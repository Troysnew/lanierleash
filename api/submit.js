// POST /api/submit  { type, ...fields, photo (data URL, pup only), hp (honeypot), t0 (ms the form opened) }
// Saves to Supabase `submissions`, stores the pup photo privately, emails you a review note,
// and sends the submitter a short thank-you if they left an email.
import crypto from "node:crypto";
import { insertSubmission, recentSubmissions, uploadPhoto, signedPhotoUrl } from "./_lib/db.js";
import { send, message } from "./_lib/mail.js";
import { reviewEmail, thanksEmail, SUBMIT_TYPES } from "./_lib/templates.js";
import { body, json, cleanEmail, log } from "./_lib/util.js";
import { publishedPlaces } from "./_lib/places.js";

const LIMIT_PER_HOUR = 8;
const MAX_PHOTO = 3.5 * 1024 * 1024;
const OK = { ok: true };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Use POST" });
  const b = body(req);
  const type = String(b.type || "");
  const spec = SUBMIT_TYPES[type];
  if (!spec) return json(res, 400, { ok: false, error: "Pick what you're sending." });
  // Bots fill the hidden field or submit instantly. Pretend it worked.
  if (b.hp || (b.t0 && Date.now() - +b.t0 < 2500)) return json(res, 200, OK);

  // Clean every expected field; ignore anything else.
  const data = {};
  for (const f of spec.fields) {
    let v = b[f.name];
    if (f.kind === "check") v = v === true || v === "on" || v === "true";
    else v = String(v ?? "").trim().slice(0, f.max || 300);
    if (f.required && !v) return json(res, 400, { ok: false, error: `Please fill in “${f.label}”.`, field: f.name });
    if (v && f.kind === "url" && !/^https?:\/\/\S+\.\S+/i.test(v)) return json(res, 400, { ok: false, error: "Links should start with https://", field: f.name });
    if (v && f.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return json(res, 400, { ok: false, error: "Pick a date.", field: f.name });
    if (v !== "" && v !== false) data[f.name] = v;
  }
  if (type === "photo") {
    const pid = String(data.place_id || "").toLowerCase();
    let place = null;
    try { place = /^[a-z0-9-]{1,90}$/.test(pid) && (await publishedPlaces()).places.find((x) => x.id === pid); } catch (e) { log("photo place lookup failed", e.message); }
    if (!place) return json(res, 400, { ok: false, error: "We couldn't find that place." });
    data.place_id = place.id; data.place = place.name + (place.town ? ", " + place.town : "");
  }
  if (type === "pup") data.species = ["dog", "cat", "bird", "reptile", "small", "other"].includes(data.species) ? data.species : "dog";
  let email = null;
  if (b.email || spec.emailRequired) {
    email = cleanEmail(b.email);
    if (!email) return json(res, 400, { ok: false, error: "That email doesn't look right.", field: "email" });
  }

  let photo = null;
  if (type === "pup" || type === "photo") {
    const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.photo || ""));
    if (!m) return json(res, 400, { ok: false, error: type === "photo" ? "Add a photo (JPG or PNG)." : "Add a photo of your pup (JPG or PNG).", field: "photo" });
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > MAX_PHOTO) return json(res, 400, { ok: false, error: "That photo is too big. Try a smaller one.", field: "photo" });
    photo = { buf, type: m[1], ext: m[2] === "jpeg" ? "jpg" : m[2] };
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const ipHash = crypto.createHash("sha256").update(ip + "|" + (process.env.CRON_SECRET || "ll")).digest("hex").slice(0, 32);

  try {
    const recent = await recentSubmissions(ipHash, new Date(Date.now() - 3600e3).toISOString());
    if (recent.length >= LIMIT_PER_HOUR) return json(res, 429, { ok: false, error: "Thanks! That's a lot at once. Please try again in an hour." });

    let photo_path = null;
    if (photo) {
      const d = new Date().toISOString();
      photo_path = await uploadPhoto(`${type === "photo" ? "places" : "pups"}/${d.slice(0, 7)}/${crypto.randomUUID()}.${photo.ext}`, photo.buf, photo.type);
    }
    const row = await insertSubmission({ type, email, data, photo_path, ip_hash: ipHash });

    const to = process.env.NOTIFY_EMAIL || process.env.EMAIL_REPLY_TO;
    if (to) {
      try {
        const photoUrl = photo_path ? await signedPhotoUrl(photo_path) : null;
        const m = message({ to, ...reviewEmail(row, photoUrl) });
        if (email) m.reply_to = email; // hit Reply to answer the submitter
        await send(m);
      } catch (e) { log("review email failed", e.message); }
    }
    if (email) {
      try { await send(message({ to: email, ...thanksEmail(row) })); } catch (e) { log("thanks email failed", e.message); }
    }
    return json(res, 200, OK);
  } catch (e) {
    log("submit failed", e.message);
    return json(res, 500, { ok: false, error: "Something went wrong on our end. Please try again in a minute." });
  }
}
