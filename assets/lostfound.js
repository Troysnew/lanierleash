/* A lost & found post's page: share buttons, the message form, and the poster's own controls
   (shown only when the page is opened from their private link, ?t=...). */
(function () {
  var D = window.LF; if (!D) return;
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search), t = qs.get("t");
  function post(data) {
    return fetch("/api/lostfound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Something went wrong. Try again." }; }); });
  }
  function say(el, text, bad) { if (!el) return; el.textContent = text; el.className = (el.className.replace(/\s*\berr\b/g, "")) + (bad ? " err" : ""); }

  // ---------- share ----------
  var shareSay = $("lfShareSay");
  function copy() {
    var done = function () { say(shareSay, "Link copied. Paste it in your neighborhood groups."); };
    if (navigator.clipboard) navigator.clipboard.writeText(D.url).then(done, function () { prompt("Copy this link:", D.url); });
    else prompt("Copy this link:", D.url);
  }
  if ($("lfCopy")) $("lfCopy").addEventListener("click", copy);
  if ($("lfShare")) $("lfShare").addEventListener("click", function () {
    if (navigator.share) navigator.share({ title: D.title, text: D.text, url: D.url }).catch(function () {});
    else copy();
  });

  // ---------- message the poster ----------
  var f = $("lfMsg"), t0 = Date.now();
  if (f) f.addEventListener("submit", function (e) {
    e.preventDefault();
    var s = $("lfMsgSay"), btn = f.querySelector("button[type=submit]");
    var data = { action: "contact", id: D.id, t0: t0 };
    ["name", "email", "phone", "message", "hp"].forEach(function (k) { data[k] = (f.elements[k] && f.elements[k].value || "").trim(); });
    f.querySelectorAll("[aria-invalid]").forEach(function (x) { x.removeAttribute("aria-invalid"); });
    btn.disabled = true; say(s, "Sending…");
    post(data).then(function (d) {
      btn.disabled = false;
      if (!d.ok) { say(s, d.error || "Couldn't send that.", true); if (d.field && f.elements[d.field]) { f.elements[d.field].setAttribute("aria-invalid", "true"); f.elements[d.field].focus(); } return; }
      f.reset(); say(s, "Sent. They'll get it by email and can reply to you directly. Thank you for helping.");
    }).catch(function () { btn.disabled = false; say(s, "Couldn't send that. Check your connection and try again.", true); });
  });

  // ---------- the poster's controls ----------
  var box = $("lfOwner");
  if (!t || !box) return;
  var fmt = function (iso) { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch (e) { return ""; } };
  function draw(st) {
    box.hidden = false;
    var who = D.name || "them", html;
    if (st.status === "active") {
      html = (qs.get("new") ? "<p class=\"lfok\"><b>Your post is live.</b> Now share it: neighborhood Facebook groups, Nextdoor and texts to neighbors find pets fastest.</p>" : "") +
        "<p><b>Your post</b> · up until " + fmt(st.expires_at) + ". Only you can see these buttons; keep this link private.</p><div class=\"acts\">" +
        (D.kind === "lost" ? "<button class=\"btn btn-coral\" data-op=\"reunited\">" + "🎉 " + "They're home</button>" : "<button class=\"btn btn-coral\" data-op=\"reunited\">Back with their owner</button>") +
        "<button class=\"btn btn-out\" data-op=\"renew\">Keep it up 30 more days</button><button class=\"btn btn-out\" data-op=\"remove\">Take it down</button></div>";
    } else if (st.status === "reunited") {
      html = "<p class=\"lfok\"><b>So glad " + (D.kind === "lost" ? who + " is home" : "they're back home") + ".</b> The post now shows as reunited, which gives everyone who shared some good news.</p><div class=\"acts\"><button class=\"btn btn-out\" data-op=\"reopen\">Oops, still looking</button><button class=\"btn btn-out\" data-op=\"remove\">Take it down</button></div>";
    } else if (st.status === "expired") {
      html = "<p><b>Your post ended.</b> " + (D.kind === "lost" ? "Still looking?" : "Still have them?") + " Put it back up for 30 days.</p><div class=\"acts\"><button class=\"btn btn-coral\" data-op=\"renew\">Put it back up</button><button class=\"btn btn-out\" data-op=\"reunited\">" + (D.kind === "lost" ? "They're home" : "Back with their family") + "</button><button class=\"btn btn-out\" data-op=\"remove\">Take it down</button></div>";
    } else html = "<p>This post is down.</p>";
    box.innerHTML = html + "<p class=\"msg\" id=\"lfOwnSay\" role=\"status\" hidden></p>";
  }
  function load() {
    fetch("/api/lostfound?owner=" + encodeURIComponent(D.id) + "&t=" + encodeURIComponent(t)).then(function (r) { return r.json(); }).then(function (d) { if (d.ok) draw(d); }).catch(function () {});
  }
  box.addEventListener("click", function (e) {
    var b = e.target.closest("[data-op]"); if (!b) return;
    var op = b.dataset.op;
    if (op === "remove" && !confirm("Take this post down? It disappears from the board and the photo is deleted.")) return;
    b.disabled = true;
    post({ action: "owner", id: D.id, t: t, op: op }).then(function (d) {
      if (!d.ok) { var s = $("lfOwnSay"); s.hidden = false; say(s, d.error || "Couldn't do that.", true); b.disabled = false; return; }
      if (op === "remove") { box.innerHTML = "<p><b>Your post is down</b> and the photo is deleted.</p>"; return; }
      // The page itself is cached for a minute; reload with a fresh query so the banner updates.
      location.replace(location.pathname + "?t=" + encodeURIComponent(t) + "&v=" + Date.now());
    });
  });
  load();
})();
