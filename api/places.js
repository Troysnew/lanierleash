// GET /api/places -> the published places directory (same fields as data/places.csv).
// Uses the CSV until the places table is set up, so the site always has something.
import { publishedPlaces } from "./_lib/places.js";
import { log } from "./_lib/util.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const { source, places } = await publishedPlaces();
    res.statusCode = 200;
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
    return res.end(JSON.stringify({ ok: true, source, places }));
  } catch (e) {
    log("places failed", e.message);
    res.statusCode = 200;
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify({ ok: false, places: [] }));
  }
}
