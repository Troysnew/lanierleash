// Email templates: table layout and inline styles so Gmail, Outlook and Apple Mail agree.
import { siteUrl } from "./util.js";
import { fmtDay, fmtShort, timeRange, fmtMi } from "./content.js";

const C = { navy: "#0B3A5B", teal: "#117A8B", mint: "#E0F7F5", cream: "#FFF7ED", coral: "#CF3F47", slate: "#334155", muted: "#5B6B7B", line: "#E6ECEF", bg: "#F3F6F8", ok: "#178A5E", warn: "#A3620B", hot: "#B8323A" };
const FONT = "'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const links = (t) => {
  const s = siteUrl(), q = encodeURIComponent(t);
  return { manage: `${s}/manage/?t=${q}`, unsub: `${s}/api/unsubscribe?t=${q}`, confirm: `${s}/api/confirm?t=${q}` };
};
const address = () => (process.env.MAILING_ADDRESS || "").trim();

function button(href, label) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0"><tr><td style="border-radius:999px;background:${C.coral}">` +
    `<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font:700 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`;
}
const h2 = (t) => `<h2 style="margin:28px 0 10px;font:800 19px/1.25 ${FONT};color:${C.navy};letter-spacing:-.01em">${t}</h2>`;
const p = (t, extra = "") => `<p style="margin:0 0 14px;font:15px/1.6 ${FONT};color:${C.slate};${extra}">${t}</p>`;

function layout({ preheader, body, token, why }) {
  const s = siteUrl(), L = token ? links(token) : null, addr = address();
  const foot = [
    why ? esc(why) : "",
    L ? `<a href="${L.manage}" style="color:${C.muted}">Change ZIP or radius</a> &nbsp;·&nbsp; <a href="${L.unsub}" style="color:${C.muted}">Unsubscribe</a>` : "",
    `<a href="${s}/privacy/" style="color:${C.muted}">Privacy</a> &nbsp;·&nbsp; Independent local guide, not affiliated with any venue or agency.`,
    addr ? "Lanier Leash · " + esc(addr) : "",
  ].filter(Boolean).map((x) => `<p style="margin:0 0 8px">${x}</p>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Lanier Leash</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px">
<tr><td style="padding:4px 8px 18px"><a href="${s}/" style="text-decoration:none"><img src="${s}/img/email-logo.png" width="190" height="44" alt="Lanier Leash" style="display:block;border:0;width:190px;height:auto"></a></td></tr>
<tr><td style="background:#ffffff;border-radius:22px;padding:30px 28px;border:1px solid ${C.line}">${body}</td></tr>
<tr><td style="padding:22px 12px 8px;font:12px/1.6 ${FONT};color:${C.muted}">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}

function textFooter(token) {
  const s = siteUrl(), L = token ? links(token) : null, addr = address();
  return ["", "—", L ? "Change ZIP or radius: " + L.manage : "", L ? "Unsubscribe: " + L.unsub : "", "Privacy: " + s + "/privacy/", addr ? "Lanier Leash · " + addr : ""].filter((x) => x !== "").join("\n");
}

// ---------- confirm ----------
export function confirmEmail(sub) {
  const L = links(sub.token);
  const body = h2("One tap and you're in") +
    p(`Confirm your email to get the Lanier Leash weekend email: dog-friendly events within <b>${esc(sub.radius)} miles of ${esc(sub.zip)}</b>, a walk check for the weekend and a few places to try. It comes Thursday mornings.`) +
    button(L.confirm, "Confirm my email") +
    p(`If you didn't sign up, ignore this. You won't get anything else from us.`, `color:${C.muted};font-size:13px`);
  return {
    subject: "Confirm your Lanier Leash weekend email",
    html: layout({ preheader: "Confirm your email to start getting the Thursday weekend email.", body }),
    text: `Confirm your email to get the Lanier Leash weekend email (events within ${sub.radius} miles of ${sub.zip}, every Thursday):\n\n${L.confirm}\n\nIf you didn't sign up, ignore this.${textFooter(null)}`,
  };
}

// ---------- already subscribed: send their manage link instead ----------
export function manageEmail(sub) {
  const L = links(sub.token);
  const body = h2("You're already on the list") +
    p(`Someone (hopefully you) just signed up with this address. You're already getting the Thursday email for <b>${esc(sub.zip)}</b>, within ${esc(sub.radius)} miles.`) +
    p("Want a different ZIP or radius? Change it here:") + button(L.manage, "Update my settings");
  return {
    subject: "Your Lanier Leash settings",
    html: layout({ preheader: "You're already subscribed. Here's your settings link.", body, token: sub.token }),
    text: `You're already getting the Lanier Leash Thursday email for ${sub.zip} (${sub.radius} mi).\n\nUpdate your settings: ${L.manage}${textFooter(sub.token)}`,
  };
}

// ---------- welcome ----------
export function welcomeEmail(sub) {
  const s = siteUrl();
  const body = h2("You're in. Welcome to Lanier Leash.") +
    p(`Every Thursday morning you'll get the weekend's dog-friendly events within <b>${esc(sub.radius)} miles of ${esc(sub.zip)}</b>, a walk check with the pavement estimate, and a few places worth trying.`) +
    p(`Every listing links to where we checked it, and we mark how sure we are: <b style="color:${C.ok}">Official rule</b> means a park or agency says so; <b style="color:${C.warn}">Unconfirmed</b> means call ahead.`) +
    p(`Know a dog-friendly patio or event we're missing? Just reply to this email.`) +
    button(s + "/events/", "See this week's events");
  return {
    subject: "Welcome to Lanier Leash",
    html: layout({ preheader: "Your first weekend email arrives Thursday morning.", body, token: sub.token, why: `You're getting this because you confirmed your email at lanierleash.com.` }),
    text: `You're in. Every Thursday morning: dog-friendly events within ${sub.radius} miles of ${sub.zip}, a walk check, and places to try.\n\nThis week's events: ${s}/events/\n\nKnow a spot we're missing? Reply to this email.${textFooter(sub.token)}`,
  };
}

// ---------- weekly ----------
function eventRow(e, s) {
  const when = e.multi ? `Through ${fmtShort(e.last)}` : `${fmtDay(e.date)} · ${timeRange(e)}`;
  const where = [e.venue, e.town].filter(Boolean).join(", ");
  const tag = e.type === "adopt" ? ` <span style="display:inline-block;padding:1px 8px;border-radius:999px;background:#FFE6E3;color:${C.coral};font-size:11px;font-weight:700">Adoption</span>` : "";
  return `<tr><td style="padding:12px 0;border-top:1px solid ${C.line};font:14px/1.5 ${FONT};color:${C.slate}">` +
    `<div style="font-size:12px;font-weight:700;color:${C.teal};text-transform:uppercase;letter-spacing:.04em">${esc(when)}</div>` +
    `<a href="${s}/events/#${esc(e.id)}" style="font-size:16px;font-weight:800;color:${C.navy};text-decoration:none">${esc(e.title)}</a>${tag}` +
    `<div style="color:${C.muted}">${esc(where)}${e.mi != null ? " · " + fmtMi(e.mi) : ""}${e.cost ? " · " + esc(e.cost) : ""}</div>` +
    (e.dog_rule ? `<div style="margin-top:3px">🐾 ${esc(e.dog_rule)}</div>` : "") + `</td></tr>`;
}
function placeRow(pl, s) {
  const conf = pl.status === "official" || pl.status === "venue";
  return `<tr><td style="padding:12px 0;border-top:1px solid ${C.line};font:14px/1.5 ${FONT};color:${C.slate}">` +
    `<a href="${s}/places/${esc(pl.id)}/" style="font-size:16px;font-weight:800;color:${C.navy};text-decoration:none">${esc(pl.name)}</a>` +
    `<div style="color:${C.muted}">${esc(pl.town)} · ${fmtMi(pl.mi)} · <span style="color:${conf ? C.ok : C.warn};font-weight:700">${conf ? "Official rule" : "Unconfirmed, call ahead"}</span></div>` +
    (pl.dog_rule ? `<div style="margin-top:3px">🐾 ${esc(pl.dog_rule)}</div>` : "") + `</td></tr>`;
}
const table = (rows) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows}</table>`;

function wxBlock(w) {
  if (!w) return "";
  const col = w.level === "ok" ? C.ok : w.level === "warn" ? C.warn : C.hot;
  const days = w.days.map((d) => `<td align="center" style="padding:8px 4px;border-radius:12px;${d.best ? `background:#ffffff;border:2px solid ${C.teal}` : ""};font:13px/1.3 ${FONT};color:${C.slate}"><div style="color:${C.muted}">${d.name}</div><div style="font-size:18px;font-weight:800;color:${C.navy}">${d.high}°</div><div style="font-size:11px">${d.rain}% rain</div></td>`).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.mint};border-radius:18px"><tr><td style="padding:18px 20px">` +
    `<div style="font:700 12px ${FONT};color:${C.teal};text-transform:uppercase;letter-spacing:.05em">Weekend walk check · Lake Lanier area</div>` +
    `<div style="font:800 21px/1.25 ${FONT};color:${C.navy};margin:4px 0 8px">${esc(w.head)}</div>` +
    `<div style="font:14px/1.6 ${FONT};color:${C.slate}">Best day: <b>${esc(w.bestDay)}</b>, high ${w.high}°, best walk ${esc(w.window)}.<br>` +
    `Pavement around <b style="color:${col}">${w.pavement}°F at 2 PM</b> (${esc(w.paws)}) · Rain ${w.rain}% · Ticks: ${esc(w.tick)}</div>` +
    `<table role="presentation" width="100%" cellspacing="6" cellpadding="0" border="0" style="margin-top:10px"><tr>${days}</tr></table>` +
    `<div style="font:11px/1.5 ${FONT};color:${C.muted};margin-top:6px">Forecast from Open-Meteo, checked Thursday morning. Pavement is an estimate; if the back of your hand can't stay on it for 7 seconds, it's too hot for paws.</div>` +
    `</td></tr></table>`;
}

// One clearly labeled sponsor slot (set in /admin/ → Emails).
function sponsorBlock(sp) {
  const name = sp.url ? `<a href="${esc(sp.url)}" style="color:${C.navy};text-decoration:none">${esc(sp.name)}</a>` : esc(sp.name);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px;background:${C.cream};border-radius:16px"><tr><td style="padding:16px 18px;font:14px/1.55 ${FONT};color:${C.slate}">` +
    `<div style="font:700 11px ${FONT};color:${C.muted};text-transform:uppercase;letter-spacing:.06em">Sponsor</div>` +
    `<div style="font:800 16px/1.3 ${FONT};color:${C.navy};margin:3px 0 4px">${name}</div>${esc(sp.text)}` +
    (sp.url ? `<div style="margin-top:6px"><a href="${esc(sp.url)}" style="color:${C.teal};font-weight:700">Learn more →</a></div>` : "") +
    `</td></tr></table>`;
}

export function weeklyEmail(sub, issue) {
  const s = siteUrl(), wk = issue.weekend;
  const range = `${fmtShort(wk.fri)}–${+wk.to.slice(8, 10)}`;
  let body = `<div style="font:700 12px ${FONT};color:${C.coral};text-transform:uppercase;letter-spacing:.05em">Your dog weekend · ${esc(range)}</div>` +
    `<h1 style="margin:6px 0 16px;font:800 26px/1.15 ${FONT};color:${C.navy};letter-spacing:-.02em">What's on within ${issue.radius} miles of ${esc(issue.zip)}</h1>` +
    wxBlock(issue.wx);

  body += h2(issue.events.length ? "This weekend" : "This weekend is quiet");
  body += issue.events.length ? table(issue.events.map((e) => eventRow(e, s)).join(""))
    : p(`We didn't find dog events within ${issue.radius} miles this weekend. A good weekend for a trail, or <a href="${s}/manage/?t=${encodeURIComponent(sub.token)}" style="color:${C.teal}">widen your radius</a>.`);
  if (issue.ongoing.length) body += h2("Ongoing") + table(issue.ongoing.map((e) => eventRow(e, s)).join(""));
  if (issue.later.length) body += h2("Coming up") + table(issue.later.map((e) => eventRow(e, s)).join(""));
  if (issue.sponsor) body += sponsorBlock(issue.sponsor);
  if (issue.places.length) body += h2("Places to try") + table(issue.places.map((pl) => placeRow(pl, s)).join(""));
  if (issue.birthdays && issue.birthdays.length) body += h2("Pack birthdays this week 🎂") +
    p(issue.birthdays.map((x) => `<b>${esc(x.name)}</b>${x.town ? " of " + esc(x.town) : ""} (${esc(x.day)})`).join(" · ") + `. <a href="${s}/pack/" style="color:${C.teal}">Meet the pack</a> or <a href="${s}/submit/?type=pup" style="color:${C.teal}">add your pup</a>.`);
  body += button(s + "/events/", "See every event");
  body += p(`Spot something wrong, or know a place we're missing? Reply and tell us. Dog rules change, so a quick call ahead never hurts.`, `color:${C.muted};font-size:13px`);

  const t = [`YOUR DOG WEEKEND · ${range} · within ${issue.radius} mi of ${issue.zip}`, ""];
  if (issue.wx) t.push(`WALK CHECK: ${issue.wx.head}. Best day ${issue.wx.bestDay}, high ${issue.wx.high}°, best walk ${issue.wx.window}. Pavement ~${issue.wx.pavement}°F at 2 PM (${issue.wx.paws}). Rain ${issue.wx.rain}%.`, "");
  const tl = (title, list) => { if (list.length) { t.push(title.toUpperCase()); list.forEach((e) => t.push(`- ${e.multi ? "Through " + fmtShort(e.last) : fmtDay(e.date) + " " + timeRange(e)}: ${e.title}, ${[e.venue, e.town].filter(Boolean).join(", ")} (${fmtMi(e.mi)})\n  ${s}/events/#${e.id}`)); t.push(""); } };
  tl("This weekend", issue.events); tl("Ongoing", issue.ongoing); tl("Coming up", issue.later);
  if (issue.sponsor) t.push(`SPONSORED BY ${issue.sponsor.name.toUpperCase()}: ${issue.sponsor.text}${issue.sponsor.url ? " " + issue.sponsor.url : ""}`, "");
  if (issue.birthdays && issue.birthdays.length) t.push("PACK BIRTHDAYS THIS WEEK: " + issue.birthdays.map((x) => x.name + (x.town ? " of " + x.town : "") + " (" + x.day + ")").join(", "), "");
  if (issue.places.length) { t.push("PLACES TO TRY"); issue.places.forEach((pl) => t.push(`- ${pl.name}, ${pl.town} (${fmtMi(pl.mi)}): ${pl.dog_rule}\n  ${s}/places/${pl.id}/`)); }

  return {
    subject: issue.subject,
    html: layout({ preheader: issue.wx ? `${issue.wx.head}. ${issue.events.length} events near you this weekend.` : `${issue.events.length} events near you this weekend.`, body, token: sub.token, why: `You're getting this because you signed up for the Lanier Leash weekend email for ${sub.zip}.` }),
    text: t.join("\n") + textFooter(sub.token),
  };
}

// ---------- submissions ----------
// One list of fields per form; /api/submit validates against it and the review email prints it.
export const SUBMIT_TYPES = {
  pup: { label: "Pup of the Week", emailRequired: true, fields: [
    { name: "dog_name", label: "Dog's name", required: true, max: 60 },
    { name: "age", label: "Age", max: 30 },
    { name: "town", label: "Town", required: true, max: 60 },
    { name: "story", label: "One line about your pup", required: true, max: 200 },
    { name: "owner", label: "Your first name", max: 60 },
    { name: "birthday", label: "Birthday", kind: "date" },
    { name: "consent", label: "Photo permission", kind: "check", required: true },
  ] },
  event: { label: "Event suggestion", fields: [
    { name: "title", label: "Event name", required: true, max: 150 },
    { name: "date", label: "Date", kind: "date", required: true },
    { name: "time", label: "Time", max: 60 },
    { name: "venue", label: "Where", required: true, max: 150 },
    { name: "town", label: "Town", required: true, max: 60 },
    { name: "url", label: "Event link", kind: "url", max: 500 },
    { name: "dog_rule", label: "Dog rule", max: 300 },
    { name: "cost", label: "Cost", max: 60 },
    { name: "details", label: "Anything else", max: 800 },
  ] },
  place: { label: "Place suggestion", fields: [
    { name: "name", label: "Place name", required: true, max: 150 },
    { name: "town", label: "Town", required: true, max: 60 },
    { name: "category", label: "Type", max: 30 },
    { name: "url", label: "Website or source", kind: "url", max: 500 },
    { name: "dog_rule", label: "Dog rule", required: true, max: 300 },
    { name: "details", label: "Anything else", max: 800 },
  ] },
  fix: { label: "Listing fix", fields: [
    { name: "listing", label: "Which listing", required: true, max: 200 },
    { name: "ref", label: "Listing id", max: 200 },
    { name: "problem", label: "What's wrong", required: true, max: 800 },
    { name: "source", label: "Where you saw it", kind: "url", max: 500 },
  ] },
  claim: { label: "Business claim", emailRequired: true, fields: [
    { name: "business", label: "Business name", required: true, max: 150 },
    { name: "contact_name", label: "Your name", required: true, max: 80 },
    { name: "role", label: "Your role", max: 80 },
    { name: "phone", label: "Phone", max: 40 },
    { name: "website", label: "Website", kind: "url", max: 500 },
    { name: "dog_rule", label: "Your dog rule", required: true, max: 400 },
    { name: "details", label: "Anything else", max: 800 },
  ] },
  sponsor: { label: "Sponsor inquiry", emailRequired: true, fields: [
    { name: "business", label: "Business name", required: true, max: 150 },
    { name: "contact_name", label: "Your name", required: true, max: 80 },
    { name: "website", label: "Website", kind: "url", max: 500 },
    { name: "phone", label: "Phone", max: 40 },
    { name: "interest", label: "Interested in", max: 80 },
    { name: "details", label: "Tell us about it", max: 800 },
  ] },
};

export function reviewEmail(row, photoUrl) {
  const spec = SUBMIT_TYPES[row.type], d = row.data || {};
  const rows = spec.fields.filter((f) => d[f.name] !== undefined && f.name !== "ref").map((f) =>
    `<tr><td style="padding:7px 12px 7px 0;font:700 13px ${FONT};color:${C.muted};vertical-align:top;white-space:nowrap">${esc(f.label)}</td>` +
    `<td style="padding:7px 0;font:14px/1.5 ${FONT};color:${C.slate}">${f.kind === "check" ? "Yes" : f.kind === "url" ? `<a href="${esc(d[f.name])}" style="color:${C.teal}">${esc(d[f.name])}</a>` : esc(d[f.name]).replace(/\n/g, "<br>")}</td></tr>`).join("");
  const title = d.dog_name || d.title || d.name || d.listing || d.business || "New submission";
  const body = `<div style="font:700 12px ${FONT};color:${C.coral};text-transform:uppercase;letter-spacing:.05em">New ${esc(spec.label.toLowerCase())}</div>` +
    `<h1 style="margin:6px 0 16px;font:800 24px/1.2 ${FONT};color:${C.navy}">${esc(title)}</h1>` +
    (photoUrl ? `<p style="margin:0 0 16px"><a href="${esc(photoUrl)}"><img src="${esc(photoUrl)}" width="360" alt="Submitted photo" style="display:block;max-width:100%;height:auto;border-radius:14px;border:0"></a></p>` : "") +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0">${rows}` +
    `<tr><td style="padding:7px 12px 7px 0;font:700 13px ${FONT};color:${C.muted}">From</td><td style="padding:7px 0;font:14px ${FONT};color:${C.slate}">${row.email ? esc(row.email) : "No email left"}</td></tr></table>` +
    p(`${row.email ? "Hit Reply to answer them directly. " : ""}${d.ref ? "Listing id: " + esc(d.ref) + ". " : ""}All submissions are in Supabase → Table Editor → submissions.`, `margin-top:18px;color:${C.muted};font-size:13px`) +
    (photoUrl ? p("The photo link works for 7 days. The original is in Supabase → Storage → submissions.", `color:${C.muted};font-size:13px`) : "");
  const text = [`New ${spec.label.toLowerCase()}: ${title}`, ""].concat(spec.fields.filter((f) => d[f.name] !== undefined).map((f) => `${f.label}: ${f.kind === "check" ? "Yes" : d[f.name]}`), [`From: ${row.email || "no email"}`, photoUrl ? "Photo: " + photoUrl : ""]).join("\n");
  return { subject: `[Lanier Leash] ${spec.label}: ${title}`.slice(0, 140), html: layout({ preheader: `New ${spec.label.toLowerCase()} from the site`, body }), text };
}

export function thanksEmail(row) {
  const d = row.data || {}, s = siteUrl();
  const what = {
    pup: [`Thanks for sending ${esc(d.dog_name)}!`, `We look at every pup. If ${esc(d.dog_name)} is picked for Pup of the Week, we'll email you first, before anything goes on the site.`],
    event: ["Thanks for the event tip!", "We'll check the details and add it to the events page if it's a fit. Dog rules change, so we confirm with the host or the event page first."],
    place: ["Thanks for the place tip!", "We'll check the dog rule and add it to the places page if it's a fit."],
    fix: ["Thanks for the fix!", "We'll check it and update the listing. Corrections like this keep the guide honest."],
    claim: ["Thanks, we got your listing request", "We'll reply within a few days to confirm your details. Once confirmed, your listing gets the green Venue confirmed badge."],
    sponsor: ["Thanks for your interest in sponsoring", "We'll reply within a few days with open dates and details."],
  }[row.type];
  const body = h2(what[0]) + p(what[1]) + p(`Reply to this email if you want to add anything.`) + button(s + "/events/", "See what's on this weekend");
  return { subject: what[0].replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&"), html: layout({ preheader: what[1].replace(/<[^>]+>/g, ""), body }), text: `${what[0]}\n\n${what[1]}\n\nReply to this email if you want to add anything.\n\n${s}` };
}
