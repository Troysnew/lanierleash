"""Adds lat,lng columns to data/rescues.csv and data/vetcare.csv (and research CSVs with an address column).

    python tools/geocode_orgs.py data/rescues.csv data/vetcare.csv

Rows that already have coordinates are left alone. Uses the same geocoders as merge_places.py
(US Census first, then OpenStreetMap at one request a second)."""
import csv, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from merge_places import census, osm, miles


def locate(r):
    for t in ([lambda: census(r["address"]), lambda: osm(r["address"])] if r.get("address") else []) + [lambda: osm(f'{r["name"]}, {r.get("town", "")}, Georgia')]:
        hit = t()
        if hit and miles(*hit) < 60: return hit
    return None


for path in sys.argv[1:]:
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    cols = list(rows[0].keys()) if rows else []
    for c in ("lat", "lng"):
        if c not in cols: cols.append(c)
    n = 0
    for r in rows:
        if r.get("lat") and r.get("lng"): continue
        ll = locate(r)
        if ll: r["lat"], r["lng"] = f"{ll[0]:.5f}", f"{ll[1]:.5f}"; n += 1
        else: print("  no location:", r["name"])
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows({c: r.get(c, "") for c in cols} for r in rows)
    print(f"{path}: located {n}")
