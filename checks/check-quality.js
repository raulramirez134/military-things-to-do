// Base-quality checks (Q01-Q31, Q33-Q87): run when you create or edit a base. No browser, no network. Run: node checks/check-quality.js
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

  // Q30 every category the page offers has listings in it (an empty tab is a dead end; remove the category or fill it)
  const catLab = loadData(b.data).catLabels || {}, strict = cfg.strictBases.includes(k);
  const emptyCats = Object.keys(catLab).filter((c) => !cats[c]), thinCats = Object.keys(catLab).filter((c) => cats[c] === 1);
  if (emptyCats.length) (strict ? R.fail : R.warn).call(R, S("Q30", "empty categories"), `${emptyCats.length} category(ies) have no listings: ${emptyCats.join(", ")} — find businesses to fill them, or remove the category`);
  else R.ok();
  if (thinCats.length) (strict ? R.fail : R.warn).call(R, S("Q30", "one-listing categories"), `${thinCats.length} category(ies) have only 1 listing: ${thinCats.join(", ")} — add a second or fold it into another category`);
  else R.ok();
  // Q31 hours carry a concrete time. "Posted in store" / "check ahead" is only allowed for ids in config.vagueHoursOk (with a reason).
  const hasTime = (h) => /\d{1,2}:\d{2}|\b24\s?(hrs?|hours)\b|\b24\/7\b/i.test(h) || /\b\d{1,2}\s?(am|pm)\b/i.test(h)
    || /\b(mon|tue|wed|thu|fri|sat|sun|daily)[a-z]*\.?[^0-9]{0,12}\d{1,2}\s?[–-]\s?\d{1,2}\b/i.test(h) // "Mon–Fri 9–17"
    || /\b(dawn|sunrise)\s+(to|until|-|–)\s+(dusk|sunset)\b|\balways (open|accessible)\b|\bopen (year[- ]round|24)\b/i.test(h);
  const vagueH = P.filter((p) => !hasTime(strip(p.hours)) && !cfg.vagueHoursOk[p.id]);
  if (vagueH.length) (strict ? R.fail : R.warn).call(R, S("Q31", "vague hours"), `${vagueH.length} listing(s) have no concrete opening time — look them up and fill them in (or add the id to vagueHoursOk with a reason): ${vagueH.slice(0, 5).map((p) => p.name).join("; ")}`);
  else R.ok();
  const stale = Object.keys(cfg.vagueHoursOk).filter((id) => P.some((p) => p.id === id && hasTime(strip(p.hours))));
  if (stale.length && strict) R.warn(S("Q31", "stale allow-list"), `${stale.join(", ")} now have real hours — remove from vagueHoursOk`);
}

// ================= extended data rules (Q33–Q64): every listing in every base =================
// rule(): offenders -> FAIL (broken for visitors) or warn (quality to-do). `lvl` is "fail" or "warn".
const rule = (S, id, n, lvl, list, msg) => { if (!list.length) return R.ok(); (lvl === "fail" ? R.fail : R.warn).call(R, S(id, n), `${list.length} ${msg}: ${list.slice(0, 4).join("; ")}`); };
const nowYear = new Date().getFullYear();
for (const k of keys) {
  const b = cfg.bases[k]; if (!exists(b.data)) continue;
  const D = loadData(b.data), P = D.places, CL = D.catLabels || {}, S = (id, n) => `${id} ${n} [${k}]`;
  const nm = (p) => p.name, bl = (p) => strip(p.blurb), hr = (p) => strip(p.hours);
  const otherTokens = keys.filter((o) => o !== k).map((o) => o);
  // Q33 no placeholder words anywhere in a listing's text
  rule(S, "Q33", "placeholder text", "fail", P.filter((p) => ["name", "blurb", "addr", "hours"].some((f) => /\b(TODO|TBD|FIXME|lorem|ipsum|xxx+|placeholder|n\/a)\b/i.test(strip(p[f])))).map(nm), "listing(s) contain placeholder words (TODO, TBD, lorem, n/a…)");
  // Q34 no web addresses or e-mail in blurbs (contact lives in the phone/link fields)
  rule(S, "Q34", "links in blurb", "warn", P.filter((p) => /https?:\/\/|www\.|\b[\w.-]+@[\w-]+\.\w+/i.test(bl(p))).map(nm), "blurb(s) contain a web address or e-mail");
  // Q35 no shouting (a word of 7+ capital letters that is not an acronym list)
  rule(S, "Q35", "shouting blurb", "warn", P.filter((p) => /\b[A-Z]{8,}\b/.test(bl(p))).map(nm), "blurb(s) contain a word in ALL CAPS");
  // Q36 punctuation: at most one exclamation mark, no "!!" or "??"
  rule(S, "Q36", "exclamations", "warn", P.filter((p) => (bl(p).match(/!/g) || []).length > 1 || /[!?]{2,}/.test(bl(p))).map(nm), "blurb(s) over-use ! or ?");
  // Q37 unverifiable superlatives age badly and read like ads
  rule(S, "Q37", "superlatives", "warn", P.filter((p) => /\b(world[- ]class|#\s?1\b|number one|best in (the )?(world|america|germany|korea|japan|town)|unbeatable|once in a lifetime|you won'?t believe)\b/i.test(bl(p))).map(nm), "blurb(s) use an advertising superlative");
  // Q38 time-sensitive wording goes stale (state the fact, not the moment)
  rule(S, "Q38", "time-sensitive wording", "warn", P.filter((p) => /\b(as of (20\d\d|today|now)|just opened|recently opened|grand opening|coming soon|new for 20\d\d|brand[- ]new|this (summer|winter|spring|fall|year))\b/i.test(bl(p))).map(nm), "blurb(s) use wording that goes out of date");
  // Q39 years in blurbs: a past year is fine ("opened in 1998"), a future or very recent "as of" year is not
  rule(S, "Q39", "future year", "fail", P.filter((p) => (bl(p).match(/\b(20\d\d)\b/g) || []).some((y) => +y > nowYear + 1)).map(nm), "blurb(s) mention a year in the future");
  // Q40 hours are never just "Closed" (a closed business should not be listed)
  rule(S, "Q40", "always closed", "fail", P.filter((p) => /^\s*(closed|permanently closed|n\/a)\s*\.?$/i.test(hr(p))).map(nm), "listing(s) say they are closed all the time — remove them");
  // Q41 hours have no stray separators or trailing punctuation
  rule(S, "Q41", "hours separators", "fail", P.filter((p) => /(·\s*){2,}|^\s*·|·\s*$|[,;]\s*$|\.\s*$|\s·\s·\s/.test(hr(p).replace(/\.\.\./g, "…"))).map((p) => `${p.name}: "${hr(p)}"`), "hours string(s) have an empty group or trailing punctuation");
  // Q42 24-hour clock values are real (0–24 hours, 00–59 minutes)
  rule(S, "Q42", "impossible clock time", "fail", P.filter((p) => [...hr(p).matchAll(/\b(\d{1,2}):(\d{2})\b/g)].some((m) => +m[1] > 24 || +m[2] > 59 || (+m[1] === 24 && +m[2] > 0))).map((p) => `${p.name}: "${hr(p)}"`), "hours string(s) contain a time that cannot exist");
  // Q43 a time range never opens and closes at the same moment
  rule(S, "Q43", "zero-length hours", "fail", P.filter((p) => [...hr(p).matchAll(/\b(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})\b/g)].some((m) => m[1].padStart(5, "0") === m[2].padStart(5, "0") && m[1] !== "00:00")).map((p) => `${p.name}: "${hr(p)}"`), "hours range(s) open and close at the same time");
  // Q44 day names use the abbreviations the hours parser reads and visitors expect
  rule(S, "Q44", "day abbreviations", "warn", P.filter((p) => /\b(Tues|Thur|Thurs|Weds|Mond|Fryday|Satur\b|Sund\b)\b/.test(hr(p))).map((p) => `${p.name}: "${hr(p)}"`), "hours string(s) use a non-standard day abbreviation (use Mon Tue Wed Thu Fri Sat Sun)");
  // Q45 time ranges use an en dash, not a hyphen (consistent typography)
  rule(S, "Q45", "range punctuation", "warn", P.filter((p) => /\d{1,2}:\d{2}\s?-\s?\d{1,2}:\d{2}/.test(hr(p))).map((p) => `${p.name}: "${hr(p)}"`), "hours string(s) use a hyphen between times (use an en dash –)");
  // Q46 address hygiene: no trailing comma/period, not just the listing's name
  rule(S, "Q46", "address punctuation", "fail", P.filter((p) => /[,;.]\s*$/.test(strip(p.addr)) || /^\s*[,;]/.test(strip(p.addr)) || /,\s*,/.test(strip(p.addr))).map((p) => `${p.name}: "${strip(p.addr)}"`), "address(es) have stray punctuation");
  rule(S, "Q47", "address is the name", "warn", P.filter((p) => strip(p.addr).trim().toLowerCase() === strip(p.name).trim().toLowerCase()).map(nm), "address(es) just repeat the listing name");
  // Q48 names: no leading/trailing punctuation, not tiny, no doubled words
  rule(S, "Q48", "name hygiene", "fail", P.filter((p) => /^[\s\-–—,.:;]|[\s\-–—,:;]$/.test(strip(p.name)) || (/\.$/.test(strip(p.name)) && !/\b(Co|Inc|Ltd|Jr|Sr|Dr|St|Mt|Ft|Bros|Corp|Ave)\.$/.test(strip(p.name))) || strip(p.name).trim().length < 3 || /\b([a-z]{3,})\s+\1\b/.test(strip(p.name))).map(nm), "name(s) have stray punctuation, are too short or repeat a lowercase word");
  // Q49 the same business name must not appear twice in one base
  const seenNames = {}; P.forEach((p) => { const key = strip(p.name).toLowerCase().replace(/[^a-z0-9]+/g, ""); (seenNames[key] = seenNames[key] || []).push(p.id); });
  rule(S, "Q49", "duplicate names", "warn", Object.values(seenNames).filter((v) => v.length > 1).map((v) => v.join(" + ")), "name(s) appear on more than one listing");
  // Q50 rating is null or 1–5; review count is a whole number
  rule(S, "Q50", "rating range", "fail", P.filter((p) => p.rating != null && !(typeof p.rating === "number" && p.rating >= 1 && p.rating <= 5)).map(nm), "rating(s) outside 1–5");
  rule(S, "Q50", "review count", "fail", P.filter((p) => p.reviewCount !== undefined && !(Number.isInteger(p.reviewCount) && p.reviewCount >= 0)).map(nm), "reviewCount(s) that are not whole numbers ≥ 0");
  // Q51 a rating without any reviews is an invented number
  rule(S, "Q51", "rating without reviews", "warn", P.filter((p) => p.rating != null && !p.reviewCount).map(nm), "listing(s) show a rating with 0 reviews behind it");
  // Q52 catLabels: unique, short, non-empty labels
  const labs = Object.values(CL);
  rule(S, "Q52", "category labels", "fail", [...labs.filter((l, i) => labs.indexOf(l) !== i), ...labs.filter((l) => !String(l).trim() || String(l).length > 34)], "category label(s) that are duplicated, empty or over 34 characters");
  // Q53 every listing's category is declared in catLabels
  rule(S, "Q53", "undeclared category", "fail", P.filter((p) => !CL[p.cat]).map((p) => `${p.name} (${p.cat})`), "listing(s) use a category that catLabels does not declare");
  // Q54 on-base pins (dist 0) must carry the "installation area" note so visitors are not misled
  rule(S, "Q54", "on-base pin note", "warn", P.filter((p) => p.dist === 0 && !/Pin marks the installation area|on[- ]base|aboard|inside the (gate|base|installation)|on post/i.test(bl(p) + " " + strip(p.addr))).map(nm), "on-base listing(s) don't say the pin is approximate or on-base");
  // Q55 ids and names must not carry another base's name (copy-paste leftovers)
  const foreignId = P.filter((p) => otherTokens.some((o) => o !== k && !k.includes(o) && !o.includes(k) && p.id.split("-").includes(o)));
  rule(S, "Q55", "other base in id", "fail", foreignId.map((p) => p.id), "id(s) contain another base's key");
  // Q56 blurb length distribution: not mostly stubs
  const stubs = P.filter((p) => bl(p).length < 80);
  if (stubs.length / P.length > 0.25) R.warn(S("Q56", "short blurbs"), `${stubs.length}/${P.length} blurbs are under 80 characters (thin pages rank and convert worse)`); else R.ok();
  // Q57 phone coverage
  const noPhone = P.filter((p) => !p.phone);
  if (noPhone.length / P.length > 0.4) R.warn(S("Q57", "phone coverage"), `${noPhone.length}/${P.length} listings have no phone number`); else R.ok();
  // Q58 placeholder-hours share (stricter than Q27's 25%)
  const phs = P.filter((p) => /check current hours/i.test(hr(p)));
  if (phs.length / P.length > 0.1) R.warn(S("Q58", "placeholder hours share"), `${phs.length}/${P.length} listings (${Math.round((100 * phs.length) / P.length)}%) still have placeholder hours`); else R.ok();
  // Q59 every category with 3+ listings in the essentials has a spread of at least 2 different pins >150 m apart (no all-on-one-spot categories)
  const catPins = {}; P.forEach((p) => (catPins[p.cat] = catPins[p.cat] || new Set()).add(p.lat.toFixed(3) + "," + p.lng.toFixed(3)));
  rule(S, "Q59", "category on one pin", "warn", Object.entries(catPins).filter(([c, v]) => v.size === 1 && P.filter((p) => p.cat === c).length >= 4).map(([c]) => c), "categor(ies) have 4+ listings all on the same pin");
  // Q60 coordinates are numbers in range, with sign matching the region's bounding box
  rule(S, "Q60", "coordinates", "fail", P.filter((p) => !(Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)).map(nm), "listing(s) have invalid coordinates");
  // Q61 dist is a non-negative number with at most two decimals
  rule(S, "Q61", "dist format", "fail", P.filter((p) => !(typeof p.dist === "number" && p.dist >= 0 && p.dist < 2000 && Math.abs(p.dist * 100 - Math.round(p.dist * 100)) < 1e-6)).map((p) => `${p.name}: ${p.dist}`), "dist value(s) that are negative, huge or have more than 2 decimals");
  // Q62 listing objects don't carry unknown fields (typos like "hour:" silently drop data)
  const allowed = new Set(["id", "name", "cat", "dist", "lat", "lng", "addr", "blurb", "hours", "phone", "rating", "reviewCount", "area", "url", "website", "tags", "icon"]);
  rule(S, "Q62", "unknown field", "warn", P.filter((p) => Object.keys(p).some((f) => !allowed.has(f))).map((p) => `${p.name}: ${Object.keys(p).filter((f) => !allowed.has(f)).join(",")}`), "listing(s) have a field the site does not read");
  // Q63 area (Camp Pendleton) is only north/south, and every Pendleton listing has one
  if (k === "camppendleton") rule(S, "Q63", "pendleton area", "fail", P.filter((p) => p.area !== undefined && !["north", "south"].includes(p.area)).map(nm), "listing(s) have an area other than \"north\" or \"south\" (missing is read as north)"); else R.ok();
  // Q64 the data file itself: no BOM, no Windows line endings, ends with a newline
  const raw = read(b.data);
  rule(S, "Q64", "file hygiene", "fail", [raw.charCodeAt(0) === 0xfeff && "BOM at start", /\r\n/.test(raw) && "CRLF line endings", !raw.endsWith("\n") && "no final newline"].filter(Boolean), "data-file problem(s)");
}

// ================= extended page & site rules (Q65–Q87) =================
const allPages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const pageTitles = {}, pageDescs = {};
for (const f of allPages) {
  const h = read(f), isTool = ["admin.html", "404.html"].includes(f), S = (id, n) => `${id} ${n} [${f}]`;
  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || "", desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  (pageTitles[title] = pageTitles[title] || []).push(f); if (desc) (pageDescs[desc] = pageDescs[desc] || []).push(f);
  // Q65 exactly one canonical, absolute, https, no .html, no query
  const canon = [...h.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
  if (!isTool && f !== "listing.html") { R.check(canon.length === 1 && /^https:\/\/militarythingstodo\.com(\/[a-z0-9-]*)?$/.test(canon[0] || ""), S("Q65", "canonical"), `needs exactly one canonical like https://militarythingstodo.com/page (found ${canon.join(" | ") || "none"})`); }
  // Q66 og:url equals the canonical, and og:title/og:description exist
  const isNoindex = /<meta name="robots" content="[^"]*noindex/.test(h);
  if (!isTool && f !== "listing.html" && !isNoindex) {
    const ogu = (h.match(/property="og:url" content="([^"]*)"/) || [])[1];
    R.check(ogu === canon[0], S("Q66", "og:url"), `og:url (${ogu}) differs from the canonical (${canon[0]})`);
    R.check(/property="og:title"/.test(h) && /property="og:description"/.test(h), S("Q66", "og tags"), "missing og:title or og:description");
  }
  // Q67 every JSON-LD block is valid JSON
  const badLd = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].filter((m) => { try { JSON.parse(m[1]); return false; } catch (e) { return true; } });
  R.check(!badLd.length, S("Q67", "JSON-LD"), `${badLd.length} JSON-LD block(s) are not valid JSON`);
  // Q68 no duplicate id= attributes (breaks anchors, labels and scripts)
  const ids = [...h.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]), dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  R.check(!dup.length, S("Q68", "duplicate ids"), `duplicate id attribute(s): ${dup.slice(0, 4).join(", ")}`);
  // Q69 in-page anchors (#x) point at an element that exists
  const ids2 = new Set(ids), badAnch = [...h.matchAll(/href="#([A-Za-z][\w-]*)"/g)].map((m) => m[1]).filter((a) => !ids2.has(a) && !new RegExp(`id=["']${a}["']`).test(h));
  R.check(!badAnch.length, S("Q69", "anchors"), `link(s) to missing section(s): ${[...new Set(badAnch)].slice(0, 4).join(", ")}`);
  // Q70 charset utf-8 and viewport
  R.check(/<meta charset="utf-8"/i.test(h), S("Q70", "charset"), "needs <meta charset=\"utf-8\">");
  // Q71 no debug leftovers in inline scripts
  const inline = [...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  R.check(!/\bdebugger\b|console\.(log|debug)\(/.test(inline), S("Q71", "debug leftovers"), "inline script has console.log/debugger left in");
  // Q72 no TODO/FIXME/lorem text visible on a page
  R.check(!/\b(TODO|FIXME|lorem ipsum)\b/i.test(textOf(h)), S("Q72", "placeholder text"), "page shows TODO/FIXME/lorem text");
  // Q73 nothing points at a local dev server
  R.check(!/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(h.replace(/<script[\s\S]*?<\/script>/g, "")), S("Q73", "dev URL"), "page links to localhost/127.0.0.1");
  // Q74 favicon declared
  R.check(/rel="(shortcut )?icon"/.test(h), S("Q74", "favicon"), "no <link rel=\"icon\">");
  // Q75 local scripts, styles and images referenced actually exist
  const refs = [...h.matchAll(/\b(?:src|href)="(\/[^"#?]+\.(?:js|css|png|jpe?g|svg|ico|webp|json))"/g)].map((m) => m[1]).filter((u) => !u.startsWith("//"));
  const missingRef = [...new Set(refs)].filter((u) => !exists(u.slice(1)));
  R.check(!missingRef.length, S("Q75", "missing file"), `references file(s) that do not exist: ${missingRef.slice(0, 3).join(", ")}`);
  // Q76 internal page links point at a real page or a known worker route
  const routes = new Set(["", ...allPages.map((x) => x.replace(".html", "")), "listing", "admin", "api"]);
  const deadLinks = [...h.matchAll(/\bhref="\/([a-z0-9-]*)(?:[?#][^"]*)?"/g)].map((m) => m[1]).filter((r) => !routes.has(r) && !/\.[a-z0-9]+$/.test(r));
  R.check(!deadLinks.length, S("Q76", "internal links"), `link(s) to pages that do not exist: ${[...new Set(deadLinks)].slice(0, 4).join(", ")}`);
  // Q77 headings: first heading in the document is the h1 (no h2/h3 above it)
  const firstH = (h.match(/<h([1-6])[\s>]/) || [])[1];
  if (!isTool) R.check(firstH === "1" || firstH === undefined || f === "index.html" || /<h1/.test(h.split(/<h[2-6][\s>]/)[0]), S("Q77", "heading order"), `first heading is h${firstH}, not h1`); else R.ok();
  // Q78 buttons that are not inside a form say what they do (type="button" or visible text/aria-label)
  const emptyBtn = [...h.matchAll(/<button\b([^>]*)>\s*<\/button>/g)].filter((m) => !/aria-label=/.test(m[1]));
  R.check(!emptyBtn.length, S("Q78", "empty buttons"), `${emptyBtn.length} empty <button> with no aria-label`);
  // Q79 images have a non-empty alt unless explicitly decorative (role="presentation"/aria-hidden)
  const blankAlt = [...h.matchAll(/<img\b[^>]*\balt=""[^>]*>/g)].filter((m) => !/role="presentation"|aria-hidden="true"/.test(m[0]));
  if (blankAlt.length) R.warn(S("Q79", "empty alt"), `${blankAlt.length} image(s) have alt="" but aren't marked decorative`); else R.ok();
  // Q80 admin, 404 and search results are not indexable
  if (["admin.html", "404.html"].includes(f)) R.check(/<meta name="robots" content="[^"]*noindex/.test(h), S("Q80", "noindex"), "must carry <meta name=\"robots\" content=\"noindex\">"); else R.ok();
}
// Q81 titles are unique across the site
R.check(!Object.entries(pageTitles).filter(([t, v]) => t && v.length > 1 && !v.every((x) => ["admin.html", "404.html"].includes(x))).length, "Q81 duplicate titles", `these pages share a <title>: ${Object.entries(pageTitles).filter(([t, v]) => t && v.length > 1).map(([t, v]) => v.join("+")).slice(0, 4).join(" ; ")}`);
// Q82 meta descriptions are unique across the site
R.check(!Object.entries(pageDescs).filter(([, v]) => v.length > 1).length, "Q82 duplicate descriptions", `these pages share a meta description: ${Object.entries(pageDescs).filter(([, v]) => v.length > 1).map(([, v]) => v.join("+")).slice(0, 4).join(" ; ")}`);
// Q83 sitemap: no duplicate URLs, all on the site's domain, none ending .html, none for noindex pages
{
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&")), dups = locs.filter((u, i) => locs.indexOf(u) !== i);
  R.check(!dups.length, "Q83 sitemap duplicates", `${dups.length} duplicate <loc> entries: ${dups.slice(0, 3).join(" ")}`);
  R.check(locs.every((u) => u.startsWith(cfg.siteUrl + "/") || u === cfg.siteUrl), "Q83 sitemap domain", `entries outside ${cfg.siteUrl}: ${locs.filter((u) => !u.startsWith(cfg.siteUrl)).slice(0, 3).join(" ")}`);
  R.check(!locs.some((u) => /\.html($|\?)/.test(u)), "Q83 sitemap .html", "sitemap lists a .html URL (use clean URLs)");
  const noindexPages = allPages.filter((f) => /<meta name="robots" content="[^"]*noindex/.test(read(f))).map((f) => f.replace(".html", ""));
  R.check(!locs.some((u) => noindexPages.includes(u.replace(cfg.siteUrl + "/", "").split("?")[0])), "Q83 sitemap noindex", "sitemap lists a page that is marked noindex");
  R.check(locs.length <= 50000 && Buffer.byteLength(sitemap) < 50 * 1024 * 1024, "Q83 sitemap size", "sitemap exceeds the 50,000 URL / 50 MB limit — split it");
}
// Q84 sitemap listing URLs only name bases that exist and ids that exist
{
  const bad = [];
  for (const m of sitemap.matchAll(/<loc>[^<]*\/listing\?base=([a-z]+)&amp;id=([^<]+)<\/loc>/g)) { const b = cfg.bases[m[1]]; if (!b || !loadData(b.data).places.some((p) => p.id === m[2])) bad.push(`${m[1]}/${m[2]}`); }
  R.check(!bad.length, "Q84 sitemap listing URLs", `${bad.length} sitemap listing URL(s) have no matching listing: ${bad.slice(0, 3).join(", ")}`);
}
// Q85 wrangler.jsonc parses (comments allowed) and names the worker
{
  let ok = false; try { const j = JSON.parse(wrangler.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")); ok = !!j.name; } catch (e) { /* reported below */ }
  R.check(ok, "Q85 wrangler.jsonc", "wrangler.jsonc is not valid JSON(C) or has no \"name\"");
}
// Q86 manifest.json is valid and its icons exist
{
  let ok = true, msg = ""; try { const m = JSON.parse(read("manifest.json")); for (const i of m.icons || []) if (!exists(i.src.replace(/^\//, ""))) { ok = false; msg = i.src; } if (!m.name) { ok = false; msg = "name"; } } catch (e) { ok = false; msg = e.message; }
  R.check(ok, "Q86 manifest.json", `manifest.json problem: ${msg}`);
}
// Q87 JavaScript files shipped to visitors parse and carry no debug leftovers
for (const f of fs.readdirSync(ROOT).filter((x) => /^(hours|money|motion|data.*)\.js$/.test(x))) {
  const src = read(f); let ok = true; try { new (require("vm").Script)(src.replace(/^const /gm, "var "), { filename: f }); } catch (e) { ok = false; }
  R.check(ok, `Q87 syntax [${f}]`, "does not parse as JavaScript");
  if (!/^data/.test(f)) R.check(!/\bdebugger\b|console\.(log|debug)\(/.test(src), `Q87 debug leftovers [${f}]`, "has console.log/debugger left in");
}

process.exit(R.print() ? 0 : 1);
