// Dog of the Month. Approved pups (owners opted in) are entered for NEXT month's title, and readers vote
// all of this month: one confirmed vote per email per contest. On the 1st the top vote-getter becomes
// that month's Dog of the Month. Contest keys are "YYYY-MM" (the month the winner holds the title).
import { db, approvedPups, signPhotos } from "./db.js";
import { slug } from "./content.js";
import { etParts } from "./util.js";

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const enc = encodeURIComponent;

export function shiftMonth(ym, n) {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export const monthName = (ym) => MON[+ym.slice(5, 7) - 1];
export const monthLabel = (ym) => `${monthName(ym)} ${ym.slice(0, 4)}`;
// Two contests run side by side: Dog of the Month ("YYYY-MM") and Critter of the Month for cats, birds,
// reptiles and other pets ("YYYY-MM-c"). Same rules, separate ballots.
export const KINDS = {
  dog: { key: "dog", suffix: "", title: "Dog of the Month", base: "/dog-of-the-month/", noun: "pup", nouns: "pups" },
  critter: { key: "critter", suffix: "-c", title: "Critter of the Month", base: "/critter-of-the-month/", noun: "pet", nouns: "pets" },
};
export const kindOf = (contest) => (/-c$/.test(contest || "") ? KINDS.critter : KINDS.dog);
// A pup submission is a critter when the sender picked a kind of pet other than dog.
export const kindOfData = (d) => (d && d.species && d.species !== "dog" ? KINDS.critter : KINDS.dog);
// Voting this month picks next month's winner.
export const openContest = (today = etParts().date, kind = "dog") => shiftMonth(today.slice(0, 7), 1) + KINDS[kind].suffix;
// The contest whose winner holds the title right now.
export const currentTitle = (today = etParts().date, kind = "dog") => today.slice(0, 7) + KINDS[kind].suffix;
// Last day of voting for a contest (the last day of the month before it).
export function closesOn(contest) {
  const d = new Date(Date.UTC(+contest.slice(0, 4), +contest.slice(5, 7) - 1, 0));
  return d.toISOString().slice(0, 10);
}

export const entryId = (row) => `${slug((row.data && row.data.dog_name) || "pup").slice(0, 40) || "pup"}-${String(row.id).replace(/-/g, "").slice(0, 6)}`;

function shape(row, photos, votes) {
  const d = row.data || {};
  return { id: entryId(row), sid: row.id, name: d.dog_name, age: d.age || "", town: d.town || "", story: d.story || "", owner: d.owner || "",
    photo: photos ? photos[row.photo_path] || null : null, photo_path: row.photo_path, contest: d.dotm || "", species: d.species || "dog", votes: votes ? votes[row.id] || 0 : 0 };
}

// Approved, consenting pups entered for a contest.
async function entryRows(contest) {
  return (await approvedPups(500)).filter((r) => r.data && r.data.consent && r.data.dog_name && r.data.dotm === contest && r.photo_path);
}

export async function voteCounts(contest) {
  const rows = await db(`dotm_votes?contest=eq.${enc(contest)}&status=eq.confirmed&select=pup_id&limit=20000`);
  const out = {};
  for (const r of rows) out[r.pup_id] = (out[r.pup_id] || 0) + 1;
  return out;
}

// Entries for a contest, most votes first (ties: who entered first).
export async function entries(contest, { photos = true } = {}) {
  const rows = await entryRows(contest);
  const [votes, signed] = await Promise.all([voteCounts(contest).catch(() => ({})), photos ? signPhotos(rows.map((r) => r.photo_path), 3 * 24 * 3600) : {}]);
  return rows.map((r) => ({ ...shape(r, signed, votes), created_at: r.created_at }))
    .sort((a, b) => b.votes - a.votes || String(a.created_at).localeCompare(String(b.created_at)));
}

// The winner of a contest that has closed, or null (no entries or no votes).
export async function winner(contest) {
  const list = await entries(contest);
  return list.length && list[0].votes > 0 ? list[0] : null;
}

// Find one entry by its public id, in any contest (shared links keep working after the month ends).
export async function findEntry(id) {
  const m = /-([0-9a-f]{6})$/.exec(id || "");
  if (!m) return null;
  const rows = (await approvedPups(500)).filter((r) => r.data && r.data.consent && r.data.dotm && String(r.id).replace(/-/g, "").startsWith(m[1]) && entryId(r) === id);
  if (!rows.length) return null;
  const r = rows[0], votes = await voteCounts(r.data.dotm).catch(() => ({}));
  return shape(r, null, votes);
}

// ---------- votes ----------
export async function voteByEmail(contest, email) {
  const rows = await db(`dotm_votes?contest=eq.${enc(contest)}&email=eq.${enc(email)}&select=*&limit=1`);
  return rows[0] || null;
}
export async function voteByToken(t) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t || "")) return null;
  const rows = await db(`dotm_votes?token=eq.${enc(t)}&select=*&limit=1`);
  return rows[0] || null;
}
export async function insertVote(row) {
  const rows = await db("dotm_votes", { method: "POST", body: row, prefer: "return=representation" });
  return rows[0];
}
export async function updateVote(id, patch) {
  const rows = await db(`dotm_votes?id=eq.${enc(id)}`, { method: "PATCH", body: patch, prefer: "return=representation" });
  return rows[0];
}
export function recentVotesBy(ipHash, sinceIso) {
  return db(`dotm_votes?ip_hash=eq.${enc(ipHash)}&created_at=gte.${enc(sinceIso)}&select=id`);
}
