// GET /sitemap.xml (rewritten here): every page plus one per place, for search engines.
import { publishedPlaces } from "./_lib/places.js";
import { siteUrl } from "./_lib/util.js";

const PAGES = ["/", "/events/", "/places/", "/pack/", "/issue/", "/adopt/", "/vet-care/", "/tips/", "/about/", "/advertise/", "/submit/", "/privacy/"];

export default async function handler(req, res) {
  const s = siteUrl();
  let places = [];
  try { places = (await publishedPlaces()).places.filter((p) => p.id); } catch {}
  const url = (loc, mod) => `<url><loc>${s}${loc}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}</url>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    PAGES.map((p) => url(p)).concat(places.map((p) => url(`/places/${encodeURIComponent(p.id)}/`, /^\d{4}-\d{2}-\d{2}$/.test(p.checked) ? p.checked : ""))).join("\n") + "\n</urlset>\n";
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  return res.end(xml);
}
