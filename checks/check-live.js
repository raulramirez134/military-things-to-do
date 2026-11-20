// Post-deploy check against the live site. Run: node checks/check-live.js [--wait]
// --wait polls (up to ~6 min) until the live files are byte-identical to the local ones, i.e. the deploy finished.
const fs = require("fs"), crypto = require("crypto"), cp = require("child_process"), path = require("path");
const { ROOT, read, exists, loadData, Report } = require("./lib");
const cfg = require("./config");
const R = new Report("live");
const SITE = process.env.SITE_URL || cfg.siteUrl;
function curl(url, { follow = true } = {}) {
  const out = path.join(require("os").tmpdir(), "mtd-live-" + crypto.randomBytes(4).toString("hex"));
  try {
    const w = cp.execFileSync("curl", ["-s", ...(follow ? ["-L"] : []), "--max-time", "30", "-H", "Cache-Control: no-cache", "-o", out, "-w", "%{http_code}|%{content_type}|%{url_effective}|%{redirect_url}", url], { encoding: "utf8" }).split("|");
    return { s: +w[0], type: w[1], url: w[2], redirect: w[3], body: fs.readFileSync(out) };
  } catch (e) { return { s: 0, type: "", url, body: Buffer.alloc(0), err: e.message }; } finally { try { fs.unlinkSync(out); } catch (e) {} }
}
// Cloudflare injects a bot-challenge <script> before </body> and prepends managed content to robots.txt; ignore both.
const norm = (b) => b.toString().replace(/<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>/g, "")
  // the worker pre-fills each base page's empty category grids with plain cards for crawlers; compare the template
  .replace(/(<div class="grid" data-group="[a-z]+" id="grid-[a-z]+">)[^\n]*<\/div>\n/g, "$1</div>\n");
const sha = (b) => crypto.createHash("sha256").update(norm(b)).digest("hex");
const files = [];
for (const k of Object.keys(cfg.bases)) { const b = cfg.bases[k]; files.push([b.page.replace(".html", ""), b.page], [b.data, b.data], [b.guide.replace(".html", ""), b.guide]); }
files.push(["index.html", "index.html"], ["hours.js", "hours.js"], ["listing", "listing.html"], ["sitemap.xml", "sitemap.xml"], ["robots.txt", "robots.txt"], ["search", "search.html"]);
const stale = () => files.filter(([u, f]) => {
  const r = curl(`${SITE}/${u}?cb=${Date.now()}`); if (r.s !== 200) return true;
  const local = fs.readFileSync(path.join(ROOT, f));
  if (f === "robots.txt") return !r.body.toString().includes(local.toString().trim());
  return sha(r.body) !== sha(local);
}).map((x) => x[1]);

(async () => {
  if (process.argv.includes("--wait")) {
    const t0 = Date.now(); let s;
    while ((s = stale()).length && Date.now() - t0 < 6 * 60e3) { process.stdout.write(`waiting for deploy… ${s.length} file(s) differ (${s.slice(0, 3)})\n`); await new Promise((r) => setTimeout(r, 15000)); }
    if (s.length) R.fail("deploy", `live site still differs from local after 6 min: ${s.join(", ")}`); else R.ok();
  } else { const s = stale(); R.check(!s.length, "deploy", `live differs from local for: ${s.join(", ")}`); }

  for (const k of Object.keys(cfg.bases)) {
    const b = cfg.bases[k], places = loadData(b.data).places;
    const pg = curl(`${SITE}/${b.page.replace(".html", "")}`);
    R.check(pg.s === 200 && /CURRENT_BASE_KEY = "/.test(pg.body.toString()), k, `base page returned ${pg.s}`);
    const old = curl(`${SITE}/${b.page}`, { follow: false });
    R.check(old.s === 200 || (old.s >= 300 && old.s < 400), k, `/${b.page} returned ${old.s}`);
    const dj = curl(`${SITE}/${b.data}`); R.check(dj.s === 200 && /javascript/.test(dj.type), k, `${b.data}: ${dj.s} ${dj.type}`);
    for (const pl of [places[0], places[places.length - 1]]) {
      const r = curl(`${SITE}/listing?base=${k}&id=${encodeURIComponent(pl.id)}`), t = r.body.toString();
      const title = (t.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
      const nm = pl.name.replace(/&/g, "&amp;");
      R.check(r.s === 200 && (title.includes(pl.name) || title.includes(nm)), k, `live listing ${pl.id}: status ${r.s}, <title> "${title}" (share preview not injected)`);
    }
  }
  const sm = curl(`${SITE}/sitemap.xml`).body.toString(), n = (sm.match(/<loc>/g) || []).length;
  const want = (read("sitemap.xml").match(/<loc>/g) || []).length;
  R.check(n === want, "sitemap", `live sitemap has ${n} URLs, local has ${want}`);
  const nf = curl(`${SITE}/definitely-not-a-page-xyz`, { follow: false }); R.check(nf.s === 404, "404", `unknown path returned ${nf.s}`);
  const api = curl(`${SITE}/api/reviews?placeId=checks-probe`); R.check(/json/.test(api.type), "api", `/api/reviews not JSON (${api.s} ${api.type})`);
  const idx = curl(`${SITE}/`); R.check(idx.s === 200 && /Find your base/i.test(idx.body.toString()), "index", `homepage ${idx.s}`);
  process.exit(R.print() ? 0 : 1);
})();
