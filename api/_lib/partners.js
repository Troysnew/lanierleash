// Featured partners: local businesses that pay monthly for a labeled "Sponsored" card and their own page.
// Rules (also on /advertise/): always labeled Sponsored, never a trust badge; never in the emergency vet list;
// at most MAX_PER_CAT running at once per category; reader reports stay visible.
import { slug } from "./content.js";

export const MAX_PER_CAT = 2;
export const PCATS = {
  vet: { label: "Vet clinic", where: "vet-care", a: "a vet clinic" },
  groomer: { label: "Groomer", where: "services", a: "a dog groomer" },
  trainer: { label: "Trainer", where: "services", a: "a dog trainer" },
  daycare: { label: "Daycare & boarding", where: "services", a: "a dog daycare and boarding spot" },
  other: { label: "Dog services", where: "services", a: "a local dog business" },
  shop: { label: "Pet store", where: "places", a: "a pet store" },
  restaurant: { label: "Restaurant", where: "places", a: "a dog-friendly restaurant" },
  brewery: { label: "Brewery", where: "places", a: "a dog-friendly brewery" },
  winery: { label: "Winery", where: "places", a: "a dog-friendly winery" },
  coffee: { label: "Coffee shop", where: "places", a: "a dog-friendly coffee shop" },
  stay: { label: "Hotel or rental", where: "places", a: "a dog-friendly place to stay" },
};
export const PARTNER_COLS = ["name", "category", "tagline", "about", "services", "address", "town", "lat", "lng", "phone", "website", "booking_url", "hours_text", "offer", "place_id", "email_mention", "starts_on", "ends_on", "contact_email", "notes", "status"];
export const EVENT_KINDS = ["view", "card", "call", "directions", "website", "booking", "offer"];
const LIM = { name: 100, tagline: 140, about: 1500, services: 600, address: 200, town: 60, phone: 30, website: 400, booking_url: 400, hours_text: 300, offer: 160, place_id: 90, contact_email: 200, notes: 1000 };

const url = (v) => (/^https?:\/\/\S+\.\S+/i.test(v) ? v : null);

export function cleanPartner(b) {
  const p = {};
  for (const k of Object.keys(LIM)) if (b[k] !== undefined) p[k] = String(b[k] ?? "").trim().slice(0, LIM[k]) || null;
  if (!p.name) return { ok: false, error: "Add the business name." };
  const category = String(b.category || "");
  if (!PCATS[category]) return { ok: false, error: "Pick a category." };
  p.category = category;
  for (const k of ["website", "booking_url"]) if (p[k] && !url(p[k])) return { ok: false, error: `The ${k === "website" ? "website" : "booking link"} should start with https://` };
  for (const k of ["starts_on", "ends_on"]) {
    const v = String(b[k] || "").trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: "Dates should look like 2026-12-01." };
    p[k] = v || null;
  }
  if (!p.starts_on) return { ok: false, error: "Add a start date." };
  if (p.ends_on && p.ends_on < p.starts_on) return { ok: false, error: "The end date is before the start date." };
  p.status = b.status === "paused" ? "paused" : "active";
  p.email_mention = b.email_mention !== false && b.email_mention !== "false";
  for (const k of ["lat", "lng"]) { const n = b[k] === "" || b[k] == null ? null : +b[k]; p[k] = n == null || isNaN(n) ? null : n; }
  if (p.place_id) p.place_id = p.place_id.toLowerCase();
  return { ok: true, partner: p };
}

export const partnerId = (p) => slug(p.name + (p.town ? "-" + p.town : "")).slice(0, 80) || "partner";

// Running today: active, started, not ended.
export function isRunning(r, today) {
  return r.status === "active" && r.starts_on && r.starts_on <= today && (!r.ends_on || r.ends_on >= today);
}

// What anyone can see. No contact email, notes or billing dates.
export function toPublic(r) {
  return {
    id: r.id, name: r.name, category: r.category, catLabel: (PCATS[r.category] || PCATS.other).label, where: (PCATS[r.category] || PCATS.other).where,
    tagline: r.tagline || "", about: r.about || "", services: r.services || "", address: r.address || "", town: r.town || "",
    lat: r.lat ?? null, lng: r.lng ?? null, phone: r.phone || "", website: r.website || "", booking_url: r.booking_url || "",
    hours_text: r.hours_text || "", offer: r.offer || "", place_id: r.place_id || "",
    photos: (r.photos || []).map((_, i) => `/partners/${r.id}/photo/${i}`),
  };
}
