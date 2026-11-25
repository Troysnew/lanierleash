// GET /places/<id>/ (rewritten to /api/place?id=<id>): one page per place, built on the server so
// search engines can read it. Shows the dog rule, where it came from, a map and nearby places.
import { publishedPlaces, CATS, catBadge } from "./_lib/places.js";
import { miles, fmtMi } from "./_lib/content.js";
import { esc } from "./_lib/templates.js";
import { shell, sendHtml } from "./_lib/page.js";
import { siteUrl, log } from "./_lib/util.js";
import PHOTOS from "../data/place-photos.json" with { type: "json" };
import AFF from "../data/affiliates.json" with { type: "json" };

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

// Licensed real photos (Wikimedia Commons). Credited under the photo, as their licenses require.
// Bundled with the function, so a deploy always serves the current list (no fetch, no stale cache).
async function photos() { return PHOTOS; }

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
  const ph = (await photos())[p.id];
  const photoHtml = ph ? `<figure class="placephoto"><img src="/img/places/${esc(ph.file)}" alt="${esc(ph.alt || p.name)}" width="${ph.w || 900}" height="${ph.h || 600}"><figcaption>${ph.illustration ? "Illustration (AI-generated), not a photo of this place." : `Photo: <a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.artist || "Wikimedia Commons")}</a>, ${esc(ph.license)}${ph.changed ? ", resized" : ""}`}</figcaption></figure>` : "";
  const hasLL = p.lat !== "" && p.lng !== "" && !isNaN(+p.lat) && !isNaN(+p.lng);
  const near = hasLL ? places.filter((x) => x.id !== p.id && x.status !== "nodogs" && x.lat !== "" && x.lng !== "")
    .map((x) => ({ ...x, mi: miles({ lat: +p.lat, lng: +p.lng }, x.lat, x.lng) })).filter((x) => x.mi != null && x.mi <= 15).sort((a, z) => a.mi - z.mi) : [];
  const sameKind = near.filter((x) => x.category === p.category).slice(0, 4);
  const other = near.filter((x) => x.category !== p.category && !sameKind.includes(x)).slice(0, 4);
  const nearCard = (x) => `<a class="nearby" href="/places/${encodeURIComponent(x.id)}/"><span class="cat cb">${catBadge(x.category)}</span><span><b>${esc(x.name)}</b><small>${esc((CATS[x.category] || CATS.park).short)} · ${esc(x.town)} · ${x.mi < 0.1 ? "next door" : fmtMi(x.mi) + " away"}</small></span></a>`;

  const isNo = p.status === "nodogs";
  const title = isNo ? `${p.name}, ${p.town}: are dogs allowed? · Lanier Leash` : `${p.name}, ${p.town}: dog rules · Lanier Leash`;
  const description = (isNo ? `Dogs are not allowed at ${p.name} in ${p.town}, GA. ` : `Dog rule at ${p.name} in ${p.town}, GA: `) + (p.dog_rule ? p.dog_rule.replace(/[.\s]*$/, ".") : "") + (p.checked ? ` Checked ${fmtChecked(p.checked)}.` : "");
  const links = [
    `<a class="btn btn-coral" href="${esc(maps(p))}" target="_blank" rel="noopener">${ic("u-pin")}Directions</a>`,
    p.website ? `<a class="btn btn-out" href="${esc(p.website)}" target="_blank" rel="noopener">${ic("u-arrow")}Website</a>` : "",
    p.category === "stay" && AFF.hotel && AFF.hotel.url ? `<a class="btn btn-out" href="${esc(affUrl(AFF.hotel, p.name + (p.town ? ", " + p.town.split(" (")[0] : "") + ", GA"))}" target="_blank" rel="${AFF.hotel.affiliate ? "sponsored noopener" : "noopener"}">${ic("i-stay")}${esc(AFF.hotel.label || "Check rates")}</a>` : "",
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
    ${photoHtml}
    <div class="rulecard${isNo ? " no" : ""}">
      <span class="eyebrow">${isNo ? "Dogs not allowed" : "The dog rule"}</span>
      <p class="big">${ic("u-leash")}<span>${esc(p.dog_rule)}</span></p>
      <div class="st"><a class="badge ${b.cls}" href="/places/?status=${p.status}" title="See every place with this badge">${ic(b.icon)}${b.label}</a><span class="chk">${p.checked ? (p.source_url ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener">Checked ${esc(fmtChecked(p.checked))}</a>` : "Checked " + esc(fmtChecked(p.checked))) : "Not checked yet"}${p.source_name ? " · " + esc(p.source_name) : ""}</span></div>
      <p class="why">${esc(b.desc)} <a href="/places/#how-we-check">How we check</a>.${p.source_url ? ` <a href="${esc(p.source_url)}" target="_blank" rel="noopener">See the source${host(p.source_url) ? " (" + esc(host(p.source_url)) + ")" : ""}</a>.` : ""}</p>
    </div>
    ${p.description ? `<div class="prose">${esc(p.description).split(/\n{2,}/).map((x) => `<p>${x}</p>`).join("")}</div>` : p.notes ? `<p class="prose">${esc(p.notes)}</p>` : ""}
    <div class="acts big">${links}<button class="btn btn-out savebtn" type="button" id="saveBtn" data-id="${esc(p.id)}" aria-pressed="false" hidden>${HEART}<span>Save</span></button></div>
    ${p.category === "stay" && AFF.hotel && AFF.hotel.affiliate ? `<p class="fine">${esc(AFF.hotel.disclosure || "If you book through this link we may earn a small commission. It never changes a dog rule or a badge.")}</p>` : ""}
    ${p.hours_text || p.hours ? `<div class="hoursbox" data-hours="${esc(p.hours || "")}"><span class="eyebrow">Hours</span><p><b class="openst" hidden></b>${esc(p.hours_text || p.hours)}</p><small>Hours change, especially on holidays. Call ahead to be sure.</small></div>` : ""}
    ${isNo ? "" : `<div class="fb" id="fb" data-id="${esc(p.id)}" hidden>
      <div class="fbtop"><div><span class="eyebrow">Been here with your dog?</span><p class="fbq">How was it?</p></div>
        <div class="thumbs"><button type="button" class="th up" data-v="1" aria-pressed="false">${THUMB}<span>Good for dogs</span><b class="n" id="fbUp">0</b></button><button type="button" class="th down" data-v="-1" aria-pressed="false">${THUMB}<span>Heads-up</span><b class="n" id="fbDown">0</b></button></div></div>
      <div class="fbtags" id="fbTags" hidden><p class="fbhint" id="fbHint"></p><div class="chips" id="fbChips"></div></div>
      <div class="fbsum" id="fbSum"></div>
      <p class="fbmsg" id="fbMsg" role="status"></p>
    </div>`}
    ${isNo ? "" : `<div class="rphotos" id="rp" data-id="${esc(p.id)}">
      <div class="fbtop"><div><span class="eyebrow">Dogs who've been here</span><p class="fbq" id="rpQ">Share a photo of your dog here</p></div>
        <button class="btn btn-out btn-sm" type="button" id="rpAdd">${ic("u-camera")}Add a photo</button></div>
      <div class="rpgrid" id="rpGrid" hidden></div>
      <form class="rpform" id="rpForm" hidden novalidate>
        <input type="text" name="hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="drop"><input id="rpFile" type="file" accept="image/jpeg,image/png,image/webp,image/*"><span id="rpDrop">${ic("u-camera")}<b>Choose a photo</b><span>Your dog at ${esc(p.name)}. Faces are best.</span></span><img id="rpPrev" alt="" hidden></label>
        <div class="rprow"><label>Dog's name<input name="dog_name" maxlength="60" required></label><label>Your first name<input name="owner" maxlength="60" autocomplete="given-name"></label></div>
        <label>Email <small>(optional, only to tell you when it's up)</small><input name="email" type="email" maxlength="120" autocomplete="email"></label>
        <label class="chk"><input type="checkbox" name="consent"> <span>It's my photo and Lanier Leash can show it on this page.</span></label>
        <button class="btn btn-coral" type="submit" id="rpSend">Send photo</button>
      </form>
      <p class="fbmsg" id="rpMsg" role="status"></p>
    </div>`}
    <p class="note">${isNo ? "" : "Dog rules change, so a quick call ahead never hurts. "}<a href="${esc(fix)}">Something wrong or out of date?</a>${isNo ? "" : ` Own this place? <a href="/submit/?type=claim&amp;business=${encodeURIComponent(p.name)}">Claim the listing</a> to update it.`}</p>
    ${sameKind.length ? `<h2 class="h2s">More ${esc(c.label.toLowerCase())} nearby</h2><div class="nearlist">${sameKind.map(nearCard).join("")}</div>` : ""}
    ${other.length ? `<h2 class="h2s">Also near here</h2><div class="nearlist">${other.map(nearCard).join("")}</div>` : ""}
  </div>
  <aside>
    ${hasLL ? `<div class="mapbox small"><div id="map" role="region" aria-label="Map of ${esc(p.name)}"></div></div>` : ""}
    <div class="joincard"><b>Dog events near ${esc(p.town)}, every Thursday</b><p>Free weekend email: events, a walk check and new places.</p><a class="btn btn-coral" href="/#top">${ic("u-paw")}Join free</a></div>
  </aside>
</div></section>`;

  const fbScript = `<script>${SAVE_JS}</script>` + (isNo ? "" : `<script>${FB_JS}</script><script>${RP_JS}</script>`) + (p.hours ? `<script src="/assets/hours.js"></script><script>(function(){var b=document.querySelector(".hoursbox"),o=b&&b.querySelector(".openst");if(!o||!window.LLHours)return;var st=window.LLHours.state(b.dataset.hours);if(!st)return;o.hidden=false;o.className="openst "+(st.open?"on":"off");o.textContent=st.label;})();</script>` : "");
  const scripts = hasLL ? `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>(function(){if(!window.L||!window.L.map)return;var ll=[${+p.lat},${+p.lng}];var m=window.L.map("map",{scrollWheelZoom:false}).setView(ll,14);
window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
window.L.marker(ll,{icon:window.L.divIcon({className:"",html:'<div class="pin ${isNo ? "nodogs" : p.category}"></div>',iconSize:[30,30],iconAnchor:[15,30]})}).addTo(m);})();</script>` : "";
  const head = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  return sendHtml(res, 200, shell({ title, description, path: `/places/${p.id}/`, image: ph ? `/img/places/${ph.file}` : undefined, body, head, scripts: scripts + fbScript, current: "places" }));
}

const HEART = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20.5s-8-4.9-8-10.6A4.6 4.6 0 0112 7a4.6 4.6 0 018 2.9c0 5.7-8 10.6-8 10.6z"/></svg>';
// Booking link: the search URL with {q}, plus the affiliate query string once one is set in data/affiliates.json.
function affUrl(a, q) { const u = a.url.replace("{q}", encodeURIComponent(q)); return a.affiliate ? u + (u.includes("?") ? "&" : "?") + a.affiliate : u; }

// Heart: saved places live in this browser (same list as the Save buttons on /places/).
const SAVE_JS = `(function(){var b=document.getElementById("saveBtn");if(!b)return;var id=b.dataset.id;
function get(){try{var a=JSON.parse(localStorage.getItem("ll_saved")||"[]");return Array.isArray(a)?a:[]}catch(e){return null}}
function draw(){var a=get()||[],on=a.indexOf(id)>=0;b.setAttribute("aria-pressed",String(on));b.querySelector("span").textContent=on?"Saved":"Save";b.title=on?"Remove from your saved places":"Save to your list on the Places page"}
if(get()===null)return;b.hidden=false;draw();
b.addEventListener("click",function(){var a=get()||[],i=a.indexOf(id);if(i>=0)a.splice(i,1);else a.unshift(id);try{localStorage.setItem("ll_saved",JSON.stringify(a.slice(0,300)))}catch(e){}draw()});})();`;

// Reader photos: approved ones load from /api/feedback?photos=1; new ones go to /admin/ for a look first.
const RP_JS = `(function(){
var box=document.getElementById("rp");if(!box||!window.fetch)return;var id=box.dataset.id,$=function(x){return document.getElementById(x)},photo=null,t0=Date.now();
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}
fetch("/api/feedback?photos=1&id="+encodeURIComponent(id)).then(function(r){return r.json()}).then(function(d){
  if(!d||!d.ok||!d.photos||!d.photos.length)return;var g=$("rpGrid");g.hidden=false;$("rpQ").textContent=d.photos.length+(d.photos.length===1?" dog has":" dogs have")+" been here";
  g.innerHTML=d.photos.map(function(p){return '<figure><a href="'+esc(p.photo)+'" target="_blank" rel="noopener"><img src="'+esc(p.photo)+'" alt="'+esc(p.dog||"A dog")+' here" loading="lazy"></a><figcaption><b>'+esc(p.dog)+'</b>'+(p.owner?" with "+esc(p.owner):"")+'</figcaption></figure>'}).join("");
}).catch(function(){});
$("rpAdd").addEventListener("click",function(){var f=$("rpForm");f.hidden=!f.hidden;if(!f.hidden)f.querySelector("[name=dog_name]").focus()});
function shrink(file){return new Promise(function(ok,bad){var img=new Image();img.onload=function(){var s=Math.min(1,1400/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);ok(c.toDataURL("image/jpeg",0.85))};img.onerror=function(){bad(new Error("x"))};img.src=URL.createObjectURL(file)})}
$("rpFile").addEventListener("change",function(){var f=this.files&&this.files[0];if(!f)return;$("rpMsg").textContent="";shrink(f).then(function(d){photo=d;$("rpPrev").src=d;$("rpPrev").hidden=false;$("rpDrop").hidden=true}).catch(function(){photo=null;$("rpMsg").textContent="We couldn't read that photo. Try a JPG or PNG."})});
$("rpForm").addEventListener("submit",function(e){e.preventDefault();var f=e.target,m=$("rpMsg"),b=$("rpSend");
  if(!photo){m.textContent="Choose a photo first.";return}
  if(!f.dog_name.value.trim()){m.textContent="Add your dog's name.";f.dog_name.focus();return}
  if(!f.consent.checked){m.textContent="Tick the box so we can show it.";return}
  b.disabled=true;m.textContent="Sending…";
  fetch("/api/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"photo",place_id:id,place:id,dog_name:f.dog_name.value,owner:f.owner.value,email:f.email.value.trim()||undefined,consent:true,photo:photo,hp:f.hp.value,t0:t0})})
  .then(function(r){return r.json()}).then(function(d){b.disabled=false;if(!d.ok){m.textContent=d.error||"Something went wrong. Try again in a minute.";return}
    f.hidden=true;f.reset();photo=null;$("rpPrev").hidden=true;$("rpDrop").hidden=false;m.textContent="Thanks! We take a quick look at every photo, then it shows up here.";})
  .catch(function(){b.disabled=false;m.textContent="Something went wrong. Try again in a minute."});
});})();`;

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
