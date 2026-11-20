// Base-quality checks (Q01-Q28): run when you create or edit a base. No browser, no network. Run: node checks/check-quality.js
// Scope names start with the check id ("Q07 …") so a failure says exactly which rule it broke.
// FAIL = broken for visitors/search engines. warn = quality to-do (never blocks a ship).
const fs = require("fs");
const { ROOT, read, exists, loadData, Report } = require("./lib");
const cfg = require("./config");
const R = new Report("quality");
const keys = Object.keys(cfg.bases);
const kmPerUnit = (u) => (u === "mi" ? 1.609344 : 1);
const textOf = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const strip = (s) => (typeof s === "string" ? s : "");
const sitePages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && f !== "admin.html");

// ---- jpeg size without a library (read the SOF marker) ----
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

const worker = read("_worker.js"), wrangler = read("wrangler.jsonc"), llms = exists("llms.txt") ? read("llms.txt") : "", robots = exists("robots.txt") ? read("robots.txt") : "";
const sitemap = read("sitemap.xml");

// ================= wiring & assets (per base) =================
for (const k of keys) {
  const b = cfg.bases[k], S = (id, n) => `${id} ${n} [${k}]`;
  const page = exists(b.page) ? read(b.page) : "", guide = exists(b.guide) ? read(b.guide) : "";
  const slug = b.page.replace(".html", "");

  // Q01 share image exists, is a real 1200x630 JPEG, and is small enough to load fast
  const ogf = `og/${k}.jpg`;
  if (R.check(exists(ogf), S("Q01", "share image"), `${ogf} is missing (make a 1200×630 JPEG)`)) {
    const buf = fs.readFileSync(`${ROOT}/${ogf}`), sz = jpegSize(buf);
    R.check(sz && sz.w === 1200 && sz.h === 630, S("Q01", "share image"), `${ogf} is ${sz ? sz.w + "×" + sz.h : "not a JPEG"}, expected 1200×630`);
    R.check(buf.length <= 400 * 1024, S("Q01", "share image"), `${ogf} is ${(buf.length / 1024) | 0} KB (keep it under 400 KB)`);
  }
  // Q02 the page and the guide point at THIS base's share image
  for (const [nm, h] of [["page", page], ["guide", guide]]) {
    const og = (h.match(/property="og:image" content="([^"]+)"/) || [])[1], tw = (h.match(/name="twitter:image" content="([^"]+)"/) || [])[1];
    R.check(og === `${cfg.siteUrl}/${ogf}` && tw === `${cfg.siteUrl}/${ogf}`, S("Q02", "og:image"), `${nm} og:image/twitter:image is ${og}/${tw}, expected ${cfg.siteUrl}/${ogf}`);
  }
  // Q03 the worker pre-fills the base page (needed for search engines): path is in run_worker_first
  R.check(new RegExp(`"/${slug}"`).test(wrangler.slice(wrangler.indexOf("run_worker_first"))), S("Q03", "wrangler"), `"/${slug}" is missing from assets.run_worker_first in wrangler.jsonc`);
  // Q04 llms.txt lists the base page and its guide
  R.check(llms.includes(`${cfg.siteUrl}/${slug}`) && llms.includes(`${cfg.siteUrl}/${b.guide.replace(".html", "")})`), S("Q04", "llms.txt"), `llms.txt must link ${cfg.siteUrl}/${slug} and /${b.guide.replace(".html", "")}`);
  // Q05 the worker's listing config matches the data file and unit for this base
  const wc = worker.match(new RegExp(`\\b${k}: \\{[^}]*\\}`)), wcs = wc ? wc[0] : "";
  R.check(wcs.includes(`dataFile: "${b.data}"`) && wcs.includes(`unit: "${b.unit}"`), S("Q05", "worker config"), `LISTING_BASE_CONFIG.${k} needs dataFile "${b.data}" and unit "${b.unit}"`);

  // Q07 search-result basics: title names the base and is not too long, description is a real sentence of sensible length
  for (const [nm, h] of [["page", page], ["guide", guide]]) {
    const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || "", d = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
    R.check(b.tokens.some((x) => t.includes(x)) || t.includes(b.label), S("Q07", "title"), `${nm} title "${t}" does not name the base`);
    R.check(t.length >= 20 && t.length <= 75, S("Q07", "title length"), `${nm} title is ${t.length} characters (20–75): "${t}"`);
    R.check(d.length >= 80 && d.length <= 175, S("Q07", "description length"), `${nm} meta description is ${d.length} characters (80–175)`);
    // Q08 exactly one h1
    const h1 = (h.match(/<h1[\s>]/g) || []).length;
    R.check(h1 === 1, S("Q08", "h1"), `${nm} has ${h1} <h1> tags (needs exactly 1)`);
    // Q09 language + viewport
    R.check(/<html[^>]*\blang="en"/.test(h) && /<meta name="viewport"[^>]*width=device-width/.test(h), S("Q09", "lang/viewport"), `${nm} needs <html lang="en"> and a viewport meta tag`);
  }

  // Q13 guide has a real checklist and nothing from another base
  const items = (guide.match(/type="checkbox"/g) || []).length;
  R.check(items >= 8, S("Q13", "guide checklist"), `guide has only ${items} checklist items (expected 8+)`);
  const foreign = keys.filter((o) => o !== k).flatMap((o) => cfg.bases[o].tokens.filter((t) => !b.tokens.includes(t) && !/^(Norfolk|Pendleton)$/.test(t)).map((t) => [o, t])).filter(([, t]) => new RegExp(`\\b${t}\\b`).test(textOf(guide)));
  R.check(!foreign.length, S("Q13", "guide leftovers"), `guide mentions other bases: ${foreign.map(([o, t]) => `${t} (${o})`).slice(0, 4).join(", ")}`);

  // Q14 page weight (performance)
  const pk = Buffer.byteLength(page) / 1024, dk = exists(b.data) ? fs.statSync(`${ROOT}/${b.data}`).size / 1024 : 0;
  R.check(pk <= 500, S("Q14", "page weight"), `${b.page} is ${pk | 0} KB (limit 500)`);
  R.check(dk <= 800, S("Q14", "data weight"), `${b.data} is ${dk | 0} KB (limit 800)`);
  if (pk > 400 || dk > 650) R.warn(S("Q14", "weight"), `${b.page} ${pk | 0} KB, ${b.data} ${dk | 0} KB — getting heavy`);

  // Q15 the right emergency number is on the page; Q16 the money section belongs to this base and has the right currency feed
  R.check(new RegExp(`(^|[^\\d])${cfg.bases[k].emergency}([^\\d]|$)`).test(textOf(page)), S("Q15", "emergency number"), `the page never shows the local emergency number ${b.emergency}`);
  const ms = (page.match(/<section id="moneySection"[^>]*>/) || [])[0] || "";
  R.check(ms.includes(`data-base="${k}"`), S("Q16", "money section"), `moneySection is missing or has the wrong data-base (expected "${k}")`);
  if (b.money) R.check(ms.includes(b.money), S("Q16", "currency feed"), `moneySection needs ${b.money} so the page shows the right exchange rates`);

  // Q28 events section has enough cards
  const ev = (page.match(/Typical (dates|schedule)/g) || []).length;
  R.check(ev >= 5, S("Q28", "events"), `only ${ev} seasonal event cards (expected 5+)`);
}

// ================= whole-site rules =================
// Q06 robots.txt points at the sitemap and does not block the whole site
R.check(/^Sitemap:\s*https:\/\/militarythingstodo\.com\/sitemap\.xml/im.test(robots), "Q06 robots.txt", "robots.txt must contain 'Sitemap: https://militarythingstodo.com/sitemap.xml'");
R.check(!/^Disallow:\s*\/\s*$/im.test(robots.split(/^User-agent:/im).filter((b) => /^\s*\*/.test(b)).join("")), "Q06 robots.txt", "robots.txt blocks the whole site for all crawlers");
for (const f of sitePages) {
  const h = read(f);
  // Q10 no insecure (http://) resources or links
  const insecure = [...h.matchAll(/\b(?:href|src)="(http:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !/localhost|w3\.org/.test(u));
  R.check(!insecure.length, `Q10 insecure link [${f}]`, `uses http:// links: ${insecure.slice(0, 2).join(" ")}`);
  // Q11 external links that open a new tab must not leak window.opener
  const blank = [...h.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]).filter((t) => !/rel="[^"]*noopener/.test(t));
  R.check(!blank.length, `Q11 target=_blank [${f}]`, `${blank.length} link(s) open a new tab without rel="noopener"`);
  // Q12 every image has alt text
  const noalt = [...h.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/\balt=/.test(t));
  R.check(!noalt.length, `Q12 image alt [${f}]`, `${noalt.length} <img> without an alt attribute`);
}
// Q29 sitemap dates are real dates and never in the future
const today = new Date().toISOString().slice(0, 10);
for (const m of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m[1]) || isNaN(Date.parse(m[1])) || m[1] > today) R.fail("Q29 sitemap lastmod", `bad lastmod "${m[1]}"`);
  else R.ok();
}

// ================= data rules (every listing in every base) =================
const mojibake = /Ã[\u0080-¿]|â€|Â[ -¿]|�|&amp;|&#\d+;|&[a-z]+;/;
for (const k of keys) {
  const b = cfg.bases[k]; if (!exists(b.data)) continue;
  const P = loadData(b.data).places, S = (id, n) => `${id} ${n} [${k}]`;
  const bad = (id, n, list, msg) => R.check(!list.length, S(id, n), `${list.length} listing(s) ${msg}: ${list.slice(0, 4).join("; ")}`);

  // Q17 ids are url-safe
  bad("Q17", "ids", P.filter((p) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id) || p.id.length > 70).map((p) => p.id), "have an id that is not lowercase-kebab, or is over 70 characters");
  // Q18 text hygiene: broken encoding (umlauts!), double spaces, stray whitespace
  bad("Q18", "text encoding", P.filter((p) => ["name", "blurb", "addr", "hours", "phone"].some((f) => mojibake.test(strip(p[f])))).map((p) => p.name), "contain broken characters (mojibake, &amp; or HTML entities — write ä ö ü ß é as real letters)");
  bad("Q18", "whitespace", P.filter((p) => ["name", "blurb", "addr", "hours"].some((f) => strip(p[f]) !== strip(p[f]).trim() || /  /.test(strip(p[f])))).map((p) => p.name), "have double spaces or leading/trailing whitespace");
  // Q19 blurb quality
  bad("Q19", "blurb length", P.filter((p) => strip(p.blurb).length < 15 || strip(p.blurb).length > 800).map((p) => `${p.name} (${strip(p.blurb).length})`), "have a blurb under 15 or over 800 characters");
  const thin = P.filter((p) => strip(p.blurb).length >= 15 && strip(p.blurb).length < 40);
  const wordy = P.filter((p) => strip(p.blurb).length > 600);
  if (wordy.length) R.warn(S("Q19", "long blurbs"), `${wordy.length} blurb(s) over 600 characters (cards get hard to scan): ${wordy.slice(0, 3).map((p) => p.name).join("; ")}`);
  if (thin.length) R.warn(S("Q19", "thin blurbs"), `${thin.length} blurb(s) under 40 characters (add what makes the place worth a visit): ${thin.slice(0, 3).map((p) => p.name).join("; ")}`);
  bad("Q19", "blurb punctuation", P.filter((p) => !/[.!?)"”'’]$/.test(strip(p.blurb).trim()) || !/^[A-Z0-9"“'‘(¡¿ÀÁÂÄÅÉÈÖÜÇ]/.test(strip(p.blurb).trim())).map((p) => p.name), "have a blurb that doesn't start with a capital or end with punctuation");
  // Q20 names
  bad("Q20", "names", P.filter((p) => strip(p.name).length > 80 || (/[A-Z]{6,}/.test(strip(p.name)) && strip(p.name) === strip(p.name).toUpperCase()) || /\((permanently )?closed\)|\bTODO\b|\bTBD\b/i.test(p.name)).map((p) => p.name), "have a name that is too long, ALL CAPS, or flagged closed/TODO");
  // Q21 addresses
  bad("Q21", "address", P.filter((p) => strip(p.addr).length < 4).map((p) => `${p.name}: "${strip(p.addr)}"`), "have an empty or tiny address");
  const vague = P.filter((p) => !/[\d,]/.test(strip(p.addr)));
  if (vague.length) R.warn(S("Q21", "vague address"), `${vague.length} address(es) are just a place name with no street/number (fine for on-base spots): ${vague.slice(0, 3).map((p) => p.name).join("; ")}`);
  if (b.addrRe) { const miss = P.filter((p) => !b.addrRe.test(strip(p.addr))); if (miss.length) R.warn(S("Q21", "postal format"), `${miss.length} address(es) lack the local postal-code format, e.g. ${miss.slice(0, 3).map((p) => p.name).join("; ")}`); }
  // Q22 phone numbers are numbers
  const firstNum = (ph) => ph.split(/[(;/]|\bor\b|\bDSN\b|\bext\b\.?/i)[0]; // notes like "(DSN 315-…)" or "ext. 123" may follow the main number
  bad("Q22", "phone", P.filter((p) => p.phone && (/[a-z]{2,}/i.test(firstNum(p.phone)) || firstNum(p.phone).replace(/\D/g, "").length < 7 || firstNum(p.phone).replace(/\D/g, "").length > 15)).map((p) => `${p.name}: ${p.phone}`), "have a main phone number with letters or the wrong number of digits");
  // Q23 pins: precise, and never the base's own reference point
  const onRef = P.filter((p) => b.refs.some(([la, ln]) => Math.abs(p.lat - la) < 1e-6 && Math.abs(p.lng - ln) < 1e-6));
  if (onRef.length) R.warn(S("Q23", "pin on base reference"), `${onRef.length} listing(s) sit exactly on the base reference point — fine for a gate/on-base spot, a placeholder if it's an off-base place: ${onRef.map((p) => p.name).join("; ")}`);
  const lowp = P.filter((p) => (String(p.lat).split(".")[1] || "").length < 4 || (String(p.lng).split(".")[1] || "").length < 4);
  if (lowp.length) R.warn(S("Q23", "pin precision"), `${lowp.length} pin(s) have fewer than 4 decimals (city-level guess?): ${lowp.slice(0, 3).map((p) => p.name).join("; ")}`);
  // Q24 everyday places (not day trips) must be close to the base
  const near = b.unit === "mi" ? 40 : 60;
  const far = P.filter((p) => !cfg.dayTripCats.includes(p.cat) && p.dist > near);
  if (far.length) R.warn(S("Q24", "far from base"), `${far.length} everyday listing(s) are over ${near} ${b.unit} away — wrong pin or a day trip in the wrong category? ${far.slice(0, 3).map((p) => `${p.name} ${p.dist}`).join("; ")}`);
  // Q25 enough listings, enough variety, the essentials are covered
  R.check(P.length >= 60, S("Q25", "size"), `only ${P.length} listings (a live base needs 60+)`);
  const cats = P.reduce((m, p) => ((m[p.cat] = (m[p.cat] || 0) + 1), m), {});
  R.check(Object.keys(cats).length >= 10, S("Q25", "variety"), `only ${Object.keys(cats).length} categories (needs 10+)`);
  const missing = cfg.essentialCats.filter((c) => !cats[c]);
  R.check(!missing.length, S("Q25", "essential categories"), `no listings in: ${missing.join(", ")}`);
  // Q26 no category swallows the base
  const [topCat, topN] = Object.entries(cats).sort((a, c) => c[1] - a[1])[0];
  if (topN / P.length > 0.4) R.warn(S("Q26", "balance"), `"${topCat}" is ${Math.round((100 * topN) / P.length)}% of all listings`);
  // Q27 hours: always filled; not mostly placeholders
  bad("Q27", "hours present", P.filter((p) => !strip(p.hours).trim()).map((p) => p.name), "have no hours text at all (use \"Hours vary — check …\" if unknown)");
  const ph = P.filter((p) => /check current hours/i.test(strip(p.hours))).length;
  if (ph / P.length > 0.25) R.warn(S("Q27", "placeholder hours"), `${ph} of ${P.length} listings (${Math.round((100 * ph) / P.length)}%) still say "check current hours"`);
}

process.exit(R.print() ? 0 : 1);
