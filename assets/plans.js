// Going / Maybe on events. Plans live in this browser only (no account), like saved places.
// Any element with data-pe='{"id":..,"t":..,"d":..}' holding buttons with data-plan="going|maybe" works.
// After a pick, a note offers to share it ("I'm going to ...") and links to /my-events/.
(function () {
  var KEY = "ll_plans", MAX = 300;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function read() { try { var o = JSON.parse(localStorage.getItem(KEY) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  function write(o) {
    var ids = Object.keys(o);
    if (ids.length > MAX) ids.sort(function (a, b) { return (o[a].d || "") < (o[b].d || "") ? -1 : 1; }).slice(0, ids.length - MAX).forEach(function (k) { delete o[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }
  function get(id) { var p = read()[id]; return p ? p.s : ""; }
  // snap: {id, t: title, d: date, l: last day, st/et: times, v: venue, w: town}
  function set(snap, s) {
    var o = read();
    if (s === "going" || s === "maybe") { o[snap.id] = { s: s, t: snap.t, d: snap.d, l: snap.l || snap.d, st: snap.st || "", et: snap.et || "", v: snap.v || "", w: snap.w || "" }; }
    else delete o[snap.id];
    write(o);
    try { document.dispatchEvent(new CustomEvent("ll:plans", { detail: { id: snap.id, s: s || "" } })); } catch (e) {}
  }
  function all() {
    var o = read();
    return Object.keys(o).map(function (id) { var p = o[id]; return { id: id, s: p.s, t: p.t, d: p.d, l: p.l || p.d, st: p.st, et: p.et, v: p.v, w: p.w }; })
      .filter(function (p) { return /^\d{4}-\d{2}-\d{2}$/.test(p.d || "") && p.t; })
      .sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.st || "99") < (b.st || "99") ? -1 : 1; });
  }
  function today() { return window.LL && LL.todayISO ? LL.todayISO() : new Date().toISOString().slice(0, 10); }
  function upcoming() { var t = today(); return all().filter(function (p) { return p.l >= t; }); }
  function snapOf(e) { return { id: e.id, t: e.title, d: e.date, l: e.last || e.end_date || e.date, st: e.start_time || "", et: e.end_time || "", v: e.venue || "", w: e.town || "" }; }

  var CHECK = '<span class="ck" aria-hidden="true">✓</span>';
  // The two buttons for an event (an LL event object from data.js).
  function btns(e, cls) {
    var s = get(e.id);
    return '<span class="planbar' + (cls ? " " + cls : "") + '" data-pe="' + esc(JSON.stringify(snapOf(e))) + '" role="group" aria-label="Your plans">' +
      '<button type="button" class="planbtn" data-plan="going" aria-pressed="' + (s === "going") + '">' + CHECK + "Going</button>" +
      '<button type="button" class="planbtn" data-plan="maybe" aria-pressed="' + (s === "maybe") + '">Maybe</button></span>';
  }

  function when(p) {
    var L = window.LL, d = L ? L.fmtDay(p.d) : p.d;
    if (p.l && p.l > p.d) d += " – " + (L ? L.fmtDay(p.l) : p.l);
    if (p.st && L) d += " · " + L.timeRange({ start_time: p.st, end_time: p.et });
    return d;
  }
  function post(p, s) {
    var where = [p.v, p.w].filter(Boolean).join(", ");
    return [s === "going" ? "🐾 I'm going to " + p.t + " with my pup! Paws up if you're coming too." : "🐾 Thinking about taking my pup to " + p.t + ". Anyone else going?",
      "📅 " + when(p), where && "📍 " + where, "Details on Lanier Leash:"].filter(Boolean).join("\n");
  }
  function shareAttrs(p, s) {
    return 'data-share data-share-heading="' + (s === "going" ? "Tell your pack you're going" : "Ask who else is going") + '" data-share-url="/events/' + esc(p.id) + '/" data-share-title="' + esc(p.t) + '" data-share-text="' + esc(post(p, s)) + '"';
  }
  // ---------- public counts ("12 going · 3 maybe") ----------
  var COUNTS = {}, OFF = false;
  function vid() {
    var v = ""; try { v = localStorage.getItem("ll_vid") || ""; } catch (e) {}
    if (!/^[A-Za-z0-9-]{16,64}$/.test(v)) {
      v = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Array.apply(null, Array(32)).map(function () { return "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]; }).join("");
      try { localStorage.setItem("ll_vid", v); } catch (e) {}
    }
    return v;
  }
  function idOf(bar) { try { return JSON.parse(bar.getAttribute("data-pe")).id; } catch (e) { return ""; } }
  function countEl(bar) {
    var n = bar.nextElementSibling;
    if (n && n.classList.contains("rsvpn")) return n;
    n = document.createElement("span"); n.className = "rsvpn"; n.hidden = true;
    bar.parentNode.insertBefore(n, bar.nextSibling); return n;
  }
  function paint(root) {
    (root || document).querySelectorAll("[data-pe]").forEach(function (bar) {
      var c = COUNTS[idOf(bar)]; if (!c) return;
      var el = countEl(bar), t = [c.going && c.going + " going", c.maybe && c.maybe + " maybe"].filter(Boolean).join(" · ");
      el.textContent = t; el.hidden = !t;
    });
  }
  function loadCounts(root) {
    if (OFF) return;
    var ids = [];
    (root || document).querySelectorAll("[data-pe]").forEach(function (bar) { var id = idOf(bar); if (id && !COUNTS[id] && ids.indexOf(id) < 0) ids.push(id); });
    paint(root);
    for (var i = 0; i < ids.length; i += 80) {
      fetch("/api/events?counts=" + ids.slice(i, i + 80).join(",")).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.ok) { OFF = true; return; }
        Object.keys(d.items || {}).forEach(function (id) { COUNTS[id] = d.items[id]; });
        paint();
      }).catch(function () {});
    }
  }
  function send(id, prev, s) {
    var c = COUNTS[id];
    if (c) { if (prev) c[prev] = Math.max(0, c[prev] - 1); if (s) c[s]++; paint(); }
    fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, s: s, t: vid() }) })
      .then(function (r) { return r.json(); }).then(function (d) { if (d && d.ok) { COUNTS[id] = { going: d.going, maybe: d.maybe }; paint(); } }).catch(function () {});
  }

  function note(bar, snap, s) {
    var a = bar.nextElementSibling && bar.nextElementSibling.classList.contains("rsvpn") ? bar.nextElementSibling : bar;
    var n = a.nextElementSibling && a.nextElementSibling.classList.contains("plannote") ? a.nextElementSibling : null;
    if (!s) { if (n) n.remove(); return; }
    if (!n) { n = document.createElement("span"); n.className = "plannote"; n.setAttribute("role", "status"); a.parentNode.insertBefore(n, a.nextSibling); }
    n.innerHTML = "<b>" + (s === "going" ? "You're going!" : "Marked maybe.") + "</b> " +
      '<button type="button" class="lnk sm" ' + shareAttrs(snap, s) + '><svg class="ic" aria-hidden="true"><use href="#u-share"/></svg>' + (s === "going" ? "Tell your pack" : "Ask your pack") + "</button>" +
      '<a class="lnk sm" href="/my-events/"><svg class="ic" aria-hidden="true"><use href="#i-cal"/></svg>My events</a>';
  }
  function sync(bar, s) { bar.querySelectorAll("[data-plan]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-plan") === s)); }); }

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-plan]"); if (!b) return;
    var bar = b.closest("[data-pe]"); if (!bar) return;
    var snap; try { snap = JSON.parse(bar.getAttribute("data-pe")); } catch (e) { return; }
    if (!snap || !snap.id) return;
    var want = b.getAttribute("data-plan"), prev = get(snap.id), s = prev === want ? "" : want;
    set(snap, s); sync(bar, s); send(snap.id, prev, s);
    if (!bar.hasAttribute("data-nonote")) note(bar, snap, s);
  });
  // Pages rendered on the server: show what this browser already picked.
  function init() { document.querySelectorAll("[data-pe]").forEach(function (bar) { try { sync(bar, get(JSON.parse(bar.getAttribute("data-pe")).id)); } catch (e) {} }); loadCounts(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  // One calendar file with every upcoming "Going" event.
  function icsText(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
  function nextDay(iso) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  function icsAll(list) {
    var D = function (iso, hm) { return iso.replace(/-/g, "") + (hm ? "T" + hm.replace(":", "") + "00" : ""); };
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lanier Leash//My events//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:My dog events"];
    list.forEach(function (p) {
      L.push("BEGIN:VEVENT", "UID:" + p.id + "@lanierleash.com", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z");
      if (p.st) {
        var et = p.et || (("0" + Math.min(23, +p.st.slice(0, 2) + 2)).slice(-2) + p.st.slice(2));
        L.push("DTSTART;TZID=America/New_York:" + D(p.d, p.st), "DTEND;TZID=America/New_York:" + D(p.l || p.d, et));
      } else L.push("DTSTART;VALUE=DATE:" + D(p.d), "DTEND;VALUE=DATE:" + D(nextDay(p.l || p.d)));
      L.push("SUMMARY:" + icsText(p.t), "LOCATION:" + icsText([p.v, p.w].filter(Boolean).join(", ")), "URL:" + location.origin + "/events/" + p.id + "/", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.join("\r\n") + "\r\n";
  }

  window.LLPlans = { counts: loadCounts, all: all, upcoming: upcoming, get: get, set: set, btns: btns, snapOf: snapOf, when: when, post: post, shareAttrs: shareAttrs, icsAll: icsAll, esc: esc };
})();
