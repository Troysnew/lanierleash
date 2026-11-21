// Builds any of the emails for a pretend reader, for the admin preview and test sends.
import { loadData, fetchWeather, walkCheck, buildIssue } from "./content.js";
import { weeklyEmail, confirmEmail, welcomeEmail } from "./templates.js";
import { etParts, lookupZip, cleanRadius } from "./util.js";

export async function buildPreview({ type, zip, radius, date } = {}) {
  const place = (await lookupZip(String(zip || "30041"))) || (await lookupZip("30041"));
  const sub = { email: "preview@example.com", zip: place.zip, lat: place.lat, lng: place.lng, radius: cleanRadius(radius || 15), token: "preview-token-not-real-000" };
  if (type === "confirm") return confirmEmail(sub);
  if (type === "welcome") return welcomeEmail(sub);
  const now = etParts();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : now.date;
  const data = await loadData(today);
  return weeklyEmail(sub, buildIssue(sub, data, walkCheck(await fetchWeather(), now.hour), today));
}
