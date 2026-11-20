// Admin only. See or test the emails before they go out.
//   /api/preview?key=ADMIN_KEY                          weekly email for 30041, 15 mi, in the browser
//   /api/preview?key=ADMIN_KEY&zip=30518&radius=10      a different reader
//   /api/preview?key=ADMIN_KEY&type=confirm|welcome     the other emails
//   /api/preview?key=ADMIN_KEY&to=you@example.com       also sends that email to this address
import { send, message } from "./_lib/mail.js";
import { loadData, fetchWeather, walkCheck, buildIssue } from "./_lib/content.js";
import { weeklyEmail, confirmEmail, welcomeEmail } from "./_lib/templates.js";
import { json, etParts, sameSecret, lookupZip, cleanRadius, cleanEmail } from "./_lib/util.js";

export default async function handler(req, res) {
  const q = req.query || {};
  if (!sameSecret(q.key, process.env.ADMIN_KEY)) return json(res, 401, { ok: false, error: "Unauthorized" });
  const place = (await lookupZip(String(q.zip || "30041"))) || (await lookupZip("30041"));
  const sub = { email: "preview@example.com", zip: place.zip, lat: place.lat, lng: place.lng, radius: cleanRadius(q.radius || 15), token: "preview-token-not-real-000" };

  let mail;
  if (q.type === "confirm") mail = confirmEmail(sub);
  else if (q.type === "welcome") mail = welcomeEmail(sub);
  else {
    const now = etParts();
    const today = /^\d{4}-\d{2}-\d{2}$/.test(q.date || "") ? q.date : now.date;
    const data = await loadData(today);
    mail = weeklyEmail(sub, buildIssue(sub, data, walkCheck(await fetchWeather(), now.hour), today));
  }

  const to = cleanEmail(q.to);
  if (to) {
    await send(message({ to, ...mail, subject: "[Test] " + mail.subject }));
  }
  if (q.format === "text") { res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end(mail.subject + "\n\n" + mail.text); }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end((to ? `<p style="font:14px sans-serif;background:#DDF4EA;padding:10px;margin:0">Test sent to ${to.replace(/</g, "")}</p>` : "") +
    `<p style="font:14px sans-serif;padding:10px;margin:0;background:#fff">Subject: <b>${mail.subject.replace(/</g, "&lt;")}</b></p>` + mail.html);
}
