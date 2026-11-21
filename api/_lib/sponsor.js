// The one sponsor slot in the Thursday email, set in /admin/ → Emails.
// Stored as settings.sponsor = { on, name, text, url, until }.
import { getSetting } from "./db.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function cleanSponsor(input) {
  const sp = {
    on: input.on !== false && input.on !== "false",
    name: String(input.name || "").trim().slice(0, 80),
    text: String(input.text || "").trim().slice(0, 240),
    url: String(input.url || "").trim().slice(0, 500),
    until: String(input.until || "").trim(),
  };
  if (sp.on && !sp.name) return { ok: false, error: "Add the sponsor's name.", field: "name" };
  if (sp.on && !sp.text) return { ok: false, error: "Add a line or two about the sponsor.", field: "text" };
  if (sp.url && !/^https?:\/\/\S+\.\S+/i.test(sp.url)) return { ok: false, error: "Links should start with https://", field: "url" };
  if (sp.until && !ISO.test(sp.until)) return { ok: false, error: "Pick an end date.", field: "until" };
  return { ok: true, sponsor: sp };
}

// The sponsor for an issue sent on `today`, or null.
export async function activeSponsor(today) {
  const sp = await getSetting("sponsor");
  if (!sp || !sp.on || !sp.name || !sp.text) return null;
  if (sp.until && sp.until < today) return null;
  return sp;
}
