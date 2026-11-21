// Admin only (by key in the link). The /admin/ page has the same tools behind a login.
//   /api/preview?key=ADMIN_KEY                          weekly email for 30041, 25 mi
//   /api/preview?key=ADMIN_KEY&zip=30518&radius=10      a different reader
//   /api/preview?key=ADMIN_KEY&type=confirm|welcome     the other emails
//   /api/preview?key=ADMIN_KEY&to=you@example.com       also sends that email to this address
import { send, message } from "./_lib/mail.js";
import { buildPreview } from "./_lib/previewmail.js";
import { json, sameSecret, cleanEmail } from "./_lib/util.js";

export default async function handler(req, res) {
  const q = req.query || {};
  if (!sameSecret(q.key, process.env.ADMIN_KEY)) return json(res, 401, { ok: false, error: "Unauthorized" });
  const mail = await buildPreview(q);
  const to = cleanEmail(q.to);
  if (to) await send(message({ to, ...mail, subject: "[Test] " + mail.subject }));
  if (q.format === "text") { res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end(mail.subject + "\n\n" + mail.text); }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end((to ? `<p style="font:14px sans-serif;background:#DDF4EA;padding:10px;margin:0">Test sent to ${to.replace(/</g, "")}</p>` : "") +
    `<p style="font:14px sans-serif;padding:10px;margin:0;background:#fff">Subject: <b>${mail.subject.replace(/</g, "&lt;")}</b></p>` + mail.html);
}
