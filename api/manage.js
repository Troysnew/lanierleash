// GET  /api/manage?t=TOKEN                       -> current settings
// POST /api/manage { t, action, zip, radius }     action: update | unsubscribe | resubscribe
import { subByToken, updateSub } from "./_lib/db.js";
import { body, json, cleanRadius, lookupZip, log } from "./_lib/util.js";

const view = (s) => ({ ok: true, email: s.email, zip: s.zip, radius: s.radius, status: s.status });

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const sub = await subByToken(String((req.query && req.query.t) || ""));
      return sub ? json(res, 200, view(sub)) : json(res, 404, { ok: false, error: "This link has expired or isn't valid." });
    }
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Use GET or POST" });

    const b = body(req);
    const sub = await subByToken(String(b.t || ""));
    if (!sub) return json(res, 404, { ok: false, error: "This link has expired or isn't valid." });
    const now = new Date().toISOString();

    if (b.action === "unsubscribe") {
      return json(res, 200, view(await updateSub(sub.id, { status: "unsubscribed", unsubscribed_at: now })));
    }
    if (b.action === "resubscribe") {
      // They proved they own the address by holding the token, so no second confirm is needed.
      return json(res, 200, view(await updateSub(sub.id, { status: "active", unsubscribed_at: null, confirmed_at: sub.confirmed_at || now })));
    }
    if (b.action === "update") {
      const zip = String(b.zip || "").trim();
      const place = await lookupZip(zip);
      if (!place) return json(res, 400, { ok: false, error: "We couldn't find that ZIP code." });
      return json(res, 200, view(await updateSub(sub.id, { zip, lat: place.lat, lng: place.lng, radius: cleanRadius(b.radius) })));
    }
    return json(res, 400, { ok: false, error: "Unknown action" });
  } catch (e) {
    log("manage failed", e.message);
    return json(res, 500, { ok: false, error: "Something went wrong on our end. Please try again." });
  }
}
