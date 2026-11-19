// Motion layer for base pages. Additive: if this file fails to load, the page is unchanged.
// 1) Intro: the briefing header settles in once per page load.
// 2) Cards and section headings rise in the first time they come into view (never again after that).
// 3) Smooth wheel scrolling (Lenis) on mouse/trackpad only; touch scrolling stays native.
// Reduced-motion users get no movement: the intro becomes a short fade, cards appear as-is, no smooth scrolling.
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("mtd-motion");
  if (reduce) root.classList.add("mtd-reduce");

  // ---- 2) First-time reveal --------------------------------------------------------------
  var io = null, firstBatch = true;
  function reveal(entries) {
    var batch = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
    batch.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
    var offset = firstBatch ? 220 : 0; // let the intro lead on first paint
    firstBatch = false;
    batch.forEach(function (el, i) {
      io.unobserve(el);
      el.style.setProperty("--mtd-delay", offset + Math.min(i, 6) * 45 + "ms");
      el.classList.remove("mtd-pending");
      el.classList.add("mtd-in");
    });
  }
  function arm(el) {
    if (!io || el.hasAttribute("data-mtd")) return;
    el.setAttribute("data-mtd", "");
    el.classList.add("mtd-pending");
    io.observe(el);
  }
  function armAll(scope) {
    (scope || document).querySelectorAll("#listView .card, #listView .section-label").forEach(arm);
  }
  if (!reduce && "IntersectionObserver" in window) {
    io = new IntersectionObserver(reveal, { rootMargin: "0px 0px -6% 0px", threshold: 0.01 });
    armAll();
    var list = document.getElementById("listView");
    if (list) new MutationObserver(function () { armAll(list); }).observe(list, { childList: true, subtree: true });
    // Hand the transform back to the hover style once the rise is done.
    document.addEventListener("animationend", function (e) {
      if (e.target.classList && e.target.classList.contains("mtd-in")) {
        e.target.classList.remove("mtd-in");
        e.target.style.removeProperty("--mtd-delay");
      }
    });
  }

  // ---- 3) Smooth wheel scrolling -----------------------------------------------------------
  var lenis = null;
  var map = document.getElementById("leafletMap");
  if (map) map.setAttribute("data-lenis-prevent", ""); // the map keeps its own wheel zoom
  function startSmooth() {
    if (reduce || lenis || !window.Lenis) return;
    // allowNestedScroll: pop-ups, dropdowns and other scrolling boxes keep their own wheel scrolling.
    lenis = new Lenis({ autoRaf: true, anchors: true, lerp: 0.12, allowNestedScroll: true });
  }
  function stopSmooth() { if (lenis) { lenis.destroy(); lenis = null; } }
  startSmooth();

  // ---- Small handle for testing (on/off, replay the intro) ----------------------------------
  window.mtdMotion = {
    smoothOn: function () { return !!lenis; },
    setSmooth: function (on) { on ? startSmooth() : stopSmooth(); return !!lenis; },
    replay: function () {
      window.scrollTo(0, 0);
      document.querySelectorAll(".brief-copy > *, .brief-graphic, .coords-row").forEach(function (el) {
        el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
      });
      if (io) {
        firstBatch = true;
        document.querySelectorAll("#listView [data-mtd]").forEach(function (el) {
          el.removeAttribute("data-mtd"); el.classList.remove("mtd-in");
        });
        armAll();
      }
    }
  };
})();
