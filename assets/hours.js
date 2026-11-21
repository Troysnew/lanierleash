/* Opening hours: reads the short OpenStreetMap-style format we store, e.g.
     "Mo-Th 11:00-21:00; Fr-Sa 11:00-22:00; Su 11:00-20:00", "Tu-Su 07:00-14:00", "24/7",
     "Mo-Fr 09:00-12:00,13:00-18:00", "Fr-Sa 16:00-01:00" (closes after midnight), "Mo off".
   window.LLHours.state(str) -> { open: true|false, label: "Open now · until 9 PM" } or null if unknown.
   Times are Lake Lanier local time (America/New_York). */
(function () {
  var DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"], NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function mins(t) { var p = t.split(":"); return +p[0] * 60 + +(p[1] || 0); }
  function fmt(m) { m = m % 1440; var h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + (mm ? ":" + String(mm).padStart(2, "0") : "") + " " + (h < 12 ? "AM" : "PM"); }
  function dayList(spec) {
    var out = [];
    spec.split(",").forEach(function (part) {
      var ab = part.trim().split("-"), a = DAYS.indexOf(ab[0]), b = ab[1] ? DAYS.indexOf(ab[1]) : a;
      if (a < 0 || b < 0) return;
      for (var i = a; ; i = (i + 1) % 7) { out.push(i); if (i === b) break; }
    });
    return out;
  }
  // -> week[day] = [[startMin, endMin], ...]; end may exceed 1440 when it runs past midnight.
  function parse(str) {
    str = String(str || "").trim();
    if (!str) return null;
    if (str === "24/7") { var all = []; for (var d = 0; d < 7; d++) all.push([[0, 1440]]); return all; }
    var week = [[], [], [], [], [], [], []], ok = false;
    str.split(";").forEach(function (rule) {
      var m = rule.trim().match(/^([A-Za-z,\- ]+?)\s+(off|closed|[\d:,\- ]+)$/);
      if (!m) return;
      var days = dayList(m[1].replace(/\s+/g, ""));
      if (!days.length) return;
      ok = true;
      if (/off|closed/.test(m[2])) { days.forEach(function (d) { week[d] = []; }); return; }
      var ranges = m[2].split(",").map(function (r) { var ab = r.trim().split("-"); if (ab.length !== 2) return null; var s = mins(ab[0]), e = mins(ab[1]); if (e <= s) e += 1440; return [s, e]; }).filter(Boolean);
      days.forEach(function (d) { week[d] = ranges.slice(); });
    });
    return ok ? week : null;
  }
  function nowET() {
    try {
      var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      var g = function (t) { return (p.filter(function (x) { return x.type === t; })[0] || {}).value; };
      return { day: NAMES.indexOf(g("weekday")), min: +g("hour") * 60 + +g("minute") };
    } catch (e) { var d = new Date(); return { day: d.getDay(), min: d.getHours() * 60 + d.getMinutes() }; }
  }
  function state(str) {
    var w = parse(str); if (!w) return null;
    var n = nowET(), y = (n.day + 6) % 7, i, r;
    // still open from yesterday's late hours?
    for (i = 0; i < w[y].length; i++) { r = w[y][i]; if (r[1] > 1440 && n.min < r[1] - 1440) return { open: true, label: "Open now · until " + fmt(r[1]) }; }
    for (i = 0; i < w[n.day].length; i++) { r = w[n.day][i]; if (n.min >= r[0] && n.min < r[1]) return { open: true, label: r[1] - r[0] >= 1440 ? "Open 24 hours" : "Open now · until " + fmt(r[1]) }; }
    // next opening
    for (var k = 0; k < 8; k++) {
      var d = (n.day + k) % 7;
      for (i = 0; i < w[d].length; i++) { r = w[d][i]; if (k > 0 || r[0] > n.min) return { open: false, label: "Closed · opens " + fmt(r[0]) + (k === 0 ? "" : k === 1 ? " tomorrow" : " " + NAMES[d]) }; }
    }
    return { open: false, label: "Closed" };
  }
  window.LLHours = { parse: parse, state: state };
})();
