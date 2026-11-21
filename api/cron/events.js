// Daily: check local calendars for new dog events and add them to Suggested in /admin/.
// Also emails lost & found posters whose post ends within 3 days, once, so they can renew it.
import { runFeeds } from "../_lib/feeds.js";
import { lostEndingSoon, updateLost, listPartners } from "../_lib/db.js";
import { addDays } from "../_lib/content.js";
import { etParts } from "../_lib/util.js";
import { lfReminderEmail } from "../_lib/lostfound.js";
import { send, message } from "../_lib/mail.js";
import { json, sameSecret, log } from "../_lib/util.js";
import { isAdmin } from "../_lib/admin.js";

async function remindLost() {
  let n = 0;
  const rows = await lostEndingSoon(new Date(Date.now() + 3 * 864e5).toISOString());
  for (const r of rows) {
    if (Date.parse(r.expires_at) < Date.now()) { await updateLost(r.id, { reminded_at: new Date().toISOString() }); continue; } // already ended
    try { await send(message({ to: r.email, ...lfReminderEmail(r) })); n++; } catch (e) { log("lf reminder failed", e.message); continue; }
    await updateLost(r.id, { reminded_at: new Date().toISOString() });
  }
  return n;
}

// Emails you 7 days before, and the day before, a featured partner's paid time ends.
async function partnersEnding() {
  const to = process.env.NOTIFY_EMAIL || process.env.EMAIL_REPLY_TO;
  if (!to) return 0;
  const today = etParts().date, soon = [addDays(today, 7), addDays(today, 1)];
  const rows = (await listPartners()).filter((r) => r.status === "active" && r.ends_on && soon.includes(r.ends_on));
  if (!rows.length) return 0;
  const list = rows.map((r) => `${r.name}: last day ${r.ends_on}${r.contact_email ? " (" + r.contact_email + ")" : ""}`);
  await send(message({ to, subject: `[Partners] ${rows.length === 1 ? rows[0].name + "'s listing ends" : rows.length + " partner listings end"} soon`,
    text: "These featured partner listings come down after their last paid day:\n\n" + list.join("\n") + "\n\nIf they've paid for another month, change \"Paid through\" in Admin > Partners.",
    html: "<p>These featured partner listings come down after their last paid day:</p><ul>" + list.map((x) => "<li>" + x.replace(/</g, "&lt;") + "</li>").join("") + "</ul><p>If they've paid for another month, change <b>Paid through</b> in Admin → Partners.</p>" }));
  return rows.length;
}

export default async function handler(req, res) {
  const isCron = sameSecret(String(req.headers.authorization || ""), "Bearer " + (process.env.CRON_SECRET || ""));
  if (!isCron && !isAdmin(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
  const dry = req.query && req.query.dry === "1";
  let reminded = 0;
  if (!dry) { try { reminded = await remindLost(); } catch (e) { log("lf reminders skipped", e.message); } }
  if (!dry) { try { await partnersEnding(); } catch (e) { log("partner notice skipped", e.message); } }
  try {
    const summary = await runFeeds({ dryRun: dry });
    log("feeds", JSON.stringify({ added: summary.added, matched: summary.matched, lostReminders: reminded }));
    return json(res, 200, { ok: true, ...summary, lostReminders: reminded });
  } catch (e) {
    log("feeds failed", e.message);
    return json(res, 500, { ok: false, error: e.message });
  }
}
