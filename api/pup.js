// GET /api/pup -> the current Pup of the Week (picked in /admin/), for the homepage card.
// Only what the owner agreed to share: dog's name, age, town, their line, owner's first name, photo.
import { featuredPup, signPhotos } from "./_lib/db.js";
import { json, log } from "./_lib/util.js";

export default async function handler(req, res) {
  try {
    const row = await featuredPup();
    if (!row) return json(res, 200, { ok: true, pup: null });
    const photos = await signPhotos([row.photo_path], 3 * 24 * 3600);
    const d = row.data || {};
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: true, pup: {
      name: d.dog_name, age: d.age || "", town: d.town, story: d.story, owner: d.owner || "", photo: photos[row.photo_path] || null, since: row.featured_at,
    } }));
  } catch (e) {
    log("pup failed", e.message);
    return json(res, 200, { ok: true, pup: null });
  }
}
