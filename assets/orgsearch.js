/* Search box for the directory pages (services, vet care, adopt).
   Filters the .org cards by name, town, services, notes and the section they're in.
   Every word typed has to match somewhere on the card. Other filters (like Adopt / Foster)
   set LLOrgSearch.tag and call LLOrgSearch.apply(). */
(function () {
  var input = document.getElementById("orgQ"), out = document.getElementById("orgCount");
  if (!input) return;
  var norm = function (s) { return String(s || "").toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ").replace(/\s+/g, " "); };
  // A few words people type that the listings spell differently.
  var ALIAS = { groom: "groomer grooming", grooming: "groomer grooming", nails: "nail", bath: "bathing bath", train: "trainer training", training: "trainer training",
    boarding: "boarding daycare", kennel: "boarding", sitter: "boarding daycare", spay: "spay neuter", neuter: "spay neuter", fix: "spay neuter", shots: "vaccine",
    vaccines: "vaccine", vaccination: "vaccine", er: "emergency 24/7", emergency: "emergency 24/7 after-hours", food: "food pantry", rescue: "rescue shelter humane",
    shelter: "shelter rescue humane", puppy: "puppy puppies" };
  var cards = [].slice.call(document.querySelectorAll(".org"));
  cards.forEach(function (o) {
    var sec = o.closest("section"), h = [];
    if (sec) sec.querySelectorAll("h2, .h3s, .eyebrow").forEach(function (x) { h.push(x.textContent); });
    o._txt = norm(o.textContent + " " + h.join(" "));
  });
  var api = window.LLOrgSearch = { tag: "", apply: apply };

  function hit(txt, w) {
    if (txt.indexOf(w) >= 0) return true;
    var a = ALIAS[w];
    return !!a && a.split(" ").some(function (x) { return txt.indexOf(x) >= 0; });
  }
  function apply() {
    var q = norm(input.value).trim(), words = q ? q.split(" ") : [], tag = api.tag, n = 0;
    cards.forEach(function (o) {
      var okTag = !tag || (" " + (o.dataset.tags || "") + " ").indexOf(" " + tag + " ") >= 0;
      var ok = okTag && words.every(function (w) { return hit(o._txt, w); });
      o.hidden = !ok; if (ok) n++;
    });
    // Hide headings and groups with nothing left in them.
    document.querySelectorAll(".orgs").forEach(function (g) {
      var any = [].some.call(g.querySelectorAll(".org"), function (o) { return !o.hidden; });
      g.hidden = !any;
      var p = g.previousElementSibling;
      while (p && !p.classList.contains("orgs") && !p.classList.contains("sh")) { if (p.matches(".h3s, .fine")) p.hidden = !any; p = p.previousElementSibling; }
    });
    document.querySelectorAll("section.blk").forEach(function (s) {
      var c = s.querySelectorAll(".org");
      if (c.length) s.hidden = [].every.call(c, function (o) { return o.hidden; });
      if (s.id) document.querySelectorAll('.svcnav a[href="#' + s.id + '"]').forEach(function (a) {
        a.hidden = s.hidden; var b = a.querySelector("b"); if (b) b.textContent = [].filter.call(c, function (o) { return !o.hidden; }).length;
      });
    });
    if (out) {
      var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
      out.innerHTML = !words.length ? "" : n ? n + (n === 1 ? " match" : " matches") + " for “" + esc(input.value.trim()) + "”" :
        "Nothing matches “" + esc(input.value.trim()) + "”. Try one word, like a town or a service, or <a href=\"" + (out.dataset.missing || "/submit/?type=place") + "\">tell us who we&rsquo;re missing</a>.";
    }
    try { var u = new URL(location.href); if (q) u.searchParams.set("q", input.value.trim()); else u.searchParams.delete("q"); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (e) {}
  }
  var t;
  input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(apply, 120); });
  input.addEventListener("keydown", function (e) { if (e.key === "Escape") { input.value = ""; apply(); } });
  var q0 = new URLSearchParams(location.search).get("q");
  if (q0) { input.value = q0; apply(); }
})();
