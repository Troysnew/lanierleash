import crypto from "node:crypto";

export const TZ = "America/New_York";
export const RADII = [5, 10, 15, 25];
export const DEFAULT_HOME = { zip: "30041", lat: 34.2037, lng: -84.1031 };

export function siteUrl() { return (process.env.SITE_URL || "https://lanierleash.com").replace(/\/$/, ""); }
export function token() { return crypto.randomBytes(24).toString("base64url"); }

export function cleanEmail(v) {
  const e = String(v || "").trim().toLowerCase();
  return e.length <= 254 && /^[^\s@"<>,;]+@[^\s@"<>,;]+\.[a-z]{2,}$/.test(e) ? e : null;
}
export function cleanRadius(v) { const r = +v; return RADII.includes(r) ? r : 15; }

// Constant-time compare for shared secrets.
export function sameSecret(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const zipCache = new Map();
export async function lookupZip(zip) {
  if (!/^\d{5}$/.test(zip || "")) return null;
  if (zip === DEFAULT_HOME.zip) return DEFAULT_HOME;
  if (zipCache.has(zip)) return zipCache.get(zip);
  try {
    const r = await fetch("https://api.zippopotam.us/us/" + zip);
    if (!r.ok) return null;
    const d = await r.json();
    const p = d.places && d.places[0];
    if (!p) return null;
    const hit = { zip, lat: +p.latitude, lng: +p.longitude, town: p["place name"], state: p["state abbreviation"] };
    zipCache.set(zip, hit);
    return hit;
  } catch { return null; }
}

// Vercel parses JSON and form bodies into req.body; handle strings just in case.
export function body(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "object") return b;
  try { return JSON.parse(b); } catch { return Object.fromEntries(new URLSearchParams(String(b))); }
}

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export function redirect(res, path) {
  res.statusCode = 302;
  res.setHeader("Location", path);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

// Date and hour in Cumming, GA.
export function etParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23", weekday: "short",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, weekday: p.weekday };
}

export function log(...a) { console.log("[lanierleash]", ...a); }
