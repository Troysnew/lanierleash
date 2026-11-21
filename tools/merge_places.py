"""Adds researched places to data/places.csv.

    python tools/merge_places.py new_places.csv [more.csv ...] [--recat recategorize.csv]

- Skips ids or names already in places.csv.
- Finds coordinates (US Census, then OpenStreetMap) and drops anything more than 35 miles from Cumming.
- --recat applies "id,category" changes to existing rows.
Then in /admin/ → Places, click "Import places" to add the new rows to the live directory.
"""
import csv, json, math, pathlib, re, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV = ROOT / "data/places.csv"
HOME = (34.2037, -84.1031)
MAX_MI = 35
CATS = {"restaurant", "brewery", "winery", "coffee", "trail", "park", "dogpark", "lake", "shop", "stay"}
BADGES = {"venue", "official", "readers", "unconfirmed", "nodogs"}
UA = {"User-Agent": "site-builder/1.0 (place geocoder)"}
COLS = ["id", "name", "category", "town", "address", "lat", "lng", "dog_rule", "status", "source_url", "source_name", "website", "phone", "hours", "hours_text", "notes", "checked"]


def miles(lat, lng):
    r = math.pi / 180
    a = math.sin((lat - HOME[0]) * r / 2) ** 2 + math.cos(HOME[0] * r) * math.cos(lat * r) * math.sin((lng - HOME[1]) * r / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(a))


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def census(addr):
    try:
        m = get("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" + urllib.parse.urlencode({"address": addr, "benchmark": "Public_AR_Current", "format": "json"}))["result"]["addressMatches"]
        return (m[0]["coordinates"]["y"], m[0]["coordinates"]["x"]) if m else None
    except Exception:
        return None


def osm(q):
    try:
        time.sleep(1.1)  # OpenStreetMap asks for at most one request a second
        j = get("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "countrycodes": "us"}))
        return (float(j[0]["lat"]), float(j[0]["lon"])) if j else None
    except Exception:
        return None


def locate(p):
    tries = []
    if p.get("address"): tries += [lambda: census(p["address"]), lambda: osm(p["address"])]
    tries.append(lambda: osm(f'{p["name"]}, {p.get("town", "")}, Georgia'))
    for t in tries:
        hit = t()
        if hit and miles(*hit) < 45: return hit
    return None


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", str(t).lower().replace("&", "and").replace("'", "")).strip("-")


def main(args):
    recat = None
    if "--recat" in args:
        i = args.index("--recat"); recat = args[i + 1]; args = args[:i] + args[i + 2:]
    rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
    ids = {r["id"] for r in rows}; names = {slug(r["name"]) + "|" + slug(r["town"]) for r in rows}
    today = time.strftime("%Y-%m-%d")
    if recat:
        m = {r["id"]: r["category"] for r in csv.DictReader(open(recat, encoding="utf-8"))}
        n = 0
        for r in rows:
            if r["id"] in m and m[r["id"]] in CATS and r["category"] != m[r["id"]]: r["category"] = m[r["id"]]; n += 1
        print(f"recategorized {n}")
    added, skipped = 0, []
    for f in args:
        for p in csv.DictReader(open(f, encoding="utf-8")):
            p = {k: (v or "").strip() for k, v in p.items() if k}
            p["id"] = slug(p.get("id") or p["name"])
            key = slug(p["name"]) + "|" + slug(p.get("town", ""))
            if not p.get("name") or p["category"] not in CATS or not p.get("dog_rule"): skipped.append((p.get("name"), "missing fields")); continue
            if p["id"] in ids or key in names: skipped.append((p["name"], "already listed")); continue
            if p.get("status") not in BADGES: p["status"] = "unconfirmed"
            try: ll = (float(p["lat"]), float(p["lng"]))
            except (KeyError, ValueError): ll = locate(p)
            if not ll: skipped.append((p["name"], "couldn't find on the map")); continue
            d = miles(*ll)
            if d > MAX_MI: skipped.append((p["name"], f"{d:.0f} mi away")); continue
            p["lat"], p["lng"] = f"{ll[0]:.5f}", f"{ll[1]:.5f}"
            p["checked"] = p.get("checked") or today
            rows.append({c: p.get(c, "") for c in COLS}); ids.add(p["id"]); names.add(key); added += 1
            print(f"+ {p['name']} ({p['category']}, {p.get('town')}, {d:.1f} mi)")
    rows.sort(key=lambda r: r["name"].lower())
    with open(CSV, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLS); w.writeheader(); w.writerows({c: r.get(c, "") for c in COLS} for r in rows)
    print(f"\nadded {added}, now {len(rows)} places")
    for n, why in skipped: print(f"  skipped {n}: {why}")


if __name__ == "__main__":
    main(sys.argv[1:])
