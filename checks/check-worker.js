// Runs the real Cloudflare worker locally (wrangler dev --local) and checks routing + per-listing share tags.
// Catches: worker not injecting <title>/og tags, assets bypassing the worker, /api/* falling into the 404 page,
// `new Function`/eval usage (forbidden on Workers), and base keys missing from the worker.
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), net = require("net");
const { ROOT, loadData, Report, read } = require("./lib");
const cfg = require("./config");
const R = new Report("worker");
R.check(!/\bnew Function\s*\(|\beval\s*\(/.test(read("_worker.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")), "worker", "_worker.js uses eval/new Function — Cloudflare Workers forbid it");
const wr = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
const rwf = wr.assets && wr.assets.run_worker_first;
R.check(Array.isArray(rwf) ? rwf.includes("/api/*") && rwf.includes("/listing") : rwf === true, "wrangler", 'assets.run_worker_first must include "/listing" and "/api/*"');
for (const k of Object.keys(cfg.bases)) R.check(rwf === true || (Array.isArray(rwf) && rwf.includes("/" + cfg.bases[k].page.replace(".html", ""))), "wrangler", `assets.run_worker_first is missing "/${cfg.bases[k].page.replace(".html", "")}" — the base page won't be pre-filled for crawlers`);
for (const k of Object.keys(cfg.bases)) R.check(fs.existsSync(path.join(ROOT, "og", k + ".jpg")), "og", `og/${k}.jpg (share image) is missing`);

function wranglerBin() {
  for (const c of [process.env.WRANGLER_BIN, "/tmp/wr/node_modules/.bin/wrangler", path.join(os.tmpdir(), "mtd-wrangler/node_modules/.bin/wrangler")]) if (c && fs.existsSync(c)) return c;
  const dir = path.join(os.tmpdir(), "mtd-wrangler"); fs.mkdirSync(dir, { recursive: true });
  console.log("installing wrangler for the worker test…"); cp.execSync("npm i --silent --no-audit --no-fund wrangler@4", { cwd: dir, stdio: "inherit" });
  return path.join(dir, "node_modules/.bin/wrangler");
}
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

(async () => {
  const port = await freePort(), persist = fs.mkdtempSync(path.join(os.tmpdir(), "mtd-persist-"));
  const proc = cp.spawn(wranglerBin(), ["dev", "--local", "--port", String(port), "--persist-to", persist, "--log-level", "error"], { cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" } });
  let log = ""; proc.stdout.on("data", (d) => (log += d)); proc.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const get = async (p, o = {}) => { const r = await fetch(base + p, { redirect: "manual", ...o }); return { s: r.status, h: r.headers, t: await r.text() }; };
  let up = false; for (let i = 0; i < 90 && !up; i++) { await new Promise((r) => setTimeout(r, 1000)); try { await fetch(base + "/robots.txt"); up = true; } catch (e) {} }
  if (!up) { R.fail("worker", "wrangler dev did not start:\n" + log.slice(-600)); proc.kill(); process.exit(R.print() ? 0 : 1); }
  try {
    for (const k of Object.keys(cfg.bases)) {
      const b = cfg.bases[k], places = loadData(b.data).places;
      for (const pl of [places[1], places[places.length - 2]]) {
        const r = await get(`/listing?base=${k}&id=${encodeURIComponent(pl.id)}`);
        R.check(r.s === 200, k, `/listing ${pl.id} returned ${r.s}`);
        const title = (r.t.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
        R.check(title.includes(esc(pl.name)) || title.includes(pl.name), k, `/listing ${pl.id}: <title> is "${title}" — worker didn't inject the listing name`);
        const og = (r.t.match(/property="og:title" content="([^"]*)"/) || [])[1] || "";
        R.check(og.includes(esc(pl.name)) || og.includes(pl.name), k, `/listing ${pl.id}: og:title is "${og}"`);
        R.check(r.t.includes(`https://militarythingstodo.com/listing?base=${k}&id=${pl.id}`) || r.t.includes(`base=${k}&amp;id=${pl.id}`), k, `/listing ${pl.id}: canonical URL not injected`);
        // readable without JavaScript: real heading + description in the HTML, never the "loading"/"not found" shells
        const h1s = [...r.t.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]);
        R.check(h1s.length === 1 && (h1s[0] === esc(pl.name) || h1s[0] === pl.name), k, `/listing ${pl.id}: raw HTML headings are ${JSON.stringify(h1s)} — crawlers without JavaScript should see the listing name`);
        const body = (r.t.split("<body")[1] || "").replace(/<script[\s\S]*?<\/script>/g, "");
        R.check(pl.blurb && body.includes(esc(pl.blurb).slice(0, 40)), k, `/listing ${pl.id}: description is not in the raw HTML`);
        const ld = [...r.t.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
        let ok = ld.length >= 2; try { ld.forEach((x) => JSON.parse(x)); } catch { ok = false; }
        R.check(ok, k, `/listing ${pl.id}: structured data missing or not valid JSON (${ld.length} blocks)`);
        R.check(!ld.some((x) => /aggregateRating/i.test(x)) && !/aggregateRating\s*[:=]/.test(r.t), k, `/listing ${pl.id}: aggregateRating in the markup — the ratings are Google's, and Google forbids marking up other sites' ratings`);
        R.check(/property="og:image" content="https:\/\/militarythingstodo\.com\/og\/[a-z]+\.jpg"/.test(r.t), k, `/listing ${pl.id}: no og:image`);
      }
      const missing = await get(`/listing?base=${k}&id=no-such-listing-xyz`);
      R.check(missing.s === 404 && /Listing not found/.test(missing.t), k, `unknown listing id returned ${missing.s} — should be a real 404`);
      const pg = await get("/" + b.page.replace(".html", "")); const pg2 = pg.s >= 300 && pg.s < 400 ? await get(pg.h.get("location")) : pg;
      R.check(pg2.s === 200 && pg2.t.includes("CURRENT_BASE_KEY"), k, `base page /${b.page} returned ${pg2.s}`);
      const links = new Set([...pg2.t.matchAll(new RegExp(`href="/listing\\?base=${k}&amp;id=([^"]+)"`, "g"))].map((m) => m[1]));
      R.check(links.size === places.length, k, `base page raw HTML links to ${links.size}/${places.length} listings — the worker should pre-fill every card for crawlers without JavaScript`);
      const dj = await get("/" + b.data); R.check(dj.s === 200 && /javascript/.test(dj.h.get("content-type") || ""), k, `${b.data} returned ${dj.s} (${dj.h.get("content-type")})`);
    }
    const a = await get("/api/reviews?placeId=checks-probe");
    R.check(/json/.test(a.h.get("content-type") || ""), "api", `/api/reviews is not served by the worker (content-type ${a.h.get("content-type")}, status ${a.s}) — check run_worker_first`);
    const a2 = await get("/api/suggestions");
    R.check(/json/.test(a2.h.get("content-type") || "") , "api", `/api/suggestions not JSON (status ${a2.s})`);
    const nf = await get("/definitely-not-a-page-xyz"); R.check(nf.s === 404, "404", `unknown path returned ${nf.s}, expected 404`);
    const bad = await get("/listing?base=nope&id=nope"); R.check(bad.s < 500, "listing", `bad listing id returned ${bad.s}`);
    const sm = await get("/sitemap.xml"); R.check(sm.s === 200 && sm.t.includes("<urlset"), "sitemap", "sitemap.xml not served");
  } catch (e) { R.fail("worker", "check crashed: " + e.message); }
  proc.kill("SIGKILL"); fs.rmSync(persist, { recursive: true, force: true });
  process.exit(R.print() ? 0 : 1);
})();
