// Share preview images (1200x630 PNG) for links posted on Facebook, iMessage, X, etc.
//   /events/<id>/card.png           -> /api/og?event=<id>
//   /dog-of-the-month/<id>/card.png -> /api/og?pup=<id>
import fs from "node:fs";
import { ImageResponse } from "@vercel/og";
import { publishedEvents } from "./_lib/events.js";
import { timeRange, addDays, slug } from "./_lib/content.js";
import { findEntry, monthName, openContest, currentTitle } from "./_lib/dotm.js";
import { signPhotos } from "./_lib/db.js";
import { etParts, log } from "./_lib/util.js";

const asset = (f) => fs.readFileSync(new URL("./_lib/og/" + f, import.meta.url));
let FONTS, EMBLEM;
function load() {
  if (FONTS) return;
  FONTS = [
    { name: "Jakarta", data: asset("jakarta-600.woff"), weight: 600, style: "normal" },
    { name: "Jakarta", data: asset("jakarta-800.woff"), weight: 800, style: "normal" },
    { name: "Kaushan", data: asset("kaushan.woff"), weight: 400, style: "normal" },
  ];
  EMBLEM = "data:image/png;base64," + asset("emblem.png").toString("base64");
}

const NAVY = "#0B3A5B", TEAL = "#117A8B", CORAL = "#CF3F47", CREAM = "#FFF7ED", MUTED = "#5B6B7B";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => `${DOW[new Date(iso + "T12:00:00Z").getUTCDay()]}, ${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

// Tiny element helper so we don't need React/JSX: h("div", style, ...children)
const h = (type, style, ...children) => ({ type, props: { style: { display: "flex", ...style }, children: children.flat().filter((c) => c !== null && c !== false && c !== undefined && c !== "") } });
const img = (src, style) => ({ type: "img", props: { src, style } });
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

function brand() {
  return h("div", { alignItems: "center", gap: 14 },
    img(EMBLEM, { width: 58, height: 64 }),
    h("div", { fontFamily: "Jakarta", fontWeight: 800, fontSize: 34, color: NAVY, letterSpacing: -1 }, "Lanier"),
    h("div", { fontFamily: "Kaushan", fontSize: 36, color: CORAL, marginLeft: -6 }, "Leash"));
}

function frame(children) {
  return h("div", { width: 1200, height: 630, background: CREAM, position: "relative", fontFamily: "Jakarta" },
    h("div", { position: "absolute", left: 0, right: 0, bottom: 0, height: 18, background: `linear-gradient(90deg, ${TEAL}, #2BB3A8, ${TEAL})` }),
    children);
}

function eventCard(e) {
  const when = day(e.date) + (e.end_date && e.end_date > e.date ? " – " + day(e.end_date) : "") + (e.start_time ? " · " + timeRange(e) : "");
  const where = [e.venue, e.town].filter(Boolean).join(", ");
  const title = clip(e.title, 90), size = title.length > 60 ? 54 : title.length > 34 ? 64 : 76;
  const label = e.type === "dog" ? "DOG EVENT" : e.type === "foster" ? "FOSTER EVENT" : "ADOPTION EVENT";
  return frame(h("div", { flexDirection: "column", padding: "56px 72px 60px", width: "100%", height: "100%", justifyContent: "space-between" },
    h("div", { justifyContent: "space-between", alignItems: "center" }, brand(),
      h("div", { background: CORAL, color: "#fff", fontWeight: 800, fontSize: 22, letterSpacing: 2, padding: "10px 22px", borderRadius: 999 }, label)),
    h("div", { flexDirection: "column", gap: 22 },
      h("div", { fontWeight: 800, fontSize: size, lineHeight: 1.08, color: NAVY, letterSpacing: -2 }, title),
      h("div", { flexDirection: "column", gap: 10, fontWeight: 600, fontSize: 32, color: "#334155" },
        h("div", {}, "📅  " + when),
        where ? h("div", {}, "📍  " + clip(where, 60)) : null)),
    h("div", { justifyContent: "space-between", alignItems: "center" },
      e.dog_rule && !/^no dog rule posted/i.test(e.dog_rule) ? h("div", { background: "#E0F7F5", color: TEAL, fontWeight: 800, fontSize: 24, padding: "10px 20px", borderRadius: 14, maxWidth: 780 }, "🐾  " + clip(e.dog_rule, 56)) : h("div", {}),
      h("div", { fontWeight: 800, fontSize: 24, color: MUTED }, "lanierleash.com"))));
}

function pupCard(p, photo) {
  const now = etParts().date, voting = p.contest >= openContest(now), won = p.contest <= currentTitle(now);
  const head = voting ? `Vote for ${p.name}!` : p.name, sub = voting ? `for ${monthName(p.contest)}'s Dog of the Month` : won ? `Dog of the Month · ${monthName(p.contest)}` : "Lake Lanier pack";
  return frame(h("div", { width: "100%", height: "100%" },
    photo ? img(photo, { width: 520, height: 612, objectFit: "cover" }) : h("div", { width: 520, height: 612, background: "#E0F7F5", alignItems: "center", justifyContent: "center", fontSize: 160 }, "🐶"),
    h("div", { flexDirection: "column", justifyContent: "space-between", padding: "52px 56px 60px", width: 680 },
      brand(),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { color: CORAL, fontWeight: 800, fontSize: 24, letterSpacing: 2 }, "🏆  DOG OF THE MONTH"),
        h("div", { fontWeight: 800, fontSize: clip(head, 40).length > 22 ? 58 : 72, lineHeight: 1.05, color: NAVY, letterSpacing: -2 }, clip(head, 40)),
        h("div", { fontWeight: 600, fontSize: 30, color: "#334155" }, sub),
        p.story ? h("div", { fontWeight: 600, fontSize: 26, color: MUTED, lineHeight: 1.35 }, "“" + clip(p.story, 110) + "”") : null),
      h("div", { justifyContent: "space-between", alignItems: "center" },
        h("div", { fontWeight: 600, fontSize: 24, color: MUTED }, [p.town, p.owner ? "with " + p.owner : ""].filter(Boolean).join(" · ")),
        h("div", { fontWeight: 800, fontSize: 24, color: MUTED }, "lanierleash.com")))));
}

async function photoData(path) {
  const urls = await signPhotos([path], 600);
  if (!urls[path]) return null;
  const r = await fetch(urls[path]);
  if (!r.ok) return null;
  const type = r.headers.get("content-type") || "image/jpeg";
  if (!/jpe?g|png/.test(type)) return null;
  return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
}

async function sendImage(res, el, cache) {
  const out = new ImageResponse(el, { width: 1200, height: 630, fonts: FONTS, emoji: "twemoji" });
  const buf = Buffer.from(await out.arrayBuffer());
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", cache);
  return res.end(buf);
}

export default async function handler(req, res) {
  const q = req.query || {};
  try {
    load();
    if (q.event) {
      const id = String(q.event).toLowerCase();
      const events = (await publishedEvents(addDays(etParts().date, -1))).events;
      const e = events.find((x) => slug(x.date + "-" + x.title) === id);
      if (!e) { res.statusCode = 302; res.setHeader("Location", "/img/hero.jpg"); return res.end(); }
      return await sendImage(res, eventCard(e), "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    }
    if (q.pup) {
      const p = await findEntry(String(q.pup).toLowerCase());
      if (!p) { res.statusCode = 302; res.setHeader("Location", "/img/hero.jpg"); return res.end(); }
      return await sendImage(res, pupCard(p, await photoData(p.photo_path).catch(() => null)), "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400");
    }
    res.statusCode = 404; return res.end("not found");
  } catch (e) {
    log("og failed", e.message);
    res.statusCode = 302; res.setHeader("Location", "/img/hero.jpg"); res.setHeader("Cache-Control", "no-store"); return res.end();
  }
}
