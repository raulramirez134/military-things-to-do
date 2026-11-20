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
  ["category missing from render loop", "static", () => edit("yokota.html", (s) => s.replace('"legal","schools"', '"schools"')), /render-loop/],
  ["category missing from groups", "static", () => edit("yokota.html", (s) => s.replace(', "legal"],', "],")), /CAT_GROUPS/],
  ["sitemap entry removed", "static", () => edit("sitemap.xml", (s) => s.replace(/.*id=yokota-ab-legal-office.*\n/, "")), /missing from sitemap/],
  ["3 listings on one pin", "static", () => edit("data-yokota.js", (s) => { let n = 0; return s.replace(/lat:[\d.]+, lng:[\d.]+/g, (m) => (n++ < 3 ? "lat:35.74, lng:139.34" : m)); }), /share the exact pin/],
  ["base switcher entry removed", "static", () => edit("ramstein.html", (s) => s.replace(/<a class="opt" href="\/norfolk">[^\n]*\n/, "")), /base switcher links/],
  ["stats text stale", "static", () => edit("yokota.html", (s) => s.replace(/<b>\d+<\/b> locations/, "<b>81</b> locations")), /stats say 81/],
  ["closed business listed", "static", () => edit("data-fortbragg.js", (s) => s.replace(/name:"[^"]+"/, 'name:"Bahama Breeze"')), /must not be listed/],
  ["internal link uses .html", "static", () => edit("about.html", (s) => s.replace('href="/suggest"', 'href="suggest.html"')), /internal link/],
  ["breadcrumb data removed from a guide", "static", () => edit("guide-yokota.html", (s) => s.replace(/<script type="application\/ld\+json">[^\n]*BreadcrumbList[^\n]*<\/script>\n/, "")), /BreadcrumbList/],
  ["search page indexable again", "static", () => edit("search.html", (s) => s.replace('<meta name="robots" content="noindex, follow">', "")), /noindex/],
  ["wrong Start Guide link", "static", () => edit("humphreys.html", (s) => s.replace(/href="\/guide-humphreys"/, 'href="/guide"')), /Start Guide/],
  ["base missing from worker", "static", () => edit("_worker.js", (s) => s.replace('"humphreys", "campbell"]', '"humphreys"]')), /VALID_BASE_KEYS/],
  ["banned tattoo category (Humphreys)", "static", () => edit("data-humphreys.js", (s) => s.replace(/cat:"phone"/, 'cat:"tattoo"')), /banned for humphreys/],
  ["canonical with .html", "static", () => edit("about.html", (s) => s.replace(/(rel="canonical" href="[^"]+?)"/, '$1.html"')), /clean URL/],
  ["JS runtime error on page", "browser:ramstein", () => edit("ramstein.html", (s) => s.replace("const CURRENT_BASE_KEY", "undefinedFunctionCall();\nconst CURRENT_BASE_KEY")), /page errors/],
  ["card links lose base=", "browser:fortbragg", () => edit("fortbragg.html", (s) => s.replace(/class="card-name" href="\/listing\?base=fortbragg&id=/, 'class="card-name" href="/listing?id=')), /lack base=|page errors|card links/],
  ["secret committed (Discord webhook)", "static", () => edit("about.html", (s) => s.replace("</body>", "<!-- " + "https://discord.com/api/" + "webhooks/123456789012345678/" + "abcdefghijklmnopqrstuvwxyz0123456789 -->\n</body>")), /Discord webhook/],
  ["private key committed", "static", () => edit("privacy.html", (s) => s.replace("</body>", "<!-- -----BEGIN RSA PRIV" + "ATE KEY----- -->\n</body>")), /private key/],
  ["listing duplicated under a new id", "static", () => edit("data-yokota.js", (s) => { const m = s.match(/^  \{ id:"([^"]+)".*$/m); return s.replace(m[0], m[0] + "\n" + m[0].replace(`id:"${m[1]}"`, `id:"${m[1]}-copy"`)); }), /duplicate listing|identical blurb/],
  ["same blurb pasted on two listings", "static", () => edit("data-norfolk.js", (s) => { const bl = [...s.matchAll(/blurb:("(?:[^"\\]|\\.)*")/g)]; return s.replace(bl[4][0], "blurb:" + bl[3][1]); }), /identical blurb/],
  ["5 listings deleted by accident", "static", () => edit("data-yokota.js", (s) => { let n = 0; return s.split("\n").filter((l) => !(l.startsWith("  { id:") && n++ < 5)).join("\n"); }), /disappeared since the last ship/],
  ["ad put back into a pop-up", "static", () => edit("norfolk.html", (s) => s.replace('<div class="ad-overlay hidden" id="welcomeOverlay">', '<div class="ad-overlay hidden" id="welcomeOverlay"><ins class="adsbygoogle" data-ad-slot="1"></ins>')), /AdSense unit sits inside a pop-up/],
  ["All view no longer capped", "browser:humphreys", () => edit("humphreys.html", (s) => s.replace("const CAP_PER_SECTION = 6;", "const CAP_PER_SECTION = 999;")), /sections over 6|Show-all/],
  ["worker stops pre-filling base pages", "worker", () => edit("_worker.js", (s) => s.replace("if (!places.length) return passthrough;", "return passthrough;")), /pre-fill every card/],
  ["Google ratings back in the markup", "worker", () => edit("_worker.js", (s) => s.replace("if (place.phone) ld.telephone = place.phone;", "if (place.phone) ld.telephone = place.phone; ld.aggregateRating = { ratingValue: 4 };")), /aggregateRating in the markup/],
  ["listing page loses its no-JS content", "worker", () => edit("_worker.js", (s) => s.replace("html = html.replace('<div class=\"main-col\" id=\"mainContent\"></div>', main);", "")), /description is not in the raw HTML/],
  ["timezone off by an hour", "browser:ramstein", () => edit("hours.js", (s) => s.replace("minutes: hour * 60 + minute, month", "minutes: hour * 60 + minute + 60, month")), /clock check|should be/],
  ["Open/Closed logic inverted", "browser:fortbragg", () => edit("hours.js", (s) => s.replace("if (t >= hs && t < he) return true;", "if (t >= hs && t < he) return false;")), /should be (Open|Closed)/],
  ["motion layer not loaded", "static", () => edit("norfolk.html", (s) => s.replace('<script src="/motion.js"></script>', "")), /lenis\.min\.js.*motion\.js/],
  ["cards never reveal", "browser:yokota", () => edit("motion.js", (s) => s.replace('el.classList.remove("mtd-pending");', "")), /stayed invisible/],
  ["hours parser unit regression", "static", () => edit("hours.js", (s) => s.replace('if (part === "weekends" || part === "weekend")', 'if (false)')), /unit tests fail/],
  ["hours parser drops a format for many listings", "static", () => edit("hours.js", (s) => s.replace("spec.split(/\\s*(?:,|&|\\band\\b)\\s*/)", "spec.split(/\\s*,\\s*/)")), /stopped being readable|unit tests fail/],
  ["old inline hours parser pasted back", "static", () => edit("norfolk.html", (s) => s.replace("// Open/Closed parsing (parseHoursString", "function parseHoursString(x){ return null; }\n// Open/Closed parsing (parseHoursString")), /defines its own parseHoursString/],
  ["page forgets to load hours.js", "static", () => edit("search.html", (s) => s.replace('<script src="/hours.js"></script>', "")), /must load/],
  ["12-hour time in hours field", "static", () => edit("data.js", (s) => s.replace('hours:"Mon–Fri 9–18 · Sat 9–17"', 'hours:"Mon–Fri 9–6 · Sat 9–5"')), /12-hour time/],
  // ---- base-quality checks (checks/check-quality.js) ----
  ["Q01 share image is not a 1200x630 JPEG", "quality", () => fs.writeFileSync(path.join(tmp, "og/yokota.jpg"), "not a jpeg"), /Q01/],
  ["Q02 page points at another base's share image", "quality", () => edit("humphreys.html", (s) => s.replace("og/humphreys.jpg", "og/yokota.jpg")), /Q02/],
  ["Q03 base missing from run_worker_first", "quality", () => edit("wrangler.jsonc", (s) => s.replace(', "/campbell"', "")), /Q03/],
  ["Q04 base missing from llms.txt", "quality", () => edit("llms.txt", (s) => s.replace("militarythingstodo.com/campbell)", "militarythingstodo.com/campbel)")), /Q04/],
  ["Q05 worker config has the wrong unit", "quality", () => edit("_worker.js", (s) => s.replace('unit: "mi", dataFile: "data-campbell.js"', 'unit: "km", dataFile: "data-campbell.js"')), /Q05/],
  ["Q06 robots.txt loses the sitemap line", "quality", () => edit("robots.txt", (s) => s.replace(/^Sitemap:.*$/im, "")), /Q06/],
  ["Q07 meta description far too short", "quality", () => edit("norfolk.html", (s) => s.replace(/(<meta name="description" content=")[^"]*"/, '$1Norfolk."')), /Q07/],
  ["Q08 second h1 on a guide", "quality", () => edit("guide-yokota.html", (s) => s.replace("</body>", "<h1>Another title</h1></body>")), /Q08/],
  ["Q09 guide loses lang attribute", "quality", () => edit("guide-norfolk.html", (s) => s.replace('<html lang="en">', "<html>")), /Q09/],
  ["Q10 http:// link on a page", "quality", () => edit("about.html", (s) => s.replace("</body>", '<a href="http://example.com/x">x</a></body>')), /Q10/],
  ["Q11 new-tab link without noopener", "quality", () => edit("privacy.html", (s) => s.replace("</body>", '<a href="https://example.com" target="_blank">x</a></body>')), /Q11/],
  ["Q12 image without alt", "quality", () => edit("about.html", (s) => s.replace("</body>", '<img src="/og/home.jpg"></body>')), /Q12/],
  ["Q13 guide mentions another base's hospital", "quality", () => edit("guide-yokota.html", (s) => s.replace("</body>", "<p>Go to Womack Army Medical Center.</p></body>")), /Q13/],
  ["Q14 base page far too heavy", "quality", () => edit("ramstein.html", (s) => s.replace("</body>", "<!-- " + "x".repeat(520 * 1024) + " --></body>")), /Q14/],
  ["Q16 money section has the wrong currency feed", "quality", () => edit("humphreys.html", (s) => s.replace('data-rates="won"', 'data-rates="yen"')), /Q16/],
  ["Q17 listing id with capitals", "quality", () => edit("data-norfolk.js", (s) => s.replace(/id:"([a-z])/, (m, c) => `id:"${c.toUpperCase()}`)), /Q17/],
  ["Q18 broken umlaut (mojibake) in a blurb", "quality", () => edit("data.js", (s) => s.replace(/blurb:"/, 'blurb:"KÃ¤se ')), /Q18/],
  ["Q20 ALL CAPS listing name", "quality", () => edit("data-norfolk.js", (s) => s.replace(/name:"[^"]+"/, 'name:"NORFOLK MARKET PLACE"')), /Q20/],
  ["Q22 phone made of words", "quality", () => edit("data-campbell.js", (s) => s.replace(/phone:"[^"]+"/, 'phone:"call us now"')), /Q22/],
  ["Q25 essential category (banking) missing", "quality", () => edit("data-campbell.js", (s) => s.replace(/cat:"banking"/g, 'cat:"services"')), /Q25/],
  ["Q27 listing with no hours text", "quality", () => edit("data-yokota.js", (s) => s.replace(/hours:"[^"]+"/, 'hours:""')), /Q27/],
  ["Q28 events section loses its dates", "quality", () => edit("yokota.html", (s) => s.replace(/Typical dates/g, "Dates")), /Q28/],
  ["Q29 sitemap date in the future", "quality", () => edit("sitemap.xml", (s) => s.replace(/<lastmod>[^<]+/, "<lastmod>2099-01-01")), /Q29/],
];
let missed = 0;
for (const [name, kind, mut, re] of M) {
  copy(); try { mut(); } catch (e) { console.log(`?? ${name}: could not apply mutation (${e.message})`); missed++; continue; }
  const args = kind === "static" ? ["checks/check-static.js"] : kind === "quality" ? ["checks/check-quality.js"] : kind === "worker" ? ["checks/check-worker.js"] : ["checks/check-browser.js", kind.split(":")[1]];
  const r = cp.spawnSync("node", args, { cwd: tmp, encoding: "utf8", env: { ...process.env, NODE_PATH: process.env.NODE_PATH || cp.execSync("npm root -g").toString().trim() }, timeout: 400000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const caught = r.status !== 0 && re.test(out);
  if (!caught) missed++;
  console.log(`${caught ? "caught " : "MISSED "} ${name}${caught ? "" : "\n" + out.split("\n").slice(0, 6).join("\n")}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(missed ? `\n${missed} mutation(s) not caught — fix the checks` : `\nall ${M.length} mutations caught`);
process.exit(missed ? 1 : 0);
