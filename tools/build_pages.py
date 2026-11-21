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
    <div><h4>Explore</h4><ul><li><a href="/events/">Events</a></li><li><a href="/places/">Places</a></li><li><a href="/pack/">The pack</a></li><li><a href="/dog-of-the-month/">Dog of the Month</a></li><li><a href="/lost-found/">Lost &amp; found</a></li><li><a href="/issue/">This week's email</a></li></ul></div>
    <div><h4>Help</h4><ul><li><a href="/adopt/">Adopt or foster</a></li><li><a href="/vet-care/">Low-cost vet care</a></li><li><a href="/services/">Groomers &amp; trainers</a></li><li><a href="/tips/">Owner tips</a></li><li><a href="/places/#how-we-check">How we check</a></li></ul></div>
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
  <nav class="mnav glass" id="mnav" hidden aria-label="Mobile"><a href="/events/">Events</a><a href="/places/">Places</a><a href="/#conditions">Conditions</a><a href="/pack/">Community</a><a href="/lost-found/">Lost &amp; found</a><a class="btn btn-coral" href="/#top">Join free</a></nav>
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


def org_id(r):
    return "vet-" + re.sub(r"[^a-z0-9]+", "-", r["name"].lower().replace("&", "and")).strip("-")[:80]


def org_card(r, extra="", fb=False):
    bits = []
    if r.get("address"): bits.append(f'<p class="addr">{ic("u-pin")}<a href="https://www.google.com/maps/search/?api=1&amp;query={esc(r["name"] + ", " + r["address"])}" target="_blank" rel="noopener">{esc(r["address"])}</a></p>')
    if r.get("phone"): bits.append(f'<p class="addr">{ic("u-phone")}{tel(r["phone"])}</p>')
    links = []
    if r.get("website"): links.append(f'<a class="lnk" href="{esc(r["website"])}" target="_blank" rel="noopener">{ic("u-arrow")}Website</a>')
    if r.get("events_url"): links.append(f'<a class="lnk" href="{esc(r["events_url"])}" target="_blank" rel="noopener">{ic("i-cal")}Adoption events</a>')
    if fb and r.get("address"): links.append(f'<a class="lnk" href="https://www.google.com/maps/search/?api=1&amp;query={esc(r["name"] + ", " + r["address"])}" target="_blank" rel="noopener">{ic("u-arrow")}Google reviews</a>')
    if r.get("source_url") and r.get("source_url") != r.get("website"): links.append(f'<a class="lnk" href="{esc(r["source_url"])}" target="_blank" rel="noopener">{ic("u-check")}Source</a>')
    name = f'<a href="{esc(r["website"])}" target="_blank" rel="noopener">{esc(r["name"])}</a>' if r.get("website") else esc(r["name"])
    tags = " ".join(x for x, on in (("adopt", r.get("adopt") == "yes"), ("foster", r.get("foster") == "yes")) if on)
    ll = f' data-lat="{r["lat"]}" data-lng="{r["lng"]}"' if r.get("lat") and r.get("lng") else ""
    town = "By phone, 24/7" if r.get("kind") == "poison line" else esc(r.get("town")) if ll else "Statewide" if r.get("town") == "Statewide" else (esc(r.get("town")) + " · serves the whole area" if r.get("town") else "Serves the whole area")
    fbattr = f' data-fb="{org_id(r)}"' if fb else ""
    return (f'<article class="org" data-tags="{tags}"{ll}{fbattr}><div class="top"><h3>{name}</h3><span class="town">{town}<b class="dist"></b></span></div>'
            f'{extra}{"<p>" + esc(r["notes"]) + "</p>" if r.get("notes") else ""}{"".join(bits)}{'<div class="ofb" hidden></div>' if fb else ""}<div class="acts">{"".join(links)}</div></article>')


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


def partner_js(cats, max_n=2):
    return f'''<script src="/assets/partners.js"></script>
<script>(function(){{var el=document.getElementById("partners");function go(){{window.LLPartners&&window.LLPartners.render(el,{json.dumps(cats)},{{max:{max_n}}}).then(function(n){{var e=document.getElementById("ptEmpty");if(e)e.hidden=n>0;}});}}go();document.addEventListener("ll:home",go);}})();</script>'''
PARTNER_JS = True


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
        return org_card(dict(r, phone="") if call else r, dl + call, fb=r["kind"] != "poison line")
    er = [r for r in rows if r["kind"] == "24/7 emergency"]
    ah = [r for r in rows if r["kind"].startswith("after-hours")]
    po = [r for r in rows if r["kind"] == "poison line"]
    return (f'<section class="blk rblk erblk" id="emergency"><div class="wrap"><div class="sh"><div><span class="eyebrow">Emergency</span><h2>If it can&rsquo;t wait</h2></div>'
            f'<p>Call ahead if you can so they&rsquo;re ready for you. Nearest first, from your ZIP.</p></div>'
            f'<h3 class="h3s">Open 24/7</h3><div class="orgs">{"".join(card(r) for r in er)}</div>'
            f'<h3 class="h3s">After hours and urgent care</h3><p class="fine">Evenings, weekends and holidays. Urgent care clinics send life-threatening cases to a 24/7 hospital.</p><div class="orgs">{"".join(card(r) for r in ah)}</div>'
            f'<h3 class="h3s">Pet poison lines</h3><p class="fine">Open 24/7, with a consultation fee. Have the package or plant name ready.</p><div class="orgs">{"".join(card(r) for r in po)}</div>'
            f'</div></section>')


# Clinics people visit get thumbs + preset tags; pantries and bill-help programs don't.
FB_KINDS = {"low-cost vet", "spay/neuter clinic", "vaccine clinic"}


def vet_ids():
    """Every vet card with feedback, so /api/feedback accepts only these ids."""
    ids = [org_id(r) for r in csv.DictReader(open(ROOT / "data/vetcare.csv", encoding="utf-8")) if r["kind"] in FB_KINDS]
    ids += [org_id(r) for r in csv.DictReader(open(ROOT / "data/emergency_vets.csv", encoding="utf-8")) if r["kind"] != "poison line"]
    return sorted(set(ids))


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
        out.append(f'<section class="blk rblk"><div class="wrap"><div class="sh"><div><h2>{title}</h2></div></div><div class="orgs">{"".join(org_card(r, extra(r), fb=k in FB_KINDS) for r in g)}</div></div></section>')
    body = hero("Low-cost vet care", "Affordable vet care near Lake Lanier",
                "Nonprofit clinics, low-cost spay and neuter, vaccine clinics, pet food pantries and help with vet bills around Cumming, Gainesville and north metro Atlanta. <a href='#emergency'>Emergency vets</a> are first.") + emergency_section() + '<section class="blk ptsec"><div class="wrap"><div class="ptwrap" id="partners" hidden></div></div></section>' + "".join(out) + \
        f'<section class="blk"><div class="wrap"><p class="note">Checked {CHECKED}. Prices are from each clinic\'s own price list and change often, so confirm when you book. For an emergency, call your vet or one of the <a href="#emergency">emergency hospitals above</a> right away.</p></div></section>'
    return shell("/vet-care/", "Low-cost vet care, spay and neuter near Cumming, GA · Lanier Leash",
                 "Affordable vet clinics, low-cost spay and neuter, vaccine clinics, pet food pantries and vet bill help near Cumming, Gainesville and north metro Atlanta.", body, DIST_JS + partner_js(["vet"]) + '<script src="/assets/orgfeedback.js" defer></script>')


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
    # Riley is always in the pack; the hero links Dog of the Month.
    body = '<section class="page-hero"><div class="wrap"><span class="eyebrow">The pack</span><h1>Meet the Lake Lanier pack</h1><p class="lede">Local pups sent in by their people. Every week one becomes Pup of the Week on the homepage and in the email, and every month readers vote for <a href="/dog-of-the-month/">Dog of the Month</a>. <a href="/submit/?type=pup">Add your pup</a>.</p></div></section><section class="blk" style="padding-top:20px"><div class="wrap">\n  <div class="bday" id="bday" hidden></div>\n  <div class="packgrid" id="pack"><p class="loading">Loading the pack…</p></div>\n  <div class="joincard" style="margin-top:30px;max-width:560px"><b>Add your pup to the pack</b><p>Send a photo, a name and one line about them. Add a birthday and we\'ll give them a shout-out that week.</p><a class="btn btn-coral" href="/submit/?type=pup"><svg class="ic" aria-hidden="true"><use href="#u-camera"/></svg>Send your pup</a></div>\n</div></section>'
    script = '<script>\n(function () {\n  var esc = window.LL.esc;\n  fetch("/api/pack").then(function (r) { return r.json(); }).then(function (d) {\n    var g = document.getElementById("pack");\n    if (d.birthdays && d.birthdays.length) {\n      var b = document.getElementById("bday"); b.hidden = false;\n      b.innerHTML = "<b>🎂 Pack birthdays this week</b> " + d.birthdays.map(function (x) { return esc(x.name) + (x.town ? " of " + esc(x.town) : "") + " <small>(" + esc(x.day) + ")</small>"; }).join(" · ");\n    }\n    // Riley (our co-founder) is always in the pack, so it\'s never empty.\n    var riley = { name: "Riley", town: "Cumming", owner: "Troy", photo: "/img/hero.jpg", story: "Co-founder. Works for pizza crust.", founder: true };\n    var pups = (d.pups || []).concat([riley]);\n    g.innerHTML = pups.map(function (p) {\n      return \'<figure class="pup">\' + \'<img src="\' + esc(p.photo) + \'" alt="\' + esc(p.name) + (p.town ? \' from \' + esc(p.town) : \'\') + \'" loading="lazy">\' +\n        (p.featured ? \'<span class="pow">★ Pup of the Week</span>\' : p.founder ? \'<span class="pow">Co-founder</span>\' : \'\') +\n        \'<figcaption><b>\' + esc(p.name) + (p.age ? \', \' + esc(p.age) : \'\') + \'</b><span>\' + esc([p.town, p.owner ? \'with \' + p.owner : \'\'].filter(Boolean).join(\' · \')) + \'</span>\' + (p.story ? \'<em>\' + esc(p.story) + \'</em>\' : \'\') + \'</figcaption></figure>\';\n    }).join("") + (pups.length === 1 ? \'<a class="pup pupnext" href="/submit/?type=pup"><b>Your pup next?</b><span>Riley is lonely. Send a photo and a line about your dog.</span></a>\' : \'\');\n  }).catch(function () { document.getElementById("pack").innerHTML = \'<p class="empty">We couldn’t load the pack right now. Try again in a minute.</p>\'; });\n})();\n</script>'
    return shell("/pack/", "The pack: local dogs of Lake Lanier · Lanier Leash", "Photos of local pups from around Cumming and Lake Lanier, sent in by their people. Add yours.", body, script)


def about():
    body = hero("About", "A local guide for dog people",
                "Lanier Leash is a free guide to dog-friendly events and places around Cumming, Lake Lanier and north metro Atlanta. It's run by one guy and one very good boy.") + \
        """<section class="blk" style="padding-top:20px"><div class="wrap narrow">
  <div class="meet">
    <figure class="meetpic"><img src="/img/hero.jpg" alt="Riley, a golden retriever in a teal bandana, smiling in Lake Lanier" width="600" height="600"><figcaption><b>Riley</b> · Co-founder. Has never read a single dog rule.</figcaption></figure>
    <div class="prose">
      <span class="eyebrow">Meet the pack</span>
      <h2 class="h2s">Hi, I'm Troy. That's Riley.</h2>
      <p>I live in Cumming with my golden retriever, Riley. If he looks familiar, it's because he's the guy smiling on our home page. Yes, that's really him, and no, he has not stopped bringing it up.</p>
      <p>Riley handles field testing: patios, trails, lake parks and any place that might drop a pizza crust. I handle the boring part, like reading the actual dog rules, checking the dates and writing the Thursday email.</p>
      <p>Between the two of us, we just want it to be easy to find where your dog is welcome around the lake. If we got something wrong, or you know a spot we'd love, <a href="/submit/">tell us</a>. Riley takes recommendations very seriously.</p>
      <ul class="riley">
        <li><b>Job title:</b> Co-founder (unpaid, works for pizza crust)</li>
        <li><b>Specialties:</b> shaking off right next to you, befriending strangers, carrying sticks too big for the trail</li>
        <li><b>Rating system:</b> tail wags. Everything so far has been a 10.</li>
      </ul>
    </div>
  </div>
</div></section>
<section class="blk"><div class="wrap narrow prose">
  <h2 class="h2s">What we do</h2>
  <p>Every Thursday morning we send a short email with the weekend's dog-friendly events near your ZIP, a walk check with the forecast and a pavement estimate, and a place worth trying. The website has the full events calendar and a directory of restaurants, breweries, trails, parks, lake access, pet stores and hotels that welcome dogs, plus groomers, trainers, vet care, adoption and a lost &amp; found board.</p>
  <h2 class="h2s">How we check</h2>
  <p>Dog rules change, and a lot of "dog-friendly" lists online are out of date. So every place shows its dog rule, where that rule came from, and the date we last checked. "Official rule" means the place or the agency that runs it posts the rule. "Venue confirmed" means they told us directly. "Unconfirmed" means we only found it on a third-party site, so call ahead. <a href="/places/#how-we-check">More on the badges</a>.</p>
  <h2 class="h2s">Independent</h2>
  <p>We aren't affiliated with any venue, county or agency. Sponsors are always labeled, and they never change a dog rule or a badge. <a href="/advertise/">How sponsorship works</a>.</p>
  <h2 class="h2s">Help us keep it right</h2>
  <p>Readers make this better. <a href="/submit/?type=event">Send an event</a>, <a href="/submit/?type=place">suggest a place</a>, <a href="/submit/?type=fix">fix a listing</a>, or <a href="/submit/?type=pup">send your pup</a> for Pup of the Week. Own a dog-friendly business? <a href="/submit/?type=claim">Claim your listing</a> for free. You can also reply to any of our emails.</p>
  <h2 class="h2s">Your privacy</h2>
  <p>We use your email to send the Thursday email and anything you've asked us for, and you can unsubscribe in one click. We don't sell it or share it with sponsors. <a href="/privacy/">Privacy details</a>.</p>
</div></section>"""
    return shell("/about/", "About Lanier Leash: meet Troy and Riley", "Lanier Leash is a free, independent guide to dog-friendly events and places around Cumming and Lake Lanier, run by Troy and his golden retriever, Riley.", body)


def services():
    path = ROOT / "data/services.csv"
    rows = list(csv.DictReader(open(path, encoding="utf-8"))) if path.exists() else []
    groups = [("groomer", "Groomers", "groomers"), ("trainer", "Trainers", "trainers"), ("daycare", "Daycare and boarding", "daycare")]
    out, nav = [], []
    for k, title, anchor in groups:
        g = sorted([r for r in rows if r["kind"] == k], key=lambda r: r["name"].lower())
        if not g: continue
        nav.append(f'<a class="chip" href="#{anchor}">{title} <b>{len(g)}</b></a>')
        def extra(r):
            return f'<dl class="facts"><dt>Services</dt><dd>{esc(r["services"])}</dd></dl>' if r.get("services") else ""
        def card(r):
            if not r.get("address"):
                lbl = "Mobile" if r["kind"] == "groomer" else "Comes to you"
                r = dict(r, town=f"{lbl}, based in {r['town']}" if r.get("town") else lbl)
            html = org_card(r, extra(r))
            return html.replace(" · serves the whole area", "")
        out.append(f'<section class="blk rblk" id="{anchor}"><div class="wrap"><div class="sh"><div><h2>{title}</h2></div></div><div class="orgs">{"".join(card(r) for r in g)}</div></div></section>')
    empty = "" if rows else """<div class="empty" id="ptEmpty" style="text-align:left;max-width:680px">We're building this page now. Know a great groomer, trainer or daycare near the lake? <a href="/submit/?type=place&amp;category=other">Tell us about them</a>.</div>"""
    navbar = f'<nav class="chips svcnav" aria-label="Jump to">{"".join(nav)}</nav>' if nav else ""
    body = hero("Dog services", "Groomers, trainers and daycare near Lake Lanier",
                "Local businesses that look after dogs around Cumming, Gainesville and north metro Atlanta, nearest to you first. Looking for a vet? See <a href='/vet-care/'>vet care</a>, with <a href='/vet-care/#emergency'>emergency vets</a> first.") + \
        f"""<section class="blk" style="padding-top:20px"><div class="wrap">
  {navbar}
  <div class="ptwrap" id="partners" hidden></div>
  {empty}
</div></section>""" + "".join(out) + \
        """<section class="blk"><div class="wrap">
  <p class="note">Free listings, checked """ + CHECKED + """ from each business's own website. We don't rank or review them, and no one pays to be on this list. Featured partners are labeled Sponsored. Something wrong, or a business we missed? <a href="/submit/?type=place&amp;category=other">Tell us</a>.</p>
  <div class="lfhelp" style="margin-top:30px">
    <div><h2 class="h2s">Choosing a groomer or daycare</h2><ul class="ticks">
      <li>Ask to see where dogs wait and play. Clean, cool and supervised is what you want.</li>
      <li>Ask which vaccines they require. Good places ask for rabies, DHPP and Bordetella.</li>
      <li>For daycare, ask about a trial day and how they group dogs by size and energy.</li>
    </ul></div>
    <div><h2 class="h2s">Choosing a trainer</h2><ul class="ticks">
      <li>Look for reward-based methods. Ask how they handle a dog who gets it wrong.</li>
      <li>Certifications like CPDT-KA mean they passed an independent exam.</li>
      <li>Watch a class first if you can. Dogs and people should both look relaxed.</li>
    </ul></div>
  </div>
  <div class="joincard" style="margin-top:30px;max-width:560px"><b>Run a dog business near the lake?</b><p>Featured partners get their own page here and a mention in the first Thursday email each month.</p><a class="btn btn-coral" href="/advertise/#partners">""" + ic("u-heart") + """Become a partner</a></div>
</div></section>"""
    return shell("/services/", "Dog groomers, trainers and daycare near Cumming, GA · Lanier Leash",
                 "Dog groomers, mobile groomers, trainers, daycare and boarding near Cumming, Lake Lanier and north metro Atlanta, with addresses, phones and services.", body, DIST_JS + partner_js(["groomer", "trainer", "daycare", "other"], 6))


def advertise():
    body = hero("Advertise", "Reach local dog owners every Thursday",
                "One sponsor per email, clearly labeled, in front of dog owners around Cumming and Lake Lanier who are planning their weekend.") + \
        """<section class="blk" style="padding-top:20px"><div class="wrap adgrid">
  <div class="prose">
    <h2 class="h2s">What you get</h2>
    <ul class="ticks">
      <li><b>The sponsor spot in the Thursday email.</b> Your name, one or two lines and a link, right after the weekend's events. Only one sponsor per issue.</li>
      <li><b>Readers who are making plans.</b> The email goes out Thursday morning, when people are deciding where to go this weekend with their dog.</li>
      <li><b>Local only.</b> Readers sign up with their ZIP code, and the email only covers events around Forsyth, Hall, Dawson, north Gwinnett and north Fulton.</li>
    </ul>
    <h2 class="h2s">Founding sponsors</h2>
    <p>We're new. The first local businesses to sponsor get their first three issues free, so you can see how it works before you pay anything. <a href="/issue/">Read this week's email</a> to see exactly what readers get.</p>
    <h2 class="h2s">Pricing</h2>
    <p>A flat price per Thursday email, set by how many people get it. The price goes up only when the list grows into the next tier, and we tell you before it does. Ask and we'll send this week's numbers.</p>
    <div class="tablewrap"><table class="pricetbl">
      <thead><tr><th>People on the list</th><th>One email</th><th>A month (4 emails)</th></tr></thead>
      <tbody>
        <tr><td>Under 1,000</td><td><b>$40</b></td><td><b>$140</b> <small>save $20</small></td></tr>
        <tr><td>1,000 to 2,500</td><td><b>$75</b></td><td><b>$260</b> <small>save $40</small></td></tr>
        <tr><td>2,501 to 5,000</td><td><b>$125</b></td><td><b>$440</b> <small>save $60</small></td></tr>
        <tr><td>Over 5,000</td><td colspan="2">$25 for every 1,000 people on the list</td></tr>
      </tbody>
    </table></div>
    <p class="fine">Just want to promote one dog event? Ask and we'll quote it. Rescues and shelters never pay to list adoption events.</p>
    <h2 class="h2s" id="partners">Featured partner listings</h2>
    <p>For vets, groomers, trainers, daycares, pet stores and dog-friendly restaurants, breweries and stays.</p>
    <ul class="ticks">
      <li><b>Your own page on Lanier Leash.</b> Photos, services, hours, call and booking buttons, and an offer just for our readers.</li>
      <li><b>A labeled card at the top of the right page.</b> Vet care for vets, dog services for groomers, trainers and daycares, and your category in places for everyone else.</li>
      <li><b>A mention in the first Thursday email of every month.</b></li>
      <li><b>A monthly report.</b> How many people saw your page and tapped call, directions, booking or your offer.</li>
      <li><b>Two partners per category at most</b>, so your spot stays worth having.</li>
    </ul>
    <p><b>$79 a month</b>, or <b>$790 a year</b> (two months free). Founding partners get their first month free. Cancel anytime; your page comes down at the end of the month you've paid for. We send a simple invoice or payment link.</p>
    <p><a class="btn btn-coral btn-sm" href="/submit/?type=sponsor&amp;interest=partner">""" + ic("u-heart") + """Ask about a partner listing</a></p>
    <h2 class="h2s">The rules</h2>
    <p>Sponsors and partners are always labeled "Sponsored." Paying never changes a dog rule, a badge, reader reports or whether a place is listed, and the emergency vet list is never sponsored or reordered. Vets must be licensed. Businesses that aren't dog-friendly can't sponsor. A free listing is open to every dog-friendly business: <a href="/submit/?type=claim">claim yours</a>.</p>
  </div>
  <aside class="joincard"><b>Interested?</b><p>Tell us a little about your business and what you'd like to promote. We'll reply within a few days.</p><a class="btn btn-coral" href="/submit/?type=sponsor">""" + ic("u-heart") + """Ask about sponsoring</a><p style="margin:12px 0 0;font-size:14px"><a href="/media-kit.pdf" target="_blank" rel="noopener">""" + ic("u-print") + """Download the media kit (PDF, 4 pages)</a></p></aside>
</div></section>"""
    return shell("/advertise/", "Advertise with Lanier Leash", "Sponsor the Lanier Leash Thursday email and reach dog owners around Cumming and Lake Lanier. Founding sponsors get their first three issues free.", body)


PAGES = {"adopt": adopt, "vet-care": vetcare, "tips": tips, "pack": pack, "about": about, "advertise": advertise, "services": services}

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
    (ROOT / "data/vet-ids.json").write_text(json.dumps(vet_ids()), encoding="utf-8")
    print("vet ids", len(vet_ids()))
    f = ROOT / "index.html"; s = f.read_text(encoding="utf-8")
    n = re.sub(r"<footer>.*?</footer>", lambda m: FOOTER, s, count=1, flags=re.S)
    if n != s: f.write_text(n, encoding="utf-8"); print("footer home")
