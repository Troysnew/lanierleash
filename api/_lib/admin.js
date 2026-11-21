// Admin login: one password (ADMIN_PASSWORD, or ADMIN_KEY if that isn't set) and a signed,
// HttpOnly session cookie. Changing ADMIN_KEY logs every session out.
import crypto from "node:crypto";
import { sameSecret } from "./util.js";

const COOKIE = "ll_admin";
const DAYS = 14;

export function adminPassword() { return process.env.ADMIN_PASSWORD || process.env.ADMIN_KEY || ""; }

function sign(v) {
  return crypto.createHmac("sha256", (process.env.ADMIN_KEY || "") + "|session").update(String(v)).digest("base64url");
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((p) => p[0]).map(([k, ...v]) => [k, v.join("=")]));
}

export function isAdmin(req) {
  if (!process.env.ADMIN_KEY) return false;
  const c = cookies(req)[COOKIE];
  if (!c) return false;
  const [exp, sig] = c.split(".");
  if (!exp || !sig || !(+exp > Date.now())) return false;
  return sameSecret(sig, sign(exp));
}

export function loginCookie() {
  const exp = Date.now() + DAYS * 864e5;
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAYS * 86400}`;
}

export function logoutCookie() {
  return `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
