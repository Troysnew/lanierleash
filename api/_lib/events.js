// Events: cleaning admin input, finding coordinates, and reading the published calendar.
import fs from "node:fs/promises";
import path from "node:path";
import { listEvents, EVENT_COLS } from "./db.js";
import { parseCSV, miles } from "./content.js";
import { siteUrl, etParts, DEFAULT_HOME } from "./util.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const LIMITS = { title: 200, venue: 150, town: 80, address: 200, cost: 80, dog_rule: 400, url: 600, source_name: 120, notes: 800 };

// Accepts "17:30", "5:30 PM", "5pm" -> "17:30"
export function normTime(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "";
  if (HM.test(s)) return s;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(a|p)\.?m?\.?$/.exec(s);
  if (!m) return null;
  let h = +m[1] % 12; if (m[3] === "p") h += 12;
  const min = m[2] || "00";
  return h > 23 || +min > 59 ? null : String(h).padStart(2, "0") + ":" + min;
}

// Returns { ok, event } or { ok:false, error, field }
export function cleanEvent(input) {
  const e = {};
  e.title = String(input.title || "").trim().slice(0, LIMITS.title);
  if (!e.title) return { ok: false, error: "Add an event name.", field: "title" };
  e.date = String(input.date || "").trim();
  if (!ISO.test(e.date)) return { ok: false, error: "Pick a date.", field: "date" };
  e.end_date = String(input.end_date || "").trim();
  if (e.end_date && (!ISO.test(e.end_date) || e.end_date < e.date)) return { ok: false, error: "The end date must be on or after the start date.", field: "end_date" };
  if (!e.end_date || e.end_date === e.date) e.end_date = null;
  for (const k of ["start_time", "end_time"]) {
    const t = normTime(input[k]);
    if (t === null) return { ok: false, error: "Times look like 5:30 PM.", field: k };
    e[k] = t || null;
  }
  e.type = ["dog", "adopt", "foster"].includes(input.type) ? input.type : "dog";
  for (const k of ["venue", "town", "address", "cost", "dog_rule", "url", "source_name", "notes"]) {
    const v = String(input[k] || "").trim().slice(0, LIMITS[k]);
    e[k] = v || null;
  }
  if (e.url && !/^https?:\/\/\S+\.\S+/i.test(e.url)) return { ok: false, error: "Links should start with https://", field: "url" };
  const lat = input.lat === "" || input.lat == null ? null : +input.lat, lng = input.lng === "" || input.lng == null ? null : +input.lng;
  e.lat = Number.isFinite(lat) ? lat : null; e.lng = Number.isFinite(lng) ? lng : null;
  e.checked = ISO.test(input.checked || "") ? input.checked : etParts().date;
  return { ok: true, event: e };
}

// ---------- coordinates ----------
const UA = { "User-Agent": "site-builder/1.0 (event geocoder)" };
async function census(addr) {
  const u = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" + new URLSearchParams({ address: addr, benchmark: "Public_AR_Current", format: "json" });
  const r = await fetch(u, { headers: UA }); if (!r.ok) return null;
  const m = (await r.json()).result.addressMatches; return m && m[0] ? { lat: m[0].coordinates.y, lng: m[0].coordinates.x } : null;
}
async function nominatim(q) {
  const u = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ q, format: "json", limit: "1", countrycodes: "us" });
  const r = await fetch(u, { headers: UA }); if (!r.ok) return null;
  const j = await r.json(); return j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
}
// Tries the street address, then the venue name + town. Only accepts spots within 45 miles of Cumming.
export async function geocode({ address, venue, town }) {
  const tries = [];
  if (address) tries.push(() => census(address + (town && !address.includes(town) ? ", " + town + ", GA" : "")));
  if (venue) tries.push(() => nominatim(`${venue}, ${town ? town + ", " : ""}Georgia`));
  if (address) tries.push(() => nominatim(address));
  if (town) tries.push(() => nominatim(`${town}, Georgia`));
  for (const t of tries) {
    try {
      const hit = await t();
      if (hit && miles(DEFAULT_HOME, hit.lat, hit.lng) < 45) return { ...hit, how: tries.indexOf(t) === tries.length - 1 && town ? "town" : "place" };
    } catch {}
  }
  return null;
}

// ---------- reading ----------
export function toPublic(r) {
  const o = {};
  for (const k of EVENT_COLS) o[k] = r[k] == null ? "" : String(r[k]);
  return o;
}

async function readCsv() {
  if (process.env.DATA_DIR) return fs.readFile(path.join(process.env.DATA_DIR, "events.csv"), "utf8");
  const r = await fetch(siteUrl() + "/data/events.csv", { cache: "no-store" });
  if (!r.ok) throw new Error("events.csv " + r.status);
  return r.text();
}
export async function csvEvents() { return parseCSV(await readCsv()); }

// Published events still running today or later. Falls back to the CSV if the table isn't set up or is empty.
export async function publishedEvents(today = etParts().date) {
  try {
    const rows = await listEvents({ status: "published", from: today });
    if (rows.length) return { source: "db", events: rows.map(toPublic) };
  } catch {}
  return { source: "csv", events: await csvEvents() };
}
