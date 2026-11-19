const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = (f) => fs.existsSync(path.join(ROOT, f));
// Load a data-*.js file the same way the browser does (top-level const -> var so vm exposes it).
function loadData(file) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(read(file).replace(/^const /gm, "var "), ctx, { filename: file });
  return ctx;
}
function hav(a, b, c, d) {
  const r = (x) => (x * Math.PI) / 180, dl = r(c - a), dn = r(d - b);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dn / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// Remove the element that starts at `marker` (balanced <div>…</div>), used to ignore the base switcher.
function stripDiv(html, marker) {
  const i = html.indexOf(marker); if (i < 0) return html;
  const re = /<div\b|<\/div>/g; re.lastIndex = i; let depth = 0, m;
  while ((m = re.exec(html))) { depth += m[0] === "</div>" ? -1 : 1; if (depth === 0) return html.slice(0, i) + html.slice(re.lastIndex); }
  return html;
}
class Report {
  constructor(title) { this.title = title; this.fails = []; this.warns = []; this.passes = 0; }
  ok(n = 1) { this.passes += n; }
  fail(scope, msg) { this.fails.push([scope, msg]); }
  warn(scope, msg) { this.warns.push([scope, msg]); }
  check(cond, scope, msg) { cond ? this.ok() : this.fail(scope, msg); return !!cond; }
  print() {
    const g = (arr) => arr.reduce((m, [s, x]) => ((m[s] = m[s] || []).push(x), m), {});
    console.log(`\n== ${this.title}: ${this.passes} checks passed, ${this.fails.length} FAILED, ${this.warns.length} warnings`);
    for (const [s, xs] of Object.entries(g(this.fails))) { console.log(`  FAIL [${s}]`); xs.slice(0, 12).forEach((x) => console.log("    - " + x)); if (xs.length > 12) console.log(`    … and ${xs.length - 12} more`); }
    for (const [s, xs] of Object.entries(g(this.warns))) { console.log(`  warn [${s}]`); xs.slice(0, 6).forEach((x) => console.log("    - " + x)); if (xs.length > 6) console.log(`    … and ${xs.length - 6} more`); }
    return this.fails.length === 0;
  }
}
module.exports = { ROOT, read, exists, loadData, hav, stripDiv, Report };
