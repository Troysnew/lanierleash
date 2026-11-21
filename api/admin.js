// Everything the /admin/ page does. Log in once; a signed cookie keeps you in for 14 days.
//   POST {action:"login", password} · POST {action:"logout"} · GET ?action=me
//   GET  ?action=overview | submissions&status=&type= | subscribers[&format=csv] | sends | preview&type=&zip=&radius=
//   GET  ?action=events&view=upcoming|suggested|past|hidden
//   POST {action:"event_save", id?, ...fields, from_submission?} | {action:"event_status", id, status} | {action:"event_delete", id} | {action:"events_import"}
//   GET  ?action=places&view=published|draft|hidden · GET ?action=sponsor
//   POST {action:"place_save", id?, ...fields, publish?, from_submission?} | {action:"place_status", id, status} | {action:"place_delete", id} | {action:"places_import"}
//   POST {action:"sponsor_save", name, text, url, until, on}
//   POST {action:"update", id, status?, note?} | {action:"feature", id, on} | {action:"delete", id} | {action:"test_email", to, type, zip, radius}
import { allFeedback } from "./_lib/db.js";
import { FLAG_TAGS, TAG_LABEL } from "./_lib/feedback.js";
import {
  allSubscribers, recentSends, listSubmissions, submissionCounts, getSubmission, updateSubmission,
  deleteSubmission, deletePhoto, signPhotos,
  listEvents, countEvents, insertEvents, getEvent, updateEvent, deleteEvent,
  listPlaces, placeIds, getPlace, insertPlaces, updatePlace, deletePlace, getSetting, setSetting,
} from "./_lib/db.js";
import { cleanPlace, placeId, csvPlaces, CATS } from "./_lib/places.js";
import { cleanSponsor } from "./_lib/sponsor.js";
import { cleanEvent, geocode, csvEvents } from "./_lib/events.js";
import { miles } from "./_lib/content.js";
import { etParts, DEFAULT_HOME } from "./_lib/util.js";
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
      case "events": {
        const today = etParts().date, view = q.view || "upcoming";
        let rows;
        if (view === "suggested") rows = await listEvents({ status: "draft" });
        else if (view === "hidden") rows = await listEvents({ status: "hidden" });
        else if (view === "past") rows = (await listEvents({ status: "published" })).filter((r) => (r.end_date || r.date) < today).reverse().slice(0, 100);
        else rows = await listEvents({ status: "published", from: today });
        const total = await countEvents();
        return json(res, 200, { ok: true, empty: total === 0, items: rows.map((r) => ({ ...r, mi: r.lat != null ? Math.round(miles(DEFAULT_HOME, r.lat, r.lng) * 10) / 10 : null })) });
      }
      case "event_save": {
        const c = cleanEvent(b);
        if (!c.ok) return json(res, 400, c);
        const ev = c.event;
        const old = b.id ? await getEvent(String(b.id)) : null;
        if (b.id && !old) return json(res, 404, { ok: false, error: "That event no longer exists." });
        // Find coordinates when they're missing or the place changed.
        const moved = !old || old.address !== ev.address || old.venue !== ev.venue || old.town !== ev.town;
        let located = null;
        if (ev.lat == null || ev.lng == null || moved) {
          const hit = (ev.address || ev.venue || ev.town) ? await geocode(ev) : null;
          if (hit) { ev.lat = hit.lat; ev.lng = hit.lng; located = hit.how; }
          else if (moved) { ev.lat = null; ev.lng = null; }
        }
        let row;
        if (old) row = await updateEvent(old.id, { ...ev, status: b.publish === false ? old.status : old.status === "draft" && b.publish ? "published" : old.status });
        else row = (await insertEvents([{ ...ev, status: b.publish === false ? "draft" : "published", origin: b.from_submission ? "submission" : "manual" }]))[0];
        if (b.from_submission) await updateSubmission(String(b.from_submission), { status: "done", reviewed_at: new Date().toISOString() }).catch(() => {});
        const mi = row.lat != null ? Math.round(miles(DEFAULT_HOME, row.lat, row.lng) * 10) / 10 : null;
        const warn = row.lat == null ? "We couldn't find this place on the map, so it won't show for distance searches or in the email. Add a street address and save again." :
          located === "town" ? "We could only find the town, not the exact spot. Add a street address for an accurate distance." : "";
        return json(res, 200, { ok: true, item: { ...row, mi }, warn });
      }
      case "event_status": {
        if (!["published", "draft", "hidden"].includes(b.status)) return json(res, 400, { ok: false, error: "Bad status" });
        const row = await updateEvent(String(b.id || ""), { status: b.status });
        return row ? json(res, 200, { ok: true, item: row }) : json(res, 404, { ok: false, error: "Not found" });
      }
      case "event_delete": {
        await deleteEvent(String(b.id || ""));
        return json(res, 200, { ok: true });
      }
      case "events_import": {
        if ((await countEvents()) > 0) return json(res, 400, { ok: false, error: "Events are already set up." });
        const today = etParts().date;
        const rows = (await csvEvents()).filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.title && (e.end_date || e.date) >= today).map((e) => {
          const c = cleanEvent(e);
          return c.ok ? { ...c.event, checked: e.checked || today, status: "published", origin: "starter" } : null;
        }).filter(Boolean);
        const out = rows.length ? await insertEvents(rows) : [];
        return json(res, 200, { ok: true, count: out.length });
      }
      // ---------- places ----------
      case "places": {
        const view = ["published", "draft", "hidden"].includes(q.view) ? q.view : "published";
        const all = await listPlaces();
        const counts = all.reduce((o, r) => ((o[r.status] = (o[r.status] || 0) + 1), o), {});
        let csvNew = 0;
        try { const have = new Set(all.map((r) => r.id)); csvNew = (await csvPlaces()).filter((p) => !have.has(p.id)).length; } catch {}
        const items = all.filter((r) => r.status === view).map((r) => ({ ...r, mi: r.lat != null ? Math.round(miles(DEFAULT_HOME, r.lat, r.lng) * 10) / 10 : null }));
        // Reader thumbs and flags, per place (empty if the feedback table isn't set up yet).
        const fb = {};
        try {
          for (const r of await allFeedback()) {
            const x = fb[r.place_id] || (fb[r.place_id] = { up: 0, down: 0, flags: {} });
            if (r.vote === 1) x.up++; else x.down++;
            for (const t of r.tags || []) if (FLAG_TAGS.has(t)) x.flags[TAG_LABEL[t]] = (x.flags[TAG_LABEL[t]] || 0) + 1;
          }
        } catch {}
        for (const it of items) it.fb = fb[it.id] || null;
        return json(res, 200, { ok: true, empty: all.length === 0, counts, csvNew, items, cats: CATS });
      }
      case "place_save": {
        const c = cleanPlace(b);
        if (!c.ok) return json(res, 400, c);
        const pl = c.place;
        const old = b.id ? await getPlace(String(b.id)) : null;
        if (b.id && !old) return json(res, 404, { ok: false, error: "That place no longer exists." });
        // Find the pin when it's missing or the address changed. Typed-in coordinates win.
        const typed = pl.lat != null && pl.lng != null && (!old || pl.lat !== old.lat || pl.lng !== old.lng);
        const moved = !old || old.address !== pl.address || old.town !== pl.town;
        let located = null;
        if (!typed && (pl.lat == null || pl.lng == null || moved)) {
          const hit = await geocode({ address: pl.address, venue: pl.name, town: pl.town });
          if (hit) { pl.lat = hit.lat; pl.lng = hit.lng; located = hit.how; }
          else if (old && moved) { pl.lat = null; pl.lng = null; }
        }
        let row;
        if (old) row = await updatePlace(old.id, { ...pl, status: old.status === "draft" && b.publish ? "published" : old.status });
        else {
          const id = placeId(pl.name, pl.town, new Set(await placeIds()));
          row = (await insertPlaces([{ ...pl, id, status: b.publish === false ? "draft" : "published", origin: b.from_submission ? "submission" : "manual" }]))[0];
        }
        if (b.from_submission) await updateSubmission(String(b.from_submission), { status: "done", reviewed_at: new Date().toISOString() }).catch(() => {});
        const mi = row.lat != null ? Math.round(miles(DEFAULT_HOME, row.lat, row.lng) * 10) / 10 : null;
        const warn = row.lat == null ? "We couldn't find this place on the map, so it won't show in distance searches. Add a street address and save again." :
          located === "town" ? "We could only find the town, not the exact spot. Add a street address for an accurate pin." : "";
        return json(res, 200, { ok: true, item: { ...row, mi }, warn });
      }
      case "place_status": {
        if (!["published", "draft", "hidden"].includes(b.status)) return json(res, 400, { ok: false, error: "Bad status" });
        const row = await updatePlace(String(b.id || ""), { status: b.status });
        return row ? json(res, 200, { ok: true, item: row }) : json(res, 404, { ok: false, error: "Not found" });
      }
      case "place_delete": {
        await deletePlace(String(b.id || ""));
        return json(res, 200, { ok: true });
      }
      case "places_import": {
        // Adds CSV places that aren't in the table yet (matched by id). Safe to run again.
        const today = etParts().date, have = new Set(await placeIds());
        const rows = (await csvPlaces()).filter((p) => !have.has(p.id)).map((p) => {
          const c = cleanPlace({ ...p, badge: p.status });
          return c.ok ? { ...c.place, id: p.id, checked: p.checked || today, status: "published", origin: "starter" } : null;
        }).filter(Boolean);
        const out = await insertPlaces(rows, { ignoreDupes: true });
        return json(res, 200, { ok: true, count: out.length });
      }

      // ---------- email sponsor ----------
      case "sponsor": return json(res, 200, { ok: true, sponsor: (await getSetting("sponsor")) || null });
      case "sponsor_save": {
        const c = cleanSponsor(b);
        if (!c.ok) return json(res, 400, c);
        await setSetting("sponsor", c.sponsor);
        return json(res, 200, { ok: true, sponsor: c.sponsor });
      }

      default: return json(res, 400, { ok: false, error: "Unknown action" });
    }
  } catch (e) {
    log("admin failed", action, e.message);
    const hint = /(submissions|events|places|settings|place_feedback)/.test(e.message) && /(column|relation|does not exist|42703|42P01|PGRST)/i.test(e.message)
      ? " The database needs the latest setup: run the newest part of schema.sql in Supabase." : "";
    return json(res, 500, { ok: false, error: "Something went wrong." + hint, detail: e.message.slice(0, 300) });
  }
}
