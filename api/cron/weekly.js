// The Thursday email. Vercel runs this at 11:00 and 12:00 UTC on Thursdays (vercel.json);
// whichever run lands at 7 AM or later Eastern sends, and the `sends` table makes sure it goes once a week.
// Skips (and logs why) when: wrong day/hour, already sent, no mailing address, no subscribers.
import { activeSubs, claimWeek, finishWeek } from "../_lib/db.js";
import { sendBatch, message } from "../_lib/mail.js";
import { loadData, fetchWeather, walkCheck, buildIssue } from "../_lib/content.js";
import { weeklyEmail } from "../_lib/templates.js";
import { json, etParts, sameSecret, log } from "../_lib/util.js";

export default async function handler(req, res) {
  const auth = String(req.headers.authorization || "");
  const isCron = sameSecret(auth, "Bearer " + (process.env.CRON_SECRET || ""));
  const isAdmin = sameSecret(req.query && req.query.key, process.env.ADMIN_KEY);
  if (!isCron && !isAdmin) return json(res, 401, { ok: false, error: "Unauthorized" });

  const now = etParts();
  // An admin can send off-schedule with ?key=...&force=1 (still once per week).
  const force = isAdmin && req.query.force === "1";
  if (!force && (now.weekday !== "Thu" || now.hour < 7)) return done(res, "skipped", `Not send time (${now.weekday} ${now.hour}:00 ET)`);
  if (!(process.env.MAILING_ADDRESS || "").trim()) return done(res, "skipped", "MAILING_ADDRESS is empty; the law requires a postal address in the footer");

  const week = now.date;
  try {
    const subs = await activeSubs();
    if (!subs.length) return done(res, "skipped", "No active subscribers");

    const data = await loadData(now.date);
    const wx = walkCheck(await fetchWeather(), now.hour);
    if (!(await claimWeek(week, "weekly"))) return done(res, "skipped", `Already sent or sending for ${week}`);

    try {
      const msgs = subs.map((s) => {
        const issue = buildIssue(s, data, wx, now.date);
        return message({ to: s.email, ...weeklyEmail(s, issue), token: s.token });
      });
      const count = await sendBatch(msgs);
      await finishWeek(week, { status: "sent", count, subject: msgs[0] && msgs[0].subject, sent_at: new Date().toISOString() });
      log("weekly sent", week, count);
      return json(res, 200, { ok: true, status: "sent", week, count });
    } catch (e) {
      // Leave the row as failed so the next hourly run doesn't send a second partial copy.
      await finishWeek(week, { status: "failed", error: String(e.message).slice(0, 500) }).catch(() => {});
      throw e;
    }
  } catch (e) {
    log("weekly failed", e.message);
    return json(res, 500, { ok: false, error: e.message });
  }
}

function done(res, status, reason) {
  log("weekly", status, reason);
  return json(res, 200, { ok: true, status, reason });
}
