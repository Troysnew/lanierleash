// Lost & found pets: cleaning posts, what the public sees, and the emails.
// A post goes live once the poster confirms their email. It stays up 30 days (they can renew it),
// and they can mark it reunited or take it down from the private link in that email.
// The poster's email is never shown. Their phone is shown only if they tick the box.
import crypto from "node:crypto";
import { slug } from "./content.js";
import { esc, h2, p, button, layout, textFooter, C } from "./templates.js";
import { siteUrl, cleanEmail } from "./util.js";

export const DAYS_LIVE = 30;
export const SPECIES = { dog: "Dog", cat: "Cat", other: "Pet" };
export const SIZES = { small: "Small", medium: "Medium", large: "Large" };
export const SEXES = { male: "Male", female: "Female", unknown: "" };
export const MAX_PHOTO = 3.5 * 1024 * 1024;

const str = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const para = (v, max) => String(v ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

export function cleanPhone(v) {
  const d = String(v || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

// -> { ok: true, post } or { ok: false, error, field }
export function cleanPost(b, today) {
  const kind = ["lost", "found"].includes(b.kind) ? b.kind : null;
  if (!kind) return { ok: false, error: "Pick lost or found.", field: "kind" };
  const species = SPECIES[b.species] ? b.species : "dog";
  const post = {
    kind, species,
    pet_name: str(b.pet_name, 40),
    breed: str(b.breed, 80), color: str(b.color, 80),
    sex: SEXES[b.sex] !== undefined ? b.sex : "unknown",
    size: SIZES[b.size] ? b.size : null,
    description: para(b.description, 800),
    last_seen: str(b.last_seen, 150), town: str(b.town, 60),
    date_seen: str(b.date_seen, 10),
    contact_name: str(b.contact_name, 40),
    show_phone: b.show_phone === true || b.show_phone === "on" || b.show_phone === "true",
  };
  if (kind === "lost" && !post.pet_name) return { ok: false, error: "What's your pet's name?", field: "pet_name" };
  if (!post.color && !post.breed) return { ok: false, error: "Add a color or breed so people can spot them.", field: "color" };
  if (!post.last_seen) return { ok: false, error: kind === "lost" ? "Where were they last seen?" : "Where did you find them?", field: "last_seen" };
  if (!post.town) return { ok: false, error: "Which town?", field: "town" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date_seen) || post.date_seen > today) return { ok: false, error: "Pick the date (today or earlier).", field: "date_seen" };
  const old = new Date(Date.parse(today + "T12:00:00Z") - 90 * 864e5).toISOString().slice(0, 10);
  if (post.date_seen < old) return { ok: false, error: "That's more than 90 days ago. Pick a more recent date.", field: "date_seen" };
  if (!post.contact_name) return { ok: false, error: "Add your first name.", field: "contact_name" };
  post.phone = b.phone ? cleanPhone(b.phone) : null;
  if (b.phone && !post.phone) return { ok: false, error: "That phone number doesn't look right.", field: "phone" };
  if (post.show_phone && !post.phone) post.show_phone = false;
  post.email = cleanEmail(b.email);
  if (!post.email) return { ok: false, error: "Add your email. We send the link that puts your post live.", field: "email" };
  return { ok: true, post };
}

// Readable id for the page address: lost-dog-biscuit-cumming-k3x9
export function postId(post) {
  const who = post.pet_name || post.color || post.breed || "pet";
  const base = [post.kind, post.species, slug(who).slice(0, 24), slug(post.town).slice(0, 20)].filter(Boolean).join("-").replace(/-+/g, "-");
  return base + "-" + crypto.randomBytes(3).toString("hex").slice(0, 4);
}

export function isLive(r, now = Date.now()) {
  return r.status === "active" && (!r.expires_at || Date.parse(r.expires_at) > now);
}

// Plain-language headline: "Lost dog: Biscuit" / "Found dog in Cumming"
export function headline(r) {
  const sp = (SPECIES[r.species] || "Pet").toLowerCase();
  if (r.status === "reunited") return r.pet_name ? `${r.pet_name} is home` : `Found ${sp} is home`;
  return r.kind === "lost" ? `Lost ${sp}${r.pet_name ? ": " + r.pet_name : ""}` : `Found ${sp}${r.town ? " in " + r.town : ""}`;
}
export function looks(r) {
  return [SIZES[r.size], SEXES[r.sex], r.color, r.breed].filter(Boolean).join(" · ");
}

// What anyone can see. No email, no token, phone only if allowed.
export function toPublic(r) {
  return {
    id: r.id, kind: r.kind, species: r.species, status: r.status === "active" && !isLive(r) ? "expired" : r.status,
    pet_name: r.pet_name || "", breed: r.breed || "", color: r.color || "", sex: r.sex || "unknown", size: r.size || "",
    description: r.description || "", last_seen: r.last_seen || "", town: r.town || "", date_seen: r.date_seen || "",
    lat: r.lat ?? null, lng: r.lng ?? null, approx: !!r.approx,
    contact_name: r.contact_name || "", phone: r.show_phone ? r.phone || "" : "",
    photo: r.photo_path ? `/lost-found/${r.id}/photo` : "",
    posted: r.confirmed_at || r.created_at, reunited_at: r.reunited_at || null, expires_at: r.expires_at || null,
    headline: headline(r), looks: looks(r),
  };
}

// ---------- emails ----------
const postUrl = (r) => `${siteUrl()}/lost-found/${r.id}/`;
const ownerUrl = (r) => `${postUrl(r)}?t=${encodeURIComponent(r.token)}`;
const confirmUrl = (r) => `${siteUrl()}/api/lostfound?confirm=${encodeURIComponent(r.token)}`;

export function lfConfirmEmail(r) {
  const what = headline(r);
  const body = h2("One tap to put your post live") +
    p(`Thanks for posting <b>${esc(what)}</b>. Tap below and it goes up on the Lanier Leash lost &amp; found board right away.`) +
    button(confirmUrl(r), "Put my post live") +
    p(`Keep this email. The same button is your private link to mark ${esc(r.pet_name || "them")} as home, renew the post, or take it down. Don't forward it.`) +
    p(`People who see your post can message you through the site. Their messages come to this address, and your email stays hidden.`, `color:${C.muted};font-size:13px`) +
    p(`Didn't post this? Ignore this email and nothing goes up.`, `color:${C.muted};font-size:13px`);
  return {
    subject: `Put your post live: ${what}`,
    html: layout({ preheader: "Tap the button to put your lost & found post on the board.", body }),
    text: `Thanks for posting "${what}". Open this link to put it live:\n\n${confirmUrl(r)}\n\nKeep this email: the same link lets you mark them home, renew the post or take it down. Don't forward it.\n\nDidn't post this? Ignore this email.${textFooter(null)}`,
  };
}

export function lfContactEmail(r, m) {
  const what = headline(r);
  const body = h2(`A message about your post`) +
    p(`<b>${esc(m.name)}</b> sent this about <a href="${esc(postUrl(r))}" style="color:${C.teal}">${esc(what)}</a>:`) +
    `<div style="margin:0 0 16px;padding:14px 16px;background:${C.cream};border-radius:14px;font:15px/1.6 'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif;color:${C.slate};white-space:pre-wrap">${esc(m.message)}</div>` +
    (m.phone ? p(`Their phone: <b>${esc(m.phone)}</b>`) : "") +
    p(`Hit <b>Reply</b> to answer ${esc(m.name)} directly. Your reply shows them your email address.`) +
    p(`Stay safe: meet in a public place, and ask anyone who claims a found pet to describe it or show a photo first. Never pay a "reward" up front.`, `color:${C.muted};font-size:13px`) +
    button(ownerUrl(r), r.kind === "lost" ? "Mark as home or manage your post" : "Manage your post");
  return {
    subject: `Message about your post: ${what}`,
    html: layout({ preheader: `${m.name}: ${m.message.slice(0, 80)}`, body }),
    text: `${m.name} sent this about ${what} (${postUrl(r)}):\n\n${m.message}\n\n${m.phone ? "Their phone: " + m.phone + "\n\n" : ""}Reply to this email to answer them directly.\n\nStay safe: meet in public, ask for a description or photo first, and never pay a reward up front.\n\nManage your post: ${ownerUrl(r)}${textFooter(null)}`,
  };
}

export function lfReminderEmail(r) {
  const what = headline(r);
  const body = h2(r.kind === "lost" ? `Still looking for ${esc(r.pet_name || "your pet")}?` : "Still caring for this pet?") +
    p(`Your post <b>${esc(what)}</b> comes down in a few days. If you're still looking, renew it for another ${DAYS_LIVE} days. If they're home, mark it so people stop searching, and so we can celebrate with you.`) +
    button(ownerUrl(r), "Renew or mark as home") +
    p(`Doing nothing is fine too. The post just comes down on its own.`, `color:${C.muted};font-size:13px`);
  return {
    subject: `Your lost & found post ends soon: ${what}`,
    html: layout({ preheader: "Renew it, or mark them home.", body }),
    text: `Your post "${what}" comes down in a few days.\n\nRenew it or mark them home: ${ownerUrl(r)}${textFooter(null)}`,
  };
}

export function lfAdminEmail(r) {
  const body = h2("New lost &amp; found post is live") +
    p(`<b>${esc(headline(r))}</b> · ${esc(looks(r))}<br>${esc(r.last_seen)}, ${esc(r.town)} · seen ${esc(r.date_seen)}`) +
    (r.description ? p(esc(r.description)) : "") +
    p(`Posted by ${esc(r.contact_name)} (${esc(r.email)})${r.phone ? ", " + esc(r.phone) + (r.show_phone ? " (shown)" : " (hidden)") : ""}.`) +
    button(postUrl(r), "See the post") +
    p(`It went live when they confirmed their email. If it looks wrong, hide it in Admin → Lost &amp; found.`, `color:${C.muted};font-size:13px`);
  return { subject: `[Lost & found] ${headline(r)}`, html: layout({ preheader: headline(r), body }), text: `${headline(r)}\n${postUrl(r)}\nPosted by ${r.contact_name} (${r.email})` };
}
