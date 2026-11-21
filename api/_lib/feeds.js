// Reads public event calendars (iCalendar, WordPress "The Events Calendar" JSON), keeps the
// dog-related events in our area, and saves them as drafts for review in /admin/ → Events → Suggested.
import { insertEventsIgnoreDupes } from "./db.js";
import { geocode } from "./events.js";
import { addDays, miles } from "./content.js";
import { etParts, log, DEFAULT_HOME } from "./util.js";
import { SOURCES } from "./sources.js";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; LanierLeash-events/1.0; +https://lanierleash.com)" };
const DOG = /\b(dogs?|doggy|doggie|pups?|puppy|puppies|pets?|canines?|k-?9s?|yappy|barks?|barking|paws?|pawty|howl(oween)?|woof|adopt(ion|ions|able)?|rescues?|fur-?bab(y|ies)|four-legged)\b/i;
const NOT_DOG = /\b(hot|corn|chili|chili-cheese)[ -]?dogs?\b|\bdog days\b|\bpet rock\b|\bpaw paw\b|\bpup tents?\b|\b(horse|burro|livestock|cattle|goat)s?\b[^.]*\badopt\w*|\badopt\w*[^.]*\b(horse|burro|highway|a[- ]road|a[- ]stream|a[- ]family)s?\b/gi;
const MAX_MI = 30; // the site's widest radius is 25 miles
// "Friendly dogs on-leash are welcome!" -> use as the dog rule
const RULE = /[^.!?\n]*\b(dogs?|pets?)\b[^.!?\n]*\b(welcome|allowed|permitted|friendly)\b[^.!?\n]*[.!]?/i;

export const isDogEvent = (text) => DOG.test(String(text || "").replace(NOT_DOG, " "));

// ---------- text helpers ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#8217": "’", "#8216": "‘", "#8220": "“", "#8221": "”", "#8211": "–", "#8212": "—", "#038": "&" };
export function plain(html) {
  return String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e) => ENT[e] ?? (e[0] === "#" ? String.fromCharCode(+e.replace(/^#x/, "0x").replace(/^#/, "")) : m))
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

// UTC instant -> { date, time } in Eastern time
function etFromUTC(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// ---------- iCalendar ----------
function icsDate(val, params) {
  const v = String(val || "").trim();
  if (/VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(v)) return { date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, time: "" };
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  if (m[7]) return etFromUTC(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])));
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` }; // TZID local or floating: treat as Eastern
}
const icsText = (s) => String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

export function parseICS(text) {
  const lines = String(text).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out = []; let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const head = line.slice(0, i), val = line.slice(i + 1), [name, ...params] = head.split(";");
    cur[name.toUpperCase()] = { val, params: params.join(";") };
  }
  return out.map((v) => {
    const s = v.DTSTART && icsDate(v.DTSTART.val, v.DTSTART.params), e = v.DTEND && icsDate(v.DTEND.val, v.DTEND.params);
    if (!s || !v.SUMMARY) return null;
    let endDate = e ? e.date : "";
    if (e && !e.time && endDate > s.date) endDate = addDays(endDate, -1); // all-day DTEND is exclusive
    return {
      uid: v.UID ? v.UID.val : "", title: icsText(v.SUMMARY.val), date: s.date, start_time: s.time, end_date: endDate && endDate !== s.date ? endDate : "",
      end_time: e && e.time && endDate === s.date ? e.time : "", location: icsText(v.LOCATION && v.LOCATION.val),
      url: v.URL ? v.URL.val.trim() : "", description: plain(icsText(v.DESCRIPTION && v.DESCRIPTION.val)), recurring: !!v.RRULE,
    };
  }).filter(Boolean);
}

// ---------- WordPress "The Events Calendar" REST API ----------
export function parseTribe(json) {
  return (json.events || []).map((e) => {
    const v = e.venue && !Array.isArray(e.venue) ? e.venue : {};
    const sd = String(e.start_date || ""), ed = String(e.end_date || "");
    return {
      uid: "tribe-" + e.id, title: plain(e.title), date: sd.slice(0, 10), start_time: e.all_day ? "" : sd.slice(11, 16),
      end_date: ed.slice(0, 10) !== sd.slice(0, 10) ? ed.slice(0, 10) : "", end_time: e.all_day || ed.slice(0, 10) !== sd.slice(0, 10) ? "" : ed.slice(11, 16),
      venue: plain(v.venue), location: [v.address, v.city, v.state || v.province, v.zip].filter(Boolean).join(", "), town: v.city || "",
      lat: v.geo_lat ? +v.geo_lat : null, lng: v.geo_lng ? +v.geo_lng : null,
      url: e.url || "", cost: plain(e.cost), description: plain(e.description),
    };
  });
}

// ---------- run ----------
async function fetchSource(src, today) {
  let url = src.url;
  if (src.format === "tribe") url += (url.includes("?") ? "&" : "?") + `start_date=${today}&end_date=${addDays(today, 75)}&per_page=50`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return src.format === "tribe" ? parseTribe(await r.json()) : parseICS(await r.text());
}

// Pulls every source; returns a summary. dryRun skips saving (for testing).
export async function runFeeds({ dryRun = false, sources = SOURCES, maxGeocode = 30 } = {}) {
  const today = etParts().date, until = addDays(today, 75);
  const summary = { sources: [], added: 0, matched: 0 };
  let geocodes = 0;
  for (const src of sources) {
    const s = { id: src.id, name: src.name, fetched: 0, matched: 0, added: 0, error: null };
    summary.sources.push(s);
    try {
      const items = await fetchSource(src, today);
      s.fetched = items.length;
      const keep = items.filter((x) => x.date >= today && x.date <= until && (src.allDog || isDogEvent(x.title + " " + x.description)));
      s.matched = keep.length; summary.matched += keep.length;
      const rows = [];
      for (const x of keep) {
        const loc = { venue: x.venue || "", address: x.location || "", town: x.town || src.town || "" };
        let lat = x.lat ?? null, lng = x.lng ?? null;
        if ((lat == null || lng == null) && (loc.address || loc.venue) && geocodes < maxGeocode) {
          geocodes++;
          const hit = await geocode(loc);
          if (hit) { lat = hit.lat; lng = hit.lng; }
        }
        if (lat != null && miles(DEFAULT_HOME, lat, lng) > MAX_MI) { s.far = (s.far || 0) + 1; continue; }
        const rule = (x.description.match(RULE) || [""])[0].trim();
        rows.push({
          status: "draft", origin: "feed", source_key: `${src.id}:${x.uid || x.url || x.date + "-" + x.title}`.slice(0, 300),
          date: x.date, end_date: x.end_date || null, start_time: x.start_time || null, end_time: x.end_time || null,
          title: clip(x.title, 200), type: /adopt/i.test(x.title) ? "adopt" : /foster/i.test(x.title) ? "foster" : "dog",
          venue: x.venue || (x.location ? clip(x.location.split(",")[0], 150) : null), town: loc.town || null, address: x.location || null,
          lat, lng, cost: x.cost || null, dog_rule: rule ? clip(rule, 300) : null, url: x.url || src.page || null, source_name: src.name,
          notes: x.description ? clip(x.description.replace(/\n+/g, " "), 300) : null, checked: today,
          feed_raw: clip([x.title, x.location, x.description].filter(Boolean).join("\n"), 1200),
        });
      }
      if (!dryRun && rows.length) {
        const added = await insertEventsIgnoreDupes(rows);
        s.added = added.length; summary.added += added.length;
      } else s.added = dryRun ? rows.length : 0;
      if (dryRun) s.sample = rows.slice(0, 3).map((r) => `${r.date} ${r.title} @ ${r.venue || "?"}`);
    } catch (e) {
      s.error = String(e.message).slice(0, 200);
      log("feed failed", src.id, s.error);
    }
  }
  return summary;
}
