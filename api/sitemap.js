// GET /sitemap.xml (rewritten here): every page plus one per place, for search engines.
import { publishedPlaces } from "./_lib/places.js";
import { publishedEvents } from "./_lib/events.js";
import { slug } from "./_lib/content.js";
import { siteUrl } from "./_lib/util.js";
import { boardPosts, listPartners } from "./_lib/db.js";
import { isRunning } from "./_lib/partners.js";
import { etParts } from "./_lib/util.js";
import { isLive } from "./_lib/lostfound.js";

const PAGES = ["/", "/events/", "/places/", "/pack/", "/lost-found/", "/issue/", "/adopt/", "/vet-care/", "/services/", "/tips/", "/about/", "/advertise/", "/submit/", "/privacy/"];

export default async function handler(req, res) {
  const s = siteUrl();
  let places = [];
  try { places = (await publishedPlaces()).places.filter((p) => p.id); } catch {}
  let events = [];
  try { events = (await publishedEvents()).events; } catch {}
  let lost = [];
  try { lost = (await boardPosts()).filter((r) => isLive(r)); } catch {}
  let partners = [];
  try { const d = etParts().date; partners = (await listPartners()).filter((r) => isRunning(r, d)); } catch {}
  const url = (loc, mod) => `<url><loc>${s}${loc}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}</url>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    PAGES.map((p) => url(p)).concat(places.map((p) => url(`/places/${encodeURIComponent(p.id)}/`, /^\d{4}-\d{2}-\d{2}$/.test(p.checked) ? p.checked : ""))).concat(events.map((e) => url(`/events/${slug(e.date + "-" + e.title)}/`))).concat(lost.map((r) => url(`/lost-found/${r.id}/`))).concat(partners.map((r) => url(`/partners/${r.id}/`))).join("\n") + "\n</urlset>\n";
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  return res.end(xml);
}
