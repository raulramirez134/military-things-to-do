// Mutation self-test: breaks a copy of the site in known ways and confirms the suite notices every time.
// If a mutation is NOT caught, that check has silently stopped working. Run: node checks/selftest.js
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mtd-selftest-"));
const copy = () => { fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  cp.execSync(`tar -C "${ROOT}" --exclude=.git --exclude=node_modules --exclude=.wrangler -cf - . | tar -C "${tmp}" -xf -`); };
const edit = (f, fn) => { const p = path.join(tmp, f), s = fs.readFileSync(p, "utf8"), t = fn(s); if (t === s) throw new Error("mutation did nothing: " + f); fs.writeFileSync(p, t); };
const M = [
  ["duplicate listing id", "static", () => edit("data-norfolk.js", (s) => { const ids = [...s.matchAll(/^  \{ id:"([^"]+)"/gm)]; return s.replace(`id:"${ids[5][1]}"`, `id:"${ids[1][1]}"`); }), /duplicate id/],
  ["dist stored in miles", "static", () => edit("data-fortbragg.js", (s) => s.replace(/dist:[0-9.]+/, "dist:0.01")), /dist .* but pin is/],
  ["leftover other-base hospital", "static", () => edit("yokota.html", (s) => s.replace('id="eventsLabel">', 'id="eventsLabel">Womack ')), /belongs to fortbragg/],
  ["wrong data script", "static", () => edit("humphreys.html", (s) => s.replace('src="data-humphreys.js"', 'src="data.js"')), /loads data scripts/],
  ["wrong timezone", "static", () => edit("humphreys.html", (s) => s.replace('"Asia/Seoul"', '"Europe/Berlin"')), /HUB_TIME_ZONE/],
  ["category missing colour", "static", () => edit("yokota.html", (s) => s.replace('legal:"#3f5c6b", ', "")), /no colour in the colour map/],
  ["category missing from render loop", "static", () => edit("yokota.html", (s) => s.replace(',"legal"]', "]")), /render-loop/],
  ["category missing from groups", "static", () => edit("yokota.html", (s) => s.replace(', "legal"],', "],")), /CAT_GROUPS/],
  ["sitemap entry removed", "static", () => edit("sitemap.xml", (s) => s.replace(/.*id=yokota-ab-legal-office.*\n/, "")), /missing from sitemap/],
  ["3 listings on one pin", "static", () => edit("data-yokota.js", (s) => { let n = 0; return s.replace(/lat:[\d.]+, lng:[\d.]+/g, (m) => (n++ < 3 ? "lat:35.74, lng:139.34" : m)); }), /share the exact pin/],
  ["base switcher entry removed", "static", () => edit("ramstein.html", (s) => s.replace(/<a class="opt" href="norfolk.html">[^\n]*\n/, "")), /base switcher links/],
  ["stats text stale", "static", () => edit("yokota.html", (s) => s.replace("<b>92</b> locations", "<b>81</b> locations")), /stats say 81/],
  ["closed business listed", "static", () => edit("data-fortbragg.js", (s) => s.replace(/name:"[^"]+"/, 'name:"Bahama Breeze"')), /must not be listed/],
  ["wrong Start Guide link", "static", () => edit("humphreys.html", (s) => s.replace(/href="guide-humphreys.html"/, 'href="guide.html"')), /Start Guide/],
  ["base missing from worker", "static", () => edit("_worker.js", (s) => s.replace('"norfolk", "humphreys"]', '"norfolk"]')), /VALID_BASE_KEYS/],
  ["banned tattoo category (Humphreys)", "static", () => edit("data-humphreys.js", (s) => s.replace(/cat:"phone"/, 'cat:"tattoo"')), /banned for humphreys/],
  ["canonical with .html", "static", () => edit("about.html", (s) => s.replace(/(rel="canonical" href="[^"]+?)"/, '$1.html"')), /clean URL/],
  ["JS runtime error on page", "browser:ramstein", () => edit("ramstein.html", (s) => s.replace("const CURRENT_BASE_KEY", "undefinedFunctionCall();\nconst CURRENT_BASE_KEY")), /page errors/],
  ["card links lose base=", "browser:fortbragg", () => edit("fortbragg.html", (s) => s.replace(/class="card-name" href="listing\.html\?base=fortbragg&id=/, 'class="card-name" href="listing.html?id=')), /lack base=|page errors|card links/],
];
let missed = 0;
for (const [name, kind, mut, re] of M) {
  copy(); try { mut(); } catch (e) { console.log(`?? ${name}: could not apply mutation (${e.message})`); missed++; continue; }
  const args = kind === "static" ? ["checks/check-static.js"] : ["checks/check-browser.js", kind.split(":")[1]];
  const r = cp.spawnSync("node", args, { cwd: tmp, encoding: "utf8", env: { ...process.env, NODE_PATH: process.env.NODE_PATH || cp.execSync("npm root -g").toString().trim() }, timeout: 200000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const caught = r.status !== 0 && re.test(out);
  if (!caught) missed++;
  console.log(`${caught ? "caught " : "MISSED "} ${name}${caught ? "" : "\n" + out.split("\n").slice(0, 6).join("\n")}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(missed ? `\n${missed} mutation(s) not caught — fix the checks` : `\nall ${M.length} mutations caught`);
process.exit(missed ? 1 : 0);
