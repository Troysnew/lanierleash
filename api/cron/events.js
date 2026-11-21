// Daily: check local calendars for new dog events and add them to Suggested in /admin/.
import { runFeeds } from "../_lib/feeds.js";
import { json, sameSecret, log } from "../_lib/util.js";
import { isAdmin } from "../_lib/admin.js";

export default async function handler(req, res) {
  const isCron = sameSecret(String(req.headers.authorization || ""), "Bearer " + (process.env.CRON_SECRET || ""));
  if (!isCron && !isAdmin(req)) return json(res, 401, { ok: false, error: "Unauthorized" });
  try {
    const summary = await runFeeds({ dryRun: req.query && req.query.dry === "1" });
    log("feeds", JSON.stringify({ added: summary.added, matched: summary.matched }));
    return json(res, 200, { ok: true, ...summary });
  } catch (e) {
    log("feeds failed", e.message);
    return json(res, 500, { ok: false, error: e.message });
  }
}
