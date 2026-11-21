// What goes in the weekly email: weekend events, a walk check and places to try,
// built from the same CSVs and forecast the site uses.
import fs from "node:fs/promises";
import path from "node:path";
import { siteUrl, etParts } from "./util.js";
import { publishedEvents } from "./events.js";

// ---------- CSV + dates (same rules as assets/data.js) ----------
export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = [];
    } else f += c;
  }
  row.push(f); if (row.some((x) => x.trim() !== "")) rows.push(row);
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, k) => [h, (r[k] || "").trim()])));
}

export const slug = (t) => String(t).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const dt = (iso) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
export const addDays = (iso, n) => { const d = dt(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dow = (iso) => dt(iso).getUTCDay();
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (iso) => DOW[dow(iso)] + " " + MON[+iso.slice(5, 7) - 1] + " " + +iso.slice(8, 10);
export const fmtShort = (iso) => MON[+iso.slice(5, 7) - 1] + " " + +iso.slice(8, 10);
export function fmtTime(t) {
  if (!t) return ""; const h = +t.slice(0, 2), m = t.slice(3, 5);
  return (h % 12 || 12) + (m && m !== "00" ? ":" + m : "") + " " + (h < 12 ? "AM" : "PM");
}
export function timeRange(e) {
  if (!e.start_time) return "Time TBA";
  if (!e.end_time) return fmtTime(e.start_time);
  let a = fmtTime(e.start_time); const b = fmtTime(e.end_time);
  if (a.slice(-2) === b.slice(-2)) a = a.slice(0, -3);
  return a + "–" + b;
}
export function weekend(today) {
  const d = dow(today);
  const fri = d === 5 || d === 6 || d === 0 ? addDays(today, d === 5 ? 0 : d === 6 ? -1 : -2) : addDays(today, 5 - d);
  return { from: today > fri ? today : fri, fri, to: addDays(fri, 2) };
}

export function miles(a, lat, lng) {
  if (lat === "" || lng === "" || lat == null || isNaN(+lat) || isNaN(+lng)) return null;
  const R = 3958.8, r = Math.PI / 180;
  const dLat = (lat - a.lat) * r, dLng = (lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtMi = (m) => (m == null ? "" : m < 10 ? m.toFixed(1) + " mi" : Math.round(m) + " mi");

// ---------- data ----------
async function readData(name) {
  // DATA_DIR lets local tests read the files from disk; on Vercel we fetch the published copies.
  if (process.env.DATA_DIR) return fs.readFile(path.join(process.env.DATA_DIR, name), "utf8");
  const r = await fetch(siteUrl() + "/data/" + name, { cache: "no-store" });
  if (!r.ok) throw new Error(`fetch ${name} ${r.status}`);
  return r.text();
}

export async function loadData(today) {
  // Events: the live calendar (falls back to the CSV). Places: the CSV.
  const [ev, pl] = await Promise.all([publishedEvents(today), readData("places.csv")]);
  const events = ev.events.map((e) => {
    e.last = e.end_date && e.end_date > e.date ? e.end_date : e.date;
    e.multi = e.last !== e.date;
    e.id = slug(e.date + "-" + e.title);
    return e;
  }).filter((e) => e.last >= today);
  const places = parseCSV(pl).map((p) => { p.id = p.id || slug(p.name); return p; }).filter((p) => p.status !== "nodogs");
  return { events, places };
}

// ---------- walk check (same scoring as the homepage) ----------
const WX_URL = "https://api.open-meteo.com/v1/forecast?latitude=34.2073&longitude=-84.1402" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
  "&hourly=temperature_2m,precipitation_probability,shortwave_radiation" +
  "&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=8";

export async function fetchWeather() {
  try {
    const r = await fetch(WX_URL);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const hr = (h) => (h % 12 || 12) + " " + (h < 12 ? "AM" : "PM");
const pave = (t, rad) => Math.round(t + 0.06 * Math.max(0, rad || 0));
const paveLevel = (p) => (p >= 125 ? "hot" : p >= 105 ? "warn" : "ok");

export function walkCheck(d, nowH) {
  if (!d || !d.daily || !d.hourly) return null;
  try {
    const D = d.daily, H = d.hourly, n = D.time.length;
    const today = dow(D.time[0]);
    const start = today === 5 || today === 6 || today === 0 ? 0 : (5 - today + 7) % 7;
    const idx = [start, start + 1, start + 2].filter((i) => i < n);
    if (!idx.length) return null;
    const hi = (i) => Math.round(D.temperature_2m_max[i]);
    const pp = (i) => D.precipitation_probability_max[i] || 0;
    const score = (i) => { let s = -Math.abs(hi(i) - 68) - pp(i) * 0.5; if (hi(i) > 85) s -= (hi(i) - 85) * 3; return s; };
    let cand = idx.filter((i) => i !== 0 || nowH < 14);
    if (!cand.length) cand = idx;
    const best = cand.reduce((a, b) => (score(b) > score(a) ? b : a));
    const day = D.time[best], byH = {};
    H.time.forEach((t, k) => {
      if (t.indexOf(day) === 0) byH[+t.slice(11, 13)] = { t: H.temperature_2m[k], p: H.precipitation_probability[k] || 0, r: H.shortwave_radiation[k] };
    });
    if (!Object.keys(byH).length) return null;
    const hs = (r) => -Math.abs(r.t - 62) - r.p * 0.6 - Math.max(0, pave(r.t, r.r) - 100) * 1.5;
    const lit = (x) => byH[x] && byH[x].r > 15;
    let win = null, wbest = -1e9;
    for (let h = best === 0 ? Math.max(7, nowH + 1) : 7; h <= 17; h++) {
      if (!lit(h + 1) || !lit(h + 2) || !lit(h + 3)) continue;
      const sc = (hs(byH[h]) + hs(byH[h + 1]) + hs(byH[h + 2])) / 3;
      if (sc > wbest) { wbest = sc; win = h; }
    }
    const at2 = byH[14] || byH[Object.keys(byH)[0]];
    const pv = pave(at2.t, at2.r), lvl = paveLevel(pv);
    const bhi = hi(best), bpp = pp(best);
    const head = lvl === "hot" ? "Hot pavement, walk early" : bpp >= 50 ? "Wet one, pack a towel" :
      bhi < 40 ? "Chilly, keep walks brisk" : lvl === "warn" ? "Warm paws, walk early" : "Good day for paws";
    const m = +D.time[0].slice(5, 7);
    return {
      head, bestDay: DOWL[dow(day)], high: bhi, rain: bpp, window: win === null ? "midday" : hr(win) + "–" + hr(win + 3),
      pavement: pv, level: lvl, paws: lvl === "ok" ? "likely OK for paws" : lvl === "warn" ? "use caution" : "too hot for paws",
      tick: m >= 3 && m <= 8 ? "High" : m >= 9 && m <= 11 ? "Moderate" : "Low",
      days: idx.map((i) => ({ name: DOW[dow(D.time[i])], high: hi(i), rain: pp(i), best: i === best })),
    };
  } catch { return null; }
}

// ---------- one reader's issue ----------
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start_time || "99") < (b.start_time || "99") ? -1 : 1);

export function buildIssue(sub, data, wx, today = etParts().date) {
  const home = { lat: +sub.lat, lng: +sub.lng }, r = +sub.radius || 15;
  const near = (x) => { x.mi = miles(home, x.lat, x.lng); return x.mi != null && x.mi <= r; };
  const events = data.events.map((e) => ({ ...e })).filter(near);
  const places = data.places.map((p) => ({ ...p })).filter(near).sort((a, b) => a.mi - b.mi);
  const wk = weekend(today);

  const weekendList = events.filter((e) => !e.multi && e.date >= wk.from && e.date <= wk.to).sort(byDate).slice(0, 8);
  const ongoing = events.filter((e) => e.multi && e.date <= wk.to && e.last >= wk.from).sort(byDate).slice(0, 2);
  const later = events.filter((e) => !e.multi && e.date > wk.to && e.date <= addDays(today, 21)).sort(byDate).slice(0, weekendList.length >= 3 ? 3 : 5);

  // Three places, rotating weekly through what's near the reader so the list doesn't repeat.
  const week = Math.floor(dt(today).getTime() / 6048e5);
  let picks = [];
  if (places.length) {
    const pool = places.slice(0, 30), start = (week * 3) % pool.length;
    for (let i = 0; i < Math.min(3, pool.length); i++) picks.push(pool[(start + i) % pool.length]);
    picks = [...new Set(picks)];
  }

  const n = weekendList.length;
  const subject = n
    ? `${n} dog-friendly ${n === 1 ? "event" : "events"} this weekend near ${sub.zip}` + (wx ? ` · ${wx.head.toLowerCase()}` : "")
    : wx ? `Your dog weekend near ${sub.zip}: ${wx.head.toLowerCase()}` : `Your dog weekend near ${sub.zip}`;

  return { subject, today, weekend: wk, radius: r, zip: sub.zip, wx, events: weekendList, ongoing, later, places: picks };
}
