// Places: categories, cleaning admin input, and reading the published directory
// (the places table, falling back to data/places.csv until it's set up).
import fs from "node:fs/promises";
import path from "node:path";
import { listPlaces } from "./db.js";
import { parseCSV, slug } from "./content.js";
import { siteUrl, etParts } from "./util.js";

// Keep in step with CAT in assets/data.js.
export const CATS = {
  restaurant: { label: "Restaurants & patios", short: "Restaurant", group: "food" },
  brewery: { label: "Breweries & taprooms", short: "Brewery", group: "food" },
  winery: { label: "Wineries", short: "Winery", group: "food" },
  coffee: { label: "Coffee & cafes", short: "Coffee", group: "food" },
  trail: { label: "Trails & greenways", short: "Trail", group: "outdoors" },
  park: { label: "Parks", short: "Park", group: "outdoors" },
  dogpark: { label: "Dog parks", short: "Dog park", group: "outdoors" },
  lake: { label: "Lake access", short: "Lake", group: "outdoors" },
  shop: { label: "Pet stores & shops", short: "Shop", group: "shops" },
  stay: { label: "Hotels & stays", short: "Stay", group: "stays" },
};
export const BADGES = ["venue", "official", "readers", "unconfirmed", "nodogs"];
export const PLACE_COLS = ["id", "name", "category", "town", "address", "lat", "lng", "dog_rule", "status", "source_url", "source_name", "website", "phone", "hours", "hours_text", "notes", "description", "checked"];

export const normCat = (c) => (c === "dine" ? "restaurant" : CATS[c] ? c : "park");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = { name: 150, town: 80, address: 200, dog_rule: 400, source_url: 600, source_name: 120, website: 600, phone: 40, hours: 300, hours_text: 300, notes: 300, description: 2000 };

// Returns { ok, place } or { ok:false, error, field }. "badge" is how we know the dog rule.
export function cleanPlace(input) {
  const p = {};
  p.name = String(input.name || "").trim().slice(0, LIMITS.name);
  if (!p.name) return { ok: false, error: "Add the place's name.", field: "name" };
  p.category = normCat(String(input.category || ""));
  if (!CATS[input.category] && input.category !== "dine") return { ok: false, error: "Pick a category.", field: "category" };
  p.badge = BADGES.includes(input.badge) ? input.badge : "unconfirmed";
  for (const k of Object.keys(LIMITS)) { if (k === "name") continue; const v = String(input[k] || "").trim().slice(0, LIMITS[k]); p[k] = v || null; }
  if (!p.dog_rule) return { ok: false, error: "Add the dog rule (what's allowed, where).", field: "dog_rule" };
  for (const k of ["source_url", "website"]) if (p[k] && !/^https?:\/\/\S+\.\S+/i.test(p[k])) return { ok: false, error: "Links should start with https://", field: k };
  const lat = input.lat === "" || input.lat == null ? null : +input.lat, lng = input.lng === "" || input.lng == null ? null : +input.lng;
  p.lat = Number.isFinite(lat) ? lat : null; p.lng = Number.isFinite(lng) ? lng : null;
  p.checked = ISO.test(input.checked || "") ? input.checked : etParts().date;
  // Leave empty hours out, so saving still works on a database that doesn't have the hours columns yet.
  for (const k of ["hours", "hours_text"]) if (p[k] == null) delete p[k];
  return { ok: true, place: p };
}

// A readable, unique-ish id for a new place: "cherry-street-brewing-cumming"
export function placeId(name, town, taken = new Set()) {
  let id = slug(name).slice(0, 70) || "place";
  if (taken.has(id) && town) id = (id + "-" + slug(town)).slice(0, 80);
  let n = 2, base = id;
  while (taken.has(id)) id = base + "-" + n++;
  return id;
}

// Same fields as data/places.csv ("status" there is the badge).
export function toPublic(r) {
  const o = {};
  for (const k of PLACE_COLS) o[k] = k === "status" ? r.badge || r.status || "" : r[k] == null ? "" : String(r[k]);
  o.category = normCat(o.category);
  return o;
}

async function readCsv() {
  if (process.env.DATA_DIR) return fs.readFile(path.join(process.env.DATA_DIR, "places.csv"), "utf8");
  const r = await fetch(siteUrl() + "/data/places.csv", { cache: "no-store" });
  if (!r.ok) throw new Error("places.csv " + r.status);
  return r.text();
}
export async function csvPlaces() {
  return parseCSV(await readCsv()).filter((p) => p.name).map((p) => ({ ...p, id: p.id || slug(p.name), category: normCat(p.category) }));
}

// Published places in the public shape. Falls back to the CSV if the table isn't set up or is empty.
export async function publishedPlaces() {
  try {
    const rows = await listPlaces({ status: "published" });
    if (rows.length) return { source: "db", places: rows.map(toPublic) };
  } catch {}
  return { source: "csv", places: (await csvPlaces()).map(toPublic) };
}

// Illustrated category badges (img/icons/<name>-96.webp).
export const CAT_BADGE = {"restaurant": "patio-dining", "brewery": "breweries", "winery": "wineries", "coffee": "coffee-and-cafes", "trail": "parks-and-trails", "park": "parks", "dogpark": "dog-parks", "lake": "lake-activities", "shop": "pet-friendly-shopping", "stay": "dog-friendly-lodging"};
export const catBadge = (cat, px = 40) => `<img class="cbadge" src="/img/icons/${CAT_BADGE[cat] || "parks"}-${px >= 40 ? 192 : 96}.webp" alt="" width="${px}" height="${px}">`;
