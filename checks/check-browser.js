// Headless-browser checks against the local files. Run: node checks/check-browser.js [base ...]
// Needs `playwright` (global NODE_PATH ok) and Leaflet (auto-installed to a temp dir if not found).
const fs = require("fs"), path = require("path"), http = require("http"), os = require("os"), cp = require("child_process");
const { ROOT, loadData, Report } = require("./lib");
const cfg = require("./config");
const R = new Report("browser");
const only = process.argv.slice(2);
const keys = Object.keys(cfg.bases).filter((k) => !only.length || only.includes(k));

function leafletDist() {
  const cands = [process.env.LEAFLET_DIST, path.join(os.tmpdir(), "mtd-leaflet/node_modules/leaflet/dist")];
  try { cands.push(path.dirname(require.resolve("leaflet/dist/leaflet.js"))); } catch (e) {}
  for (const c of cands) if (c && fs.existsSync(path.join(c, "leaflet.js"))) return c;
  const dir = path.join(os.tmpdir(), "mtd-leaflet"); fs.mkdirSync(dir, { recursive: true });
  console.log("installing leaflet for the map tests…");
  cp.execSync("npm i --silent --no-audit --no-fund leaflet@1.9.4", { cwd: dir, stdio: "inherit" });
  return path.join(dir, "node_modules/leaflet/dist");
}
const LF = leafletDist();
const { chromium } = require("playwright");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".xml": "text/xml", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain" };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x"); let p = decodeURIComponent(u.pathname);
  if (p === "/listing") p = "/listing.html"; else if (p === "/") p = "/index.html"; else if (!path.extname(p)) p += ".html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end("nf"); } r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); r.end(d); });
});
const BLOCK = /openstreetmap|cloudflareinsights|googleapis|gstatic|challenges\.cloudflare|googlesyndication|doubleclick|google-analytics|\/api\//;
async function newPage(b, vp, errs, bad) {
  const p = await b.newPage({ viewport: vp });
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  p.on("response", (r) => { const u = r.url(); if (u.startsWith("http://127.0.0.1") && r.status() >= 400) bad.push(`${r.status()} ${u.replace(/^http:\/\/127\.0\.0\.1:\d+/, "")}`); });
  await p.route(/leaflet\.js/, (r) => r.fulfill({ path: LF + "/leaflet.js", contentType: "text/javascript" }));
  await p.route(/leaflet\.css/, (r) => r.fulfill({ path: LF + "/leaflet.css", contentType: "text/css" }));
  await p.route(BLOCK, (r) => r.abort());
  return p;
}

(async () => {
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const URL0 = "http://127.0.0.1:" + srv.address().port;
  const b = await chromium.launch();
  for (const k of keys) {
    const base = cfg.bases[k], S = k, data = loadData(base.data), places = data.places;
    const used = [...new Set(places.map((p) => p.cat))];
    // ===== desktop =====
    const errs = [], bad = [];
    const p = await newPage(b, { width: 1280, height: 900 }, errs, bad);
    await p.goto(`${URL0}/${base.page}`); await p.waitForTimeout(900);
    let info = { groups: {} };
    try {
    await p.evaluate(() => document.querySelectorAll(".ad-overlay").forEach((e) => e.remove()));
    info = await p.evaluate(() => {
      const per = {}; document.querySelectorAll('.grid[id^="grid-"]').forEach((g) => (per[g.id] = g.children.length));
      const cards = [...document.querySelectorAll(".card")];
      const c = map.getCenter();
      return { legend: document.querySelectorAll("#legendItems input").length, center: [c.lat, c.lng], cards: Object.values(per).reduce((a, x) => a + x, 0),
        emptyTabs: [...document.querySelectorAll(".cat-tab[data-cat]")].map((t) => t.dataset.cat).filter((c) => !["all", "map", "favorites", "events"].includes(c) && !c.startsWith("group:") && !per["grid-" + c]),
        wrongLinks: [...document.querySelectorAll(".card a.card-name")].filter((a) => !a.href.includes("base=" + CURRENT_BASE_KEY)).length,
        withStatus: cards.filter((c) => c.dataset.openstatus).length, nCards: cards.length, groups: CAT_GROUPS, total: places.length };
    });
    R.check(info.legend === used.length, S, `map legend has ${info.legend} toggles, expected ${used.length} (categories with listings)`);
    R.check(base.refs.some((r) => Math.abs(r[0] - info.center[0]) < 0.3 && Math.abs(r[1] - info.center[1]) < 0.3), S, `map centred at ${info.center.map((x) => x.toFixed(2))}, not on this base`);
    R.check(info.cards === places.length, S, `${info.cards} cards rendered, data has ${places.length}`);
    R.check(!info.emptyTabs.length, S, `tabs with no cards: ${info.emptyTabs}`);
    R.check(info.wrongLinks === 0, S, `${info.wrongLinks} card links lack base=${k} (worker would default to ramstein)`);
    const cov = info.withStatus / Math.max(1, info.nCards);
    if (cov < 0.5) R.warn(S, `only ${(cov * 100).toFixed(0)}% of cards have a parseable Open/Closed status`);
    // groups
    const vis = () => p.evaluate(() => ({ cards: [...document.querySelectorAll(".card")].filter((c) => c.offsetParent !== null).length,
      cats: [...new Set([...document.querySelectorAll(".card")].filter((c) => c.offsetParent !== null).map((c) => c.dataset.cat))],
      ev: document.getElementById("eventsGrid") ? document.getElementById("eventsGrid").offsetParent !== null : false,
      openRows: [...document.querySelectorAll(".sub-row.open")].map((r) => r.dataset.group), active: document.querySelector(".cat-tab.active").dataset.cat,
      parent: [...document.querySelectorAll(".group-tab.parent-active")].map((t) => t.dataset.group) }));
    let sum = 0;
    for (const [g, cats] of Object.entries(info.groups)) {
      const want = places.filter((x) => cats.includes(x.cat)).length; sum += want;
      await p.click(`.group-tab[data-group="${g}"]`); await p.waitForTimeout(120);
      const v = await vis();
      R.check(v.cards === want && v.cats.every((c) => cats.includes(c)) && v.openRows.join() === g && v.active === "group:" + g, S, `group "${g}" shows ${v.cards} cards (want ${want}), rows [${v.openRows}]`);
      const first = cats.find((c) => c !== "events");
      await p.click(`.sub-tab[data-cat="${first}"]`); await p.waitForTimeout(120);
      const w = await vis(), wantF = places.filter((x) => x.cat === first).length;
      R.check(w.cards === wantF && w.cats.every((c) => c === first) && w.parent.join() === g, S, `sub-tab "${first}" shows ${w.cards} cards (want ${wantF})`);
      if (cats.includes("events")) { await p.click(`.sub-tab[data-cat="events"]`); await p.waitForTimeout(120); const e = await vis(); R.check(e.ev && e.cards === 0, S, "Seasonal Events tab should show the events grid and no listing cards"); }
    }
    R.check(sum === places.length, S, `groups cover ${sum} listings but data has ${places.length}`);
    await p.click('.cat-tab[data-cat="all"]'); await p.waitForTimeout(120);
    const all = await vis(); R.check(all.cards === places.length && all.openRows.length === 0, S, `"All" shows ${all.cards}/${places.length} cards`);
    // search finds a known listing
    const probe = places[Math.floor(places.length / 2)].name;
    await p.fill("#searchBox", probe); await p.waitForTimeout(300);
    const found = await p.evaluate((n) => [...document.querySelectorAll(".card")].filter((c) => c.offsetParent !== null && c.dataset.placename === n).length, probe);
    R.check(found >= 1, S, `searching "${probe}" didn't show that listing`); await p.fill("#searchBox", ""); await p.waitForTimeout(100);
    // map tab + legend toggle hides pins
    await p.click('.cat-tab[data-cat="map"]'); await p.waitForTimeout(300);
    const mp = await p.evaluate(() => ({ shown: document.getElementById("map-section").offsetParent !== null, n: document.querySelectorAll("#legendItems input").length }));
    R.check(mp.shown && mp.n === used.length, S, `map view: visible=${mp.shown}, legend=${mp.n}`);
    R.check(errs.length === 0, S, `page errors: ${errs.slice(0, 3).join(" | ")}`);
    R.check(bad.length === 0, S, `local requests failed: ${[...new Set(bad)].slice(0, 5).join(", ")}`);
    } catch (e) { R.fail(S, `page broke while testing: ${e.message.split("\n")[0]} | page errors: ${errs.slice(0, 3).join(" | ")}`); }
    await p.close();
    // ===== mobile =====
    const e2 = [], b2 = [];
    const m = await newPage(b, { width: 390, height: 844 }, e2, b2);
    await m.goto(`${URL0}/${base.page}`); await m.waitForTimeout(700);
    await m.evaluate(() => document.querySelectorAll(".ad-overlay").forEach((e) => e.remove()));
    R.check(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), S, "page scrolls sideways at 390px width");
    const g0 = Object.keys(info.groups)[0];
    if (g0) { await m.click('.group-tab[data-group="' + g0 + '"]'); await m.waitForTimeout(150);
      R.check(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), S, "page scrolls sideways at 390px with a group open"); }
    R.check(e2.length === 0, S, `mobile page errors: ${e2.slice(0, 2)}`);
    await m.close();
    // ===== listing pages (first / middle / last) =====
    for (const pl of [places[0], places[Math.floor(places.length / 2)], places[places.length - 1]]) {
      const le = [], lb = [], lp = await newPage(b, { width: 1000, height: 800 }, le, lb);
      await lp.goto(`${URL0}/listing?base=${k}&id=${encodeURIComponent(pl.id)}`); await lp.waitForTimeout(500);
      const r = await lp.evaluate(() => ({ h1: (document.querySelector("h1") || {}).textContent || "", back: (document.querySelector(".back-link") || {}).getAttribute?.("href") || "", canon: (document.querySelector('link[rel="canonical"]') || {}).href || "" }));
      R.check(r.h1.trim() === pl.name, S, `listing ${pl.id}: heading is "${r.h1.trim().slice(0, 40)}", expected "${pl.name}"`);
      R.check(r.back === base.page, S, `listing ${pl.id}: back link goes to "${r.back}", expected ${base.page}`);
      R.check(r.canon.includes(`base=${k}`) && r.canon.includes(pl.id) && !/\.html/.test(r.canon), S, `listing ${pl.id}: canonical is "${r.canon}"`);
      R.check(le.length === 0, S, `listing ${pl.id} page errors: ${le[0]}`);
      await lp.close();
    }
  }
  // ===== guides =====
  if (!only.length) {
    const seenKeys = new Set();
    for (const k of Object.keys(cfg.bases)) {
      const g = cfg.bases[k].guide, errs = [], bad = [], p = await newPage(b, { width: 900, height: 900 }, errs, bad);
      await p.goto(`${URL0}/${g}`); await p.waitForTimeout(400);
      const info = await p.evaluate(() => ({ boxes: document.querySelectorAll(".check-input").length, ids: [...document.querySelectorAll("li[data-id]")].map((l) => l.dataset.id) }));
      R.check(info.boxes > 5 && info.boxes === info.ids.length && new Set(info.ids).size === info.ids.length, g, `checklist: ${info.boxes} boxes, ${info.ids.length} ids (${new Set(info.ids).size} unique)`);
      await p.locator(".check-input").nth(0).check(); await p.reload(); await p.waitForTimeout(300);
      const after = await p.evaluate(() => ({ lab: document.getElementById("progressLabel")?.textContent || "", keys: Object.keys(localStorage).filter((x) => /checklist/.test(x)) }));
      R.check(/^1 of /.test(after.lab.trim()), g, `progress after reload is "${after.lab}" (state not persisted)`);
      R.check(after.keys.length === 1 && !seenKeys.has(after.keys[0]), g, `localStorage key ${after.keys} must be unique per guide`); after.keys.forEach((x) => seenKeys.add(x));
      R.check(after.keys[0] === "arrival_checklist_" + k, g, `localStorage key is "${after.keys[0]}", expected arrival_checklist_${k}`);
      R.check(errs.length === 0 && bad.length === 0, g, `errors: ${[...errs, ...bad].slice(0, 2)}`);
      await p.close();
    }
    // ===== index + search + other pages =====
    for (const pg of ["index", "search", "about", "privacy", "terms", "suggest", "404"]) {
      const errs = [], bad = [], p = await newPage(b, { width: 390, height: 800 }, errs, bad);
      await p.goto(`${URL0}/${pg}.html`); await p.waitForTimeout(700);
      await p.evaluate(() => document.querySelectorAll(".ad-overlay").forEach((e) => e.remove()));
      R.check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), pg, "scrolls sideways at 390px");
      R.check(errs.length === 0, pg, `page errors: ${errs.slice(0, 2)}`);
      R.check(bad.filter((x) => !/^404 \/404/.test(x)).length === 0, pg, `local requests failed: ${bad.slice(0, 3)}`);
      if (pg === "index") R.check((await p.locator(".base-row").count()) === Object.keys(cfg.bases).length, pg, "base cards count");
      if (pg === "search") {
        for (const k of Object.keys(cfg.bases)) {
          const nm = loadData(cfg.bases[k].data).places[3].name;
          await p.fill("#searchInput", nm); await p.waitForTimeout(500);
          const n = await p.evaluate(() => document.querySelectorAll("#resultsGrid > *").length);
          R.check(n >= 1, "search", `searching "${nm}" (${k}) returns nothing`);
        }
      }
      await p.close();
    }
  }
  await b.close(); srv.close();
  process.exit(R.print() ? 0 : 1);
})().catch((e) => { console.error("browser check crashed:", e); srv.close(); process.exit(2); });
