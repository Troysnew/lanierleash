// Featured partners.
//   GET  /api/partners?list=1                     -> { ok, partners } running today (public fields only)
//   GET  /partners/<id>/          (rewritten to ?page=<id>)          -> the partner's page
//   GET  /partners/<id>/photo/<n> (rewritten to ?photo=<id>&n=<n>)   -> redirects to the (private) photo
//   POST {action:"track", id, kind}  kind: view | card | call | directions | website | booking | offer
import crypto from "node:crypto";
import { listPartners, getPartner, logPartnerEvent, signPhotos } from "./_lib/db.js";
import { PCATS, EVENT_KINDS, isRunning, toPublic } from "./_lib/partners.js";
import { esc } from "./_lib/templates.js";
import { shell, sendHtml } from "./_lib/page.js";
import { body, json, etParts, siteUrl, log } from "./_lib/util.js";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embed|monitor|curl|wget|python|headless/i;
const idOk = (id) => /^[a-z0-9-]{1,90}$/.test(id);
const ic = (id) => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;

export default async function handler(req, res) {
  const q = req.query || {};
  try {
    if (req.method === "POST") {
      const b = body(req);
      if (b.action === "track") return await track(req, res, b);
      return json(res, 400, { ok: false, error: "Unknown action" });
    }
    if (q.list) {
      const today = etParts().date;
      const partners = (await listPartners()).filter((r) => isRunning(r, today)).map(toPublic);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
      return res.end(JSON.stringify({ ok: true, partners }));
    }
    if (q.photo) return await photo(res, String(q.photo), +q.n || 0);
    if (q.page) return await page(res, String(q.page).toLowerCase().replace(/\/+$/, ""));
    return json(res, 400, { ok: false, error: "Unknown request" });
  } catch (e) {
    log("partners failed", e.message);
    if (q.list) return json(res, 200, { ok: true, partners: [] }); // no table yet: pages just show no partner cards
    if (q.page) return sendHtml(res, 503, shell({ title: "Back in a minute · Lanier Leash", description: "", path: "/services/", noindex: true, body: `<section class="blk"><div class="wrap"><h1>Back in a minute</h1><p>We couldn’t load this page just now. Please try again shortly.</p></div></section>` }), "no-store");
    return json(res, 500, { ok: false, error: "Something went wrong." });
  }
}

async function track(req, res, b) {
  const id = String(b.id || ""), kind = String(b.kind || "");
  if (!idOk(id) || !EVENT_KINDS.includes(kind)) return json(res, 400, { ok: false });
  const ua = String(req.headers["user-agent"] || "");
  if (!ua || BOT.test(ua)) return json(res, 200, { ok: true });
  const r = await getPartner(id);
  if (!r) return json(res, 404, { ok: false });
  const day = etParts().date;
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const visitor = crypto.createHash("sha256").update(["pv", ip, ua, day, process.env.CRON_SECRET || "ll"].join("|")).digest("hex").slice(0, 24);
  await logPartnerEvent({ partner_id: id, kind, day, visitor });
  return json(res, 200, { ok: true });
}

async function photo(res, id, n) {
  const r = idOk(id) ? await getPartner(id) : null;
  const path = r && (r.photos || [])[n];
  if (!path) { res.statusCode = 404; res.setHeader("Cache-Control", "public, s-maxage=60"); return res.end(); }
  const urls = await signPhotos([path], 24 * 3600);
  if (!urls[path]) { res.statusCode = 404; return res.end(); }
  res.statusCode = 302;
  res.setHeader("Location", urls[path]);
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  return res.end();
}

function gone(res) {
  return sendHtml(res, 404, shell({
    title: "Page not found · Lanier Leash", description: "This partner page isn't active.", path: "/services/", noindex: true,
    body: `<section class="page-hero"><div class="wrap"><span class="eyebrow">Partners</span><h1>This page isn't active</h1><p class="lede">See <a href="/services/">dog services</a>, <a href="/vet-care/">vet care</a> or <a href="/places/">dog-friendly places</a> near Lake Lanier.</p></div></section>`,
  }), "public, s-maxage=60");
}

const maps = (p) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([p.name, p.address || (p.town ? p.town + ", GA" : "")].filter(Boolean).join(", "));
const SCHEMA = { vet: "VeterinaryCare", groomer: "LocalBusiness", trainer: "LocalBusiness", daycare: "LocalBusiness", other: "LocalBusiness", shop: "PetStore", restaurant: "Restaurant", brewery: "Brewery", winery: "Winery", coffee: "CafeOrCoffeeShop", stay: "LodgingBusiness" };
const BACK = { "vet-care": ["/vet-care/", "Vet care"], services: ["/services/", "Dog services"], places: ["/places/", "Places"] };

async function page(res, id) {
  if (!idOk(id)) return gone(res);
  const r = await getPartner(id);
  if (!r || !isRunning(r, etParts().date)) return gone(res);
  const P = toPublic(r), cat = PCATS[r.category] || PCATS.other, back = BACK[cat.where];
  const hasLL = P.lat != null && P.lng != null;
  const services = P.services.split(/\n|;|,(?=\s*[A-Z])/).map((s) => s.trim()).filter(Boolean);
  const acts = [
    P.phone ? `<a class="btn btn-coral" data-track="call" href="tel:${esc(P.phone.replace(/[^\d+]/g, ""))}">${ic("u-phone")}Call ${esc(P.phone)}</a>` : "",
    P.booking_url ? `<a class="btn ${P.phone ? "btn-out" : "btn-coral"}" data-track="booking" href="${esc(P.booking_url)}" target="_blank" rel="noopener sponsored">${ic("u-arrow")}Book online</a>` : "",
    P.address || P.town ? `<a class="btn btn-out" data-track="directions" href="${esc(maps(P))}" target="_blank" rel="noopener">${ic("u-pin")}Directions</a>` : "",
    P.website ? `<a class="btn btn-out" data-track="website" href="${esc(P.website)}" target="_blank" rel="noopener sponsored">Website</a>` : "",
  ].filter(Boolean).join("");
  const ld = {
    "@context": "https://schema.org", "@type": SCHEMA[r.category] || "LocalBusiness", name: P.name, url: `${siteUrl()}/partners/${P.id}/`,
    description: P.tagline || undefined, telephone: P.phone || undefined, sameAs: P.website || undefined,
    address: P.address ? { "@type": "PostalAddress", streetAddress: P.address.split(",")[0], addressLocality: P.town || undefined, addressRegion: "GA", addressCountry: "US" } : undefined,
    geo: hasLL ? { "@type": "GeoCoordinates", latitude: +P.lat, longitude: +P.lng } : undefined,
    image: P.photos.length ? siteUrl() + P.photos[0] : undefined,
  };

  const body = `<section class="page-hero pthero"><div class="wrap">
  <p class="crumbs"><a href="${back[0]}">${back[1]}</a>${back[1] === cat.label ? "" : " › " + esc(cat.label)}</p>
  <span class="sponsor-tag">Sponsored · Featured partner</span>
  <h1>${esc(P.name)}</h1>
  ${P.tagline ? `<p class="lede">${esc(P.tagline)}</p>` : ""}
  <p class="ptmeta">${esc(cat.label)}${P.town ? " · " + esc(P.town) : ""}${P.address ? ` · <a href="${esc(maps(P))}" data-track="directions" target="_blank" rel="noopener">${esc(P.address)}</a>` : ""}</p>
</div></section>
<section class="blk" style="padding-top:4px"><div class="wrap placegrid">
  <div>
    ${P.photos.length ? `<div class="ptgal${P.photos.length > 1 ? " multi" : ""}">${P.photos.map((u, i) => `<img src="${esc(u)}" alt="${esc(P.name)}, photo ${i + 1}" ${i ? 'loading="lazy"' : ""}>`).join("")}</div>` : ""}
    ${P.offer ? `<div class="ptoffer"><span class="eyebrow">Lanier Leash reader offer</span><p>${esc(P.offer)}</p><button type="button" class="btn btn-coral btn-sm" id="ptOfferBtn" data-track="offer">Show this offer</button><p class="fine" id="ptOfferSay" hidden>Show this screen or mention Lanier Leash when you book.</p></div>` : ""}
    <div class="acts big">${acts}</div>
    ${P.about ? `<h2 class="h2s">About</h2><div class="prose">${esc(P.about).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, "<br>")}</p>`).join("")}</div>` : ""}
    ${services.length ? `<h2 class="h2s">Services</h2><ul class="ticks">${services.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
    ${P.hours_text ? `<div class="hoursbox"><span class="eyebrow">Hours</span><p>${esc(P.hours_text)}</p></div>` : ""}
    ${P.place_id ? `<p class="note">${ic("u-users")} <a href="/places/${encodeURIComponent(P.place_id)}/">See the dog rule and what readers say</a> on their regular listing.</p>` : ""}
    <div class="ptdisc"><b>Why this page is marked Sponsored</b><p>${esc(P.name)} pays to be a featured partner on Lanier Leash. That gets them this page and a labeled card on our ${esc(back[1].toLowerCase())} page. It never changes a dog rule, a badge, reader reports or where anyone appears in emergency listings. <a href="/advertise/#partners">How partnerships work</a>.</p></div>
  </div>
  <aside>
    ${hasLL ? `<div class="mapbox small"><div id="map" role="region" aria-label="Map of ${esc(P.name)}"></div></div>` : ""}
    <div class="joincard"><b>Run a dog business near the lake?</b><p>Featured partners get their own page, a card on the right page of the site and a mention in the first Thursday email each month.</p><a class="btn btn-coral" href="/advertise/#partners">${ic("u-heart")}Become a partner</a></div>
  </aside>
</div></section>`;

  const leaflet = hasLL ? `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>(function(){if(!window.L||!window.L.map)return;var ll=[${+P.lat},${+P.lng}];var m=window.L.map("map",{scrollWheelZoom:false}).setView(ll,14);
window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
window.L.marker(ll,{icon:window.L.divIcon({className:"",html:'<div class="pin partner"></div>',iconSize:[30,30],iconAnchor:[15,30]})}).addTo(m);})();</script>` : "";
  const tracker = `<script>(function(){var id=${JSON.stringify(P.id)};function t(k){try{var b=new Blob([JSON.stringify({action:"track",id:id,kind:k})],{type:"application/json"});if(!(navigator.sendBeacon&&navigator.sendBeacon("/api/partners",b)))fetch("/api/partners",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"track",id:id,kind:k}),keepalive:true});}catch(e){}}
t("view");document.addEventListener("click",function(e){var a=e.target.closest("[data-track]");if(a)t(a.dataset.track);});
var ob=document.getElementById("ptOfferBtn");if(ob)ob.addEventListener("click",function(){document.getElementById("ptOfferSay").hidden=false;ob.hidden=true;});})();</script>`;
  return sendHtml(res, 200, shell({
    title: `${P.name}${P.town ? ", " + P.town : ""}: ${cat.label.toLowerCase()} · Lanier Leash`,
    description: (P.tagline || `${P.name} is ${cat.a || "a local dog business"}${P.town ? " in " + P.town + ", GA" : ""}.`) + " Featured partner of Lanier Leash.",
    path: `/partners/${P.id}/`, body, image: P.photos.length ? P.photos[0] : "/img/hero.jpg",
    head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
    scripts: leaflet + tracker,
  }), "public, s-maxage=300, stale-while-revalidate=3600");
}
