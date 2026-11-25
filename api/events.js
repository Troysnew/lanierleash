// GET  /api/events                      -> published, upcoming events for the site (same fields as data/events.csv).
//                                          If the events table isn't ready yet, returns ok:false and the site uses the CSV instead.
// GET  /api/events?counts=<id>,<id>,...  -> { ok, items: {id: {going, maybe}} }  (public Going / Maybe counts)
// POST /api/events {id, s: "going"|"maybe"|"", t}  -> saves (or with "", removes) this browser's pick, returns the new counts.
//   t is a random id the browser keeps (assets/plans.js); we store only a salted hash of it. A few picks per
//   network per event, and a cap per hour, keep one person from padding the numbers.
import crypto from "node:crypto";
import { listEvents, rsvpRows, rsvpRecentByIp, saveRsvp, deleteRsvp } from "./_lib/db.js";
import { toPublic, publishedEvents } from "./_lib/events.js";
import { eventId } from "./event.js";
import { voterHash } from "./_lib/feedback.js";
import { addDays } from "./_lib/content.js";
import { etParts, body, json, log } from "./_lib/util.js";

const ID = /^[a-z0-9-]{1,140}$/;
const PER_NET_PER_EVENT = 6, PER_NET_PER_HOUR = 60;
const tally = (rows, ids) => {
  const items = {};
  for (const id of ids) items[id] = { going: 0, maybe: 0 };
  for (const r of rows) if (items[r.event_id] && (r.status === "going" || r.status === "maybe")) items[r.event_id][r.status]++;
  return items;
};

async function counts(req, res) {
  const ids = [...new Set(String(req.query.counts).toLowerCase().split(","))].filter((x) => ID.test(x)).slice(0, 80);
  try {
    const items = tally(ids.length ? await rsvpRows(ids) : [], ids);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store"); // fresh, so your own tap always shows
    return res.end(JSON.stringify({ ok: true, items }));
  } catch (e) {
    log("rsvp counts failed", e.message);
    return json(res, 503, { ok: false, error: "Counts aren't available right now." });
  }
}

async function pick(req, res) {
  const b = body(req);
  const id = String(b.id || "").toLowerCase(), s = b.s === "going" || b.s === "maybe" ? b.s : "", t = String(b.t || "");
  if (!ID.test(id)) return json(res, 400, { ok: false, error: "Unknown event." });
  if (!/^[A-Za-z0-9-]{16,64}$/.test(t)) return json(res, 400, { ok: false, error: "Missing browser id." });
  try {
    const today = etParts().date;
    const ev = (await publishedEvents(addDays(today, -1))).events.find((e) => eventId(e) === id);
    if (!ev) return json(res, 404, { ok: false, error: "That event isn't on the calendar." });
    const voter = crypto.createHash("sha256").update("rsvp|" + t + "|" + (process.env.CRON_SECRET || "ll")).digest("hex").slice(0, 32);
    const ip = voterHash(req);
    if (s) {
      const recent = await rsvpRecentByIp(ip, new Date(Date.now() - 3600e3).toISOString());
      if (recent.length >= PER_NET_PER_HOUR) return json(res, 429, { ok: false, error: "That's a lot of picks for one hour. Try again later." });
      const others = (await rsvpRows([id])).filter((r) => r.ip_hash === ip && r.voter !== voter);
      // Saved in this browser either way; the public count just stops growing from one network.
      if (others.length < PER_NET_PER_EVENT) await saveRsvp({ event_id: id, voter, ip_hash: ip, status: s });
    } else await deleteRsvp(id, voter);
    return json(res, 200, { ok: true, ...tally(await rsvpRows([id]), [id])[id] });
  } catch (e) {
    log("rsvp failed", e.message);
    return json(res, 503, { ok: false, error: "Couldn't save that right now." });
  }
}

export default async function handler(req, res) {
  if (req.method === "POST") return pick(req, res);
  if (req.query && req.query.counts !== undefined) return counts(req, res);
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
    return res.end(JSON.stringify({ ok: false, events: [], error: String(e.message || e).slice(0, 200) }));
  }
}
