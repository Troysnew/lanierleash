"""Adds researched phone numbers and opening hours to data/places.csv.

    python tools/merge_hours.py research.csv [more.csv ...]

Research CSV columns: id,phone,hours,hours_text,source_url,notes
- Fills phone, hours and hours_text only where places.csv is blank (never overwrites what's there).
- "hours" must be in the short format the site reads (Mo-Th 11:00-21:00; Fr-Sa 11:00-22:00); anything else is skipped.
- Rows whose notes say CLOSED are listed for you to check by hand; nothing is deleted.
Then in /admin/ -> Places, click "Import places" to copy the new phones and hours into the live directory.
"""
import csv, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV = ROOT / "data/places.csv"
DAY = r"(Mo|Tu|We|Th|Fr|Sa|Su)"
RULE = re.compile(rf"^{DAY}(-{DAY})?(,{DAY}(-{DAY})?)*\s+(off|closed|\d{{1,2}}:\d{{2}}-\d{{1,2}}:\d{{2}}(,\d{{1,2}}:\d{{2}}-\d{{1,2}}:\d{{2}})*)$")


def ok_hours(h):
    h = h.strip()
    return h == "24/7" or (bool(h) and all(RULE.match(x.strip()) for x in h.split(";") if x.strip()))


def phone(p):
    d = re.sub(r"\D", "", p or "")
    if len(d) == 11 and d[0] == "1": d = d[1:]
    return f"({d[:3]}) {d[3:6]}-{d[6:]}" if len(d) == 10 else ""


rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
cols = list(rows[0].keys())
for c in ("phone", "hours", "hours_text"):
    if c not in cols: cols.insert(cols.index("notes"), c)
by = {r["id"]: r for r in rows}
stats = {"phone": 0, "hours": 0, "hours_text": 0}
bad, closed, unknown = [], [], []
for path in sys.argv[1:]:
    for x in csv.DictReader(open(path, encoding="utf-8")):
        r = by.get((x.get("id") or "").strip())
        if not r: unknown.append(x.get("id")); continue
        if re.search(r"\bCLOSED\b",x.get("notes") or ""): closed.append((r["name"], x.get("notes"), x.get("source_url")))
        p = phone(x.get("phone"))
        if p and not r.get("phone"): r["phone"] = p; stats["phone"] += 1
        h = (x.get("hours") or "").strip()
        if h:
            if ok_hours(h):
                if not r.get("hours"): r["hours"] = h; stats["hours"] += 1
            else: bad.append((r["name"], h))
        t = (x.get("hours_text") or "").strip()
        if t and not r.get("hours_text"): r["hours_text"] = t[:300]; stats["hours_text"] += 1
with open(CSV, "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows({c: r.get(c, "") for c in cols} for r in rows)
print("filled:", stats)
for n, h in bad: print(f"  skipped hours for {n}: {h!r}")
for n, why, src in closed: print(f"  CHECK, may be closed: {n} ({why}) {src or ''}")
for i in unknown: print(f"  unknown id: {i}")
