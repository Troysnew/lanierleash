// Resend REST API. One message: send(). Up to 100 per call: sendBatch().
import { siteUrl } from "./util.js";

function cfg() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Resend is not configured");
  return {
    key,
    from: process.env.EMAIL_FROM || "Lanier Leash <hello@lanierleash.com>",
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  };
}

// Gmail and Yahoo require one-click unsubscribe headers (RFC 8058) for bulk mail.
export function unsubHeaders(token) {
  const url = siteUrl() + "/api/unsubscribe?t=" + encodeURIComponent(token);
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

export function message({ to, subject, html, text, token }) {
  const c = cfg();
  const m = { from: c.from, to: [to], subject, html, text };
  if (c.replyTo) m.reply_to = c.replyTo;
  if (token) m.headers = unsubHeaders(token);
  return m;
}

async function post(path, body) {
  const c = cfg();
  const r = await fetch("https://api.resend.com" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + c.key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`resend ${path} ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export function send(msg) { return post("/emails", msg); }

export async function sendBatch(msgs) {
  let sent = 0;
  for (let i = 0; i < msgs.length; i += 100) {
    await post("/emails/batch", msgs.slice(i, i + 100));
    sent += Math.min(100, msgs.length - i);
  }
  return sent;
}
