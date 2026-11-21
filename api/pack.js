// GET /api/pack -> approved pup photos for /pack/, newest first, plus this week's birthdays.
// Only pups you approved or featured in /admin/ (owners agreed to share when they sent them).
import { approvedPups, signPhotos } from "./_lib/db.js";
import { birthdaysThisWeek } from "./_lib/content.js";
import { json, etParts, log } from "./_lib/util.js";

export default async function handler(req, res) {
  try {
    const rows = (await approvedPups(120)).filter((r) => r.data && r.data.consent && r.data.dog_name);
    const photos = await signPhotos(rows.map((r) => r.photo_path), 3 * 24 * 3600);
    const pups = rows.filter((r) => photos[r.photo_path]).map((r) => {
      const d = r.data;
      return { name: d.dog_name, age: d.age || "", town: d.town || "", story: d.story || "", owner: d.owner || "", photo: photos[r.photo_path], featured: !!r.featured_at, birthday: /^\d{4}-\d{2}-\d{2}$/.test(d.birthday || "") ? d.birthday.slice(5) : "" };
    });
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=1800, stale-while-revalidate=7200");
    return json(res, 200, { ok: true, pups, birthdays: birthdaysThisWeek(rows, etParts().date) });
  } catch (e) {
    log("pack failed", e.message);
    return json(res, 200, { ok: true, pups: [], birthdays: [] });
  }
}
