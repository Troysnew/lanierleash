// Reader feedback on places: a thumb up or down plus tags picked from a fixed list.
// No free text, so nothing needs moderating. One vote per visitor per place (they can change it).
import crypto from "node:crypto";

export const TAGS = {
  up: [
    { id: "water", label: "Water bowls out" },
    { id: "shade", label: "Good shade" },
    { id: "staff", label: "Staff loves dogs" },
    { id: "room", label: "Plenty of room" },
    { id: "bigdogs", label: "Big dogs welcome" },
    { id: "clean", label: "Clean and well kept" },
    { id: "inside", label: "Dogs allowed inside" },
    { id: "quiet", label: "Calm, not crowded" },
  ],
  down: [
    { id: "nodogs", label: "Dogs not allowed anymore", flag: true },
    { id: "rule", label: "Rule is different than listed", flag: true },
    { id: "closed", label: "Closed or moved", flag: true },
    { id: "crowded", label: "Too crowded for dogs" },
    { id: "hot", label: "Hot pavement, little shade" },
    { id: "offleash", label: "Lots of off-leash dogs" },
    { id: "dirty", label: "Messy or poorly kept" },
  ],
};
// Vets and clinics (ids start with "vet-"): about the visit, not the dog rule.
export const VET_TAGS = {
  up: [
    { id: "kind", label: "Kind, caring staff" },
    { id: "gentle", label: "Gentle with nervous dogs" },
    { id: "explained", label: "Explained everything" },
    { id: "fair", label: "Fair prices" },
    { id: "asquoted", label: "Price matched the quote" },
    { id: "appt", label: "Easy to get an appointment" },
    { id: "fast", label: "Short wait" },
    { id: "clean", label: "Clean clinic" },
  ],
  down: [
    { id: "pricier", label: "Prices higher than listed", flag: true },
    { id: "closed", label: "Closed or moved", flag: true },
    { id: "nonew", label: "Not taking new patients", flag: true },
    { id: "wait", label: "Long wait" },
    { id: "phone", label: "Hard to reach by phone" },
    { id: "rushed", label: "Felt rushed" },
    { id: "fees", label: "Surprise fees" },
  ],
};
export const tagsFor = (id) => (String(id).startsWith("vet-") ? VET_TAGS : TAGS);
export const TAG_LABEL = Object.fromEntries([...TAGS.up, ...TAGS.down, ...VET_TAGS.up, ...VET_TAGS.down].map((t) => [t.id, t.label]));
export const FLAG_TAGS = new Set([...TAGS.down, ...VET_TAGS.down].filter((t) => t.flag).map((t) => t.id));

// Same privacy-safe visitor id the submit form uses: a salted hash of the IP, never the IP itself.
export function voterHash(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  return crypto.createHash("sha256").update("fb|" + ip + "|" + (process.env.CRON_SECRET || "ll")).digest("hex").slice(0, 32);
}

// vote: 1, -1, or 0 (take my vote back). Tags must match the vote's side.
export function cleanFeedback(input, T = TAGS) {
  const vote = [1, -1, 0].includes(+input.vote) ? +input.vote : null;
  if (vote === null) return { ok: false, error: "Pick thumbs up or down." };
  const allowed = new Set((vote === 1 ? T.up : vote === -1 ? T.down : []).map((t) => t.id));
  const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).map(String))].filter((t) => allowed.has(t)).slice(0, 8);
  return { ok: true, vote, tags };
}

export function summarize(rows, mine) {
  const out = { up: 0, down: 0, tags: {}, mine: null };
  for (const r of rows || []) {
    if (r.vote === 1) out.up++; else if (r.vote === -1) out.down++;
    for (const t of r.tags || []) if (TAG_LABEL[t]) out.tags[t] = (out.tags[t] || 0) + 1;
    if (mine && r.voter === mine) out.mine = { vote: r.vote, tags: r.tags || [] };
  }
  return out;
}
