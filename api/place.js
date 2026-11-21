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
const THUMB = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 21h4V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>`;
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
  <span class="eyebrow">${ic(ICON[p.category] || "i-park")} <a href="/places/?cat=${p.category}">${esc(c.short)}</a> · <a href="/places/?q=${encodeURIComponent((p.town || "").split(" (")[0])}">${esc(p.town)}</a></span>
  <h1>${esc(p.name)}</h1>
  ${p.address ? `<p class="lede addr">${ic("u-pin")}<a href="${esc(maps(p))}" target="_blank" rel="noopener">${esc(p.address)}</a></p>` : ""}
</div></section>
<section class="blk" style="padding-top:4px"><div class="wrap placegrid">
  <div>
    <div class="rulecard${isNo ? " no" : ""}">
      <span class="eyebrow">${isNo ? "Dogs not allowed" : "The dog rule"}</span>
      <p class="big">${ic("u-leash")}<span>${esc(p.dog_rule)}</span></p>
      <div class="st"><a class="badge ${b.cls}" href="/places/?status=${p.status}" title="See every place with this badge">${ic(b.icon)}${b.label}</a><span class="chk">${p.checked ? (p.source_url ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener">Checked ${esc(fmtChecked(p.checked))}</a>` : "Checked " + esc(fmtChecked(p.checked))) : "Not checked yet"}${p.source_name ? " · " + esc(p.source_name) : ""}</span></div>
      <p class="why">${esc(b.desc)} <a href="/places/#how-we-check">How we check</a>.${p.source_url ? ` <a href="${esc(p.source_url)}" target="_blank" rel="noopener">See the source${host(p.source_url) ? " (" + esc(host(p.source_url)) + ")" : ""}</a>.` : ""}</p>
    </div>
    ${p.description ? `<div class="prose">${esc(p.description).split(/\n{2,}/).map((x) => `<p>${x}</p>`).join("")}</div>` : p.notes ? `<p class="prose">${esc(p.notes)}</p>` : ""}
    <div class="acts big">${links}</div>
    ${isNo ? "" : `<div class="fb" id="fb" data-id="${esc(p.id)}" hidden>
      <div class="fbtop"><div><span class="eyebrow">Been here with your dog?</span><p class="fbq">How was it?</p></div>
        <div class="thumbs"><button type="button" class="th up" data-v="1" aria-pressed="false">${THUMB}<span>Good for dogs</span><b class="n" id="fbUp">0</b></button><button type="button" class="th down" data-v="-1" aria-pressed="false">${THUMB}<span>Heads-up</span><b class="n" id="fbDown">0</b></button></div></div>
      <div class="fbtags" id="fbTags" hidden><p class="fbhint" id="fbHint"></p><div class="chips" id="fbChips"></div></div>
      <div class="fbsum" id="fbSum"></div>
      <p class="fbmsg" id="fbMsg" role="status"></p>
    </div>`}
    <p class="note">Dog rules change, so a quick call ahead never hurts. <a href="${esc(fix)}">Something wrong or out of date?</a> Own this place? <a href="/submit/?type=claim&amp;business=${encodeURIComponent(p.name)}">Claim the listing</a> to update it.</p>
    ${sameKind.length ? `<h2 class="h2s">More ${esc(c.label.toLowerCase())} nearby</h2><div class="nearlist">${sameKind.map(nearCard).join("")}</div>` : ""}
    ${other.length ? `<h2 class="h2s">Also near here</h2><div class="nearlist">${other.map(nearCard).join("")}</div>` : ""}
  </div>
  <aside>
    ${hasLL ? `<div class="mapbox small"><div id="map" role="region" aria-label="Map of ${esc(p.name)}"></div></div>` : ""}
    <div class="joincard"><b>Dog events near ${esc(p.town)}, every Thursday</b><p>Free weekend email: events, a walk check and new places.</p><a class="btn btn-coral" href="/#top">${ic("u-paw")}Join free</a></div>
  </aside>
</div></section>`;

  const fbScript = isNo ? "" : `<script>${FB_JS}</script>`;
  const scripts = hasLL ? `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>(function(){if(!window.L||!window.L.map)return;var ll=[${+p.lat},${+p.lng}];var m=window.L.map("map",{scrollWheelZoom:false}).setView(ll,14);
window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
window.L.marker(ll,{icon:window.L.divIcon({className:"",html:'<div class="pin ${isNo ? "nodogs" : p.category}"></div>',iconSize:[30,30],iconAnchor:[15,30]})}).addTo(m);})();</script>` : "";
  const head = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  return sendHtml(res, 200, shell({ title, description, path: `/places/${p.id}/`, body, head, scripts: scripts + fbScript, current: "places" }));
}

// Thumbs + preset tags. Hidden until /api/feedback answers, so the page still works if feedback is down.
const FB_JS = `(function(){
var box=document.getElementById("fb");if(!box||!window.fetch)return;var id=box.dataset.id,S=null,busy=false;
var $=function(i){return document.getElementById(i)};
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}
function draw(d){S=d;box.hidden=false;$("fbUp").textContent=d.up;$("fbDown").textContent=d.down;
var mv=d.mine?d.mine.vote:0,mt=d.mine?d.mine.tags:[];
box.querySelectorAll(".th").forEach(function(b){b.setAttribute("aria-pressed",String(+b.dataset.v===mv))});
var opts=mv===1?d.options.up:mv===-1?d.options.down:[];
$("fbTags").hidden=!opts.length;
$("fbHint").textContent=mv===1?"Thanks! Anything stand out? Tap all that apply.":"Thanks for the heads-up. What did you notice?";
$("fbChips").innerHTML=opts.map(function(o){return '<button type="button" class="chip" data-t="'+o.id+'" aria-pressed="'+(mt.indexOf(o.id)>=0)+'">'+esc(o.label)+'</button>'}).join("");
var all=d.options.up.concat(d.options.down),lab={};all.forEach(function(o){lab[o.id]=o.label});
var top=Object.keys(d.tags).sort(function(a,b){return d.tags[b]-d.tags[a]}).slice(0,6);
var tot=d.up+d.down;
$("fbSum").innerHTML=tot?'<p><b>'+tot+(tot===1?" reader":" readers")+'</b> weighed in'+(top.length?":":".")+'</p>'+(top.length?'<div class="said">'+top.map(function(t){var bad=d.options.down.some(function(o){return o.id===t});return '<span class="'+(bad?"bad":"good")+'">'+esc(lab[t])+' <b>'+d.tags[t]+'</b></span>'}).join("")+'</div>':""):'<p>No reader reports yet. Be the first.</p>';}
function send(vote,tags,msg){if(busy)return;busy=true;$("fbMsg").textContent="Saving…";
fetch("/api/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:id,vote:vote,tags:tags})}).then(function(r){return r.json()}).then(function(d){busy=false;if(!d.ok){$("fbMsg").textContent=d.error||"Couldn't save that.";return}draw(d);$("fbMsg").textContent=msg||""}).catch(function(){busy=false;$("fbMsg").textContent="Couldn't save that. Try again."})}
box.addEventListener("click",function(e){var b=e.target.closest(".th");if(b&&S){var v=+b.dataset.v,mv=S.mine?S.mine.vote:0;send(v===mv?0:v,[],v===mv?"Vote removed.":"Saved. Thanks!");return}
var c=e.target.closest("[data-t]");if(c&&S&&S.mine){var t=S.mine.tags.slice(),i=t.indexOf(c.dataset.t);if(i>=0)t.splice(i,1);else t.push(c.dataset.t);send(S.mine.vote,t,"Saved.")}});
fetch("/api/feedback?id="+encodeURIComponent(id)).then(function(r){return r.json()}).then(function(d){if(d&&d.ok)draw(d)}).catch(function(){});
})();`;
