// GET /api/confirm?t=TOKEN  -> activates the subscriber, sends the welcome email, redirects to /confirmed/
import { subByToken, updateSub } from "./_lib/db.js";
import { send, message } from "./_lib/mail.js";
import { welcomeEmail } from "./_lib/templates.js";
import { redirect, log } from "./_lib/util.js";

export default async function handler(req, res) {
  const t = String((req.query && req.query.t) || "");
  try {
    const sub = await subByToken(t);
    if (!sub) return redirect(res, "/confirmed/?e=1");
    if (sub.status !== "active") {
      const now = new Date().toISOString();
      const updated = await updateSub(sub.id, { status: "active", confirmed_at: now, unsubscribed_at: null });
      try { await send(message({ to: updated.email, ...welcomeEmail(updated), token: updated.token })); }
      catch (e) { log("welcome failed", e.message); } // still confirmed; the welcome is a nicety
    }
    return redirect(res, "/confirmed/?t=" + encodeURIComponent(t));
  } catch (e) {
    log("confirm failed", e.message);
    return redirect(res, "/confirmed/?e=2");
  }
}
