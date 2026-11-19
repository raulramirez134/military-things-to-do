// Listing baseline: per-base counts, per-category counts and listing ids at the last successful ship.
//   node checks/baseline.js            print what changed since the baseline
//   node checks/baseline.js --update   rewrite checks/baseline.json (ship.sh does this after the checks pass)
const fs = require("fs"), path = require("path");
const { loadData } = require("./lib");
const cfg = require("./config");
const FILE = path.join(__dirname, "baseline.json");
function snapshot() {
  const out = {};
  for (const [k, b] of Object.entries(cfg.bases)) {
    const places = loadData(b.data).places, cats = {};
    for (const p of places) cats[p.cat] = (cats[p.cat] || 0) + 1;
    out[k] = { total: places.length, cats, ids: places.map((p) => p.id).sort() };
  }
  return out;
}
function diff(cur, old) {
  const res = [];
  for (const k of Object.keys(cur)) {
    const o = old && old[k];
    if (!o) { res.push({ base: k, isNew: true, added: cur[k].ids, removed: [], dTotal: cur[k].total, catsGone: [], catChanges: {} }); continue; }
    const oi = new Set(o.ids), ci = new Set(cur[k].ids);
    const catChanges = {}, catsGone = [];
    for (const c of new Set([...Object.keys(cur[k].cats), ...Object.keys(o.cats)])) {
      const d = (cur[k].cats[c] || 0) - (o.cats[c] || 0);
      if (d) catChanges[c] = d;
      if (!cur[k].cats[c] && o.cats[c]) catsGone.push(c);
    }
    res.push({ base: k, isNew: false, added: cur[k].ids.filter((x) => !oi.has(x)), removed: o.ids.filter((x) => !ci.has(x)), dTotal: cur[k].total - o.total, catsGone, catChanges });
  }
  return res;
}
const load = () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : null);
module.exports = { snapshot, diff, load, FILE };
if (require.main === module) {
  const cur = snapshot();
  if (process.argv.includes("--update")) { fs.writeFileSync(FILE, JSON.stringify(cur) + "\n"); console.log("baseline updated:", Object.entries(cur).map(([k, v]) => `${k} ${v.total}`).join(", ")); }
  else for (const d of diff(cur, load())) console.log(d.base.padEnd(14), (d.dTotal >= 0 ? "+" : "") + d.dTotal, "listings", d.added.length ? `| added: ${d.added.join(", ")}` : "", d.removed.length ? `| REMOVED: ${d.removed.join(", ")}` : "");
}
