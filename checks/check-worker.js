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
      }
      const pg = await get("/" + b.page.replace(".html", "")); const pg2 = pg.s >= 300 && pg.s < 400 ? await get(pg.h.get("location")) : pg;
      R.check(pg2.s === 200 && pg2.t.includes("CURRENT_BASE_KEY"), k, `base page /${b.page} returned ${pg2.s}`);
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
