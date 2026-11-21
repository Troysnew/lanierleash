// GET /api/events -> published, upcoming events for the site (same fields as data/events.csv).
// If the events table isn't ready yet, returns ok:false and the site uses the CSV instead.
import { listEvents } from "./_lib/db.js";
import { toPublic } from "./_lib/events.js";
import { etParts, log } from "./_lib/util.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const rows = await listEvents({ status: "published", from: etParts().date });
    res.statusCode = 200;
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    return res.end(JSON.stringify({ ok: true, events: rows.map(toPublic) }));
  } catch (e) {
    log("events failed", e.message);
    res.statusCode = 200;
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify({ ok: false, events: [] }));
  }
}
