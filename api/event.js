// GET /events/<id>/ (rewritten to /api/event?id=<id>): one page per event, built on the server.
// <id> is slug(date + "-" + title), the same id the site and the email use.
// ?format=ics returns a calendar file for the event.
import { publishedEvents } from "./_lib/events.js";
import { publishedPlaces, CATS, catBadge } from "./_lib/places.js";
import { slug, miles, fmtMi, timeRange, addDays } from "./_lib/content.js";
import { esc } from "./_lib/templates.js";
import { shell, sendHtml } from "./_lib/page.js";
import { siteUrl, etParts, log } from "./_lib/util.js";

const DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso) => `${DOWL[new Date(iso + "T12:00:00Z").getUTCDay()]}, ${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
const RX_CAT = /\b(cats?|kittens?|kitties|kitty|feline)\b/i;
const RX_CRIT = /\b(reptiles?|snakes?|lizards?|geckos?|turtles?|tortoises?|birds?|parrots?|rabbits?|bunn(y|ies)|guinea pigs?|hamsters?|ferrets?|chickens?|horses?|goats?|exotics?|small animals?|critters?|herp\w*)\b/i;
// Cats / other critters tags, read from the title and notes (same rule as the events list).
const petTags = (e) => { const t = [e.title, e.notes].join(" "); return [RX_CAT.test(t) && ["cats", "Cats"], RX_CRIT.test(t) && ["critters", "Other pets"]].filter(Boolean).map(([k, l]) => `<a class="tag t-pet" href="/events/?animal=${k}">${l}</a>`).join(""); };
const TYPE = { dog: { label: "Dog event", cls: "t-dog" }, adopt: { label: "Adoption", cls: "t-adopt" }, foster: { label: "Foster", cls: "t-adopt" } };
const ICON = { restaurant: "i-dine", brewery: "i-brew", winery: "i-wine", coffee: "i-coffee", trail: "i-trail", park: "i-park", dogpark: "i-dogpark", lake: "i-lake", shop: "i-shop", stay: "i-stay" };
const ic = (id) => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;
const norm = (t) => slug(t).replace(/-(the|at|and)-/g, "-").replace(/^the-/, "");
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export const eventId = (e) => slug(e.date + "-" + e.title);

// The ready-made post for the share panel (the link is added after it).
const NO_RULE = /^no dog rule posted/i;
export function sharePost(e, when) {
  const where = [e.venue, e.town].filter(Boolean).join(", ");
  return [`🐾 ${e.title}`, `📅 ${when}${e.start_time ? " · " + timeRange(e) : ""}`, where && `📍 ${where}`,
    e.dog_rule && !NO_RULE.test(e.dog_rule) && `🐕 ${e.dog_rule}`, "Found on Lanier Leash, the free dog guide for Lake Lanier:"].filter(Boolean).join("\n");
}
const lastDay = (e) => (e.end_date && e.end_date > e.date ? e.end_date : e.date);

function icsText(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function vevent(e, id) {
  const d = (iso, hm) => iso.replace(/-/g, "") + (hm ? "T" + hm.replace(":", "") + "00" : "");
  const L = ["BEGIN:VEVENT", `UID:${id}@lanierleash.com`, "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"];
  if (e.start_time) {
    const endT = e.end_time || (String(Math.min(23, +e.start_time.slice(0, 2) + 2)).padStart(2, "0") + e.start_time.slice(2));
    L.push(`DTSTART;TZID=America/New_York:${d(e.date, e.start_time)}`, `DTEND;TZID=America/New_York:${d(lastDay(e), endT)}`);
  } else L.push(`DTSTART;VALUE=DATE:${d(e.date)}`, `DTEND;VALUE=DATE:${d(addDays(lastDay(e), 1))}`);
  L.push("SUMMARY:" + icsText(e.title), "LOCATION:" + icsText([e.venue, e.address || e.town].filter(Boolean).join(", ")),
    "DESCRIPTION:" + icsText([e.dog_rule && "Dogs: " + e.dog_rule, e.cost && "Cost: " + e.cost, `${siteUrl()}/events/${id}/`].filter(Boolean).join("\n")),
    `URL:${siteUrl()}/events/${id}/`, "END:VEVENT");
  return L;
}
function calendar(list, name) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lanier Leash//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + icsText(name), "X-WR-TIMEZONE:America/New_York", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
    ...list.flatMap((e) => vevent(e, eventId(e))), "END:VCALENDAR"].join("\r\n") + "\r\n";
}
function sendIcs(res, body, filename) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  if (filename) res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
  return res.end(body);
}
function gcal(e, id) {
  const d = (iso, hm) => iso.replace(/-/g, "") + (hm ? "T" + hm.replace(":", "") + "00" : "");
  const dates = e.start_time
    ? d(e.date, e.start_time) + "/" + d(lastDay(e), e.end_time || String(Math.min(23, +e.start_time.slice(0, 2) + 2)).padStart(2, "0") + e.start_time.slice(2))
    : d(e.date) + "/" + d(addDays(lastDay(e), 1));
  return "https://calendar.google.com/calendar/render?" + new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, ctz: "America/New_York", location: [e.venue, e.address || e.town].filter(Boolean).join(", "), details: `${siteUrl()}/events/${id}/` });
}
const maps = (e) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([e.venue, e.address || (e.town ? e.town + ", GA" : "")].filter(Boolean).join(", "));

// Going / Maybe buttons (assets/plans.js fills in this browser's pick).
function planBar(e, id) {
  const snap = { id, t: e.title, d: e.date, l: lastDay(e), st: e.start_time || "", et: e.end_time || "", v: e.venue || "", w: e.town || "" };
  return `<span class="planbar big" data-pe="${esc(JSON.stringify(snap))}" role="group" aria-label="Your plans"><button type="button" class="planbtn" data-plan="going" aria-pressed="false"><span class="ck" aria-hidden="true">✓</span>Going</button><button type="button" class="planbtn" data-plan="maybe" aria-pressed="false">Maybe</button></span>`;
}

function notFound(res) {
  return sendHtml(res, 404, shell({
    title: "Event not found · Lanier Leash", description: "That event may have already happened.", path: "/events/", current: "events", noindex: true,
    body: `<section class="page-hero"><div class="wrap"><span class="eyebrow">Events</span><h1>That event has passed or moved</h1><p class="lede">It may have already happened, or the details changed. <a href="/events/">See upcoming dog events</a>.</p></div></section>`,
  }), "public, s-maxage=60");
}

// The place listing for an event's venue, if we have one: same name, or very close by with a similar name.
export function venuePlace(e, places) {
  if (!e.venue) return null;
  const v = norm(e.venue.split("(")[0]);
  if (!v) return null;
  return places.find((p) => p.status !== "nodogs" && (norm(p.name) === v ||
    (e.lat && p.lat && miles({ lat: +e.lat, lng: +e.lng }, p.lat, p.lng) < 0.3 && v.includes(norm(p.name)) && norm(p.name).length >= 5))) || null;
}

export default async function handler(req, res) {
  const q = req.query || {};
  // /events.ics (rewritten here with feed=1): every upcoming event, for calendar apps to subscribe to.
  // ?type=dog or ?type=adopt narrows it.
  if (q.feed) {
    try {
      const all = (await publishedEvents(etParts().date)).events;
      const t = q.type === "dog" || q.type === "adopt" ? q.type : "";
      const list = t ? all.filter((e) => (t === "dog" ? e.type === "dog" : e.type !== "dog")) : all;
      return sendIcs(res, calendar(list, t === "adopt" ? "Lanier Leash: adoption events" : t === "dog" ? "Lanier Leash: dog events" : "Lanier Leash: dog events"), null);
    } catch (e) { log("feed failed", e.message); res.statusCode = 503; return res.end("Try again in a minute."); }
  }
  const id = String(q.id || "").toLowerCase().replace(/\/+$/, "");
  if (!/^[a-z0-9-]{1,140}$/.test(id)) return notFound(res);
  const today = etParts().date;
  let events, places;
  try {
    [events, places] = await Promise.all([publishedEvents(addDays(today, -1)).then((x) => x.events), publishedPlaces().then((x) => x.places).catch(() => [])]);
  } catch (e) { log("event page failed", e.message); return sendHtml(res, 503, "<p>Please try again in a minute.</p>", "no-store"); }
  const e = events.find((x) => eventId(x) === id);
  if (!e) return notFound(res);
  if (q.format === "ics") return sendIcs(res, calendar([e], e.title), `${id}.ics`);

  const T = TYPE[e.type] || TYPE.dog, multi = lastDay(e) !== e.date, past = lastDay(e) < today;
  const hasLL = e.lat !== "" && e.lng !== "" && !isNaN(+e.lat) && !isNaN(+e.lng);
  const when = multi ? `${longDate(e.date)} – ${longDate(lastDay(e))}` : longDate(e.date);
  const place = venuePlace(e, places);
  const near = hasLL ? places.filter((p) => p.status !== "nodogs" && p.lat !== "" && (!place || p.id !== place.id))
    .map((p) => ({ ...p, mi: miles({ lat: +e.lat, lng: +e.lng }, p.lat, p.lng) })).filter((p) => p.mi != null && p.mi <= 5).sort((a, b) => a.mi - b.mi).slice(0, 4) : [];
  const sameVenue = e.venue ? events.filter((x) => x !== e && x.venue && norm(x.venue) === norm(e.venue) && lastDay(x) >= today).slice(0, 4) : [];
  const evCard = (x) => `<a class="nearby" href="/events/${eventId(x)}/"><span class="cat cb"><img class="cbadge" src="/img/icons/events-calendar-96.webp" alt="" width="40" height="40"></span><span><b>${esc(x.title)}</b><small>${esc(longDate(x.date))} · ${esc(timeRange(x))}</small></span></a>`;
  const plCard = (p) => `<a class="nearby" href="/places/${encodeURIComponent(p.id)}/"><span class="cat cb">${catBadge(p.category)}</span><span><b>${esc(p.name)}</b><small>${esc((CATS[p.category] || CATS.park).short)} · ${p.mi < 0.1 ? "steps away" : fmtMi(p.mi) + " away"}</small></span></a>`;
  const where = [e.venue, e.town].filter(Boolean).join(", ");
  const title = `${e.title} · ${when.replace(/^\w+, /, "")}${e.town ? " · " + e.town : ""} · Lanier Leash`;
  const venueInTitle = e.venue && e.title.toLowerCase().includes(e.venue.toLowerCase());
  const description = `${e.title}${where ? (venueInTitle ? (e.town ? " in " + e.town : "") : " at " + where) : ""}, ${when}. ${e.dog_rule ? "Dogs: " + e.dog_rule + "." : ""}`.trim();
  const fix = `/submit/?type=fix&listing=${encodeURIComponent(e.title + " (" + e.date + ")")}&ref=${encodeURIComponent("event:" + id)}`;

  const ld = {
    "@context": "https://schema.org", "@type": "Event", name: e.title, url: `${siteUrl()}/events/${id}/`,
    startDate: e.date + (e.start_time ? "T" + e.start_time : ""), endDate: lastDay(e) + (e.end_time ? "T" + e.end_time : ""),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: e.venue || e.town || "TBA", address: e.address || [e.town, "GA"].filter(Boolean).join(", "), geo: hasLL ? { "@type": "GeoCoordinates", latitude: +e.lat, longitude: +e.lng } : undefined },
    description: e.dog_rule || undefined, isAccessibleForFree: /free/i.test(e.cost || "") || undefined,
  };

  const body = `<section class="page-hero placehero"><div class="wrap">
  <p class="crumbs"><a href="/events/">Events</a> › <a href="/events/?type=${e.type === "dog" ? "dog" : "adopt"}">${esc(T.label === "Dog event" ? "Dog events" : "Adoption & foster")}</a></p>
  <span class="eyebrow">${ic("i-cal")} ${esc(when)}${e.start_time ? " · " + esc(timeRange(e)) : ""}</span>
  <h1>${esc(e.title)}</h1>
  ${where ? `<p class="lede addr">${ic("u-pin")}<a href="${esc(maps(e))}" target="_blank" rel="noopener">${esc([e.venue, e.address || e.town].filter(Boolean).join(", "))}</a></p>` : ""}
</div></section>
<section class="blk" style="padding-top:4px"><div class="wrap placegrid">
  <div>
    ${past ? `<p class="note" style="margin:0 0 14px"><b>This event has passed.</b> <a href="/events/">See what's coming up</a>.</p>` : ""}
    <div class="rulecard">
      <span class="eyebrow">The dog rule</span>
      <p class="big">${ic("u-leash")}<span>${esc(e.dog_rule || "Check with the organizer before bringing your dog.")}</span></p>
      <div class="st"><a class="tag ${T.cls}" href="/events/?type=${e.type === "dog" ? "dog" : "adopt"}">${T.label}</a>${petTags(e)}${e.cost ? `<span class="chk">${esc(e.cost)}</span>` : ""}<span class="chk">${/^\d{4}-\d{2}-\d{2}$/.test(e.checked || "") ? "Checked " + MON[+e.checked.slice(5, 7) - 1].slice(0, 3) + " " + +e.checked.slice(8, 10) + ", " + e.checked.slice(0, 4) : ""}${e.source_name ? " · " + esc(e.source_name) : ""}</span></div>
      ${e.url ? `<p class="why">Details from ${esc(e.source_name || host(e.url) || "the organizer")}. <a href="${esc(e.url)}" target="_blank" rel="noopener">See the event page${host(e.url) ? " (" + esc(host(e.url)) + ")" : ""}</a>.</p>` : ""}
    </div>
    ${e.notes ? `<p class="prose">${esc(e.notes)}</p>` : ""}
    ${past ? "" : `<div class="planrow"><b>Are you going?</b>${planBar(e, id)}</div>`}
    <div class="acts big">
      ${where ? `<a class="btn btn-coral" href="${esc(maps(e))}" target="_blank" rel="noopener">${ic("u-pin")}Directions</a>` : ""}
      <a class="btn btn-out" href="/events/${id}/?format=ics" download>${ic("i-cal")}Add to calendar</a>
      <a class="btn btn-out" href="${esc(gcal(e, id))}" target="_blank" rel="noopener">Google Calendar</a>
      <button class="btn btn-out" type="button" data-share data-share-heading="Share this event" data-share-url="/events/${id}/" data-share-title="${esc(e.title)}" data-share-text="${esc(sharePost(e, when))}">${ic("u-share")}Share</button>
    </div>
    <p class="note">Plans change, so check the organizer's page before you go. <a href="${esc(fix)}">Something wrong?</a> Hosting a dog event? <a href="/submit/?type=event">Send it to us</a>.</p>
    ${place ? `<h2 class="h2s">About the venue</h2><div class="nearlist">${plCard({ ...place, mi: 0 }).replace(" · steps away", " · " + esc(place.town))}</div>` : ""}
    ${sameVenue.length ? `<h2 class="h2s">More at ${esc(e.venue)}</h2><div class="nearlist">${sameVenue.map(evCard).join("")}</div>` : ""}
    ${near.length ? `<h2 class="h2s">Dog-friendly spots nearby</h2><div class="nearlist">${near.map(plCard).join("")}</div>` : ""}
  </div>
  <aside>
    ${hasLL ? `<div class="mapbox small"><div id="map" role="region" aria-label="Map of ${esc(where || e.title)}"></div></div>` : ""}
    <div class="joincard"><b>Dog events like this, every Thursday</b><p>Free weekend email: events near you, a walk check and new places.</p><a class="btn btn-coral" href="/#top">${ic("u-paw")}Join free</a></div>
  </aside>
</div></section>`;

  const share = `<script src="/assets/share.js" defer></script><script src="/assets/plans.js" defer></script>`;
  const map = hasLL ? `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>(function(){if(!window.L||!window.L.map)return;var ll=[${+e.lat},${+e.lng}];var m=window.L.map("map",{scrollWheelZoom:false}).setView(ll,14);
window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
window.L.marker(ll,{icon:window.L.divIcon({className:"",html:'<div class="pin event"></div>',iconSize:[30,30],iconAnchor:[15,30]})}).addTo(m);})();</script>` : "";
  const head = `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  return sendHtml(res, 200, shell({ title, description, path: `/events/${id}/`, body, head, scripts: map + share, current: "events", noindex: past, image: `/events/${id}/card.png` }), "public, s-maxage=300, stale-while-revalidate=3600");
}
