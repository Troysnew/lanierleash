/* Featured partner cards: always labeled "Sponsored". Draws up to two partners of the given categories
   into a container, nearest first, skipping any outside the reader's radius.
     LLPartners.render(el, ["vet"])          LLPartners.render(el, ["groomer","trainer"], { max: 6 }) */
(function () {
  var cache = null;
  function load() {
    if (!cache) cache = fetch("/api/partners?list=1").then(function (r) { return r.json(); }).then(function (d) { return (d && d.partners) || []; }).catch(function () { return []; });
    return cache;
  }
  function track(id, kind) {
    try {
      var body = JSON.stringify({ action: "track", id: id, kind: kind });
      if (!(navigator.sendBeacon && navigator.sendBeacon("/api/partners", new Blob([body], { type: "application/json" }))))
        fetch("/api/partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true });
    } catch (e) {}
  }
  function card(p, L) {
    var esc = L.esc, mi = p.lat != null ? L.miles(+p.lat, +p.lng) : null, url = "/partners/" + encodeURIComponent(p.id) + "/";
    return '<article class="ptcard" data-pid="' + esc(p.id) + '">' +
      '<a class="ptimg" href="' + url + '" data-k="card">' + (p.photos[0] ? '<img src="' + esc(p.photos[0]) + '" alt="" loading="lazy">' : '<svg class="ic" aria-hidden="true"><use href="#u-paw"/></svg>') + '</a>' +
      '<div class="ptbody"><span class="sponsor-tag">Sponsored</span>' +
      '<h3><a href="' + url + '" data-k="card">' + esc(p.name) + '</a></h3>' +
      (p.tagline ? '<p>' + esc(p.tagline) + '</p>' : '') +
      '<small>' + esc(p.catLabel) + (p.town ? " · " + esc(p.town) : "") + (mi != null ? " · " + esc(L.fmtMi(mi)) : "") + '</small>' +
      (p.offer ? '<span class="ptoff">🎁 ' + esc(p.offer) + '</span>' : '') +
      '<div class="ptacts"><a class="btn btn-sm btn-coral" href="' + url + '" data-k="card">See details</a>' +
      (p.phone ? '<a class="btn btn-sm btn-out" href="tel:' + esc(p.phone.replace(/[^\d+]/g, "")) + '" data-k="call">Call</a>' : '') + '</div></div></article>';
  }
  function render(el, cats, opts) {
    var L = window.LL; if (!el || !L) return Promise.resolve(0);
    opts = opts || {};
    return load().then(function (all) {
      var r = L.radius || 25;
      var list = all.filter(function (p) { return cats.indexOf(p.category) >= 0; })
        .map(function (p) { p.mi = p.lat != null ? L.miles(+p.lat, +p.lng) : null; return p; })
        .filter(function (p) { return p.mi == null || p.mi <= r + 10; })
        .sort(function (a, b) { return (a.mi == null ? 999 : a.mi) - (b.mi == null ? 999 : b.mi); })
        .slice(0, opts.max || 2);
      el.hidden = !list.length;
      el.innerHTML = list.length ? (opts.title === false ? "" : '<p class="ptlabel">Featured partners <a href="/advertise/#partners">What\'s this?</a></p>') + '<div class="ptcards">' + list.map(function (p) { return card(p, L); }).join("") + "</div>" : "";
      if (!el.dataset.wired) {
        el.dataset.wired = "1";
        el.addEventListener("click", function (e) { var a = e.target.closest("[data-k]"), c = e.target.closest("[data-pid]"); if (a && c) track(c.dataset.pid, a.dataset.k); });
      }
      return list.length;
    });
  }
  window.LLPartners = { render: render, load: load };
})();
