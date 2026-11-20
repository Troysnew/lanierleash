// POST /api/unsubscribe?t=TOKEN  -> one-click unsubscribe (what Gmail/Yahoo's "Unsubscribe" button sends, RFC 8058)
// GET  /api/unsubscribe?t=TOKEN  -> footer link: unsubscribes, then shows the manage page with an undo button.
// (A GET can be triggered by mail scanners, but every unsubscribe has a one-tap undo on the manage page.)
import { subByToken, updateSub } from "./_lib/db.js";
import { redirect, log } from "./_lib/util.js";

export default async function handler(req, res) {
  const t = String((req.query && req.query.t) || "");
  try {
    const sub = await subByToken(t);
    if (sub && sub.status === "active") await updateSub(sub.id, { status: "unsubscribed", unsubscribed_at: new Date().toISOString() });
    if (req.method === "POST") { res.statusCode = sub ? 200 : 404; res.setHeader("Content-Type", "text/plain"); return res.end(sub ? "Unsubscribed" : "Not found"); }
    return redirect(res, sub ? "/manage/?t=" + encodeURIComponent(t) + "&unsub=1" : "/manage/?e=1");
  } catch (e) {
    log("unsubscribe failed", e.message);
    if (req.method === "POST") { res.statusCode = 500; return res.end("Error"); }
    return redirect(res, "/manage/?t=" + encodeURIComponent(t) + "&e=2");
  }
}
