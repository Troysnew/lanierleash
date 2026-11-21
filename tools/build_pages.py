"""Builds the simple content pages from data files, with the site's header and footer.

    python tools/build_pages.py

Pages: /adopt/ (data/rescues.csv), /vet-care/ (data/vetcare.csv), /tips/ (data/tips.json),
/pack/, /about/, /advertise/. It also puts the current footer on every static page.
Edit the data files, then run this again. Keep FOOTER in step with api/_lib/page.js.
"""
import csv, html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
esc = lambda s: html.escape(str(s or ""), quote=True)
ic = lambda i: f'<svg class="ic" aria-hidden="true"><use href="#{i}"/></svg>'
CHECKED = "November 2026"

FOOTER = """<footer>
  <div class="lakeband" aria-hidden="true"></div>
  <div class="wrap">
    <div>
      <a class="brand" href="/" aria-label="Lanier Leash home"><svg class="mark" aria-hidden="true"><use href="#i-logo"/></svg><span class="wm"><b>Lanier<i>Leash</i></b></span></a>
      <p style="margin-top:14px;max-width:36ch">A free weekly email of dog events and dog-friendly places around Cumming, Lake Lanier and north metro Atlanta.</p>
    </div>
    <div><h4>Explore</h4><ul><li><a href="/events/">Events</a></li><li><a href="/places/">Places</a></li><li><a href="/pack/">The pack</a></li><li><a href="/issue/">This week's email</a></li></ul></div>
    <div><h4>Help</h4><ul><li><a href="/adopt/">Adopt or foster</a></li><li><a href="/vet-care/">Low-cost vet care</a></li><li><a href="/tips/">Owner tips</a></li><li><a href="/places/#how-we-check">How we check</a></li></ul></div>
    <div><h4>Lanier Leash</h4><ul><li><a href="/#top">Join free</a></li><li><a href="/about/">About</a></li><li><a href="/advertise/">Advertise</a></li><li><a href="/submit/">Send us something</a></li><li><a href="/manage/">Manage your email</a></li><li><a href="/privacy/">Privacy</a></li></ul></div>
  </div>
  <div class="wrap legal">© 2026 Lanier Leash · Cumming, GA · Rules change, so check before you go. Owner tips are general advice; ask your vet about your own dog.</div>
</footer>"""


def shell(path, title, desc, body, scripts=""):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="https://lanierleash.com{path}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="https://lanierleash.com/img/hero.jpg">
<meta name="theme-color" content="#0B3A5B">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Kaushan+Script&display=swap">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<script src="/assets/icons.js"></script>
<div class="mesh" aria-hidden="true" style="height:420px"></div>
<div class="wrap navwrap">
  <nav class="nav glass" aria-label="Main">
    <a class="brand" href="/" aria-label="Lanier Leash home"><svg class="mark" aria-hidden="true"><use href="#i-logo"/></svg><span class="wm"><b>Lanier<i>Leash</i></b></span></a>
    <div class="links"><a href="/events/">Events</a><a href="/places/">Places</a><a href="/#conditions">Conditions</a><a href="/pack/">Community</a></div>
    <a class="btn btn-coral btn-sm" href="/#top"><svg class="ic"><use href="#u-paw"/></svg>Join free</a>
    <button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="mnav"><span class="sr">Menu</span><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
  </nav>
  <nav class="mnav glass" id="mnav" hidden aria-label="Mobile"><a href="/events/">Events</a><a href="/places/">Places</a><a href="/#conditions">Conditions</a><a href="/pack/">Community</a><a class="btn btn-coral" href="/#top">Join free</a></nav>
</div>
<main id="top">
{body}
</main>
{FOOTER}
<script src="/assets/data.js"></script>
<script>window.LL && window.LL.initMenu();</script>
{scripts}
</body>
</html>
"""


def hero(eyebrow, h1, lede):
    return f'<section class="page-hero"><div class="wrap"><span class="eyebrow">{esc(eyebrow)}</span><h1>{esc(h1)}</h1><p class="lede">{lede}</p></div></section>'


def host(u):
    m = re.match(r"https?://(?:www\.)?([^/]+)", u or "")
    return m.group(1) if m else ""


def tel(p):
    d = re.sub(r"[^\d]", "", p or "")
    return f'<a href="tel:+1{d[-10:]}">{esc(p)}</a>' if len(d) >= 10 else esc(p)


def org_card(r, extra=""):
    bits = []
    if r.get("address"): bits.append(f'<p class="addr">{ic("u-pin")}<a href="https://www.google.com/maps/search/?api=1&amp;query={esc(r["name"] + ", " + r["address"])}" target="_blank" rel="noopener">{esc(r["address"])}</a></p>')
    if r.get("phone"): bits.append(f'<p class="addr">{ic("u-arrow")}{tel(r["phone"])}</p>')
    links = []
    if r.get("website"): links.append(f'<a class="lnk" href="{esc(r["website"])}" target="_blank" rel="noopener">{ic("u-arrow")}Website</a>')
    if r.get("events_url"): links.append(f'<a class="lnk" href="{esc(r["events_url"])}" target="_blank" rel="noopener">{ic("i-cal")}Adoption events</a>')
    if r.get("source_url") and r.get("source_url") != r.get("website"): links.append(f'<a class="lnk" href="{esc(r["source_url"])}" target="_blank" rel="noopener">{ic("u-check")}Source</a>')
    name = f'<a href="{esc(r["website"])}" target="_blank" rel="noopener">{esc(r["name"])}</a>' if r.get("website") else esc(r["name"])
    tags = " ".join(x for x, on in (("adopt", r.get("adopt") == "yes"), ("foster", r.get("foster") == "yes")) if on)
    ll = f' data-lat="{r["lat"]}" data-lng="{r["lng"]}"' if r.get("lat") and r.get("lng") else ""
    town = "By phone, 24/7" if r.get("kind") == "poison line" else esc(r.get("town")) if ll else (esc(r.get("town")) + " · serves the whole area" if r.get("town") else "Serves the whole area")
    return (f'<article class="org" data-tags="{tags}"{ll}><div class="top"><h3>{name}</h3><span class="town">{town}<b class="dist"></b></span></div>'
            f'{extra}{"<p>" + esc(r["notes"]) + "</p>" if r.get("notes") else ""}{"".join(bits)}<div class="acts">{"".join(links)}</div></article>')


ADOPT_JS = """<script>(function(){function show(v){document.querySelectorAll(".org").forEach(function(o){o.hidden=!!v&&(" "+o.dataset.tags+" ").indexOf(" "+v+" ")<0});
document.querySelectorAll(".orgf [data-of]").forEach(function(b){b.setAttribute("aria-pressed",String(b.dataset.of===v))});
document.querySelectorAll("section.blk").forEach(function(sec){var c=sec.querySelectorAll(".org");if(c.length)sec.hidden=[].every.call(c,function(o){return o.hidden})})}
document.addEventListener("click",function(e){var b=e.target.closest("[data-of]");if(!b)return;show(b.dataset.of);if(b.closest(".org"))document.querySelector(".orgf").scrollIntoView({behavior:"smooth",block:"center"})})})();</script>"""

# Where to go next from each tip, on this site.
RELATED = {
    "hot-pavement-georgia-summer": [("Shady trails and parks", "/places/?cat=outdoors"), ("This weekend's walk check", "/#conditions")],
    "ticks-in-georgia": [("Low-cost vaccine and vet clinics", "/vet-care/"), ("Trails near you", "/places/?cat=trail")],
    "lake-lanier-water-safety": [("Lake Lanier access spots", "/places/?cat=lake")],
    "toxic-algae-lake-lanier": [("Lake Lanier access spots", "/places/?cat=lake"), ("Low-cost vet care", "/vet-care/")],
    "leptospirosis-lakes-puddles": [("Low-cost vaccine clinics", "/vet-care/")],
    "leash-and-at-large-rules": [("Fenced dog parks", "/places/?cat=dogpark"), ("Parks and trails", "/places/?cat=outdoors")],
    "georgia-rabies-law": [("Low-cost vaccine clinics", "/vet-care/")],
    "holiday-food-and-plant-hazards": [("Low-cost vet care", "/vet-care/"), ("Holiday dog events", "/events/?q=santa")],
    "fireworks-and-thunderstorms": [("This weekend's walk check", "/#conditions")],
    "dog-friendly-patios": [("Dog-friendly restaurants and breweries", "/places/?cat=food"), ("Coffee shops", "/places/?cat=coffee")],
}


# Distance from the visitor's ZIP on each org card, nearest first within each group.
DIST_JS = """<script src="/assets/data.js"></script>
<script>(function(){var L=window.LL;if(!L)return;function run(){
document.querySelectorAll(".org[data-lat]").forEach(function(o){var m=L.miles(+o.dataset.lat,+o.dataset.lng);o.dataset.mi=m==null?"":m;var b=o.querySelector(".dist");if(b)b.textContent=m==null?"":" · "+L.fmtMi(m)+" from "+L.home.zip;});
document.querySelectorAll(".orglist, .orgs").forEach(function(g){var c=[].slice.call(g.querySelectorAll(":scope > .org"));c.sort(function(a,b){var x=a.dataset.mi===undefined||a.dataset.mi===""?1e9:+a.dataset.mi,y=b.dataset.mi===undefined||b.dataset.mi===""?1e9:+b.dataset.mi;return x-y});c.forEach(function(n){g.appendChild(n)})});}
run();document.addEventListener("ll:home",run);})();</script>"""


def adopt():
    rows = list(csv.DictReader(open(ROOT / "data/rescues.csv", encoding="utf-8")))
    groups = [("county shelter", "County shelters", "Open-admission shelters run by the counties. Low fees, lots of dogs, and they need fosters."),
              ("humane society", "Humane societies", "Nonprofit shelters and adoption centers."),
              ("rescue", "Foster-based rescues", "Dogs live in volunteer homes until they're adopted. Many hold weekend adoption events at pet stores."),
              ("breed rescue", "Breed rescues", "For a specific breed, or if you need to rehome one.")]
    out = []
    for k, title, blurb in groups:
        g = sorted([r for r in rows if r["kind"] == k], key=lambda r: r["name"])
        if not g: continue
        def tags(r):
            t = [x for x, on in (("Adopt", r.get("adopt") == "yes"), ("Foster", r.get("foster") == "yes")) if on]
            return f'<p class="tags">{"".join(f'<button type="button" data-of="{x.lower()}" title="Show only places that offer this">{x}</button>' for x in t)}</p>' if t else ""
        out.append(f'<section class="blk rblk"><div class="wrap"><div class="sh"><div><h2>{title}</h2></div><p>{blurb}</p></div><div class="orgs">{"".join(org_card(r, tags(r)) for r in g)}</div></div></section>')
    body = hero("Adopt or foster", "Shelters and rescues near Lake Lanier",
                "County shelters, humane societies and foster-based rescues around Cumming, Gainesville and north metro Atlanta. Fostering, even for a weekend, frees up a kennel. "
                '<a href="/events/?type=adopt&amp;when=weekend">See adoption events this weekend</a>.'
                '<span class="orgf" role="group" aria-label="Show"><button type="button" data-of="" aria-pressed="true">All</button><button type="button" data-of="adopt" aria-pressed="false">Adopt</button><button type="button" data-of="foster" aria-pressed="false">Foster</button></span>') + "".join(out) + \
        f'<section class="blk"><div class="wrap"><p class="note">Checked {CHECKED}. Hours and programs change, so call or check the website before you go. Run a rescue we missed? <a href="/submit/?type=place&amp;category=rescue">Tell us about it</a>.</p></div></section>'
    return shell("/adopt/", "Adopt or foster a dog near Cumming and Lake Lanier · Lanier Leash",
                 "Animal shelters, humane societies and dog rescues near Cumming, Gainesville, Forsyth, Hall and north metro Atlanta, with adoption and foster info.", body, DIST_JS + ADOPT_JS)


def emergency_section():
    """24/7 and after-hours emergency vets plus pet poison lines (data/emergency_vets.csv), at the top of /vet-care/."""
    rows = list(csv.DictReader(open(ROOT / "data/emergency_vets.csv", encoding="utf-8")))
    def card(r):
        facts = [("Hours", r.get("hours"))]
        dl = '<dl class="facts">' + "".join(f"<dt>{lbl}</dt><dd>{esc(v)}</dd>" for lbl, v in facts if v) + "</dl>"
        call = f'<p class="ercall"><a class="btn btn-coral btn-sm" href="tel:{esc(re.sub(r"[^0-9+]", "", r["phone"]))}">Call {esc(r["phone"])}</a></p>' if r.get("phone") else ""
        return org_card(r, dl + call)
    er = [r for r in rows if r["kind"] == "24/7 emergency"]
    ah = [r for r in rows if r["kind"].startswith("after-hours")]
    po = [r for r in rows if r["kind"] == "poison line"]
    return (f'<section class="blk rblk erblk" id="emergency"><div class="wrap"><div class="sh"><div><span class="eyebrow">Emergency</span><h2>If it can&rsquo;t wait</h2></div>'
            f'<p>Call ahead if you can so they&rsquo;re ready for you. Nearest first, from your ZIP.</p></div>'
            f'<h3 class="h3s">Open 24/7</h3><div class="orgs">{"".join(card(r) for r in er)}</div>'
            f'<h3 class="h3s">After hours and urgent care</h3><p class="fine">Evenings, weekends and holidays. Urgent care clinics send life-threatening cases to a 24/7 hospital.</p><div class="orgs">{"".join(card(r) for r in ah)}</div>'
            f'<h3 class="h3s">Pet poison lines</h3><p class="fine">Open 24/7, with a consultation fee. Have the package or plant name ready.</p><div class="orgs">{"".join(card(r) for r in po)}</div>'
            f'</div></section>')


def vetcare():
    rows = list(csv.DictReader(open(ROOT / "data/vetcare.csv", encoding="utf-8")))
    groups = [("low-cost vet", "Low-cost vet clinics"), ("spay/neuter clinic", "Spay and neuter"), ("vaccine clinic", "Vaccine clinics"),
              ("financial help", "Help paying vet bills"), ("pet food pantry", "Pet food pantries")]
    out = []
    for k, title in groups:
        g = sorted([r for r in rows if r["kind"] == k], key=lambda r: r["name"])
        if not g: continue
        def extra(r):
            dl = [(lbl, r.get(f)) for lbl, f in (("Services", "services"), ("Cost", "cost_note"), ("Who can use it", "eligibility")) if r.get(f)]
            return '<dl class="facts">' + "".join(f"<dt>{lbl}</dt><dd>{esc(v)}</dd>" for lbl, v in dl) + "</dl>" if dl else ""
        out.append(f'<section class="blk rblk"><div class="wrap"><div class="sh"><div><h2>{title}</h2></div></div><div class="orgs">{"".join(org_card(r, extra(r)) for r in g)}</div></div></section>')
    body = hero("Low-cost vet care", "Affordable vet care near Lake Lanier",
                "Nonprofit clinics, low-cost spay and neuter, vaccine clinics, pet food pantries and help with vet bills around Cumming, Gainesville and north metro Atlanta. <a href='#emergency'>Emergency vets</a> are first.") + emergency_section() + "".join(out) + \
        f'<section class="blk"><div class="wrap"><p class="note">Checked {CHECKED}. Prices are from each clinic\'s own price list and change often, so confirm when you book. For an emergency, call your vet or one of the <a href="#emergency">emergency hospitals above</a> right away.</p></div></section>'
    return shell("/vet-care/", "Low-cost vet care, spay and neuter near Cumming, GA · Lanier Leash",
                 "Affordable vet clinics, low-cost spay and neuter, vaccine clinics, pet food pantries and vet bill help near Cumming, Gainesville and north metro Atlanta.", body, DIST_JS)


def rel_links(slug):
    rel = " · ".join(f'<a href="{u}">{esc(n)}</a>' for n, u in RELATED.get(slug, []))
    return f'<p class="rel"><b>On Lanier Leash:</b> {rel}</p>' if rel else ""


def tips():
    data = json.load(open(ROOT / "data/tips.json", encoding="utf-8"))
    toc = "".join(f'<a href="#{esc(t["slug"])}">{esc(t["title"])}</a>' for t in data)
    arts = []
    for t in data:
        paras = "".join(f"<p>{esc(p)}</p>" for p in t["body"].split("\n\n") if p.strip())
        src = " · ".join(f'<a href="{esc(s["url"])}" target="_blank" rel="noopener">{esc(s["name"])}</a>' for s in t.get("sources", []))
        arts.append(f'<article class="tip" id="{esc(t["slug"])}"><h2>{esc(t["title"])}</h2><p class="sum">{esc(t["summary"])}</p><div class="prose">{paras}</div>'
                    f'{rel_links(t["slug"])}'
                    f'{f"<p class=src><b>Sources:</b> {src}</p>" if src else ""}</article>')
    body = hero("Owner tips", "Smart, local dog tips",
                "Short, practical advice for dog owners around Lake Lanier: heat, ticks, lake safety, local leash rules and more. Each tip links its sources.") + \
        f'<section class="blk" style="padding-top:20px"><div class="wrap tipgrid"><nav class="toc" aria-label="Tips">{toc}</nav><div>{"".join(arts)}'\
        f'<p class="note">General advice, checked {CHECKED}. It isn\'t a substitute for your vet, who knows your dog.</p></div></div></section>'
    return shell("/tips/", "Dog owner tips for Lake Lanier and north Georgia · Lanier Leash",
                 "Local dog tips: hot pavement, ticks, Lake Lanier water safety, algae, leptospirosis, Forsyth and Hall leash rules, rabies law and holiday hazards.", body)


def pack():
    body = hero("The pack", "Meet the Lake Lanier pack",
                'Local pups sent in by their people. Every week one becomes Pup of the Week on the homepage and in the email. <a href="/submit/?type=pup">Add your pup</a>.') + \
        """<section class="blk" style="padding-top:20px"><div class="wrap">
  <div class="bday" id="bday" hidden></div>
  <div class="packgrid" id="pack"><p class="loading">Loading the pack…</p></div>
  <div class="joincard" style="margin-top:30px;max-width:560px"><b>Add your pup to the pack</b><p>Send a photo, a name and one line about them. Add a birthday and we'll give them a shout-out that week.</p><a class="btn btn-coral" href="/submit/?type=pup">""" + ic("u-camera") + """Send your pup</a></div>
</div></section>"""
    script = """<script>
(function () {
  var esc = window.LL.esc;
  fetch("/api/pack").then(function (r) { return r.json(); }).then(function (d) {
    var g = document.getElementById("pack");
    if (d.birthdays && d.birthdays.length) {
      var b = document.getElementById("bday"); b.hidden = false;
      b.innerHTML = "<b>🎂 Pack birthdays this week</b> " + d.birthdays.map(function (x) { return esc(x.name) + (x.town ? " of " + esc(x.town) : "") + " <small>(" + esc(x.day) + ")</small>"; }).join(" · ");
    }
    if (!d.pups || !d.pups.length) { g.innerHTML = '<p class="empty">The pack is just getting started. <a href="/submit/?type=pup">Be the first to send your pup</a>.</p>'; return; }
    g.innerHTML = d.pups.map(function (p) {
      return '<figure class="pup">' + '<img src="' + esc(p.photo) + '" alt="' + esc(p.name) + (p.town ? ' from ' + esc(p.town) : '') + '" loading="lazy">' +
        (p.featured ? '<span class="pow">★ Pup of the Week</span>' : '') +
        '<figcaption><b>' + esc(p.name) + (p.age ? ', ' + esc(p.age) : '') + '</b><span>' + esc([p.town, p.owner ? 'with ' + p.owner : ''].filter(Boolean).join(' · ')) + '</span>' + (p.story ? '<em>' + esc(p.story) + '</em>' : '') + '</figcaption></figure>';
    }).join("");
  }).catch(function () { document.getElementById("pack").innerHTML = '<p class="empty">We couldn’t load the pack right now. Try again in a minute.</p>'; });
})();
</script>"""
    return shell("/pack/", "The pack: local dogs of Lake Lanier · Lanier Leash", "Photos of local pups from around Cumming and Lake Lanier, sent in by their people. Add yours.", body, script)


def about():
    body = hero("About", "A local guide for dog people",
                "Lanier Leash is a free guide to dog-friendly events and places around Cumming, Lake Lanier and north metro Atlanta.") + \
        """<section class="blk" style="padding-top:20px"><div class="wrap narrow prose">
  <h2 class="h2s">What we do</h2>
  <p>Every Thursday morning we send a short email with the weekend's dog-friendly events near your ZIP, a walk check with the forecast and a pavement estimate, and a few places worth trying. The website has the full events calendar and a directory of restaurants, breweries, trails, parks, lake access, pet stores and hotels that welcome dogs.</p>
  <h2 class="h2s">How we check</h2>
  <p>Dog rules change, and a lot of "dog-friendly" lists online are out of date. So every place shows its dog rule, where that rule came from, and the date we last checked. A green badge means the place or the agency that runs it says so. "Unconfirmed" means we only found it on a third-party site, so call ahead. <a href="/places/#how-we-check">More on the badges</a>.</p>
  <h2 class="h2s">Independent</h2>
  <p>We aren't affiliated with any venue, county or agency. Sponsors are always labeled, and they never change a dog rule or a badge. <a href="/advertise/">How sponsorship works</a>.</p>
  <h2 class="h2s">Help us keep it right</h2>
  <p>Readers make this better. <a href="/submit/?type=event">Send an event</a>, <a href="/submit/?type=place">suggest a place</a>, <a href="/submit/?type=fix">fix a listing</a>, or <a href="/submit/?type=pup">send your pup</a> for Pup of the Week. Run a dog-friendly business? <a href="/submit/?type=claim">Claim your listing</a> for free. You can also reply to any of our emails.</p>
  <h2 class="h2s">Your privacy</h2>
  <p>We only use your email to send the weekly guide, and you can unsubscribe in one click. We don't sell or share it. <a href="/privacy/">Privacy details</a>.</p>
</div></section>"""
    return shell("/about/", "About Lanier Leash", "Lanier Leash is a free, independent guide to dog-friendly events and places around Cumming, Lake Lanier and north metro Atlanta.", body)


def advertise():
    body = hero("Advertise", "Reach local dog owners every Thursday",
                "One sponsor per email, clearly labeled, in front of dog owners around Cumming and Lake Lanier who are planning their weekend.") + \
        """<section class="blk" style="padding-top:20px"><div class="wrap adgrid">
  <div class="prose">
    <h2 class="h2s">What you get</h2>
    <ul class="ticks">
      <li><b>The sponsor spot in the Thursday email.</b> Your name, one or two lines and a link, right after the weekend's events. Only one sponsor per issue.</li>
      <li><b>Readers who are making plans.</b> The email goes out Thursday morning, when people are deciding where to go this weekend with their dog.</li>
      <li><b>Local only.</b> Readers sign up with their ZIP code, and almost all of them live around Forsyth, Hall, Dawson, north Gwinnett and north Fulton.</li>
    </ul>
    <h2 class="h2s">Founding sponsors</h2>
    <p>We're new. The first local businesses to sponsor get their first three issues free, so you can see how it works before you pay anything. After that it's a simple flat price per issue, based on how many people get the email. Ask and we'll send current numbers, or <a href="/issue/">read this week's email</a> to see exactly what readers get.</p>
    <h2 class="h2s">The rules</h2>
    <p>Sponsors are always labeled "Sponsor." Sponsoring never changes a dog rule, a badge or whether a place is listed. Businesses that aren't dog-friendly can't sponsor. A free listing is open to every dog-friendly business: <a href="/submit/?type=claim">claim yours</a>.</p>
  </div>
  <aside class="joincard"><b>Interested?</b><p>Tell us a little about your business and what you'd like to promote. We'll reply within a few days.</p><a class="btn btn-coral" href="/submit/?type=sponsor">""" + ic("u-heart") + """Ask about sponsoring</a></aside>
</div></section>"""
    return shell("/advertise/", "Advertise with Lanier Leash", "Sponsor the Lanier Leash Thursday email and reach dog owners around Cumming and Lake Lanier. Founding sponsors get their first three issues free.", body)


PAGES = {"adopt": adopt, "vet-care": vetcare, "tips": tips, "pack": pack, "about": about, "advertise": advertise}

if __name__ == "__main__":
    for name, fn in PAGES.items():
        d = ROOT / name; d.mkdir(exist_ok=True)
        (d / "index.html").write_text(fn(), encoding="utf-8")
        print("built", "/" + name + "/")
    # Same footer everywhere.
    for f in ROOT.glob("*/index.html"):
        if f.parent.name in ("admin",) or f.parent.name in PAGES: continue
        s = f.read_text(encoding="utf-8")
        n = re.sub(r"<footer>.*?</footer>", lambda m: FOOTER, s, count=1, flags=re.S)
        if n != s: f.write_text(n, encoding="utf-8"); print("footer", f.parent.name)
    f = ROOT / "index.html"; s = f.read_text(encoding="utf-8")
    n = re.sub(r"<footer>.*?</footer>", lambda m: FOOTER, s, count=1, flags=re.S)
    if n != s: f.write_text(n, encoding="utf-8"); print("footer home")
