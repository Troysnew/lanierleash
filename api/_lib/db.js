// Supabase via its REST API (PostgREST), using the service-role key. Server-side only.
function base() {
  const u = process.env.SUPABASE_URL;
  if (!u || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase is not configured");
  return u.replace(/\/$/, "") + "/rest/v1/";
}

export async function db(path, { method = "GET", body, prefer } = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // New-style secret keys (sb_secret_...) go in the apikey header only. Legacy service_role keys are JWTs
  // ("eyJ...") and also go in Authorization.
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(base() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) {
    const err = new Error(`db ${method} ${path.split("?")[0]} ${r.status}: ${text.slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

const enc = encodeURIComponent;

export async function subByToken(t) {
  if (!t || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  const rows = await db(`subscribers?token=eq.${enc(t)}&select=*&limit=1`);
  return rows[0] || null;
}

export async function subByEmail(email) {
  const rows = await db(`subscribers?email=eq.${enc(email)}&select=*&limit=1`);
  return rows[0] || null;
}

export async function insertSub(row) {
  const rows = await db("subscribers", { method: "POST", body: row, prefer: "return=representation" });
  return rows[0];
}

export async function updateSub(id, patch) {
  const rows = await db(`subscribers?id=eq.${enc(id)}`, { method: "PATCH", body: patch, prefer: "return=representation" });
  return rows[0];
}

export async function activeSubs() {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const page = await db(`subscribers?status=eq.active&select=id,email,zip,radius,lat,lng,token&order=created_at.asc&limit=1000&offset=${off}`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// One row per weekly issue. Inserting it is the lock: a second run that week hits the primary key and stops.
export async function claimWeek(week, subject) {
  try {
    await db("sends", { method: "POST", body: { week, status: "sending", subject }, prefer: "return=minimal" });
    return true;
  } catch (e) {
    if (e.status === 409) return false;
    throw e;
  }
}

export async function finishWeek(week, patch) {
  await db(`sends?week=eq.${enc(week)}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
}

// ---------- submissions + photo storage ----------
function storageHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const h = { apikey: key, ...extra };
  if (key.startsWith("eyJ")) h.Authorization = "Bearer " + key;
  return h;
}

export async function insertSubmission(row) {
  const rows = await db("submissions", { method: "POST", body: row, prefer: "return=representation" });
  return rows[0];
}

export async function recentSubmissions(ipHash, sinceIso) {
  return db(`submissions?ip_hash=eq.${enc(ipHash)}&created_at=gte.${enc(sinceIso)}&select=id`);
}

export async function uploadPhoto(path, buf, contentType) {
  const r = await fetch(base().replace("/rest/v1/", "/storage/v1/") + "object/submissions/" + path, {
    method: "POST", headers: storageHeaders({ "Content-Type": contentType, "x-upsert": "false" }), body: buf,
  });
  if (!r.ok) throw new Error(`storage upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return path;
}

// A link to a private photo that works for 7 days (for the review email).
export async function signedPhotoUrl(path) {
  const root = base().replace("/rest/v1/", "/storage/v1");
  const r = await fetch(root + "/object/sign/submissions/" + path, {
    method: "POST", headers: storageHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: 7 * 24 * 3600 }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const u = j.signedURL || j.signedUrl;
  return u ? root + (u.startsWith("/") ? u : "/" + u) : null;
}

// ---------- admin ----------
async function pageAll(path) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const page = await db(`${path}&limit=1000&offset=${off}`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

export function allSubscribers() {
  return pageAll("subscribers?select=email,zip,radius,status,source,created_at,confirmed_at,unsubscribed_at&order=created_at.desc");
}

export function recentSends() { return db("sends?select=*&order=week.desc&limit=12"); }

export function listSubmissions({ status, type } = {}) {
  let q = "submissions?select=*&order=created_at.desc&limit=200";
  if (status && status !== "all") q += `&status=eq.${enc(status)}`;
  if (type && type !== "all") q += `&type=eq.${enc(type)}`;
  return db(q);
}

export function submissionCounts() { return pageAll("submissions?select=status,type&order=created_at.desc"); }

export async function getSubmission(id) {
  const rows = await db(`submissions?id=eq.${enc(id)}&select=*&limit=1`);
  return rows[0] || null;
}

export async function updateSubmission(id, patch) {
  const rows = await db(`submissions?id=eq.${enc(id)}`, { method: "PATCH", body: patch, prefer: "return=representation" });
  return rows[0];
}

export async function deleteSubmission(id) {
  await db(`submissions?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" });
}

export async function deletePhoto(path) {
  const root = base().replace("/rest/v1/", "/storage/v1");
  await fetch(root + "/object/submissions", {
    method: "DELETE", headers: storageHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: [path] }),
  });
}

// Signed links for many private photos at once: { path: url }
export async function signPhotos(paths, seconds = 3600) {
  const out = {};
  if (!paths.length) return out;
  const root = base().replace("/rest/v1/", "/storage/v1");
  const r = await fetch(root + "/object/sign/submissions", {
    method: "POST", headers: storageHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: seconds, paths }),
  });
  if (!r.ok) return out;
  for (const x of await r.json()) {
    const u = x.signedURL || x.signedUrl;
    if (u && x.path) out[x.path] = root + (u.startsWith("/") ? u : "/" + u);
  }
  return out;
}

export async function featuredPup() {
  const rows = await db("submissions?type=eq.pup&featured_at=not.is.null&select=data,photo_path,featured_at&order=featured_at.desc&limit=1");
  return rows[0] || null;
}

// ---------- events ----------
export const EVENT_COLS = ["date", "end_date", "start_time", "end_time", "title", "type", "venue", "town", "address", "lat", "lng", "cost", "dog_rule", "url", "source_name", "notes", "checked"];

export function listEvents({ status, from, to, limit = 500 } = {}) {
  let q = `events?select=*&order=date.asc,start_time.asc&limit=${limit}`;
  if (status && status !== "all") q += `&status=eq.${enc(status)}`;
  if (from) q += `&or=(date.gte.${enc(from)},end_date.gte.${enc(from)})`;
  if (to) q += `&date=lte.${enc(to)}`;
  return db(q);
}

export async function countEvents() {
  const rows = await db("events?select=id&limit=1");
  return rows.length;
}

export async function insertEvents(rows) {
  return db("events", { method: "POST", body: rows, prefer: "return=representation" });
}

// Feed imports: skip rows whose source_key already exists.
export async function insertEventsIgnoreDupes(rows) {
  if (!rows.length) return [];
  return db("events?on_conflict=source_key", { method: "POST", body: rows, prefer: "return=representation,resolution=ignore-duplicates" });
}

export async function getEvent(id) {
  const rows = await db(`events?id=eq.${enc(id)}&select=*&limit=1`);
  return rows[0] || null;
}

export async function updateEvent(id, patch) {
  const rows = await db(`events?id=eq.${enc(id)}`, { method: "PATCH", body: { ...patch, updated_at: new Date().toISOString() }, prefer: "return=representation" });
  return rows[0];
}

export async function deleteEvent(id) {
  await db(`events?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" });
}

// ---------- places ----------
export function listPlaces({ status } = {}) {
  let q = "places?select=*&order=name.asc";
  if (status && status !== "all") q += `&status=eq.${enc(status)}`;
  return pageAll(q);
}

export async function placeIds() { return (await pageAll("places?select=id&order=id.asc")).map((r) => r.id); }

export async function getPlace(id) {
  const rows = await db(`places?id=eq.${enc(id)}&select=*&limit=1`);
  return rows[0] || null;
}

// ignoreDupes: rows whose id already exists are skipped (the CSV import can be run again safely).
export async function insertPlaces(rows, { ignoreDupes = false } = {}) {
  if (!rows.length) return [];
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    out.push(...await db(ignoreDupes ? "places?on_conflict=id" : "places", { method: "POST", body: part, prefer: "return=representation" + (ignoreDupes ? ",resolution=ignore-duplicates" : "") }));
  }
  return out;
}

export async function updatePlace(id, patch) {
  const rows = await db(`places?id=eq.${enc(id)}`, { method: "PATCH", body: { ...patch, updated_at: new Date().toISOString() }, prefer: "return=representation" });
  return rows[0];
}

export async function deletePlace(id) {
  await db(`places?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" });
}

// ---------- settings (small JSON values, e.g. the email sponsor) ----------
export async function getSetting(key) {
  try {
    const rows = await db(`settings?key=eq.${enc(key)}&select=value&limit=1`);
    return rows[0] ? rows[0].value : null;
  } catch { return null; }
}

export async function setSetting(key, value) {
  await db("settings?on_conflict=key", { method: "POST", body: { key, value, updated_at: new Date().toISOString() }, prefer: "return=minimal,resolution=merge-duplicates" });
}

// ---------- the pack (approved pup photos) ----------
export function approvedPups(limit = 120) {
  return db(`submissions?type=eq.pup&status=in.(approved,done)&photo_path=not.is.null&select=id,data,photo_path,featured_at,created_at&order=created_at.desc&limit=${limit}`);
}

// ---------- Place feedback (thumbs + preset tags) ----------
export function feedbackFor(placeId) {
  return db(`place_feedback?place_id=eq.${enc(placeId)}&select=vote,tags,voter&limit=5000`);
}
export function recentFeedbackBy(voter, sinceIso) {
  return db(`place_feedback?voter=eq.${enc(voter)}&updated_at=gte.${enc(sinceIso)}&select=place_id`);
}
export function saveFeedback(row) {
  return db("place_feedback?on_conflict=place_id,voter", { method: "POST", body: [{ ...row, updated_at: new Date().toISOString() }], prefer: "return=minimal,resolution=merge-duplicates" });
}
export function deleteFeedback(placeId, voter) {
  return db(`place_feedback?place_id=eq.${enc(placeId)}&voter=eq.${enc(voter)}`, { method: "DELETE" });
}
export function allFeedback() {
  return db("place_feedback?select=place_id,vote,tags,updated_at&order=updated_at.desc&limit=20000");
}

// ---------- Lost & found ----------
export async function insertLost(row) {
  const rows = await db("lost_found", { method: "POST", body: row, prefer: "return=representation" });
  return rows[0];
}
export async function lostBy(col, val) {
  const rows = await db(`lost_found?${col}=eq.${enc(val)}&select=*&limit=1`);
  return rows[0] || null;
}
export async function updateLost(id, patch) {
  const rows = await db(`lost_found?id=eq.${enc(id)}`, { method: "PATCH", body: { ...patch, updated_at: new Date().toISOString() }, prefer: "return=representation" });
  return rows[0];
}
export async function deleteLost(id) {
  await db(`lost_found?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" });
}
// Live posts plus recent happy endings, for the board and the email.
export function boardPosts() {
  return db("lost_found?status=in.(active,reunited)&select=*&order=created_at.desc&limit=500");
}
export function listLost({ status } = {}) {
  let q = "lost_found?select=*&order=created_at.desc&limit=300";
  if (status && status !== "all") q += `&status=eq.${enc(status)}`;
  return db(q);
}
export function recentLostBy(ipHash, sinceIso) {
  return db(`lost_found?ip_hash=eq.${enc(ipHash)}&created_at=gte.${enc(sinceIso)}&select=id`);
}
export function lostEndingSoon(beforeIso) {
  return db(`lost_found?status=eq.active&reminded_at=is.null&expires_at=lte.${enc(beforeIso)}&select=*&limit=200`);
}
// Messages sent through the site: we keep only who-sent-when (for spam limits), never the text.
export function logLostMsg(row) { return db("lost_found_msgs", { method: "POST", body: row, prefer: "return=minimal" }); }
export function recentLostMsgs(col, val, sinceIso) {
  return db(`lost_found_msgs?${col}=eq.${enc(val)}&created_at=gte.${enc(sinceIso)}&select=id`);
}

// ---------- Featured partners ----------
export function listPartners() { return db("partners?select=*&order=created_at.desc&limit=500"); }
export async function getPartner(id) {
  const rows = await db(`partners?id=eq.${enc(id)}&select=*&limit=1`);
  return rows[0] || null;
}
export async function insertPartner(row) {
  const rows = await db("partners", { method: "POST", body: row, prefer: "return=representation" });
  return rows[0];
}
export async function updatePartner(id, patch) {
  const rows = await db(`partners?id=eq.${enc(id)}`, { method: "PATCH", body: { ...patch, updated_at: new Date().toISOString() }, prefer: "return=representation" });
  return rows[0];
}
export async function deletePartner(id) {
  await db(`partner_events?partner_id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
  await db(`partners?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" });
}
// One row per visitor, partner, kind and day (the unique key drops repeats), so counts are people, not reloads.
export function logPartnerEvent(row) {
  return db("partner_events?on_conflict=partner_id,kind,day,visitor", { method: "POST", body: [row], prefer: "return=minimal,resolution=ignore-duplicates" });
}
export function partnerEventsSince(dayIso) {
  return pageAll(`partner_events?day=gte.${enc(dayIso)}&select=partner_id,kind,day&order=day.desc`);
}
