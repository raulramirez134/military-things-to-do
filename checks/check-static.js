// Static checks: no browser, no network. Run: node checks/check-static.js
const fs = require("fs"), vm = require("vm");
const { ROOT, read, exists, loadData, hav, stripDiv, Report } = require("./lib");
const cfg = require("./config");
const R = new Report("static");
const keys = Object.keys(cfg.bases);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const now = new Date();

// ---------- 0. every data file on disk is configured ----------
const dataOnDisk = fs.readdirSync(ROOT).filter((f) => /^data(-[a-z]+)?\.js$/.test(f));
const configured = keys.map((k) => cfg.bases[k].data);
for (const f of dataOnDisk) R.check(configured.includes(f), "config", `${f} exists but is not in checks/config.js (add the base there)`);
for (const f of fs.readdirSync(ROOT).filter((f) => /^guide(-[a-z]+)?\.html$/.test(f))) R.check(keys.some((k) => cfg.bases[k].guide === f), "config", `${f} has no base in checks/config.js`);

const pages = {}, datas = {};
for (const k of keys) {
  const b = cfg.bases[k], S = k;
  for (const f of [b.page, b.data, b.guide]) R.check(exists(f), S, `missing file ${f}`);
  if (!exists(b.page) || !exists(b.data)) continue;
  const html = (pages[k] = read(b.page));
  let d;
  try { d = datas[k] = loadData(b.data); } catch (e) { R.fail(S, `${b.data} does not parse: ${e.message}`); continue; }
  const places = d.places, catLabels = d.catLabels;
  R.check(Array.isArray(places) && places.length > 0, S, "places array empty/missing");
  R.check(catLabels && typeof catLabels === "object", S, "catLabels missing");

  // ---------- 1. page wiring: data source, base key, timezone, map centre ----------
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /^data(-[a-z]+)?\.js$/.test(s));
  R.check(srcs.length === 1 && srcs[0] === b.data, S, `page loads data scripts [${srcs}] but should load only ${b.data}`);
  const bk = (html.match(/const CURRENT_BASE_KEY\s*=\s*"([^"]+)"/) || [])[1];
  R.check(bk === k, S, `CURRENT_BASE_KEY is "${bk}", expected "${k}"`);
  const tz = (html.match(/const HUB_TIME_ZONE\s*=\s*"([^"]+)"/) || [])[1];
  R.check(tz === b.tz, S, `HUB_TIME_ZONE is "${tz}", expected "${b.tz}" (Open/Closed badges depend on it)`);
  const sv = html.match(/setView\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/);
  R.check(sv && b.refs.some((r) => Math.abs(r[0] - +sv[1]) < 0.2 && Math.abs(r[1] - +sv[2]) < 0.2), S, `map setView centre ${sv ? sv[1] + "," + sv[2] : "not found"} is not near this base's reference point`);
  for (const m of html.matchAll(/L\.marker\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/g))
    R.check(b.refs.some((r) => Math.abs(r[0] - +m[1]) < 0.2 && Math.abs(r[1] - +m[2]) < 0.2), S, `base marker at ${m[1]},${m[2]} is not near this base's reference point`);
  // Other bases' reference-coordinate literals must not appear.
  for (const o of keys.filter((x) => x !== k)) for (const r of cfg.bases[o].refs) {
    const lit = String(r[0]).slice(0, 7);
    R.check(!html.includes(lit), S, `contains ${o}'s reference coordinate ${lit}… (template leftover)`);
  }
  // refWord/unit as the page declares them, compared with config
  // ---------- 2. leftovers: other bases' proper nouns ----------
  const pageNoSwitch = stripDiv(html, '<div class="base-dropdown"').replace(/<!--[\s\S]*?-->/g, "");
  for (const o of keys.filter((x) => x !== k)) for (const t of cfg.bases[o].tokens) {
    const re = new RegExp("\\b" + esc(t) + "\\b", "i");
    const allow = (cfg.allowForeign || {})[k] || [];
    if (allow.includes(t)) continue;
    const m = pageNoSwitch.match(re);
    if (m) { const ix = pageNoSwitch.indexOf(m[0]); R.fail(S, `page mentions "${t}" (belongs to ${o}): …${pageNoSwitch.slice(Math.max(0, ix - 50), ix + 60).replace(/\s+/g, " ")}…`); } else R.ok();
    const dm = read(b.data).match(re);
    if (dm) { const s = read(b.data), ix = s.indexOf(dm[0]); R.warn(S, `data file mentions "${t}" (belongs to ${o}): …${s.slice(Math.max(0, ix - 40), ix + 50).replace(/\s+/g, " ")}…`); }
  }
  // ---------- 3. stats text ----------
  const nLoc = (html.match(/<b>(\d+)<\/b>\s*locations logged/) || [])[1];
  const nCat = (html.match(/<b>(\d+)<\/b>\s*categories mapped/) || [])[1];
  const nAll = (html.match(/All (\d+) logged locations/) || [])[1];
  const usedCats = new Set(places.map((p) => p.cat));
  R.check(+nLoc === places.length, S, `stats say ${nLoc} locations, data has ${places.length}`);
  R.check(+nCat === usedCats.size, S, `stats say ${nCat} categories, data has ${usedCats.size}`);
  if (nAll) R.check(+nAll === places.length, S, `map text says ${nAll} locations, data has ${places.length}`);

  // ---------- 4. data integrity ----------
  const ids = new Map(), coords = new Map();
  for (const p of places) {
    const w = `${p.id}`;
    ids.set(p.id, (ids.get(p.id) || 0) + 1);
    for (const f of ["id", "name", "cat", "addr", "blurb"]) if (typeof p[f] !== "string" || !p[f].trim()) R.fail(S, `${w}: ${f} missing/empty`);
    if (typeof p.hours !== "string" || !p.hours.trim()) R.fail(S, `${w}: hours missing`);
    if (!(p.phone === null || (typeof p.phone === "string" && p.phone.trim()))) R.fail(S, `${w}: phone must be null or a string`);
    if (!(p.rating == null || (p.rating >= 0 && p.rating <= 5))) R.fail(S, `${w}: rating ${p.rating} invalid`);
    if (p.rating == null && p.reviewCount) R.fail(S, `${w}: rating null but reviewCount ${p.reviewCount}`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id)) R.fail(S, `${w}: id should be lowercase-hyphen`);
    if (!catLabels[p.cat]) R.fail(S, `${w}: cat "${p.cat}" not in catLabels`);
    if (/undefined|null|TODO|lorem|\[object/i.test(p.name + p.blurb + p.addr + p.hours)) R.fail(S, `${w}: placeholder text in a field`);
    if (typeof p.lat !== "number" || typeof p.lng !== "number") { R.fail(S, `${w}: lat/lng not numbers`); continue; }
    const [la0, lo0, la1, lo1] = b.bbox;
    if (p.lat < la0 || p.lat > la1 || p.lng < lo0 || p.lng > lo1) R.fail(S, `${w}: pin ${p.lat},${p.lng} is outside the expected region for ${k}`);
    const calc = Math.min(...b.refs.map((r) => hav(r[0], r[1], p.lat, p.lng)));
    const diff = Math.abs(calc - p.dist);
    if (diff > 0.5 && diff / Math.max(calc, 0.1) > 0.12) R.fail(S, `${w}: dist ${p.dist} (km) but pin is ${calc.toFixed(2)} km from the reference point (dist is ALWAYS km)`);
    const ck = p.lat + "," + p.lng; (coords.get(ck) || coords.set(ck, []).get(ck)).push(p.id);
    if (p.phone && !b.phone.test(p.phone.replace(/\s/g, ""))) R.warn(S + " phone", `${w}: "${p.phone}" doesn't look like a ${k}-region number`);
    for (const nl of cfg.neverList) if (nl.re.test(p.name) && (!nl.base || nl.base === k) && (!nl.cat || nl.cat === p.cat)) R.fail(S, `${w}: "${p.name}" must not be listed (${nl.why})`);
  }
  for (const [id, n] of ids) if (n > 1) R.fail(S, `duplicate id ${id} ×${n}`);
  for (const [c, l] of coords) if (l.length >= 3) R.fail(S, `${l.length} listings share the exact pin ${c}: ${l.slice(0, 4).join(", ")}`);
  for (const c of cfg.bannedCats[k] || []) R.check(!usedCats.has(c), S, `category "${c}" is banned for ${k} (off-limits)`);
  const placeholder = places.filter((p) => /check current hours/i.test(p.hours)).length;
  if (placeholder) R.warn(S, `${placeholder}/${places.length} listings still have placeholder hours`);
  const noPhone = places.filter((p) => !p.phone).length;
  if (noPhone > places.length * 0.5) R.warn(S, `${noPhone}/${places.length} listings have no phone`);

  // ---------- 5. category wiring in the page ----------
  const groupBlock = (html.match(/const CAT_GROUPS\s*=\s*\{([\s\S]*?)\n\};/) || [])[1] || "";
  const groups = {}; for (const m of groupBlock.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) groups[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  R.check(Object.keys(groups).length > 0, S, "CAT_GROUPS not found");
  const loopArr = (html.match(/\[((?:"[a-z]+",?\s*)+)\]\.forEach\(\s*cat/) || [])[1] || "";
  const loopCats = [...loopArr.matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
  const tabCats = new Set([...html.matchAll(/class="cat-tab sub-tab" data-cat="([^"]+)"/g)].map((x) => x[1]));
  for (const c of usedCats) {
    R.check(tabCats.has(c), S, `category "${c}" has listings but no tab button`);
    R.check(html.includes(`id="grid-${c}"`), S, `category "${c}" has no <div id="grid-${c}">`);
    R.check(loopCats.includes(c), S, `category "${c}" is missing from the render-loop array (its cards would never render)`);
    R.check(new RegExp(`\\b${c}\\s*:\\s*\`<svg`).test(html), S, `category "${c}" has no icon in the icon map`);
    R.check(new RegExp(`\\b${c}\\s*:\\s*"#[0-9a-fA-F]{3,8}"`).test(html), S, `category "${c}" has no colour in the colour map`);
    const inGroups = Object.entries(groups).filter(([, v]) => v.includes(c)).map(([g]) => g);
    R.check(inGroups.length === 1, S, `category "${c}" is in ${inGroups.length} CAT_GROUPS (needs exactly 1)`);
    if (!new RegExp(`\\.tag\\.${c}\\b`).test(html)) R.warn(S + " css", `no .tag.${c} style`);
  }
  for (const [g, members] of Object.entries(groups)) {
    R.check(html.includes(`data-cat="group:${g}"`), S, `group "${g}" has no group tab`);
    R.check(html.includes(`class="sub-row`) && html.includes(`data-group="${g}"`), S, `group "${g}" has no sub-row`);
    for (const m of members) if (m !== "events") R.check(usedCats.has(m), S, `group "${g}" lists "${m}" which has no listings (empty tab)`);
  }
  for (const c of tabCats) if (c !== "events") R.check(usedCats.has(c), S, `tab "${c}" has no listings (empty tab)`);

  // ---------- 6. events section ----------
  const evStart = html.indexOf('id="eventsGrid"'), evEnd = html.indexOf('id="eventsNote"');
  if (evStart > 0 && evEnd > evStart) {
    const ev = html.slice(evStart, evEnd);
    const cards = ev.split('<div class="help-card">').slice(1);
    R.check(cards.length >= 3, S, `only ${cards.length} event cards`);
    const stale = [];
    for (const c of cards) {
      const name = ((c.match(/h-name">([\s\S]*?)<\/div>/) || [])[1] || "").replace(/\s+/g, " ").trim();
      R.check(name && /h-desc">/.test(c) && /Typical (dates|schedule)/.test(c), S, `event card "${name || "?"}" is missing name/desc/Typical dates`);
      const yrs = [...((c.match(/Typical (?:dates|schedule)<\/span>([\s\S]*?)<\/span>/) || [])[1] || "").matchAll(/\b(20\d\d)\b/g)].map((x) => +x[1]);
      if (yrs.length && Math.max(...yrs) < now.getFullYear()) stale.push(`${name} (latest year ${Math.max(...yrs)})`);
    }
    if (stale.length) R.warn(S + " events", `refresh needed — only past-year dates: ${stale.join("; ")}`);
    const note = html.slice(evEnd, evEnd + 700);
    const vm_ = note.match(/last verified in (\w+) (20\d\d)/);
    if (!vm_) R.fail(S, "events footnote has no 'last verified in <Month Year>'");
    else {
      const ver = new Date(`${vm_[1]} 1, ${vm_[2]}`), months = (now - ver) / (30.4 * 864e5);
      if (months > 12) R.warn(S + " events", `events last verified ${vm_[1]} ${vm_[2]} (${months.toFixed(0)} months ago)`);
      else R.ok();
    }
  } else R.warn(S, "no events section");

  // ---------- 7. HTML sanity: balanced tags, inline scripts compile ----------
  for (const t of ["div", "section", "nav", "ul", "ol", "table", "select"]) {
    const o = (html.match(new RegExp(`<${t}[\\s>]`, "g")) || []).length, c = (html.match(new RegExp(`</${t}>`, "g")) || []).length;
    R.check(o === c, S, `unbalanced <${t}>: ${o} open vs ${c} close`);
  }
  // ---------- 8. base switcher ----------
  const sw = html.slice(html.indexOf('<div class="base-dropdown"'));
  const swEnd = sw.indexOf("</div>\n      </div>"); const swHtml = swEnd > 0 ? sw.slice(0, swEnd + 6) : sw.slice(0, 1500);
  const hrefs = [...swHtml.matchAll(/<a class="opt" href="([^"]+)"/g)].map((m) => m[1]).sort();
  const want = keys.filter((x) => x !== k).map((x) => cfg.bases[x].page).sort();
  R.check(JSON.stringify(hrefs) === JSON.stringify(want), S, `base switcher links [${hrefs}] should be exactly the other bases [${want}]`);
  R.check((swHtml.match(/class="opt active"/g) || []).length === 1, S, "base switcher must have exactly one active entry");
  for (const x of keys.filter((y) => y !== k)) {
    const m = swHtml.match(new RegExp(`href="${esc(cfg.bases[x].page)}"[^>]*>[\\s\\S]*?<span class="soon">([^<]*)</span>`));
    R.check(m && m[1].trim().toLowerCase() === cfg.bases[x].status, S, `switcher badge for ${x} is "${m && m[1]}", expected "${cfg.bases[x].status}"`);
  }
  R.check(html.toUpperCase().includes(`>${b.topbar}`) || new RegExp(`<b[^>]*>[^<]*${b.topbar}`, "i").test(html), S, `topbar label doesn't mention ${b.topbar}`);
  // ---------- 9. Start Guide link ----------
  const gl = (html.match(/href="(guide[^"]*\.html)"/) || [])[1];
  R.check(gl === b.guide, S, `"Start Guide" link points to ${gl}, expected ${b.guide}`);
}

// ---------- inline scripts compile (all pages) ----------
const allPages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const titles = new Map();
for (const f of allPages) {
  const h = read(f);
  [...h.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/(ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
    try { new vm.Script(m[2], { filename: f + "#script" + i }); R.ok(); } catch (e) { R.fail(f, `inline script #${i} has a syntax error: ${e.message}`); }
  });
  [...h.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].forEach((m) => { try { JSON.parse(m[1]); R.ok(); } catch (e) { R.fail(f, "invalid JSON-LD: " + e.message); } });
  if (f === "404.html") continue;
  const canon = (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1], og = (h.match(/property="og:url" content="([^"]+)"/) || [])[1];
  for (const u of [canon, og]) if (u) R.check(!/\.html(\?|#|$)/.test(u), f, `canonical/og:url "${u}" should be the clean URL (no .html)`);
  const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1];
  R.check(!!t, f, "missing <title>");
  if (t && f !== "listing.html") { if (titles.has(t)) R.fail(f, `same <title> as ${titles.get(t)}: "${t}"`); else titles.set(t, f); }
}

// ---------- cross-file registration ----------
const worker = read("_worker.js"), listing = read("listing.html"), search = read("search.html"), suggest = read("suggest.html"), admin = read("admin.html"), index = read("index.html");
const vbk = (worker.match(/const VALID_BASE_KEYS\s*=\s*\[([^\]]*)\]/) || [])[1] || "";
const lbc = (worker.match(/const LISTING_BASE_CONFIG\s*=\s*\{([\s\S]*?)\n\};/) || [])[1] || "";
const blc = (listing.match(/const BASE_CONFIG\s*=\s*\{([\s\S]*?)\n\};/) || [])[1] || "";
const bas = (search.match(/const BASES\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || "";
for (const k of keys) {
  const b = cfg.bases[k];
  R.check(new RegExp(`"${k}"`).test(vbk), "registration", `_worker.js VALID_BASE_KEYS is missing ${k}`);
  const l1 = lbc.split("\n").find((l) => l.includes(`${k}:`)) || "";
  R.check(l1.includes(`dataFile: "${b.data}"`) && l1.includes(`refWord: "${b.refWord}"`), "registration", `_worker.js LISTING_BASE_CONFIG.${k} missing or wrong dataFile/refWord`);
  const l2 = blc.split("\n").find((l) => l.includes(`${k}:`)) || "";
  R.check(l2.includes(`hub: "${b.page}"`) && l2.includes(`dataFile: "${b.data}"`) && l2.includes(`timeZone: "${b.tz}"`) && l2.includes(`unit: "${b.unit}"`) && l2.includes(`refWord: "${b.refWord}"`), "registration", `listing.html BASE_CONFIG.${k} missing or wrong (hub/dataFile/timeZone/unit/refWord)`);
  const l3 = bas.split("\n").find((l) => l.includes(`key: "${k}"`)) || "";
  R.check(l3.includes(`hub: "${b.page}"`) && l3.includes(`dataFile: "${b.data}"`) && l3.includes(`timeZone: "${b.tz}"`), "registration", `search.html BASES entry for ${k} missing or wrong`);
  R.check(suggest.includes(`value="${k}"`), "registration", `suggest.html dropdown is missing ${k}`);
  R.check(new RegExp(`\\b${k}\\s*:\\s*"`).test((admin.match(/const BASE_LABELS\s*=\s*\{[^}]*\}/) || [""])[0]), "registration", `admin.html BASE_LABELS is missing ${k}`);
  const row = index.match(new RegExp(`<a class="base-row (\\w+)" href="${esc(b.page)}"[\\s\\S]*?<span class="base-status (\\w+)">([^<]*)</span>`));
  R.check(row && row[1] === b.status && row[2] === b.status && row[3].toLowerCase() === b.status, "registration", `index.html base card for ${k} missing or wrong status (expected ${b.status})`);
}
R.check((index.match(/class="base-row/g) || []).length === keys.length, "registration", `index.html has ${(index.match(/class="base-row/g) || []).length} base cards, config has ${keys.length}`);
R.check((vbk.match(/"/g) || []).length / 2 === keys.length, "registration", "VALID_BASE_KEYS has extra/unknown bases");

// ---------- sitemap + robots ----------
const sm = read("sitemap.xml");
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
R.check(new Set(locs).size === locs.length, "sitemap", `duplicate sitemap entries: ${locs.length - new Set(locs).size}`);
const listingLocs = new Map();
for (const l of locs) {
  R.check(!/\.html/.test(l), "sitemap", `${l} should be a clean URL`);
  const m = l.match(/\/listing\?base=([a-z]+)&amp;id=([^<]+)$/);
  if (m) (listingLocs.get(m[1]) || listingLocs.set(m[1], new Set()).get(m[1])).add(m[2]);
  else { const p = l.replace(cfg.siteUrl, "").replace(/^\//, "") || "index"; R.check(exists(p + ".html") || p === "", "sitemap", `${l} points to a page that doesn't exist`); }
}
for (const k of keys) {
  const have = listingLocs.get(k) || new Set(), want = new Set((datas[k]?.places || []).map((p) => p.id));
  const missing = [...want].filter((x) => !have.has(x)), extra = [...have].filter((x) => !want.has(x));
  R.check(!missing.length, k, `${missing.length} listing(s) missing from sitemap.xml: ${missing.slice(0, 4)}`);
  R.check(!extra.length, k, `${extra.length} stale sitemap entries (no such listing): ${extra.slice(0, 4)}`);
}
for (const k of keys) R.check(locs.includes(`${cfg.siteUrl}/${k}`) || locs.includes(`${cfg.siteUrl}/${cfg.bases[k].page.replace(".html", "")}`), "sitemap", `base page ${k} is not in the sitemap`);
R.check(/Disallow:\s*\/admin/.test(read("robots.txt")), "robots", "robots.txt must disallow /admin");
R.check(!locs.some((l) => /\/admin/.test(l)), "sitemap", "admin must not be in the sitemap");

// ---------- shared phone numbers across base pages (emergency/help cards) ----------
const nums = {};
for (const k of keys) { if (!pages[k]) continue; for (const m of pages[k].matchAll(/href="tel:([^"]+)"/g)) { const d = m[1].replace(/\D/g, ""); (nums[d] = nums[d] || new Set()).add(k); } }
for (const [d, s] of Object.entries(nums)) if (s.size > 1 && !cfg.sharedNumbers.includes(d)) R.warn("shared phone", `${d} appears on ${[...s].join(", ")} — fine for national lines, a bug if it's a local number copied from another base`);

process.exit(R.print() ? 0 : 1);
