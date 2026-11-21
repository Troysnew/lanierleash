// GET /api/weather -> the Open-Meteo forecast for Cumming, GA, cached at the edge.
// The homepage walk check and the Thursday email both read this same forecast (fetchWeather),
// so they can't disagree, and visitors never depend on reaching Open-Meteo themselves.
import { fetchWeather } from "./_lib/content.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const d = await fetchWeather();
  if (!d || !d.daily || !d.hourly) {
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify({ ok: false }));
  }
  res.statusCode = 200;
  // Fresh for an hour; if Open-Meteo is down, keep serving the last good copy for up to 12 hours.
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=43200, stale-if-error=43200");
  return res.end(JSON.stringify(d));
}
