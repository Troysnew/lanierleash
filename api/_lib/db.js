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
