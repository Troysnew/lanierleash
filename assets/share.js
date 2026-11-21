// Share panel: a ready-made post people can copy into a Facebook group or send by text, email or social.
// Any button with data-share opens it: data-share-url, data-share-title, data-share-text (the post, without the link).
(function () {
  var dlg, cur;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function abs(u) { try { return new URL(u || location.pathname, location.origin).href.split("#")[0]; } catch (e) { return location.href; } }
  function post() { return dlg.querySelector("textarea").value.trim(); }
  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "sharedlg";
    dlg.setAttribute("aria-labelledby", "shareH");
    dlg.innerHTML =
      '<form method="dialog" class="sharebox">' +
      '<div class="sharehd"><h2 id="shareH">Share</h2><button class="x" value="close" aria-label="Close">×</button></div>' +
      '<p class="sharesub"></p>' +
      '<label class="sharelbl" for="sharePost">Your post <small>(edit it if you like)</small></label>' +
      '<textarea id="sharePost" rows="7"></textarea>' +
      '<button type="button" class="btn btn-coral sharecopy" data-k="copy">Copy post</button>' +
      '<div class="sharegrid">' +
      '<a data-k="fb" target="_blank" rel="noopener"><span class="sb fb">f</span>Facebook</a>' +
      '<a data-k="x" target="_blank" rel="noopener"><span class="sb xx">𝕏</span>X</a>' +
      '<a data-k="sms"><span class="sb sms">💬</span>Text</a>' +
      '<a data-k="mail"><span class="sb mail">✉</span>Email</a>' +
      '<button type="button" data-k="link"><span class="sb lnk">🔗</span>Copy link</button>' +
      '<button type="button" data-k="more" hidden><span class="sb more">⋯</span>More</button>' +
      '</div>' +
      '<p class="sharetip">Tip: paste the post into a local Facebook group like a Cumming or Lake Lanier community page.</p>' +
      '</form>';
    document.body.appendChild(dlg);
    if (navigator.share) dlg.querySelector('[data-k="more"]').hidden = false;
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) { dlg.close(); return; }
      var b = e.target.closest("[data-k]"); if (!b) return;
      var k = b.getAttribute("data-k"), text = post(), u = cur.url;
      var full = text.indexOf(u) >= 0 ? text : text + "\n" + u;
      if (k === "copy" || k === "link") {
        e.preventDefault();
        copy(k === "copy" ? full : u, b);
        return;
      }
      if (k === "more") { e.preventDefault(); navigator.share({ title: cur.title, text: text, url: u }).catch(function () {}); return; }
      // Links: refresh the href with the edited text right before the browser follows it.
      if (k === "fb") b.href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(u);
      if (k === "x") b.href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(u);
      if (k === "sms") b.href = "sms:?&body=" + encodeURIComponent(full);
      if (k === "mail") b.href = "mailto:?subject=" + encodeURIComponent(cur.title) + "&body=" + encodeURIComponent(full);
    });
  }
  function copy(s, b) {
    var lbl = b.lastChild.nodeType === 3 ? b.lastChild : b, old = lbl.textContent;
    function done() { lbl.textContent = "Copied!"; setTimeout(function () { lbl.textContent = old; }, 1600); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(s).then(done).catch(fallback); else fallback();
    function fallback() { var t = dlg.querySelector("textarea"), keep = t.value; t.value = s; t.select(); try { document.execCommand("copy"); done(); } catch (e) { prompt("Copy this", s); } t.value = keep; }
  }
  function open(o) {
    if (!dlg) build();
    cur = { url: abs(o.url), title: o.title || document.title, text: o.text || o.title || document.title };
    dlg.querySelector("h2").textContent = o.heading || "Share";
    dlg.querySelector(".sharesub").textContent = o.sub || "";
    dlg.querySelector(".sharesub").hidden = !o.sub;
    dlg.querySelector("textarea").value = cur.text + "\n" + cur.url;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-share]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    open({ url: b.getAttribute("data-share-url"), title: b.getAttribute("data-share-title"), text: b.getAttribute("data-share-text"), heading: b.getAttribute("data-share-heading"), sub: b.getAttribute("data-share-sub") });
  });
  window.LLShare = { open: open, esc: esc };
})();
