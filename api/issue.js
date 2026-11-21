// GET /issue/ (rewritten here): this week's Thursday email as a web page, for anyone.
//   ?zip=30041&radius=25 picks the area · ?format=json gives a short summary for the homepage card.
import { loadData, fetchWeather, walkCheck, buildIssue, fmtShort } from "./_lib/content.js";
import { weeklyEmail, esc, weekendRange } from "./_lib/templates.js";
import { etParts, lookupZip, cleanRadius, siteUrl, json, log } from "./_lib/util.js";

export default async function handler(req, res) {
  const q = req.query || {};
  try {
    const place = (await lookupZip(String(q.zip || "30041"))) || (await lookupZip("30041"));
    const sub = { zip: place.zip, lat: place.lat, lng: place.lng, radius: cleanRadius(q.radius || 25), token: "" };
    const now = etParts();
    const issue = buildIssue(sub, await loadData(now.date), walkCheck(await fetchWeather(), now.hour), now.date);
    const wk = issue.weekend, range = weekendRange(wk);
    if (q.format === "json") {
      res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
      res.statusCode = 200; res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ ok: true, subject: issue.subject, range, zip: sub.zip, radius: sub.radius, wx: issue.wx ? issue.wx.head : "",
        events: issue.events.slice(0, 3).map((e) => ({ title: e.title, mi: e.mi == null ? null : Math.round(e.mi) })), count: issue.events.length,
        place: issue.places[0] ? { id: issue.places[0].id, name: issue.places[0].name, town: issue.places[0].town } : null }));
    }
    const s = siteUrl();
    const wider = [10, 15, 25, 35].find((x) => x > sub.radius) || 35;
    let html = weeklyEmail(sub, issue).html
      // "widen your radius" in a quiet week: show the same email with a bigger radius instead of the signup form.
      .replace(/href="[^"]*\/manage\/\?t=[^"]*"( style="[^"]*">widen your radius)/, `href="${s}/issue/?zip=${encodeURIComponent(sub.zip)}&radius=${wider}"$1`)
      .replace(/href="[^"]*\/manage\/\?t=[^"]*"/g, `href="${s}/#top"`)
      .replace("<title>Lanier Leash</title>", `<title>This week's dog weekend near ${esc(sub.zip)} (${esc(range)}) · Lanier Leash</title><meta name="description" content="${esc(issue.subject)}. The Lanier Leash weekend email: dog events, a walk check and places to try around Lake Lanier."><link rel="canonical" href="${s}/issue/"><link rel="icon" href="/favicon.svg" type="image/svg+xml">`)
      .replace(/You(?:'|&#39;|&#x27;)re getting this because[^<]*/, "This is the web version of the Lanier Leash Thursday email.")
      .replace("checked Thursday morning", "updated every few hours")
      .replace("Reply and tell us.", `<a href="${s}/submit/?type=fix" style="color:#117A8B">Tell us</a>.`);
    const banner = `<div style="background:#0B3A5B;color:#D6ECF2;font:14px/1.5 'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;padding:12px 16px;text-align:center">` +
      `This week's email for ZIP <b style="color:#fff">${esc(sub.zip)}</b>, ${sub.radius} miles. ` +
      `<form action="/issue/" method="get" style="display:inline-flex;gap:6px;margin:6px 0 0 6px;vertical-align:middle"><input name="zip" inputmode="numeric" maxlength="5" placeholder="Your ZIP" aria-label="ZIP" value="${esc(sub.zip)}" style="width:90px;padding:6px 10px;border-radius:999px;border:0;font:inherit"><select name="radius" aria-label="Distance" style="padding:6px 8px;border-radius:999px;border:0;font:inherit">${[5, 10, 15, 25, 35].map((x) => `<option value="${x}"${x === sub.radius ? " selected" : ""}>${x} mi</option>`).join("")}</select><button style="padding:6px 14px;border-radius:999px;border:0;background:#4CC9C6;color:#0B3A5B;font-weight:700;font-size:14px;cursor:pointer">Show mine</button></form>` +
      ` &nbsp;<a href="${s}/#top" style="color:#fff;font-weight:700">Get it free every Thursday →</a></div>`;
    const nav = `<div style="background:#fff;border-bottom:1px solid #E6ECEF;font:600 14px 'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;padding:10px 16px;text-align:center">` +
      `<a href="${s}/" style="color:#0B3A5B;font-weight:800;text-decoration:none;margin-right:14px">Lanier Leash</a>` +
      [["Events", "/events/"], ["Places", "/places/"], ["Walk check", "/#conditions"], ["The pack", "/pack/"], ["Adopt", "/adopt/"]]
        .map(([t, u]) => `<a href="${s}${u}" style="color:#117A8B;text-decoration:none;margin:0 8px">${t}</a>`).join("") + `</div>`;
    html = html.replace(/<body([^>]*)>/, (m) => m + nav + banner);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
    return res.end(html);
  } catch (e) {
    log("issue failed", e.message);
    if (q.format === "json") return json(res, 200, { ok: false });
    res.statusCode = 503; res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(`<p style="font-family:sans-serif;padding:20px">This week's email isn't ready right now. Try again in a minute, or <a href="/events/">see this weekend's events</a>.</p>`);
  }
}
