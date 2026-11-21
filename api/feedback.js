// GET  /api/feedback?id=<place id>          -> { ok, up, down, tags: {id: count}, mine, options }
// POST /api/feedback {id, vote: 1|-1|0, tags} -> saves (or with vote 0, removes) this visitor's vote
// Tags come from a fixed list (api/_lib/feedback.js), so there's no free text to moderate.
import { publishedPlaces } from "./_lib/places.js";
import { feedbackFor, recentFeedbackBy, saveFeedback, deleteFeedback } from "./_lib/db.js";
import { TAGS, voterHash, cleanFeedback, summarize } from "./_lib/feedback.js";
import { body, json, log } from "./_lib/util.js";

const OPTIONS = { up: TAGS.up.map(({ id, label }) => ({ id, label })), down: TAGS.down.map(({ id, label }) => ({ id, label })) };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.method === "POST" ? body(req) : req.query || {};
  const id = String(q.id || "").toLowerCase();
  if (!/^[a-z0-9-]{1,90}$/.test(id)) return json(res, 400, { ok: false, error: "Unknown place." });
  const voter = voterHash(req);
  try {
    if (req.method === "POST") {
      const f = cleanFeedback(q);
      if (!f.ok) return json(res, 400, f);
      const places = (await publishedPlaces()).places;
      if (!places.some((p) => p.id === id)) return json(res, 404, { ok: false, error: "Unknown place." });
      const recent = await recentFeedbackBy(voter, new Date(Date.now() - 3600e3).toISOString());
      if (recent.filter((r) => r.place_id !== id).length >= 30) return json(res, 429, { ok: false, error: "That's a lot of votes for one hour. Try again later." });
      if (f.vote === 0) await deleteFeedback(id, voter);
      else await saveFeedback({ place_id: id, vote: f.vote, tags: f.tags, voter });
    } else if (req.method !== "GET") return json(res, 405, { ok: false, error: "Use GET or POST" });
    const s = summarize(await feedbackFor(id), voter);
    return json(res, 200, { ok: true, up: s.up, down: s.down, tags: s.tags, mine: s.mine, options: OPTIONS });
  } catch (e) {
    log("feedback failed", e.message);
    // Table not set up yet: the page just hides the feedback box.
    return json(res, 503, { ok: false, error: "Feedback isn't available right now." });
  }
}
