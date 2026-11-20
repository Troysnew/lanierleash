// POST /api/subscribe  { email, zip, radius, source, website (honeypot) }
// New or lapsed address: save as pending and send a confirm email.
// Already active: send their settings link instead (and don't reveal that on the page).
import { subByEmail, insertSub, updateSub } from "./_lib/db.js";
import { send, message } from "./_lib/mail.js";
import { confirmEmail, manageEmail } from "./_lib/templates.js";
import { body, json, cleanEmail, cleanRadius, lookupZip, token, log } from "./_lib/util.js";

const COOLDOWN_MS = 2 * 60 * 1000;
const OK = { ok: true, message: "Check your inbox to confirm. It can take a minute; look in Promotions or Spam too." };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Use POST" });
  const b = body(req);
  if (b.website) return json(res, 200, OK); // bots fill the hidden field; pretend it worked

  const email = cleanEmail(b.email);
  if (!email) return json(res, 400, { ok: false, error: "That email doesn't look right." });
  const zip = String(b.zip || "30041").trim();
  const place = await lookupZip(zip);
  if (!place) return json(res, 400, { ok: false, error: "We couldn't find that ZIP code." });
  const radius = cleanRadius(b.radius);
  const source = String(b.source || "site").slice(0, 40);

  try {
    let sub = await subByEmail(email);
    const now = new Date();
    if (sub && sub.last_confirm_sent_at && now - new Date(sub.last_confirm_sent_at) < COOLDOWN_MS) return json(res, 200, OK);

    if (sub && sub.status === "active") {
      sub = await updateSub(sub.id, { last_confirm_sent_at: now.toISOString() });
      await send(message({ to: email, ...manageEmail(sub), token: sub.token }));
      return json(res, 200, OK);
    }

    const fields = { zip, radius, lat: place.lat, lng: place.lng, source, last_confirm_sent_at: now.toISOString() };
    if (sub) sub = await updateSub(sub.id, { ...fields, status: "pending" });
    else sub = await insertSub({ email, token: token(), status: "pending", ...fields });

    await send(message({ to: email, ...confirmEmail(sub) }));
    return json(res, 200, OK);
  } catch (e) {
    log("subscribe failed", e.message);
    return json(res, 500, { ok: false, error: "Something went wrong on our end. Please try again in a minute." });
  }
}
