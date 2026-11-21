// Dog of the Month and Critter of the Month (cats, birds, reptiles and other pets). Same page code, two ballots.
//   GET  /critter-of-the-month/        (?view=1&kind=critter) and /critter-of-the-month/<id>/ the same way
//   GET  /dog-of-the-month/            (?view=1)   the voting page, plus the current winner
//   GET  /dog-of-the-month/<id>/       (?page=id)  one pup's page, made for sharing
//   GET  /dog-of-the-month/<id>/photo  (?photo=id) the pup's photo (redirect to a signed link)
//   POST /api/dotm {pup, email, join, website}     ask to vote: we email a confirm link
//   GET  /api/dotm?confirm=<token>                 the vote counts once that link is clicked
import crypto from "node:crypto";
import { signPhotos, subByEmail, insertSub, updateSub } from "./_lib/db.js";
import { entries, winner, findEntry, openContest, currentTitle, closesOn, monthName, monthLabel, KINDS, kindOf,
  voteByEmail, voteByToken, insertVote, updateVote, recentVotesBy } from "./_lib/dotm.js";
import { esc, layout, h2, p, button, textFooter, welcomeEmail } from "./_lib/templates.js";
import { send, message } from "./_lib/mail.js";
import { shell, sendHtml } from "./_lib/page.js";
import { body, json, redirect, cleanEmail, token, siteUrl, etParts, DEFAULT_HOME, log } from "./_lib/util.js";

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDay = (iso) => `${DOW[new Date(iso + "T12:00:00Z").getUTCDay()]}, ${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
const ic = (id) => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const COOLDOWN_MS = 2 * 60 * 1000;

function sharePost(x, open) {
  return open ? `🐾 Vote for ${x.name}${x.town ? " of " + x.town : ""} for ${monthName(x.contest)}'s Lanier Leash ${kindOf(x.contest).title}! It takes one click:`
    : `🐾 Meet ${x.name}${x.town ? " of " + x.town : ""} on Lanier Leash, the free pet guide for Lake Lanier:`;
}
const shareBtn = (x, open, cls = "btn btn-out") => `<button class="${cls}" type="button" data-share data-share-heading="${open ? "Get more votes for " + esc(x.name) : "Share " + esc(x.name)}" data-share-sub="${open ? "Friends vote with their email. One vote each per month." : ""}" data-share-url="${kindOf(x.contest).base}${x.id}/" data-share-title="${esc((open ? "Vote for " : "") + x.name)}" data-share-text="${esc(sharePost(x, open))}">${ic("u-share")}Share</button>`;
const voteBtn = (x, cls = "btn btn-coral") => `<button class="${cls}" type="button" data-vote="${x.id}" data-name="${esc(x.name)}">${ic("u-heart")}Vote</button>`;

// The vote form, shared by both pages.
const VOTE_DLG = `<dialog class="votedlg" id="voteDlg" aria-labelledby="voteH"><form class="sharebox" id="voteForm">
  <div class="sharehd"><h2 id="voteH">Vote</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>
  <p class="sharesub">We'll email you a link. Your vote counts when you tap it. One vote per email each month.</p>
  <input type="hidden" name="pup"><label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
  <label class="sharelbl" for="voteEmail">Your email</label>
  <input id="voteEmail" name="email" type="email" required autocomplete="email" placeholder="you@example.com">
  <label class="chk"><input type="checkbox" name="join"> <span>Also send me the free Thursday email: dog events, a walk check and new places near Cumming.</span></label>
  <button class="btn btn-coral" type="submit">Send my vote link</button>
  <p class="votemsg" role="status" hidden></p>
  <p class="fine">We only use your email for this vote (and the Thursday email if you tick the box). <a href="/privacy/">Privacy</a></p>
</form></dialog>`;
const VOTE_JS = `<script src="/assets/share.js" defer></script><script>(function(){var d=document.getElementById("voteDlg");if(!d)return;var f=document.getElementById("voteForm"),m=f.querySelector(".votemsg");
function open(id,name){f.pup.value=id;d.querySelector("h2").textContent="Vote for "+name;m.hidden=true;f.querySelector("[type=submit]").disabled=false;d.showModal?d.showModal():d.setAttribute("open","");setTimeout(function(){f.email.focus()},50)}
document.addEventListener("click",function(e){var b=e.target.closest("[data-vote]");if(b){e.preventDefault();open(b.dataset.vote,b.dataset.name)}if(e.target.closest("[data-close]")||e.target===d)d.close()});
f.addEventListener("submit",function(e){e.preventDefault();var s=f.querySelector("[type=submit]");s.disabled=true;
fetch("/api/dotm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pup:f.pup.value,email:f.email.value,join:f.join.checked,website:f.website.value})}).then(function(r){return r.json()}).then(function(j){m.hidden=false;m.className="votemsg "+(j.ok?"ok":"bad");m.textContent=j.ok?j.message:j.error;if(!j.ok)s.disabled=false}).catch(function(){m.hidden=false;m.className="votemsg bad";m.textContent="Something went wrong. Try again in a minute.";s.disabled=false})});
var q=new URLSearchParams(location.search).get("vote");if(q){var b=document.querySelector('[data-vote="'+q.replace(/[^a-z0-9-]/g,"")+'"]');if(b)open(b.dataset.vote,b.dataset.name)}})();</script>`;

function entryCard(x, open, rank) {
  return `<article class="dcard">
  <a class="dph" href="${kindOf(x.contest).base}${x.id}/"><img src="${esc(x.photo)}" alt="${esc(x.name)}${x.town ? " from " + esc(x.town) : ""}" loading="lazy">${open && rank === 0 && x.votes > 0 ? '<span class="lead">Leading</span>' : ""}</a>
  <div class="dbd"><h3><a href="${kindOf(x.contest).base}${x.id}/">${esc(x.name)}${x.age ? `, <span>${esc(x.age)}</span>` : ""}</a></h3>
  <p class="who">${esc([x.town, x.owner ? "with " + x.owner : ""].filter(Boolean).join(" · "))}</p>
  ${x.story ? `<p class="story">“${esc(x.story)}”</p>` : ""}
  <p class="votes"><b>${x.votes}</b> ${x.votes === 1 ? "vote" : "votes"}</p>
  ${open ? `<div class="dacts">${voteBtn(x)}${shareBtn(x, true)}</div>` : ""}</div>
</article>`;
}

function winnerBanner(w, month) {
  return `<div class="dwin"><img src="${esc(w.photo)}" alt="${esc(w.name)}"><div><span class="eyebrow">🏆 ${esc(monthName(month))}'s ${kindOf(month).title}</span>
  <h2>${esc(w.name)}${w.town ? " of " + esc(w.town) : ""}</h2>${w.story ? `<p>“${esc(w.story)}”</p>` : ""}<p class="fine">${plural(w.votes, "vote")}${w.owner ? " · with " + esc(w.owner) : ""}</p>
  <a class="btn btn-out btn-sm" href="${kindOf(month).base}${w.id}/">See ${esc(w.name)}'s page</a></div></div>`;
}

async function viewPage(req, res) {
  const q0 = req.query || {}, K = q0.kind === "critter" ? KINDS.critter : KINDS.dog;
  const today = etParts().date, open = openContest(today, K.key), now = currentTitle(today, K.key);
  const enter = K.key === "dog" ? "/submit/?type=pup" : "/submit/?type=pup&amp;pet=critter", enterTxt = K.key === "dog" ? "Enter your pup" : "Enter your pet";
  const [list, champ] = await Promise.all([entries(open), winner(now).catch(() => null)]);
  const q = req.query || {}, voted = q.voted && list.find((x) => x.id === q.voted);
  const closes = longDay(closesOn(open));
  const body = `<section class="page-hero"><div class="wrap"><span class="eyebrow">${K.title}</span>
  <h1>Vote for ${esc(monthName(open))}'s ${K.title}</h1>
  <p class="lede">${K.key === "dog" ? "Local pups" : "Cats, birds, reptiles, bunnies and every other kind of local pet"}, sent in by their people. Vote for your favorite (one vote per email). The ${K.noun} with the most votes when voting closes <b>${esc(closes)}</b> is ${esc(monthName(open))}'s ${K.title} on the homepage, in the Thursday email and in the pack.</p>
  <p class="acts"><a class="btn btn-coral" href="${enter}">${ic("u-camera")}${enterTxt}</a><a class="btn btn-out" href="#how">How it works</a></p>
  <p class="fine" style="margin-top:12px">${K.key === "dog" ? `Got a cat, a parrot or a bearded dragon? They're up for <a href="/critter-of-the-month/">Critter of the Month</a>.` : `Dogs have their own contest: <a href="/dog-of-the-month/">Dog of the Month</a>.`}</p>
</div></section>
<section class="blk" style="padding-top:8px"><div class="wrap">
  ${q.confirmed === "1" && voted ? `<p class="note good"><b>Your vote for ${esc(voted.name)} is in. Thanks!</b> Want to help more? ${shareBtn(voted, true, "linkbtn")}</p>` : ""}
  ${q.confirmed === "already" ? `<p class="note"><b>You've already voted this month.</b> Thanks! You can vote again when the next month opens.</p>` : ""}
  ${q.confirmed === "closed" ? `<p class="note"><b>That vote link is from a contest that has ended.</b> Voting is open now for ${esc(monthName(open))}.</p>` : ""}
  ${champ ? winnerBanner(champ, now) : ""}
  <h2 class="h2s">Up for ${esc(monthLabel(open))} <small>${plural(list.length, K.noun)} · voting closes ${esc(closes)}</small></h2>
  ${list.length ? `<div class="dgrid">${list.map((x, i) => entryCard(x, true, i)).join("")}</div>`
    : `<div class="joincard" style="max-width:620px"><b>No ${K.nouns} entered for ${esc(monthName(open))} yet</b><p>Be the first! Send a photo, a name and one line about your ${K.key === "dog" ? "dog" : "cat, bird, reptile or other pet"}. Once we approve it, your ${K.noun} shows up here and you can share it to get votes.</p><a class="btn btn-coral" href="${enter}">${ic("u-camera")}${enterTxt}</a></div>`}
  <div class="howto" id="how"><h2 class="h2s">How it works</h2><ol>
    <li><b>${enterTxt}.</b> Send a photo and one line about them. It's free. We approve each one by hand, usually within a day or two.</li>
    <li><b>Share your ${K.noun}'s page.</b> Every entry gets its own page and share button. Post it in a Facebook group, text it to family, rally the dog park.</li>
    <li><b>Friends vote with their email.</b> One vote per email each month, confirmed with a click so nobody can stuff the ballot.</li>
    <li><b>The winner holds the title for a month.</b> On the 1st, the top ${K.noun} is featured on the homepage, in the Thursday email and in the pack. Entries sent in after voting closes go into the next month.</li>
  </ol></div>
</div></section>${VOTE_DLG}`;
  const ogx = list[0];
  return sendHtml(res, 200, shell({ title: `Vote for ${monthName(open)}'s ${K.title} · Lanier Leash`, description: `Vote for the Lake Lanier ${K.key === "dog" ? "pup" : "cat, bird, reptile or other pet"} of the month. ${plural(list.length, "local " + K.noun)} up for ${monthLabel(open)}. Voting closes ${closes}.`,
    path: K.base, body, scripts: VOTE_JS, current: "community", image: ogx ? `${K.base}${ogx.id}/card.png` : "/img/hero.jpg",
    head: '<meta name="twitter:card" content="summary_large_image">' }), q.voted || q.confirmed ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300");
}

async function entryPage(req, res, id) {
  const x = await findEntry(id);
  if (!x) return sendHtml(res, 404, shell({ title: "Pup not found · Lanier Leash", description: "That pup isn't in the running right now.", path: "/dog-of-the-month/", noindex: true,
    body: `<section class="page-hero"><div class="wrap"><span class="eyebrow">Dog of the Month</span><h1>We couldn't find that pup</h1><p class="lede">The entry may have been removed. <a href="/dog-of-the-month/">See who's up this month</a>.</p></div></section>` }), "public, s-maxage=60");
  const K = kindOf(x.contest), today = etParts().date, open = x.contest === openContest(today, K.key), won = !open && x.contest.slice(0, 7) <= today.slice(0, 7) && (await winner(x.contest).catch(() => null))?.sid === x.sid;
  const photo = `${K.base}${x.id}/photo`;
  const body = `<section class="page-hero"><div class="wrap"><p class="crumbs"><a href="${K.base}">${K.title}</a> › ${esc(monthLabel(x.contest))}</p></div></section>
<section class="blk" style="padding-top:0"><div class="wrap dentry">
  <img class="dbig" src="${photo}" alt="${esc(x.name)}${x.town ? " from " + esc(x.town) : ""}">
  <div>
    <span class="eyebrow">${won ? `🏆 ${esc(monthName(x.contest))}'s ${K.title}` : open ? `Up for ${esc(monthName(x.contest))}'s ${K.title}` : `In the running for ${esc(monthLabel(x.contest))}`}</span>
    <h1>${open ? "Vote for " : ""}${esc(x.name)}${x.age && !open ? ", " + esc(x.age) : ""}</h1>
    <p class="lede">${esc([x.town, x.owner ? "with " + x.owner : ""].filter(Boolean).join(" · "))}</p>
    ${x.story ? `<p class="story big">“${esc(x.story)}”</p>` : ""}
    <p class="votes big"><b>${x.votes}</b> ${x.votes === 1 ? "vote" : "votes"}${open ? ` · voting closes ${esc(longDay(closesOn(x.contest)))}` : ""}</p>
    <div class="acts big">${open ? voteBtn(x) : ""}${shareBtn(x, open)}</div>
    <p class="note">${open ? "One vote per email each month. We email you a link and your vote counts when you tap it." : `Voting for ${esc(monthName(x.contest))} has closed.`} <a href="${K.base}">See all the ${K.nouns}</a> · <a href="/submit/?type=pup${K.key === "dog" ? "" : "&amp;pet=critter"}">Enter your own</a></p>
  </div>
</div></section>${open ? VOTE_DLG : ""}`;
  return sendHtml(res, 200, shell({ title: `${open ? "Vote for " : ""}${x.name}${x.town ? " of " + x.town : ""} · ${K.title} · Lanier Leash`,
    description: open ? `${x.name} is up for ${monthName(x.contest)}'s ${K.title} on Lanier Leash. ${x.story ? "“" + x.story + "” " : ""}Vote with one click.` : `${x.name}${x.town ? " of " + x.town : ""} on Lanier Leash. ${x.story || ""}`,
    path: `${K.base}${x.id}/`, body, scripts: VOTE_JS, current: "community", image: `${K.base}${x.id}/card.png`,
    head: '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">' }), "public, s-maxage=60, stale-while-revalidate=300");
}

function voteEmail(v, x) {
  const url = `${siteUrl()}/api/dotm?confirm=${encodeURIComponent(v.token)}`;
  const body = h2(`Tap to vote for ${esc(x.name)}`) + p(`Thanks for voting in Lanier Leash's ${kindOf(v.contest).title}. Confirm your vote for <b>${esc(x.name)}</b>${x.town ? " of " + esc(x.town) : ""} for ${esc(monthName(v.contest))}:`) +
    button(url, `Count my vote for ${x.name}`) + p("If you didn't ask to vote, ignore this. Nothing else will happen.", "color:#5B6B7B;font-size:13px");
  return { subject: `Confirm your vote for ${x.name}`, html: layout({ preheader: `One tap and your vote for ${x.name} counts.`, body, why: `You asked to vote in Lanier Leash's ${kindOf(v.contest).title}.` }),
    text: `Confirm your vote for ${x.name} in Lanier Leash's ${kindOf(v.contest).title} (${monthName(v.contest)}):\n\n${url}\n\nIf you didn't ask to vote, ignore this.${textFooter(null)}` };
}

async function askVote(req, res) {
  const b = body(req);
  const OK = { ok: true, message: "Check your email and tap the link to count your vote. Look in Promotions or Spam if you don't see it." };
  if (b.website) return json(res, 200, OK);
  const email = cleanEmail(b.email);
  if (!email) return json(res, 400, { ok: false, error: "That email doesn't look right." });
  let contest = null, x = null;
  for (const k of ["dog", "critter"]) {
    const c = openContest(undefined, k), hit = (await entries(c, { photos: false })).find((e) => e.id === String(b.pup || ""));
    if (hit) { contest = c; x = hit; break; }
  }
  if (!x) return json(res, 400, { ok: false, error: "That entry isn't up for a vote right now." });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const ipHash = crypto.createHash("sha256").update(ip + "|vote|" + (process.env.CRON_SECRET || "ll")).digest("hex").slice(0, 32);
  if ((await recentVotesBy(ipHash, new Date(Date.now() - 3600e3).toISOString())).length >= 20) return json(res, 429, { ok: false, error: "Too many votes from here in the last hour. Try again later." });
  let v = await voteByEmail(contest, email);
  if (v && v.status === "confirmed") return json(res, 200, { ok: false, error: `This email already voted for ${monthName(contest)}. Thanks! You can vote again next month.` });
  if (v && v.sent_at && Date.now() - new Date(v.sent_at) < COOLDOWN_MS && v.pup_id === x.sid) return json(res, 200, OK);
  const now = new Date().toISOString();
  if (v) v = await updateVote(v.id, { pup_id: x.sid, join_email: !!b.join, sent_at: now, ip_hash: ipHash });
  else v = await insertVote({ contest, pup_id: x.sid, email, token: token(), status: "pending", join_email: !!b.join, ip_hash: ipHash, sent_at: now });
  await send(message({ to: email, ...voteEmail(v, x) }));
  return json(res, 200, OK);
}

// They tapped the link in the email: count the vote, and add them to the Thursday email if they asked.
async function confirmVote(res, t) {
  const v = await voteByToken(t);
  if (!v) return redirect(res, "/dog-of-the-month/");
  const K = kindOf(v.contest);
  const list = await entries(v.contest, { photos: false });
  const x = list.find((e) => e.sid === v.pup_id);
  if (v.contest !== openContest(undefined, K.key)) return redirect(res, `${K.base}?confirmed=closed`);
  if (v.status === "confirmed") return redirect(res, `${K.base}?confirmed=1&voted=${x ? x.id : ""}`);
  await updateVote(v.id, { status: "confirmed", confirmed_at: new Date().toISOString() });
  if (v.join_email) {
    try {
      let sub = await subByEmail(v.email);
      const now = new Date().toISOString();
      if (!sub) sub = await insertSub({ email: v.email, token: token(), status: "active", zip: DEFAULT_HOME.zip, radius: 25, lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng, source: "dotm", confirmed_at: now });
      else if (sub.status !== "active") sub = await updateSub(sub.id, { status: "active", confirmed_at: now, unsubscribed_at: null });
      else sub = null; // already getting it
      if (sub) await send(message({ to: v.email, ...welcomeEmail(sub), token: sub.token })).catch((e) => log("dotm welcome failed", e.message));
    } catch (e) { log("dotm join failed", e.message); }
  }
  return redirect(res, `${K.base}?confirmed=1&voted=${x ? x.id : ""}`);
}

export default async function handler(req, res) {
  const q = req.query || {};
  try {
    if (req.method === "POST") return await askVote(req, res);
    if (q.confirm) return await confirmVote(res, String(q.confirm));
    if (q.photo) {
      const x = await findEntry(String(q.photo).toLowerCase());
      const url = x && (await signPhotos([x.photo_path], 7 * 24 * 3600))[x.photo_path];
      if (!url) { res.statusCode = 404; return res.end("not found"); }
      res.statusCode = 302; res.setHeader("Location", url); res.setHeader("Cache-Control", "public, s-maxage=86400"); return res.end();
    }
    if (q.page) return await entryPage(req, res, String(q.page).toLowerCase());
    return await viewPage(req, res);
  } catch (e) {
    log("dotm failed", e.message);
    if (req.method === "POST") return json(res, 500, { ok: false, error: "Something went wrong on our end. Please try again in a minute." });
    return sendHtml(res, 503, shell({ title: "Dog of the Month · Lanier Leash", description: "", path: "/dog-of-the-month/", noindex: true,
      body: `<section class="page-hero"><div class="wrap"><h1>Dog of the Month is taking a nap</h1><p class="lede">Please try again in a minute.</p></div></section>` }), "no-store");
  }
}
