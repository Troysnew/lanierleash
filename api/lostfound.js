// Lost & found pets.
//   GET  /api/lostfound?list=1                 -> { ok, posts } live posts + happy endings from the last 60 days
//   GET  /api/lostfound?confirm=TOKEN          -> puts a post live, redirects to its page
//   GET  /lost-found/<id>/        (rewritten to ?page=<id>)   -> the post's page
//   GET  /lost-found/<id>/photo   (rewritten to ?photo=<id>)  -> redirects to the (private) photo
//   GET  /api/lostfound?owner=<id>&t=TOKEN     -> what the poster's own controls need
//   POST {action:"post", ...fields, photo, hp, t0}               -> saves it and emails the confirm link
//   POST {action:"contact", id, name, email, phone, message, hp, t0} -> emails the poster (reply goes to sender)
//   POST {action:"owner", id, t, op: reunited|renew|reopen|remove}
import crypto from "node:crypto";
import {
  insertLost, lostBy, updateLost, boardPosts, recentLostBy, logLostMsg, recentLostMsgs,
  uploadPhoto, signPhotos, deletePhoto,
} from "./_lib/db.js";
import { cleanPost, postId, toPublic, isLive, headline, looks, lfConfirmEmail, lfContactEmail, lfAdminEmail, DAYS_LIVE, MAX_PHOTO, SPECIES, cleanPhone } from "./_lib/lostfound.js";
import { geocode } from "./_lib/events.js";
import { send, message } from "./_lib/mail.js";
import { esc } from "./_lib/templates.js";
import { shell, sendHtml } from "./_lib/page.js";
import { body, json, redirect, cleanEmail, etParts, siteUrl, token, log } from "./_lib/util.js";

const ipHash = (req) => {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  return crypto.createHash("sha256").update("lf|" + ip + "|" + (process.env.CRON_SECRET || "ll")).digest("hex").slice(0, 32);
};
const isBot = (b) => b.hp || (b.t0 && Date.now() - +b.t0 < 3000);
const later = (days) => new Date(Date.now() + days * 864e5).toISOString();
const idOk = (id) => /^[a-z0-9-]{4,90}$/.test(id);
const HAPPY_DAYS = 60;

export default async function handler(req, res) {
  const q = req.query || {};
  try {
    if (req.method === "POST") {
      const b = body(req);
      if (b.action === "post") return await post(req, res, b);
      if (b.action === "contact") return await contact(req, res, b);
      if (b.action === "owner") return await owner(res, b);
      return json(res, 400, { ok: false, error: "Unknown action" });
    }
    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Use GET or POST" });
    if (q.list) return await list(res);
    if (q.confirm) return await confirm(res, String(q.confirm));
    if (q.photo) return await photo(res, String(q.photo).toLowerCase());
    if (q.page) return await page(res, String(q.page).toLowerCase().replace(/\/+$/, ""));
    if (q.owner) {
      const r = await lostBy("id", String(q.owner));
      if (!r || r.token !== String(q.t || "") || r.status === "removed") return json(res, 404, { ok: false, error: "This link isn't valid anymore." });
      return json(res, 200, { ok: true, status: toPublic(r).status, expires_at: r.expires_at, headline: headline(r), kind: r.kind, pet_name: r.pet_name || "" });
    }
    return json(res, 400, { ok: false, error: "Unknown request" });
  } catch (e) {
    log("lostfound failed", e.message);
    if (q.page) return sendHtml(res, 503, "<p>Please try again in a minute.</p>", "no-store");
    return json(res, e.status === 404 ? 503 : 500, { ok: false, error: "Something went wrong on our end. Please try again in a minute." });
  }
}

async function list(res) {
  const now = Date.now(), rows = await boardPosts();
  const posts = rows.filter((r) => isLive(r, now) || (r.status === "reunited" && now - Date.parse(r.reunited_at || r.updated_at) < HAPPY_DAYS * 864e5)).map(toPublic);
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify({ ok: true, posts }));
}

async function post(req, res, b) {
  if (isBot(b)) return json(res, 200, { ok: true, sent: true });
  const today = etParts().date;
  const c = cleanPost(b, today);
  if (!c.ok) return json(res, 400, c);
  let pic = null;
  if (b.photo) {
    const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.photo));
    if (!m) return json(res, 400, { ok: false, error: "That photo didn't work. Try a JPG or PNG.", field: "photo" });
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > MAX_PHOTO) return json(res, 400, { ok: false, error: "That photo is too big. Try a smaller one.", field: "photo" });
    pic = { buf, type: m[1], ext: m[2] === "jpeg" ? "jpg" : m[2] };
  }
  const ip = ipHash(req);
  const recent = await recentLostBy(ip, new Date(Date.now() - 3600e3).toISOString());
  if (recent.length >= 4) return json(res, 429, { ok: false, error: "That's a lot of posts at once. Please try again in an hour." });

  const hit = await geocode({ venue: c.post.last_seen, town: c.post.town }).catch(() => null);
  const row = { ...c.post, id: postId(c.post), token: token(), ip_hash: ip, status: "pending" };
  if (hit) { row.lat = hit.lat; row.lng = hit.lng; row.approx = hit.how === "town"; }
  if (pic) row.photo_path = await uploadPhoto(`lostfound/${today.slice(0, 7)}/${crypto.randomUUID()}.${pic.ext}`, pic.buf, pic.type);
  const saved = await insertLost(row);
  try { await send(message({ to: saved.email, ...lfConfirmEmail(saved) })); }
  catch (e) { log("lf confirm email failed", e.message); return json(res, 500, { ok: false, error: "We saved your post but couldn't send the email. Please try again in a minute." }); }
  return json(res, 200, { ok: true, sent: true });
}

async function confirm(res, t) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return redirect(res, "/lost-found/?e=link");
  const r = await lostBy("token", t);
  if (!r || r.status === "removed" || r.status === "hidden") return redirect(res, "/lost-found/?e=link");
  if (r.status === "pending") {
    const now = new Date().toISOString();
    const upd = await updateLost(r.id, { status: "active", confirmed_at: now, expires_at: later(DAYS_LIVE) });
    const to = process.env.NOTIFY_EMAIL || process.env.EMAIL_REPLY_TO;
    if (to) { try { await send(message({ to, ...lfAdminEmail(upd) })); } catch (e) { log("lf admin email failed", e.message); } }
    return redirect(res, `/lost-found/${r.id}/?t=${encodeURIComponent(t)}&new=1`);
  }
  return redirect(res, `/lost-found/${r.id}/?t=${encodeURIComponent(t)}`);
}

async function photo(res, id) {
  if (!idOk(id)) { res.statusCode = 404; return res.end(); }
  const r = await lostBy("id", id);
  if (!r || !r.photo_path || !["active", "reunited"].includes(r.status)) { res.statusCode = 404; res.setHeader("Cache-Control", "public, s-maxage=60"); return res.end(); }
  const urls = await signPhotos([r.photo_path], 24 * 3600);
  if (!urls[r.photo_path]) { res.statusCode = 404; return res.end(); }
  res.statusCode = 302;
  res.setHeader("Location", urls[r.photo_path]);
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  return res.end();
}

async function contact(req, res, b) {
  if (isBot(b)) return json(res, 200, { ok: true });
  const id = String(b.id || "");
  const name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const email = cleanEmail(b.email);
  const msg = String(b.message || "").replace(/\r/g, "").trim().slice(0, 1200);
  const phone = b.phone ? cleanPhone(b.phone) : null;
  if (!name) return json(res, 400, { ok: false, error: "Add your name.", field: "name" });
  if (!email) return json(res, 400, { ok: false, error: "Add your email so they can reply.", field: "email" });
  if (b.phone && !phone) return json(res, 400, { ok: false, error: "That phone number doesn't look right.", field: "phone" });
  if (msg.length < 10) return json(res, 400, { ok: false, error: "Write a little more so they know what you saw.", field: "message" });
  if (/https?:\/\//i.test(msg) && (msg.match(/https?:\/\//gi) || []).length > 2) return json(res, 400, { ok: false, error: "Please leave out the links.", field: "message" });
  if (!idOk(id)) return json(res, 404, { ok: false, error: "This post isn't up anymore." });
  const r = await lostBy("id", id);
  if (!r || !isLive(r)) return json(res, 404, { ok: false, error: "This post isn't up anymore." });
  const ip = ipHash(req), hour = new Date(Date.now() - 3600e3).toISOString(), day = new Date(Date.now() - 864e5).toISOString();
  const [mine, theirs] = await Promise.all([recentLostMsgs("ip_hash", ip, hour), recentLostMsgs("post_id", id, day)]);
  if (mine.length >= 5) return json(res, 429, { ok: false, error: "You've sent several messages. Please try again in an hour." });
  if (theirs.length >= 30) return json(res, 429, { ok: false, error: "This post has had a lot of messages today. Try again tomorrow, or call if a phone number is listed." });
  const m = message({ to: r.email, ...lfContactEmail(r, { name, message: msg, phone }) });
  m.reply_to = email;
  await send(m);
  await logLostMsg({ post_id: id, ip_hash: ip }).catch((e) => log("lf msg log failed", e.message));
  return json(res, 200, { ok: true });
}

async function owner(res, b) {
  const r = await lostBy("id", String(b.id || ""));
  if (!r || r.token !== String(b.t || "") || r.status === "removed" || r.status === "pending") return json(res, 404, { ok: false, error: "This link isn't valid anymore." });
  if (r.status === "hidden") return json(res, 403, { ok: false, error: "This post was taken down. Reply to your confirmation email if you think that's a mistake." });
  const now = new Date().toISOString();
  let patch;
  if (b.op === "reunited") patch = { status: "reunited", reunited_at: now };
  else if (b.op === "renew" || b.op === "reopen") patch = { status: "active", expires_at: later(DAYS_LIVE), reminded_at: null, reunited_at: null };
  else if (b.op === "remove") {
    if (r.photo_path) await deletePhoto(r.photo_path).catch((e) => log("lf photo delete failed", e.message));
    patch = { status: "removed", photo_path: null };
  } else return json(res, 400, { ok: false, error: "Unknown action" });
  const upd = await updateLost(r.id, patch);
  return json(res, 200, { ok: true, status: toPublic(upd).status, expires_at: upd.expires_at });
}

// ---------- the post's page ----------
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtDate = (iso) => { const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z"); return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const ic = (id) => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;

function gone(res, title, text) {
  return sendHtml(res, 404, shell({
    title: title + " · Lanier Leash", description: "Lost & found pets around Lake Lanier.", path: "/lost-found/", noindex: true,
    body: `<section class="page-hero"><div class="wrap"><span class="eyebrow">Lost &amp; found</span><h1>${esc(title)}</h1><p class="lede">${text} <a href="/lost-found/">See every lost and found pet</a>.</p></div></section>`,
  }), "public, s-maxage=30");
}

async function page(res, id) {
  if (!idOk(id)) return gone(res, "We couldn't find that post", "It may have been taken down.");
  const r = await lostBy("id", id);
  if (!r || r.status === "removed" || r.status === "hidden") return gone(res, "This post is down", "The owner took it down, or it was removed.");
  if (r.status === "pending") return gone(res, "This post isn't live yet", "The poster needs to tap the link in their email first.");
  const P = toPublic(r), live = P.status === "active", home = P.status === "reunited", ended = P.status === "expired";
  const sp = (SPECIES[r.species] || "Pet").toLowerCase();
  const tag = home ? "Home safe" : ended ? "Post ended" : r.kind === "lost" ? `Lost ${sp}` : `Found ${sp}`;
  const cls = home ? "home" : ended ? "ended" : r.kind;
  const seen = r.kind === "lost" ? "Last seen" : "Found";
  const url = `${siteUrl()}/lost-found/${r.id}/`;
  const title = `${headline(r)}${r.town ? " · " + r.town + ", GA" : ""} · Lanier Leash`;
  const desc = `${tag}${P.looks ? ": " + P.looks : ""}. ${seen} ${fmtDate(r.date_seen)} near ${r.last_seen}, ${r.town}.` + (live ? " Seen them? Tap to contact the " + (r.kind === "lost" ? "owner." : "finder.") : "");
  const shareText = `${tag}${r.pet_name ? ": " + r.pet_name : ""}${P.looks ? " (" + P.looks + ")" : ""}. ${seen} near ${r.last_seen}, ${r.town}. Please share!`;
  const hasLL = r.lat != null && r.lng != null;
  const rows = [
    [seen, `${esc(fmtDate(r.date_seen))} · ${esc(r.last_seen)}, ${esc(r.town)}`],
    P.looks ? ["Looks like", esc(P.looks)] : null,
    r.pet_name && r.kind === "lost" ? ["Answers to", esc(r.pet_name)] : null,
    ["Posted by", esc(r.contact_name) + ` <small>on ${esc(fmtDate(etParts(new Date(P.posted)).date))}</small>`],
  ].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  const contactBox = live ? `<div class="lfcontact" id="contact">
      <h2 class="h2s">${r.kind === "lost" ? `Seen ${esc(r.pet_name || "this " + sp)}?` : "Is this your pet?"}</h2>
      ${P.phone ? `<a class="btn btn-coral big" href="tel:${esc(P.phone.replace(/[^\d]/g, ""))}">${ic("u-phone")}Call or text ${esc(P.phone)}</a><p class="fine">Or send a message below.</p>` : `<p class="fine">Send ${esc(r.contact_name)} a message. It goes to their email, and they reply to you directly.</p>`}
      <form id="lfMsg" class="lfform" novalidate>
        <input type="text" name="hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="grid"><div><label for="m-name">Your name</label><input id="m-name" name="name" maxlength="60" required autocomplete="name"></div>
        <div><label for="m-email">Your email</label><input id="m-email" name="email" type="email" required autocomplete="email"><small>So they can reply. Not shown on the site.</small></div>
        <div><label for="m-phone">Your phone <span class="opt">optional</span></label><input id="m-phone" name="phone" type="tel" maxlength="20" autocomplete="tel"></div>
        <div class="full"><label for="m-msg">${r.kind === "lost" ? "Where and when did you see them?" : "Tell them about your pet"}</label><textarea id="m-msg" name="message" rows="4" maxlength="1200" required placeholder="${r.kind === "lost" ? "Saw a dog like this near the boat ramp around 6 PM, heading toward the trail." : "Describe something only the owner would know, like a marking or the collar."}"></textarea></div></div>
        <button class="btn btn-coral" type="submit">${ic("u-mail")}Send message</button>
        <p class="msg" id="lfMsgSay" role="status"></p>
      </form>
    </div>` : "";

  const body = `<section class="page-hero lfhero ${cls}"><div class="wrap">
  <p class="crumbs"><a href="/lost-found/">Lost &amp; found</a> › <a href="/lost-found/?kind=${r.kind}">${r.kind === "lost" ? "Lost pets" : "Found pets"}</a></p>
  <span class="lftag ${cls}">${esc(tag)}</span>
  <h1>${esc(home ? headline(r) + "! 🎉" : r.pet_name ? r.pet_name : headline(r))}</h1>
  <p class="lede">${home ? `Reunited ${esc(fmtDate(etParts(new Date(r.reunited_at || r.updated_at)).date))}. Thanks to everyone who shared.` : ended ? "This post has ended. The pet may be home, or the poster didn't renew it." : `${seen} ${esc(fmtDate(r.date_seen))} near <b>${esc(r.last_seen)}</b>, ${esc(r.town)}.`}</p>
</div></section>
<div class="wrap"><div class="lfowner" id="lfOwner" hidden></div></div>
<section class="blk" style="padding-top:4px"><div class="wrap lfgrid">
  <div>
    <div class="lfflyer">
      <p class="printonly lfbig ${cls}">${esc(tag.toUpperCase())}</p>
      ${r.pet_name || P.looks ? `<p class="printonly lfname">${esc(r.pet_name || P.looks)}</p>` : ""}
      ${P.photo ? `<img class="lfphoto" src="${esc(P.photo)}" alt="${esc(headline(r) + (P.looks ? ", " + P.looks : ""))}">` : `<div class="lfphoto none">${ic("u-paw")}<span>No photo</span></div>`}
      <dl class="lfdl">${rows}</dl>
      ${r.description ? `<div class="prose">${esc(r.description).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, "<br>")}</p>`).join("")}</div>` : ""}
      <p class="printonly lfprintcontact">${P.phone ? `Call or text <b>${esc(P.phone)}</b><br>` : ""}Message ${esc(r.contact_name)}: <b>${esc(url.replace(/^https?:\/\//, ""))}</b></p>
    </div>
    ${live ? `<div class="lfshare">
      <b>Sharing is the fastest way home.</b>
      <div class="acts"><button class="btn btn-coral" type="button" id="lfShare">${ic("u-share")}Share</button>
      <a class="btn btn-out" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">Facebook</a>
      <a class="btn btn-out" href="sms:?&amp;body=${encodeURIComponent(shareText + " " + url)}">Text it</a>
      <button class="btn btn-out" type="button" id="lfCopy">Copy link</button>
      <button class="btn btn-out" type="button" onclick="window.print()">${ic("u-print")}Print a flyer</button></div>
      <p class="fine" id="lfShareSay" role="status"></p>
    </div>` : ""}
    ${contactBox}
    ${live ? `<div class="lftips"><b>${r.kind === "lost" ? "If you spot them" : "Found a pet?"}</b><ul>${r.kind === "lost"
      ? "<li>Don't chase. Crouch, look away and toss a treat; scared dogs run from people walking at them.</li><li>Note the time, place and direction, take a photo if you can, then message the owner right away.</li><li>Scams happen: never pay anyone up front to “return” a pet.</li>"
      : "<li>Any vet or shelter will scan for a microchip for free.</li><li>File a found report with <a href=\"/adopt/\">the county shelter</a> too. Owners check there first.</li><li>Ask anyone who claims the pet to describe it or show photos before you hand it over.</li>"}</ul></div>` : ""}
    <p class="note">Is something wrong with this post? <a href="/submit/?type=fix&amp;listing=${encodeURIComponent("Lost & found: " + headline(r))}&amp;ref=${encodeURIComponent("lost:" + r.id)}">Tell us</a>.</p>
  </div>
  <aside>
    ${hasLL ? `<div class="mapbox small"><div id="map" role="region" aria-label="Map of where the pet was ${r.kind === "lost" ? "last seen" : "found"}"></div></div><p class="fine">${r.approx ? `Pin shows ${esc(r.town)}, not the exact spot.` : `About where they were ${r.kind === "lost" ? "last seen" : "found"}.`}</p>` : ""}
    <div class="joincard"><b>${r.kind === "lost" ? "Found a pet, or lost one?" : "Lost a pet?"}</b><p>Post it free. It goes up as soon as you confirm your email.</p><a class="btn btn-coral" href="/lost-found/#post">${ic("u-paw")}Post a lost or found pet</a></div>
  </aside>
</div></section>`;

  const leaflet = hasLL ? `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>(function(){if(!window.L||!window.L.map)return;var ll=[${+r.lat},${+r.lng}];var m=window.L.map("map",{scrollWheelZoom:false}).setView(ll,${r.approx ? 12 : 14});
window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
window.L.circle(ll,{radius:${r.approx ? 2500 : 600},color:"#CF3F47",weight:2,fillOpacity:.12}).addTo(m);})();</script>` : "";
  const data = JSON.stringify({ id: r.id, url, text: shareText, title: headline(r), name: r.pet_name || "", kind: r.kind }).replace(/</g, "\\u003c");
  return sendHtml(res, 200, shell({
    title, description: desc, path: `/lost-found/${r.id}/`, body, noindex: !live,
    image: P.photo ? `/lost-found/${r.id}/photo` : "/img/hero.jpg",
    head: `<meta name="referrer" content="strict-origin-when-cross-origin">`,
    scripts: leaflet + `<script>window.LF=${data};</script><script src="/assets/lostfound.js"></script>`,
  }), "public, s-maxage=60, stale-while-revalidate=600");
}
