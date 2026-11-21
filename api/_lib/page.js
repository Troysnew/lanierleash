// The site's header and footer for pages the server builds (place pages, the web version of the email).
// Keep the nav and footer in step with the static pages.
import { esc } from "./templates.js";
import { siteUrl } from "./util.js";

export const FOOTER = `<footer>
  <div class="lakeband" aria-hidden="true"></div>
  <div class="wrap">
    <div>
      <a class="brand" href="/" aria-label="Lanier Leash home"><svg class="mark" aria-hidden="true"><use href="#i-logo"/></svg><span class="wm"><b>Lanier<i>Leash</i></b></span></a>
      <p style="margin-top:14px;max-width:36ch">A free weekly email of dog events and dog-friendly places around Cumming, Lake Lanier and north metro Atlanta.</p>
    </div>
    <div><h4>Explore</h4><ul><li><a href="/events/">Events</a></li><li><a href="/places/">Places</a></li><li><a href="/pack/">The pack</a></li><li><a href="/lost-found/">Lost &amp; found</a></li><li><a href="/issue/">This week's email</a></li></ul></div>
    <div><h4>Help</h4><ul><li><a href="/adopt/">Adopt or foster</a></li><li><a href="/vet-care/">Low-cost vet care</a></li><li><a href="/tips/">Owner tips</a></li><li><a href="/places/#how-we-check">How we check</a></li></ul></div>
    <div><h4>Lanier Leash</h4><ul><li><a href="/#top">Join free</a></li><li><a href="/about/">About</a></li><li><a href="/advertise/">Advertise</a></li><li><a href="/submit/">Send us something</a></li><li><a href="/manage/">Manage your email</a></li><li><a href="/privacy/">Privacy</a></li></ul></div>
  </div>
  <div class="wrap legal">© 2026 Lanier Leash · Cumming, GA · Rules change, so check before you go.</div>
</footer>`;

export function shell({ title, description, path, body, head = "", scripts = "", current = "", image = "/img/hero.jpg", noindex = false }) {
  const url = siteUrl() + path, cur = (k) => (current === k ? ' aria-current="true"' : "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(siteUrl() + image)}">
<meta name="theme-color" content="#0B3A5B">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Kaushan+Script&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${head}
</head>
<body>
<script src="/assets/icons.js"></script>
<div class="mesh" aria-hidden="true" style="height:420px"></div>
<div class="wrap navwrap">
  <nav class="nav glass" aria-label="Main">
    <a class="brand" href="/" aria-label="Lanier Leash home"><svg class="mark" aria-hidden="true"><use href="#i-logo"/></svg><span class="wm"><b>Lanier<i>Leash</i></b></span></a>
    <div class="links"><a href="/events/"${cur("events")}>Events</a><a href="/places/"${cur("places")}>Places</a><a href="/#conditions">Conditions</a><a href="/pack/">Community</a></div>
    <a class="btn btn-coral btn-sm" href="/#top"><svg class="ic"><use href="#u-paw"/></svg>Join free</a>
    <button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="mnav"><span class="sr">Menu</span><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
  </nav>
  <nav class="mnav glass" id="mnav" hidden aria-label="Mobile"><a href="/events/">Events</a><a href="/places/">Places</a><a href="/#conditions">Conditions</a><a href="/pack/">Community</a><a href="/lost-found/">Lost &amp; found</a><a class="btn btn-coral" href="/#top">Join free</a></nav>
</div>
<main id="top">
${body}
</main>
${FOOTER}
<script src="/assets/data.js"></script>
<script>window.LL && window.LL.initMenu();</script>
${scripts}
</body>
</html>`;
}

export function sendHtml(res, status, html, cache = "public, s-maxage=600, stale-while-revalidate=86400") {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  return res.end(html);
}
