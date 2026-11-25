// GET  /api/feedback?id=<place id>          -> { ok, up, down, tags: {id: count}, mine, options }
// GET  /api/feedback?id=<place id>&photos=1 -> { ok, photos: [{photo, dog, owner}] }  (approved reader photos)
// GET  /api/feedback?ids=<id>,<id>,...       -> { ok, items: {id: {up, down, tags, mine}}, options }  (vet cards, one request)
// POST /api/feedback {id, vote: 1|-1|0, tags} -> saves (or with vote 0, removes) this visitor's vote
// Ids are places, or vets ("vet-..." from data/vet-ids.json). Tags come from fixed lists (api/_lib/feedback.js),
// so there's no free text to moderate.
import { publishedPlaces } from "./_lib/places.js";
import { approvedPlacePhotos, signPhotos, feedbackFor, feedbackForMany, recentFeedbackBy, saveFeedback, deleteFeedback } from "./_lib/db.js";
import { tagsFor, voterHash, cleanFeedback, summarize } from "./_lib/feedback.js";
import { body, json, log } from "./_lib/util.js";
import VET_IDS from "../data/vet-ids.json" with { type: "json" };

const VETS = new Set(VET_IDS);
const options = (id) => { const T = tagsFor(id); return { up: T.up.map(({ id, label }) => ({ id, label })), down: T.down.map(({ id, label }) => ({ id, label })) }; };
const ID = /^[a-z0-9-]{1,90}$/;
async function known(id) { return id.startsWith("vet-") ? VETS.has(id) : (await publishedPlaces()).places.some((p) => p.id === id); }

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.method === "POST" ? body(req) : req.query || {};
  const voter = voterHash(req);
  try {
    if (req.method === "GET" && q.ids) {
      const ids = [...new Set(String(q.ids).toLowerCase().split(","))].filter((x) => ID.test(x) && VETS.has(x)).slice(0, 60);
      const rows = ids.length ? await feedbackForMany(ids) : [];
      const items = {};
      for (const id of ids) { const s = summarize(rows.filter((r) => r.place_id === id), voter); items[id] = { up: s.up, down: s.down, tags: s.tags, mine: s.mine }; }
      return json(res, 200, { ok: true, items, options: options("vet-") });
    }
    const id = String(q.id || "").toLowerCase();
    if (!ID.test(id)) return json(res, 400, { ok: false, error: "Unknown place." });
    if (req.method === "GET" && q.photos) {
      const rows = (await approvedPlacePhotos()).filter((r) => r.data && r.data.place_id === id && r.data.consent).slice(0, 24);
      const urls = rows.length ? await signPhotos(rows.map((r) => r.photo_path), 2 * 24 * 3600) : {};
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
      return json(res, 200, { ok: true, photos: rows.filter((r) => urls[r.photo_path]).map((r) => ({ photo: urls[r.photo_path], dog: r.data.dog_name || "", owner: r.data.owner || "" })) });
    }
    if (req.method === "POST") {
      const f = cleanFeedback(q, tagsFor(id));
      if (!f.ok) return json(res, 400, f);
      if (!(await known(id))) return json(res, 404, { ok: false, error: "Unknown place." });
      const recent = await recentFeedbackBy(voter, new Date(Date.now() - 3600e3).toISOString());
      if (recent.filter((r) => r.place_id !== id).length >= 30) return json(res, 429, { ok: false, error: "That's a lot of votes for one hour. Try again later." });
      if (f.vote === 0) await deleteFeedback(id, voter);
      else await saveFeedback({ place_id: id, vote: f.vote, tags: f.tags, voter });
    } else if (req.method !== "GET") return json(res, 405, { ok: false, error: "Use GET or POST" });
    const s = summarize(await feedbackFor(id), voter);
    return json(res, 200, { ok: true, up: s.up, down: s.down, tags: s.tags, mine: s.mine, options: options(id) });
  } catch (e) {
    log("feedback failed", e.message);
    // Table not set up yet: the page just hides the feedback box.
    return json(res, 503, { ok: false, error: "Feedback isn't available right now.", detail: String(e.message || "").replace(/https?:\/\/\S+/g, "").slice(0, 160) });
  }
}
