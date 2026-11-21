// Everything the /admin/ page does. Log in once; a signed cookie keeps you in for 14 days.
//   POST {action:"login", password} · POST {action:"logout"} · GET ?action=me
//   GET  ?action=overview | submissions&status=&type= | subscribers[&format=csv] | sends | preview&type=&zip=&radius=
//   POST {action:"update", id, status?, note?} | {action:"feature", id, on} | {action:"delete", id} | {action:"test_email", to, type, zip, radius}
import {
  allSubscribers, recentSends, listSubmissions, submissionCounts, getSubmission, updateSubmission,
  deleteSubmission, deletePhoto, signPhotos,
} from "./_lib/db.js";
import { send, message } from "./_lib/mail.js";
import { SUBMIT_TYPES } from "./_lib/templates.js";
import { buildPreview } from "./_lib/previewmail.js";
import { isAdmin, adminPassword, loginCookie, logoutCookie } from "./_lib/admin.js";
import { body, json, sameSecret, cleanEmail, log } from "./_lib/util.js";

const STATUSES = ["new", "approved", "rejected", "done"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shape(row, photos) {
  const spec = SUBMIT_TYPES[row.type] || { label: row.type, fields: [] };
  const d = row.data || {};
  return {
    id: row.id, type: row.type, typeLabel: spec.label, status: row.status, email: row.email,
    created_at: row.created_at, reviewed_at: row.reviewed_at || null, featured_at: row.featured_at || null, note: row.admin_note || "",
    title: d.dog_name || d.title || d.name || d.listing || d.business || "Submission",
    fields: spec.fields.filter((f) => d[f.name] !== undefined).map((f) => ({ label: f.label, value: f.kind === "check" ? "Yes" : String(d[f.name]), kind: f.kind || "text" })),
    data: d, photo: row.photo_path ? photos[row.photo_path] || null : null,
  };
}

const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export default async function handler(req, res) {
  const q = req.query || {};
  const b = req.method === "POST" ? body(req) : {};
  const action = String((req.method === "POST" ? b.action : q.action) || "");

  try {
    if (action === "login") {
      if (req.method !== "POST") return json(res, 405, { ok: false });
      const pw = adminPassword();
      if (!pw || !sameSecret(String(b.password || ""), pw)) { await sleep(900); return json(res, 401, { ok: false, error: "That password isn't right." }); }
      res.setHeader("Set-Cookie", loginCookie());
      return json(res, 200, { ok: true });
    }
    if (action === "logout") { res.setHeader("Set-Cookie", logoutCookie()); return json(res, 200, { ok: true }); }
    if (action === "me") return json(res, 200, { ok: true, authed: isAdmin(req) });

    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "Please log in." });
    // Changes must come from our own page (it sends this header; other sites can't).
    if (req.method === "POST" && req.headers["x-admin"] !== "1") return json(res, 403, { ok: false, error: "Forbidden" });

    switch (action) {
      case "overview": {
        const [subs, counts, sends] = await Promise.all([allSubscribers(), submissionCounts(), recentSends()]);
        const by = (arr, k) => arr.reduce((o, x) => ((o[x[k]] = (o[x[k]] || 0) + 1), o), {});
        const week = Date.now() - 7 * 864e5;
        return json(res, 200, {
          ok: true,
          subscribers: { ...by(subs, "status"), total: subs.length, newThisWeek: subs.filter((s) => s.status === "active" && new Date(s.confirmed_at || s.created_at) > week).length },
          submissions: by(counts, "status"),
          lastSend: sends[0] || null,
          mailingAddress: !!(process.env.MAILING_ADDRESS || "").trim(),
        });
      }
      case "submissions": {
        const rows = await listSubmissions({ status: q.status || "new", type: q.type });
        const photos = await signPhotos(rows.map((r) => r.photo_path).filter(Boolean));
        return json(res, 200, { ok: true, items: rows.map((r) => shape(r, photos)) });
      }
      case "update": {
        const patch = {};
        if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return json(res, 400, { ok: false, error: "Bad status" }); patch.status = b.status; patch.reviewed_at = new Date().toISOString(); }
        if (b.note !== undefined) patch.admin_note = String(b.note).slice(0, 2000);
        const row = await updateSubmission(String(b.id || ""), patch);
        if (!row) return json(res, 404, { ok: false, error: "Not found" });
        const photos = await signPhotos(row.photo_path ? [row.photo_path] : []);
        return json(res, 200, { ok: true, item: shape(row, photos) });
      }
      case "feature": {
        const row = await getSubmission(String(b.id || ""));
        if (!row || row.type !== "pup" || !row.photo_path) return json(res, 400, { ok: false, error: "Only pup submissions with a photo can be featured." });
        const on = b.on !== false;
        const upd = await updateSubmission(row.id, on ? { featured_at: new Date().toISOString(), status: "approved", reviewed_at: new Date().toISOString() } : { featured_at: null });
        const photos = await signPhotos([row.photo_path]);
        return json(res, 200, { ok: true, item: shape(upd, photos) });
      }
      case "delete": {
        const row = await getSubmission(String(b.id || ""));
        if (!row) return json(res, 404, { ok: false, error: "Not found" });
        if (row.photo_path) await deletePhoto(row.photo_path).catch((e) => log("photo delete failed", e.message));
        await deleteSubmission(row.id);
        return json(res, 200, { ok: true });
      }
      case "subscribers": {
        const subs = await allSubscribers();
        if (q.format === "csv") {
          const cols = ["email", "zip", "radius", "status", "source", "created_at", "confirmed_at", "unsubscribed_at"];
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="lanierleash-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
          res.setHeader("Cache-Control", "no-store");
          return res.end([cols.join(",")].concat(subs.map((s) => cols.map((c) => csvCell(s[c])).join(","))).join("\n"));
        }
        return json(res, 200, { ok: true, items: subs });
      }
      case "sends": return json(res, 200, { ok: true, items: await recentSends() });
      case "preview": {
        const mail = await buildPreview(q);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Robots-Tag", "noindex");
        return res.end(`<p style="font:14px sans-serif;padding:10px 14px;margin:0;background:#fff;border-bottom:1px solid #e6ecef">Subject: <b>${mail.subject.replace(/</g, "&lt;")}</b></p>` + mail.html);
      }
      case "test_email": {
        const to = cleanEmail(b.to);
        if (!to) return json(res, 400, { ok: false, error: "Enter an email address." });
        const mail = await buildPreview(b);
        await send(message({ to, ...mail, subject: "[Test] " + mail.subject }));
        return json(res, 200, { ok: true, message: `Test sent to ${to}. Check Promotions or Spam if you don't see it.` });
      }
      default: return json(res, 400, { ok: false, error: "Unknown action" });
    }
  } catch (e) {
    log("admin failed", action, e.message);
    const hint = /submissions/.test(e.message) && /(column|relation|does not exist|42703|42P01|PGRST)/i.test(e.message)
      ? " The database needs the latest setup: run the newest part of schema.sql in Supabase." : "";
    return json(res, 500, { ok: false, error: "Something went wrong." + hint, detail: e.message.slice(0, 300) });
  }
}
