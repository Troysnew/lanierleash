// POST /api/suggest  (Authorization: Bearer <SUGGEST_KEY>)
// For the weekly research run: adds events as drafts in /admin/ → Events → Suggested. It can't publish,
// edit or delete anything, so this key is safe to give to an automated task.
//   body: { events: [{ title, date, end_date?, start_time?, end_time?, venue, town, address?, url, dog_rule?, cost?, notes?, source_name? }] }
import { insertEventsIgnoreDupes } from "./_lib/db.js";
import { cleanEvent, geocode } from "./_lib/events.js";
import { miles, slug } from "./_lib/content.js";
import { body, json, sameSecret, etParts, DEFAULT_HOME, log } from "./_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Use POST" });
  const key = process.env.SUGGEST_KEY, auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!key || !sameSecret(auth, key)) return json(res, 401, { ok: false, error: "Unauthorized" });
  const list = Array.isArray(body(req).events) ? body(req).events.slice(0, 40) : [];
  const today = etParts().date, rows = [], skipped = [];
  for (const raw of list) {
    const c = cleanEvent({ ...raw, checked: today });
    if (!c.ok) { skipped.push({ title: raw && raw.title, why: c.error }); continue; }
    const e = c.event;
    if ((e.end_date || e.date) < today) { skipped.push({ title: e.title, why: "Already over" }); continue; }
    if (!e.url) { skipped.push({ title: e.title, why: "Needs a source link" }); continue; }
    if (e.lat == null && (e.address || e.venue || e.town)) { const hit = await geocode(e); if (hit) { e.lat = hit.lat; e.lng = hit.lng; } }
    if (e.lat != null && miles(DEFAULT_HOME, e.lat, e.lng) > 38) { skipped.push({ title: e.title, why: "Too far" }); continue; }
    rows.push({ ...e, type: /adopt/i.test(e.title) ? "adopt" : /foster/i.test(e.title) ? "foster" : "dog", source_name: e.source_name || "Weekly research",
      status: "draft", origin: "research", source_key: `research:${e.date}:${slug(e.title)}`.slice(0, 300), feed_raw: raw.notes ? String(raw.notes).slice(0, 1200) : null });
  }
  try {
    const added = await insertEventsIgnoreDupes(rows);
    return json(res, 200, { ok: true, received: list.length, added: added.length, duplicates: rows.length - added.length, skipped });
  } catch (e) {
    log("suggest failed", e.message);
    return json(res, 500, { ok: false, error: "Couldn't save. Is the events table set up?" });
  }
}
