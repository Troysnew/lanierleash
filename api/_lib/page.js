// The site's header and footer for pages the server builds (place pages, the web version of the email).
// Keep the nav and footer in step with the static pages.
import { esc } from "./templates.js";
import { siteUrl } from "./util.js";

export const FOOTER = `<footer>
  <div class="lakeband" aria-hidden="true"></div>
  <div class="wrap">
    <div>
      <a class="brand" href="/" aria-label="Lanier Leash home"><img class="mark" src="/img/icons/lanier-leash-emblem-96.webp" alt="" width="46" height="46"><span class="wm"><b>Lanier<i>Leash</i></b></span></a>
      <p style="margin-top:14px;max-width:36ch">A free weekly email of dog events and dog-friendly places around Cumming, Lake Lanier and north metro Atlanta.</p>
    </div>
    <div><h4>Explore</h4><ul><li><a href="/events/">Events</a></li><li><a href="/places/">Places</a></li><li><a href="/pack/">The pack</a></li><li><a href="/dog-of-the-month/">Dog of the Month</a></li><li><a href="/lost-found/">Lost &amp; found</a></li><li><a href="/issue/">This week's email</a></li></ul></div>
    <div><h4>Help</h4><ul><li><a href="/adopt/">Adopt or foster</a></li><li><a href="/vet-care/">Low-cost vet care</a></li><li><a href="/services/">Groomers &amp; trainers</a></li><li><a href="/tips/">Owner tips</a></li><li><a href="/places/#how-we-check">How we check</a></li></ul></div>
    <div><h4>Lanier Leash</h4><ul><li><a href="/#top">Join free</a></li><li><a href="/about/">About</a></li><li><a href="/advertise/">Advertise</a></li><li><a href="/submit/">Send us something</a></li><li><a href="/manage/">Manage your email</a></li><li><a href="/privacy/">Privacy</a></li></ul></div>
  </div>
  <div class="wrap legal">© 2026 Lanier Leash · Cumming, GA · Rules change, so check before you go. Owner tips are general advice; ask your vet about your own dog.</div>
</footer>`;

// Top menu: generated from tools/nav.py (keep in step).
const NAV = `<div class="links" id="links"><a href="/events/">Events</a><a href="/places/">Places</a><div class="dd"><a class="ddt" href="/dog-services/">Services<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a><div class="ddm"><a href="/vet-care/"><img src="/img/icons/vet-care-96.webp" alt="" width="34" height="34"><span><b>Vet care</b><small>Low-cost clinics and emergency vets</small></span></a><a href="/services/"><img src="/img/icons/services-96.webp" alt="" width="34" height="34"><span><b>Groomers &amp; trainers</b><small>Grooming, training, walkers and sitters</small></span></a><a href="/adopt/"><img src="/img/icons/adopt-and-rescues-96.webp" alt="" width="34" height="34"><span><b>Adopt or foster</b><small>Shelters and rescues near the lake</small></span></a><a class="ddall" href="/dog-services/">All dog services →</a></div></div><a class="lfl" href="/lost-found/">Lost &amp; found</a><div class="dd"><a class="ddt" href="/pack/">Community<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a><div class="ddm"><a href="/pack/"><img src="/img/icons/the-pack-community-96.webp" alt="" width="34" height="34"><span><b>The pack</b><small>Local pups sent in by their people</small></span></a><a href="/dog-of-the-month/"><img src="/img/icons/lanier-leash-emblem-96.webp" alt="" width="34" height="34"><span><b>Dog of the Month</b><small>Vote for your favorite pup</small></span></a><a href="/#conditions"><img src="/img/icons/conditions-sun-good-walk-day-96.webp" alt="" width="34" height="34"><span><b>Walk conditions</b><small>Weekend forecast and pavement check</small></span></a><a href="/tips/"><img src="/img/icons/tips-96.webp" alt="" width="34" height="34"><span><b>Owner tips</b><small>Ticks, heat, lake safety and more</small></span></a><a href="/issue/"><img src="/img/icons/newsletter-96.webp" alt="" width="34" height="34"><span><b>This week's email</b><small>Read the latest Thursday email</small></span></a></div></div></div>`;
const CUR = { events: 'href="/events/"', places: 'href="/places/"', services: 'class="ddt" href="/dog-services/"', lost: 'class="lfl" href="/lost-found/"', community: 'class="ddt" href="/pack/"' };
export function navLinks(cur) { const t = CUR[cur]; return t ? NAV.replace(t + ">", t + ' aria-current="true">') : NAV; }

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
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
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
    <a class="brand" href="/" aria-label="Lanier Leash home"><img class="mark" src="/img/icons/lanier-leash-emblem-96.webp" alt="" width="46" height="46"><span class="wm"><b>Lanier<i>Leash</i></b></span></a>
    ${navLinks(current)}
    <a class="btn btn-coral btn-sm" href="/#top"><svg class="ic"><use href="#u-paw"/></svg>Join free</a>
    <button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="mnav"><span class="sr">Menu</span><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
  </nav>
  <nav class="mnav glass" id="mnav" hidden aria-label="Mobile"><a href="/events/">Events</a><a href="/places/">Places</a><a class="lfl" href="/lost-found/">Lost &amp; found</a><p class="mh">Services</p><a href="/vet-care/">Vet care</a><a href="/services/">Groomers &amp; trainers</a><a href="/adopt/">Adopt or foster</a><p class="mh">Community</p><a href="/pack/">The pack</a><a href="/dog-of-the-month/">Dog of the Month</a><a href="/#conditions">Walk conditions</a><a href="/tips/">Owner tips</a><a href="/issue/">This week's email</a><a class="btn btn-coral" href="/#top">Join free</a></nav>
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
