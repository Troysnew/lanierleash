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
  // "Use my location": the browser asks permission, then we look up the ZIP for those coordinates
  // (OpenStreetMap). Distances use the exact spot; the ZIP is what shows and what signup uses.
  function useLocation() {
    if (!navigator.geolocation) return Promise.reject(new Error("Your browser can't share a location."));
    return new Promise(function (ok, bad) {
      navigator.geolocation.getCurrentPosition(ok, function (e) { bad(new Error(e.code === 1 ? "Location permission was blocked. You can type a ZIP instead." : "We couldn't get your location. Try typing a ZIP.")); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    }).then(function (pos) {
      var lat = +pos.coords.latitude.toFixed(4), lng = +pos.coords.longitude.toFixed(4);
      return fetch("https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&addressdetails=1&lat=" + lat + "&lon=" + lng)
        .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
        .then(function (d) {
          var a = d.address || {}, zip = String(a.postcode || "").slice(0, 5);
          if (!/^\d{5}$/.test(zip)) zip = home.zip;
          home = { zip: zip, lat: lat, lng: lng, town: a.city || a.town || a.village || a.hamlet || "your location", gps: true };
          store("ll-home", home); return home;
        });
    });
  }
  // Adds a "Use my location" button after each ZIP box on the page.
  function initLocate(ids) {
    (ids || ["zip", "hZip"]).forEach(function (id) {
      var inp = document.getElementById(id); if (!inp || inp.dataset.loc) return;
      inp.dataset.loc = "1";
      var b = document.createElement("button");
      b.type = "button"; b.className = "locbtn"; b.title = "Use my location"; b.setAttribute("aria-label", "Use my location");
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>';
      inp.insertAdjacentElement("afterend", b);
      b.addEventListener("click", function () {
        b.disabled = true; b.classList.add("busy");
        useLocation().then(function (h) {
          inp.value = h.zip; inp.dispatchEvent(new Event("input", { bubbles: true }));
          document.dispatchEvent(new CustomEvent("ll:home", { detail: h }));
        }).catch(function (e) { alert(e.message); }).then(function () { b.disabled = false; b.classList.remove("busy"); });
      });
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
  var radius = +(store("ll3-rad") || 25) || 25;
  function setRadius(r) { radius = r; store("ll3-rad", r); }

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
  // Keep in step with CATS in api/_lib/places.js. "group" powers the broader filters.
  var CAT = {
    restaurant: { label: "Restaurants & patios", short: "Restaurant", icon: "i-dine", badge: "patio-dining", group: "food" },
    brewery: { label: "Breweries & taprooms", short: "Brewery", icon: "i-brew", badge: "breweries", group: "food" },
    winery: { label: "Wineries", short: "Winery", icon: "i-wine", badge: "wineries", group: "food" },
    coffee: { label: "Coffee & cafes", short: "Coffee", icon: "i-coffee", badge: "coffee-and-cafes", group: "food" },
    trail: { label: "Trails & greenways", short: "Trail", icon: "i-trail", badge: "parks-and-trails", group: "outdoors" },
    park: { label: "Parks", short: "Park", icon: "i-park", badge: "parks", group: "outdoors" },
    dogpark: { label: "Dog parks", short: "Dog park", icon: "i-dogpark", badge: "dog-parks", group: "outdoors" },
    lake: { label: "Lake access", short: "Lake", icon: "i-lake", badge: "lake-activities", group: "outdoors" },
    shop: { label: "Pet stores & shops", short: "Shop", icon: "i-shop", badge: "pet-friendly-shopping", group: "shops" },
    stay: { label: "Hotels & stays", short: "Stay", icon: "i-stay", badge: "dog-friendly-lodging", group: "stays" }
  };
  // Which animals an event is for, read from its title and notes (so no extra field to fill in).
  var RX_CAT = /\b(cats?|kittens?|kitties|kitty|feline)\b/i;
  var RX_CRIT = /\b(reptiles?|snakes?|lizards?|geckos?|turtles?|tortoises?|birds?|parrots?|rabbits?|bunn(y|ies)|guinea pigs?|hamsters?|ferrets?|chickens?|horses?|goats?|exotics?|small animals?|critters?|herp\w*)\b/i;
  var RX_DOG = /\b(dogs?|pupp(y|ies)|pups?|canines?|k-?9s?|doggy|doggie)\b/i;
  function animalsOf(e) {
    var t = [e.title, e.notes].join(" "), a = [], cat = RX_CAT.test(t), crit = RX_CRIT.test(t);
    if (RX_DOG.test(t) || (!cat && !crit)) a.push("dogs");
    if (cat) a.push("cats");
    if (crit) a.push("critters");
    return a;
  }
  var ANIMAL = { dogs: "Dogs", cats: "Cats", critters: "Other pets" };
  var GROUP = { food: "Food & drink", outdoors: "Outdoors", shops: "Shops", stays: "Stays" };
  var TYPE = { dog: { label: "Dog event", cls: "t-dog" }, adopt: { label: "Adoption", cls: "t-adopt" }, foster: { label: "Foster", cls: "t-adopt" } };
  // Generic illustration tiles by category (not photos of the actual place). Each place always gets
  // the same tile, picked from its id, so the list doesn't repeat in a fixed pattern.
  function tiles(k, n) { var a = []; for (var j = 1; j <= n; j++) a.push("tiles/" + k + "-" + j + ".webp"); return a; }
  var PARK = tiles("park", 3), FOOD = tiles("restaurant", 5), BREW = tiles("brewery", 3);
  var PHOTOS = { restaurant: FOOD, coffee: FOOD, brewery: BREW, winery: BREW.concat(FOOD.slice(0, 2)), shop: tiles("shop", 3), stay: tiles("stay", 3),
    park: PARK, dogpark: PARK, trail: PARK.concat(["hiker.jpg"]), lake: tiles("lake", 2).concat(["golden-dock.jpg"]) };
  var recent = []; // tiles used by the last few cards drawn, so nearby cards don't match
  function stockFor(p, i) {
    var a = PHOTOS[p.category] || PARK, k = String(p.id || p.name || i || ""), h = 0;
    for (var j = 0; j < k.length; j++) h = (h * 31 + k.charCodeAt(j)) >>> 0;
    if (i === 0) recent = [];
    var pick = a[h % a.length];
    for (var t = 1; t < a.length && recent.indexOf(pick) >= 0; t++) pick = a[(h + t) % a.length];
    recent.push(pick); if (recent.length > 3) recent.shift();
    return "/img/" + pick;
  }
  // Licensed real photos (Wikimedia Commons, public domain) by place id; filled from /assets/place-photos.js.
  var REAL = (typeof window !== "undefined" && window.LL_PHOTOS) || {};
  // Ready-made share post for an event (the share panel adds the link). Same wording as the event page.
  function sharePost(e) {
    var D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], d = new Date(e.date + "T12:00:00");
    var day = function (iso) { return D[new Date(iso + "T12:00:00").getDay()] + ", " + fmtShort(iso); };
    var when = day(e.date) + (e.end_date && e.end_date > e.date ? " – " + day(e.end_date) : "") + (e.start_time ? " · " + timeRange(e) : "");
    var where = [e.venue, e.town].filter(Boolean).join(", ");
    return ["🐾 " + e.title, "📅 " + when, where && "📍 " + where, e.dog_rule && !/^no dog rule posted/i.test(e.dog_rule) && "🐕 " + e.dog_rule,
      "Found on Lanier Leash, the free dog guide for Lake Lanier:"].filter(Boolean).join("\n");
  }
  function shareBtn(e, cls) {
    return '<button class="' + (cls || "lnk") + '" type="button" data-share data-share-heading="Share this event" data-share-url="/events/' + e.id + '/" data-share-title="' + esc(e.title) + '" data-share-text="' + esc(sharePost(e)) + '">' + ic("u-share") + "Share</button>";
  }
  // Illustrated category badge (hexagon icon) as an <img>.
  function catBadge(cat, px) { var c = CAT[cat] || CAT.park; return '<img class="cbadge" src="/img/icons/' + c.badge + (px > 36 ? "-192" : "-96") + '.webp" alt="" width="' + px + '" height="' + px + '">'; }
  function photoFor(p, i) { var x = REAL[p.id]; return x ? "/img/places/" + x.file : stockFor(p, i); }
  function photoCredit(p) { return REAL[p.id] || null; }
  // True when the picture is a generic tile or an AI illustration, not a real photo of the place.
  function isGeneric(p) { var x = REAL[p.id]; return !x || !!x.illustration; }
  function genTag(p) { return isGeneric(p) ? '<span class="gen" title="Illustration, not a photo of this place">Illustration</span>' : ""; }

  // ---------- loading ----------
  var cache = null;
  function load() {
    if (cache) return cache;
    function get(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.text(); }).then(parseCSV); }
    // Events come from the live calendar (/api/events); the CSV is the fallback if that's unavailable.
    function events() {
      return fetch("/api/events").then(function (r) { if (!r.ok) throw new Error("api " + r.status); return r.json(); })
        .then(function (d) { if (!d.ok || !d.events || !d.events.length) throw new Error("no api events"); return d.events; })
        .catch(function () { return get("/data/events.csv"); });
    }
    // Places come from the directory (/api/places); the CSV is the fallback.
    function places() {
      return fetch("/api/places").then(function (r) { if (!r.ok) throw new Error("api " + r.status); return r.json(); })
        .then(function (d) { if (!d.ok || !d.places || !d.places.length) throw new Error("no api places"); return d.places; })
        .catch(function () { return get("/data/places.csv"); });
    }
    cache = Promise.all([events(), places()]).then(function (res) {
      var t = todayISO();
      var events = res[0].filter(function (e) { return /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.title; }).map(function (e) {
        ["end_date", "start_time", "end_time", "venue", "town", "address", "cost", "dog_rule", "url", "source_name", "notes", "checked"].forEach(function (k) { if (e[k] == null) e[k] = ""; });
        e.type = TYPE[e.type] ? e.type : "dog";
        e.last = e.end_date && e.end_date > e.date ? e.end_date : e.date;
        e.multi = e.last !== e.date;
        e.animals = animalsOf(e);
        e.id = slug(e.date + "-" + e.title);
        return e;
      }).filter(function (e) { return e.last >= t; });
      var places = res[1].filter(function (p) { return p.name; }).map(function (p) {
        p.category = p.category === "dine" ? "restaurant" : CAT[p.category] ? p.category : "park";
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
  // Repeat events (same title at the same venue): keep the first one and list the other dates on it.
  // Expects the list sorted by date. Adds e.more = [later events] and e.every = "Every Tuesday" when they share a weekday.
  function groupRepeats(list) {
    var first = {}, out = [];
    list.forEach(function (e) {
      if (e.multi) { out.push(e); return; }
      var k = slug(e.title) + "|" + slug(e.venue || e.town || "");
      if (first[k]) { first[k].more.push(e); return; }
      e.more = []; first[k] = e; out.push(e);
    });
    out.forEach(function (e) {
      if (!e.more || !e.more.length) return;
      var d = dow(e.date), same = e.more.every(function (x) { return dow(x.date) === d; });
      e.every = same ? "Every " + DOWL[d] : "";
    });
    return out;
  }
  function mapsLink(p) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([p.name, p.address || p.town + ", GA"].join(", ")); }

  // ---------- shared page chrome: mobile menu + ZIP/radius controls ----------
  function initMenu() {
    var burger = document.getElementById("burger"), mnav = document.getElementById("mnav");
    if (!burger || !mnav) return;
    burger.addEventListener("click", function () { var open = mnav.hidden; mnav.hidden = !open; burger.setAttribute("aria-expanded", String(open)); });
    mnav.addEventListener("click", function (e) { if (e.target.closest("a")) { mnav.hidden = true; burger.setAttribute("aria-expanded", "false"); } });
  }

  // Saved places live in this browser only (no account). Same key as the heart on place pages.
  function savedList() { try { var a = JSON.parse(localStorage.getItem("ll_saved") || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function isSaved(id) { return savedList().indexOf(id) >= 0; }
  function toggleSaved(id) {
    var a = savedList(), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.unshift(id);
    try { localStorage.setItem("ll_saved", JSON.stringify(a.slice(0, 300))); } catch (e) {}
    return i < 0;
  }
  window.LL = {
    esc: esc, ic: ic, slug: slug, parseCSV: parseCSV,
    get home() { return home; }, setZip: setZip, useLocation: useLocation, initLocate: initLocate, miles: miles, fmtMi: fmtMi,
    get radius() { return radius; }, setRadius: setRadius,
    todayISO: todayISO, addDays: addDays, dow: dow, fmtDay: fmtDay, fmtLong: fmtLong, fmtShort: fmtShort, fmtChecked: fmtChecked,
    fmtTime: fmtTime, timeRange: timeRange, weekend: weekend,
    BADGE: BADGE, CAT: CAT, ANIMAL: ANIMAL, animalsOf: animalsOf, GROUP: GROUP, TYPE: TYPE, photoFor: photoFor, catBadge: catBadge, sharePost: sharePost, shareBtn: shareBtn, photoCredit: photoCredit, isGeneric: isGeneric, genTag: genTag,
    saved: savedList, isSaved: isSaved, toggleSaved: toggleSaved,
    load: load, withMiles: withMiles, groupRepeats: groupRepeats, within: within, ics: ics, downloadICS: downloadICS, mapsLink: mapsLink, initMenu: initMenu
  };
})();
