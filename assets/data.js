/* Lanier Leash shared data layer.
   Listings live in /data/events.csv and /data/places.csv (open them in Excel or Google Sheets).
   This file loads them, works out distances from the visitor's ZIP, and formats dates, badges and calendar files. */
(function () {
  var TZ = "America/New_York";
  var DEFAULT_HOME = { zip: "30041", lat: 34.2037, lng: -84.1031, town: "Cumming" };

  // ---------- small helpers ----------
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ic(id, cls) { return '<svg class="ic' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function slug(t) { return String(t).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  // RFC 4180-ish CSV parser (quoted fields, commas and newlines inside quotes, "" escapes).
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, "");
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); f = ""; if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row); row = [];
      } else f += c;
    }
    row.push(f); if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row);
    var head = (rows.shift() || []).map(function (h) { return h.trim(); });
    return rows.map(function (r) { var o = {}; head.forEach(function (h, k) { o[h] = (r[k] || "").trim(); }); return o; });
  }

  // ---------- home location ----------
  var home = store("ll-home") || DEFAULT_HOME;
  function setZip(zip) {
    if (!/^\d{5}$/.test(zip)) return Promise.reject(new Error("bad zip"));
    if (zip === home.zip) return Promise.resolve(home);
    return fetch("https://api.zippopotam.us/us/" + zip).then(function (r) { if (!r.ok) throw new Error("unknown zip"); return r.json(); })
      .then(function (d) {
        var p = d.places && d.places[0]; if (!p) throw new Error("unknown zip");
        home = { zip: zip, lat: +p.latitude, lng: +p.longitude, town: p["place name"] };
        store("ll-home", home); return home;
      });
  }
  function miles(lat, lng) {
    if (lat === "" || lng === "" || lat == null || lng == null || isNaN(+lat) || isNaN(+lng)) return null;
    var R = 3958.8, toR = Math.PI / 180;
    var dLat = (lat - home.lat) * toR, dLng = (lng - home.lng) * toR;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(home.lat * toR) * Math.cos(lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function fmtMi(m) { return m == null ? "" : m < 1 ? "<1 mi" : Math.round(m) + " mi"; }

  // radius shared across pages
  var radius = +(store("ll3-r") || 15) || 15;
  function setRadius(r) { radius = r; store("ll3-r", r); }

  // ---------- dates (all in Lake Lanier local time) ----------
  function todayISO() {
    try {
      var p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    } catch (e) {}
    var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dt(iso) { var p = iso.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function addDays(iso, n) { var d = dt(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dow(iso) { return dt(iso).getUTCDay(); }
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDay(iso) { return DOW[dow(iso)] + " " + MON[+iso.slice(5, 7) - 1] + " " + +iso.slice(8, 10); }
  function fmtLong(iso) { return DOWL[dow(iso)] + ", " + MON[+iso.slice(5, 7) - 1] + " " + +iso.slice(8, 10); }
  function fmtShort(iso) { return MON[+iso.slice(5, 7) - 1] + " " + +iso.slice(8, 10); }
  function fmtChecked(iso) { return iso ? "Checked " + MON[+iso.slice(5, 7) - 1] + " " + +iso.slice(8, 10) + ", " + iso.slice(0, 4) : "Not checked yet"; }
  function fmtTime(t) {
    if (!t) return ""; var h = +t.slice(0, 2), m = t.slice(3, 5);
    return (h % 12 || 12) + (m && m !== "00" ? ":" + m : "") + " " + (h < 12 ? "AM" : "PM");
  }
  function timeRange(e) {
    if (!e.start_time) return "Time TBA";
    if (!e.end_time) return fmtTime(e.start_time);
    var a = fmtTime(e.start_time), b = fmtTime(e.end_time);
    if (a.slice(-2) === b.slice(-2)) a = a.slice(0, -3);
    return a + "–" + b;
  }
  // The weekend the site is talking about: Fri-Sun now if we're in it, otherwise the coming one.
  function weekend() {
    var t = todayISO(), d = dow(t);
    var fri = (d === 5 || d === 6 || d === 0) ? addDays(t, d === 5 ? 0 : d === 6 ? -1 : -2) : addDays(t, 5 - d);
    var sun = addDays(fri, 2);
    return { from: t > fri ? t : fri, fri: fri, to: sun };
  }

  // ---------- labels ----------
  var BADGE = {
    venue: { cls: "b-ok", icon: "u-check", label: "Venue confirmed", desc: "The venue or park told us its dog rule directly." },
    official: { cls: "b-off", icon: "u-check", label: "Official rule", desc: "The rule is posted on the park's or business's own website. We link it and date it." },
    readers: { cls: "b-rd", icon: "u-users", label: "Readers say yes", desc: "Readers visited with their dogs and reported back." },
    unconfirmed: { cls: "b-unv", icon: "u-q", label: "Unconfirmed", desc: "Only listed as dog-friendly on a third-party site. Call ahead, or help us confirm it." },
    nodogs: { cls: "b-no", icon: "u-x", label: "Dogs not allowed", desc: "The official rules ban dogs here. Listed so you don't make the drive." }
  };
  var CAT = {
    dine: { label: "Patios & breweries", short: "Patio", icon: "i-dine" },
    trail: { label: "Trails & greenways", short: "Trail", icon: "i-trail" },
    park: { label: "Parks", short: "Park", icon: "i-park" },
    dogpark: { label: "Dog parks", short: "Dog park", icon: "i-dogpark" },
    lake: { label: "Lake access", short: "Lake", icon: "i-lake" }
  };
  var TYPE = { dog: { label: "Dog event", cls: "t-dog" }, adopt: { label: "Adoption", cls: "t-adopt" }, foster: { label: "Foster", cls: "t-adopt" } };
  // Decorative photos by category (not photos of the actual place).
  var PHOTOS = { dine: ["bulldog.jpg", "frenchie.jpg", "dachshund-boat.jpg"], trail: ["hiker.jpg", "beagle.jpg", "beagle-sleep.jpg"], park: ["golden-close.jpg", "beagle.jpg"], dogpark: ["bc-puppy.jpg", "golden-close.jpg"], lake: ["bc-rocks.jpg", "golden-dock.jpg", "golden-sunset.jpg"] };
  function photoFor(p, i) { var a = PHOTOS[p.category] || PHOTOS.park; return "/img/" + a[i % a.length]; }

  // ---------- loading ----------
  var cache = null;
  function load() {
    if (cache) return cache;
    function get(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.text(); }).then(parseCSV); }
    cache = Promise.all([get("/data/events.csv"), get("/data/places.csv")]).then(function (res) {
      var t = todayISO();
      var events = res[0].filter(function (e) { return /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.title; }).map(function (e) {
        e.type = TYPE[e.type] ? e.type : "dog";
        e.last = e.end_date && e.end_date > e.date ? e.end_date : e.date;
        e.multi = e.last !== e.date;
        e.id = slug(e.date + "-" + e.title);
        return e;
      }).filter(function (e) { return e.last >= t; });
      var places = res[1].filter(function (p) { return p.name; }).map(function (p) {
        p.category = CAT[p.category] ? p.category : "park";
        p.status = BADGE[p.status] ? p.status : "unconfirmed";
        p.id = p.id || slug(p.name);
        return p;
      });
      return { events: events, places: places };
    });
    return cache;
  }
  // Distances depend on the current home, so recompute on demand.
  function withMiles(list) { list.forEach(function (x) { x.mi = miles(x.lat, x.lng); }); return list; }
  function within(x, r) { return x.mi != null && x.mi <= r; }

  // ---------- calendar export (.ics) ----------
  function icsDate(iso, hm) { return iso.replace(/-/g, "") + (hm ? "T" + hm.replace(":", "") + "00" : ""); }
  function icsText(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
  function ics(e) {
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lanier Leash//Events//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + e.id + "@lanierleash.com", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"];
    if (e.start_time) {
      lines.push("DTSTART;TZID=" + TZ + ":" + icsDate(e.date, e.start_time));
      var endT = e.end_time || (("0" + Math.min(23, +e.start_time.slice(0, 2) + 2)).slice(-2) + e.start_time.slice(2));
      lines.push("DTEND;TZID=" + TZ + ":" + icsDate(e.multi ? e.last : e.date, endT));
    } else {
      lines.push("DTSTART;VALUE=DATE:" + icsDate(e.date));
      lines.push("DTEND;VALUE=DATE:" + icsDate(addDays(e.last, 1)));
    }
    lines.push("SUMMARY:" + icsText(e.title));
    lines.push("LOCATION:" + icsText([e.venue, e.address || e.town].filter(Boolean).join(", ")));
    lines.push("DESCRIPTION:" + icsText([e.dog_rule ? "Dogs: " + e.dog_rule : "", e.cost ? "Cost: " + e.cost : "", e.url].filter(Boolean).join("\n")));
    if (e.url) lines.push("URL:" + e.url);
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  }
  function downloadICS(e) {
    var blob = new Blob([ics(e)], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = e.id + ".ics";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function mapsLink(p) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([p.name, p.address || p.town + ", GA"].join(", ")); }

  // ---------- shared page chrome: mobile menu + ZIP/radius controls ----------
  function initMenu() {
    var burger = document.getElementById("burger"), mnav = document.getElementById("mnav");
    if (!burger || !mnav) return;
    burger.addEventListener("click", function () { var open = mnav.hidden; mnav.hidden = !open; burger.setAttribute("aria-expanded", String(open)); });
    mnav.addEventListener("click", function (e) { if (e.target.closest("a")) { mnav.hidden = true; burger.setAttribute("aria-expanded", "false"); } });
  }

  window.LL = {
    esc: esc, ic: ic, slug: slug, parseCSV: parseCSV,
    get home() { return home; }, setZip: setZip, miles: miles, fmtMi: fmtMi,
    get radius() { return radius; }, setRadius: setRadius,
    todayISO: todayISO, addDays: addDays, dow: dow, fmtDay: fmtDay, fmtLong: fmtLong, fmtShort: fmtShort, fmtChecked: fmtChecked,
    fmtTime: fmtTime, timeRange: timeRange, weekend: weekend,
    BADGE: BADGE, CAT: CAT, TYPE: TYPE, photoFor: photoFor,
    load: load, withMiles: withMiles, within: within, ics: ics, downloadICS: downloadICS, mapsLink: mapsLink, initMenu: initMenu
  };
})();
