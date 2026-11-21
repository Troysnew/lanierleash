// Thumbs up/down and preset tags on vet cards (cards with data-fb). One request loads every card's counts.
// Stays hidden if feedback isn't available, so the page works either way.
(function () {
  var cards = [].slice.call(document.querySelectorAll(".org[data-fb]"));
  if (!cards.length || !window.fetch) return;
  var OPT = null, LAB = {};
  var THUMB = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 21h4V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>';
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function box(card) { return card.querySelector(".ofb"); }

  function draw(card, d, open) {
    var b = box(card), mv = d.mine ? d.mine.vote : 0, mt = d.mine ? d.mine.tags : [];
    card._d = d; b.hidden = false;
    var tot = d.up + d.down;
    var top = Object.keys(d.tags).sort(function (x, y) { return d.tags[y] - d.tags[x]; }).slice(0, 4);
    var opts = mv === 1 ? OPT.up : mv === -1 ? OPT.down : [];
    b.innerHTML =
      '<div class="ofbrow"><span class="ofbq">' + (mv ? "Thanks for rating!" : "Been here?") + "</span>" +
      '<button type="button" class="oth up" data-v="1" aria-pressed="' + (mv === 1) + '" aria-label="Good visit">' + THUMB + "<b>" + d.up + "</b></button>" +
      '<button type="button" class="oth down" data-v="-1" aria-pressed="' + (mv === -1) + '" aria-label="Heads-up">' + THUMB + "<b>" + d.down + "</b></button></div>" +
      (tot && top.length ? '<div class="said">' + top.map(function (t) { var bad = OPT.down.some(function (o) { return o.id === t; }); return '<span class="' + (bad ? "bad" : "good") + '">' + esc(LAB[t]) + " <b>" + d.tags[t] + "</b></span>"; }).join("") + "</div>" : "") +
      (open && opts.length ? '<div class="ofbtags"><p>' + (mv === 1 ? "What stood out? Tap all that apply." : "What happened? Tap all that apply.") + '</p><div class="chips">' +
        opts.map(function (o) { return '<button type="button" class="chip" data-t="' + o.id + '" aria-pressed="' + (mt.indexOf(o.id) >= 0) + '">' + esc(o.label) + "</button>"; }).join("") + "</div></div>" : "") +
      '<p class="ofbmsg" role="status"></p>';
  }

  function send(card, vote, tags) {
    if (card._busy) return; card._busy = true;
    var msg = box(card).querySelector(".ofbmsg"); if (msg) msg.textContent = "Saving…";
    fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: card.dataset.fb, vote: vote, tags: tags }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        card._busy = false;
        if (!d.ok) { if (msg) msg.textContent = d.error || "Couldn't save that."; return; }
        draw(card, d, vote !== 0);
      }).catch(function () { card._busy = false; if (msg) msg.textContent = "Couldn't save that. Try again."; });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest(".ofb button"); if (!b) return;
    var card = b.closest(".org"), d = card._d; if (!d) return;
    var mv = d.mine ? d.mine.vote : 0, mt = d.mine ? d.mine.tags.slice() : [];
    if (b.dataset.v) { var v = +b.dataset.v; send(card, v === mv ? 0 : v, []); return; }
    if (b.dataset.t) { var i = mt.indexOf(b.dataset.t); if (i >= 0) mt.splice(i, 1); else mt.push(b.dataset.t); send(card, mv, mt); }
  });

  fetch("/api/feedback?ids=" + cards.map(function (c) { return c.dataset.fb; }).join(","))
    .then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) return;
      OPT = d.options; OPT.up.concat(OPT.down).forEach(function (o) { LAB[o.id] = o.label; });
      cards.forEach(function (c) { if (d.items[c.dataset.fb]) draw(c, d.items[c.dataset.fb], false); });
    }).catch(function () {});
})();
