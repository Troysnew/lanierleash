"""The site's top menu, in one place. build_pages.py uses it, tools/nav.py --apply rewrites the hand-made
pages, and api/_lib/page.js has a JS copy (keep them in step)."""
import pathlib, re, sys

CHEV = '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
SERVICES = [("/vet-care/", "Vet care", "Low-cost clinics and emergency vets", "vet-care"),
            ("/services/", "Groomers &amp; trainers", "Grooming, training, walkers and sitters", "services"),
            ("/adopt/", "Adopt or foster", "Shelters and rescues near the lake", "adopt-and-rescues")]
COMMUNITY = [("/pack/", "The pack", "Local pups sent in by their people", "the-pack-community"),
             ("/dog-of-the-month/", "Dog of the Month", "Vote for your favorite pup", "lanier-leash-emblem"),
             ("/critter-of-the-month/", "Critter of the Month", "Cats, birds, reptiles and more", "the-pack-community"),
             ("/#conditions", "Walk conditions", "Weekend forecast and pavement check", "conditions-sun-good-walk-day"),
             ("/tips/", "Owner tips", "Ticks, heat, lake safety and more", "tips"),
             ("/issue/", "This week's email", "Read the latest Thursday email", "newsletter")]
SECTION = {"events": "events", "places": "places", "vet-care": "services", "services": "services", "adopt": "services", "dog-services": "services",
           "lost-found": "lost", "pack": "community", "tips": "community", "dog-of-the-month": "community", "critter-of-the-month": "community", "issue": "community"}


def section_of(path):
    first = path.strip("/").split("/")[0]
    return SECTION.get(first, "")


def _item(href, label, sub, icon):
    return f'<a href="{href}"><img src="/img/icons/{icon}-96.webp" alt="" width="34" height="34"><span><b>{label}</b><small>{sub}</small></span></a>'


def links(cur="", home=False):
    c = lambda k: ' aria-current="true"' if cur == k else ""
    s = lambda k: f' data-s="{k}"' if home else ""
    lens = '<span class="lens" id="lens" aria-hidden="true"></span>' if home else ""
    return (f'<div class="links" id="links">{lens}<a href="/events/"{c("events")}{s("weekend")}>Events</a><a href="/places/"{c("places")}{s("places")}>Places</a>'
            f'<div class="dd"><a class="ddt" href="/dog-services/"{c("services")}>Services{CHEV}</a><div class="ddm">{"".join(_item(*x) for x in SERVICES)}'
            f'<a class="ddall" href="/dog-services/">All dog services →</a></div></div>'
            f'<a class="lfl" href="/lost-found/"{c("lost")}>Lost &amp; found</a>'
            f'<div class="dd"><a class="ddt" href="/pack/"{c("community")}{s("community")}>Community{CHEV}</a><div class="ddm">{"".join(_item(*x) for x in COMMUNITY)}</div></div></div>')


def mnav(join_href="/#top"):
    a = lambda href, label: f'<a href="{href}">{label}</a>'
    return ('<nav class="mnav glass" id="mnav" hidden aria-label="Mobile">' + a("/events/", "Events") + a("/places/", "Places") +
            '<a class="lfl" href="/lost-found/">Lost &amp; found</a>' +
            '<p class="mh">Services</p>' + "".join(a(h, l) for h, l, _, _ in SERVICES) +
            '<p class="mh">Community</p>' + "".join(a(h, l) for h, l, _, _ in COMMUNITY) +
            f'<a class="btn btn-coral" href="{join_href}">Join free</a></nav>')


LINKS_RE = re.compile(r'<div class="links"[^>]*>.*?</div>(?=\s*\n\s*<a class="btn)', re.S)
MNAV_RE = re.compile(r'<nav class="mnav glass" id="mnav" hidden aria-label="Mobile">.*?</nav>', re.S)


def apply(root):
    """Rewrite the menu in every hand-made page."""
    root = pathlib.Path(root)
    files = [root / "index.html"] + sorted(root.glob("*/index.html"))
    for f in files:
        if f.parent.name == "admin": continue
        s = f.read_text(encoding="utf-8")
        home = f == root / "index.html"
        cur = "" if home else section_of("/" + f.parent.name + "/")
        n = LINKS_RE.sub(lambda m: links(cur, home), s, count=1)
        n = MNAV_RE.sub(lambda m: mnav("#top" if home else "/#top"), n, count=1)
        if n != s: f.write_text(n, encoding="utf-8"); print("nav", f.parent.name if not home else "home")


if __name__ == "__main__" and "--apply" in sys.argv:
    apply(pathlib.Path(__file__).resolve().parent.parent)
