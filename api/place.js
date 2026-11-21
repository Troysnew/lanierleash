// GET /places/<id>/ (rewritten to /api/place?id=<id>): one page per place, built on the server so
// search engines can read it. Shows the dog rule, where it came from, a map and nearby places.
import { publishedPlaces, CATS } from "./_lib/places.js";
import { miles, fmtMi } from "./_lib/content.js";
import { esc } from "./_lib/templates.js";
import { shell, sendHtml } from "./_lib/page.js";
import { siteUrl, log } from "./_lib/util.js";

const BADGE = {
  venue: { cls: "b-ok", icon: "u-check", label: "Venue confirmed", desc: "The venue told us its dog rule directly." },
  official: { cls: "b-off", icon: "u-check", label: "Official rule", desc: "The rule is posted on the place's own website or the agency's rules page." },
  readers: { cls: "b-rd", icon: "u-users", label: "Readers say yes", desc: "Readers visited with their dogs and reported back." },
  unconfirmed: { cls: "b-unv", icon: "u-q", label: "Unconfirmed", desc: "Only listed as dog-friendly on a third-party site. Call ahead, or help us confirm it." },
  nodogs: { cls: "b-no", icon: "u-x", label: "Dogs not allowed", desc: "The official rules ban dogs here. Listed so you don't make the drive." },
};
const ICON = { restaurant: "i-dine", brewery: "i-brew", winery: "i-wine", coffee: "i-coffee", trail: "i-trail", park: "i-park", dogpark: "i-dogpark", lake: "i-lake", shop: "i-shop", stay: "i-stay" };
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtChecked = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}, ${iso.slice(0, 4)}` : "");
const ic = (id) => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;
const maps = (p) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([p.name, p.address || p.town + ", GA"].join(", "));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

function notFound(res) {
  return sendHtml(res, 404, shell({
    title: "Place not found · Lanier Leash", description: "We couldn't find that place.", path: "/places/", current: "places", noindex: true,
    body: `<section class="page-hero"><div class="wrap"><span class="eyebrow">Places</span><h1>We couldn't find that place</h1><p class="lede">It may have closed or moved. <a href="/places/">See every dog-friendly place</a>.</p></div></section>`,
  }), "public, s-maxage=60");
}

export default async function handler(req, res) {
  const id = String((req.query || {}).id || "").toLowerCase().replace(/\/+$/, "");
  if (!/^[a-z0-9-]{1,90}$/.test(id)) return notFound(res);
  let places;
  try { places = (await publishedPlaces()).places; } catch (e) { log("place page failed", e.message); return sendHtml(res, 503, "<p>Please try again in a minute.</p>", "no-store"); }
  const p = places.find((x) => x.id === id);
  if (!p) return notFound(res);

  const c = CATS[p.category] || CATS.park, b = BADGE[p.status] || BADGE.unconfirmed;
  const hasLL = p.lat !== "" && p.lng !== "" && !isNaN(+p.lat) && !isNaN(+p.lng);
  const near = hasLL ? places.filter((x) => x.id !== p.id && x.status !== "nodogs" && x.lat !== "" && x.lng !== "")
    .map((x) => ({ ...x, mi: miles({ lat: +p.lat, lng: +p.lng }, x.lat, x.lng) })).filter((x) => x.mi != null && x.mi <= 15).sort((a, z) => a.mi - z.mi) : [];
  const sameKind = near.filter((x) => x.category === p.category).slice(0, 4);
  const other = near.filter((x) => x.category !== p.category && !sameKind.includes(x)).slice(0, 4);
  const nearCard = (x) => `<a class="nearby" href="/places/${encodeURIComponent(x.id)}/"><span class="cat">${ic(ICON[x.category] || "i-park")}</span><span><b>${esc(x.name)}</b><small>${esc((CATS[x.category] || CATS.park).short)} · ${esc(x.town)} · ${fmtMi(x.mi)} away</small></span></a>`;

  const isNo = p.status === "nodogs";
  const title = isNo ? `${p.name}, ${p.town}: are dogs allowed? · Lanier Leash` : `${p.name}, ${p.town}: dog-friendly ${c.short.toLowerCase()} · Lanier Leash`;
  const description = (isNo ? `Dogs are not allowed at ${p.name} in ${p.town}, GA. ` : `Dog rule at ${p.name} in ${p.town}, GA: `) + (p.dog_rule || "") + (p.checked ? ` Checked ${fmtChecked(p.checked)}.` : "");
  const links = [
    `<a class="btn btn-coral" href="${esc(maps(p))}" target="_blank" rel="noopener">${ic("u-pin")}Directions</a>`,
    p.website ? `<a class="btn btn-out" href="${esc(p.website)}" target="_blank" rel="noopener">${ic("u-arrow")}Website</a>` : "",
    p.phone ? `<a class="btn btn-out" href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">Call ${esc(p.phone)}</a>` : "",
  ].filter(Boolean).join("");
  const fix = `/submit/?type=fix&listing=${encodeURIComponent(p.name + (p.town ? ", " + p.town : ""))}&ref=${encodeURIComponent("place:" + p.id)}`;

  const ld = {
    "@context": "https://schema.org", "@type": { restaurant: "Restaurant", brewery: "Brewery", winery: "Winery", coffee: "CafeOrCoffeeShop", park: "Park", dogpark: "Park", trail: "Park", lake: "Park", shop: "PetStore", stay: "LodgingBusiness" }[p.category] || "Place",
    name: p.name, url: `${siteUrl()}/places/${p.id}/`,
    address: p.address ? { "@type": "PostalAddress", streetAddress: p.address.split(",")[0], addressLocality: p.town, addressRegion: "GA", addressCountry: "US" } : undefined,
    geo: hasLL ? { "@type": "GeoCoordinates", latitude: +p.lat, longitude: +p.lng } : undefined,
    sameAs: p.website || undefined, telephone: p.phone || undefined,
    amenityFeature: !isNo && ["restaurant", "brewery", "winery", "coffee", "shop", "stay"].includes(p.category) ? { "@type": "LocationFeatureSpecification", name: "Dogs allowed", value: true } : undefined,
  };

  const body = `<section class="page-hero placehero"><div class="wrap">
  <p class="crumbs"><a href="/places/">Places</a> › <a href="/places/?cat=${p.category}">${esc(c.label)}</a></p>
  <span class="eyebrow">${ic(ICON[p.category] || "i-park")} ${esc(c.short)} · ${esc(p.town)}</span>
  <h1>${esc(p.name)}</h1>
  ${p.address ? `<p class="lede addr">${ic("u-pin")}${esc(p.address)}</p>` : ""}
</div></section>
<section class="blk" style="padding-top:4px"><div class="wrap placegrid">
  <div>
    <div class="rulecard${isNo ? " no" : ""}">
      <span class="eyebrow">${isNo ? "Dogs not allowed" : "The dog rule"}</span>
      <p class="big">${ic("u-leash")}<span>${esc(p.dog_rule)}</span></p>
      <div class="st"><span class="badge ${b.cls}">${ic(b.icon)}${b.label}</span><span class="chk">${p.checked ? "Checked " + esc(fmtChecked(p.checked)) : "Not checked yet"}${p.source_name ? " · " + esc(p.source_name) : ""}</span></div>
      <p class="why">${esc(b.desc)}${p.source_url ? ` <a href="${esc(p.source_url)}" target="_blank" rel="noopener">See the source${host(p.source_url) ? " (" + esc(host(p.source_url)) + ")" : ""}</a>.` : ""}</p>
    </div>
    ${p.description ? `<div class="prose">${esc(p.description).split(/\n{2,}/).map((x) => `<p>${x}</p>`).join("")}</div>` : p.notes ? `<p class="prose">${esc(p.notes)}</p>` : ""}
    <div class="acts big">${links}</div>
    <p class="note">Dog rules change, so a quick call ahead never hurts. <a href="${esc(fix)}">Something wrong or out of date?</a> Own this place? <a href="/submit/?type=claim&amp;business=${encodeURIComponent(p.name)}">Claim the listing</a> to update it.</p>
    ${sameKind.length ? `<h2 class="h2s">More ${esc(c.label.toLowerCase())} nearby</h2><div class="nearlist">${sameKind.map(nearCard).join("")}</div>` : ""}
    ${other.length ? `<h2 class="h2s">Also near here</h2><div class="nearlist">${other.map(nearCard).join("")}</div>` : ""}
  </div>
  <aside>
    ${hasLL ? `<div class="mapbox small"><div id="map" role="region" aria-label="Map of ${esc(p.name)}"></div></div>` : ""}
    <div class="joincard"><b>Dog events near ${esc(p.town)}, every Thursday</b><p>Free weekend email: events, a walk check and new places.</p><a class="btn btn-coral" href="/#top">${ic("u-paw")}Join free</a></div>
  </aside>
</div></section>`;

  const scripts = hasLL ? `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>(function(){if(!window.L||!window.L.map)return;var ll=[${+p.lat},${+p.lng}];var m=window.L.map("map",{scrollWheelZoom:false}).setView(ll,14);
window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
window.L.marker(ll,{icon:window.L.divIcon({className:"",html:'<div class="pin ${isNo ? "nodogs" : p.category}"></div>',iconSize:[30,30],iconAnchor:[15,30]})}).addTo(m);})();</script>` : "";
  const head = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  return sendHtml(res, 200, shell({ title, description, path: `/places/${p.id}/`, body, head, scripts, current: "places" }));
}
