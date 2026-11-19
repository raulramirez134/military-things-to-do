// ===== Open Now / Closed Now — shared by every base page, listing.html and search.html.
// Parses the free-text `hours` field of a listing. Conservative by design: any
// format it can't confidently read (prose, "by appointment", "varies", ...) is
// skipped (no badge) rather than risk showing wrong info.
//
// Supported, e.g.:
//   "Mon-Fri 9:00-17:00 · Sat 10-14 · Closed Sun"
//   "Daily 11-21/22"                 (closes 21 or 22 → Open only when sure)
//   "Mon–Wed & Fri 8:00–12:30, 13:30–16:00 · Thu 9–16"
//   "Tue–Thu 11:00–14:00 & 17:00–21:00 · Closed Sun–Mon"
//   "Mon–Fri 9–17 · Closed weekends & US holidays"
//   "Closed Mon · 11:00–21:00 other days"
//   "Daily 9:00–18:00 (Apr–Oct) · 9:00–17:00 (Nov–Mar)"
//   "Mon 5-24 · Tue-Thu 24hrs · Sat open 24 hours"
//   "Office: Mon–Fri 9:30–18:00"      (a single leading label is dropped)
//
// A time range is stored as [start, end] in minutes from midnight (end may pass
// 24*60 for after-midnight closing). When a listing gives alternatives
// ("11-20/22", "10/12-2") the range is [hardStart, hardEnd, softStart, softEnd]:
// inside hard → Open; inside soft but not hard → no badge (unsure).
//
// Edit ONLY this file — the pages load it with <script src="/hours.js">.
// checks/check-static.js unit-tests it and runs it over every listing.
const DAY_ABBR_MAP = {
  sun:0, sunday:0, mon:1, monday:1, tue:2, tues:2, tuesday:2, wed:3, wednesday:3,
  thu:4, thur:4, thurs:4, thursday:4, fri:5, friday:5, sat:6, saturday:6
};
const MONTH_ABBR_MAP = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 };
const HOURS_UNCERTAINTY_MARKERS = ["check ahead", "vary", "varies", "call ahead", "call for", "by booking", "by appointment", "by arrangement", "seasonal hours", "morning", "afternoon", "evening", "eve hours", "eve.", "contact for hours", "sunset", "sunrise", "dawn", "dusk"];

function parseDayToken(token){
  token = token.trim().toLowerCase();
  return DAY_ABBR_MAP[token] !== undefined ? DAY_ABBR_MAP[token] : null;
}
function parseDaySpec(spec){
  spec = spec.trim().toLowerCase();
  if (spec === "daily" || spec === "every day" || spec === "open") return [0,1,2,3,4,5,6];
  // "Sat, Sun & holidays", "weekends, US and Korean holidays" → holidays are ignored
  spec = spec.replace(/(?:,|&|\band\b)?[a-z.\s]*\bholidays?\b/g, "");
  spec = spec.replace(/\s*(?:&|\band\b)\s*/g, ",");
  const days = new Set();
  for (let part of spec.split(",")) {
    part = part.trim();
    if (!part) continue;
    if (part === "weekends" || part === "weekend") { days.add(0); days.add(6); continue; }
    if (part === "weekdays") { [1,2,3,4,5].forEach(d => days.add(d)); continue; }
    if (part.includes("/")) {
      for (const sp of part.split("/")) {
        const d = parseDayToken(sp);
        if (d === null) return null;
        days.add(d);
      }
    } else if (/[–-]/.test(part)) {
      const rangeParts = part.split(/[–-]/).map(s=>s.trim()).filter(Boolean);
      if (rangeParts.length !== 2) return null;
      const start = parseDayToken(rangeParts[0]);
      const end = parseDayToken(rangeParts[1]);
      if (start === null || end === null) return null;
      let i = start;
      while (true) { days.add(i); if (i === end) break; i = (i + 1) % 7; }
    } else {
      const d = parseDayToken(part);
      if (d === null) return null;
      days.add(d);
    }
  }
  return days.size ? Array.from(days) : null;
}
function parseTimeToken(token){
  const m = token.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (hour > 24 || minute > 59 || (hour === 24 && minute > 0)) return null;
  return hour * 60 + minute;
}
// "20/21" → [1200, 1260]
function parseTimeAlternatives(token){
  const out = [];
  for (const t of token.split("/")) {
    const v = parseTimeToken(t);
    if (v === null) return null;
    out.push(v);
  }
  return out.length ? out : null;
}
function parseTimeRanges(spec){
  const ranges = [];
  for (let group of spec.split(/\s*(?:,|&|\band\b)\s*/)) {
    group = group.trim();
    if (!group) continue;
    const parts = group.split(/[–-]/).map(s => s.trim()).filter(Boolean);
    if (parts.length !== 2) return null;
    const starts = parseTimeAlternatives(parts[0]);
    const ends = parseTimeAlternatives(parts[1]);
    if (!starts || !ends) return null;
    const hardStart = Math.max(...starts), softStart = Math.min(...starts);
    const endsAbs = ends.map(e => (e <= hardStart ? e + 24*60 : e));
    const hardEnd = Math.min(...endsAbs), softEnd = Math.max(...endsAbs);
    if (hardStart === softStart && hardEnd === softEnd) ranges.push([hardStart, hardEnd]);
    else ranges.push([hardStart, hardEnd, softStart, softEnd]);
  }
  return ranges.length ? ranges : null;
}
// "(Mar–Oct)" → is `month` (0–11) inside it? null = not a month range
function monthRangeContains(text, month){
  const m = text.trim().toLowerCase().match(/^([a-z]{3,4})[a-z]*\s*[–-]\s*([a-z]{3,4})[a-z]*$/);
  if (!m) return null;
  const a = MONTH_ABBR_MAP[m[1]], b = MONTH_ABBR_MAP[m[2]];
  if (a === undefined || b === undefined) return null;
  return a <= b ? (month >= a && month <= b) : (month >= a || month <= b);
}
// month: 0–11 (needed only for seasonal "(Apr–Oct)" groups; without it those return null)
function parseHoursString(hoursStr, month){
  if (!hoursStr) return null;
  let str = String(hoursStr).trim();
  const lowerStr = str.toLowerCase();
  for (const marker of HOURS_UNCERTAINTY_MARKERS) {
    if (lowerStr.includes(marker)) return null;
  }
  if (/^open 24 hours/i.test(str) || /^(?:open\s+)?(?:24\/7|24\s*hrs?|24 hours)$/i.test(str)) return { type: "always_open" };
  // a single leading label: "Office: Mon–Fri ...", "Leasing office: ...", "Office Mon–Fri ..."
  str = str.replace(/^[a-z][a-z .\/-]{0,30}:\s*(?=(?:mon|tue|wed|thu|fri|sat|sun|daily)\b)/i, "")
           .replace(/^office\s+(?=(?:mon|tue|wed|thu|fri|sat|sun|daily)\b)/i, "");
  // "Tue-Thu 24hrs", "Sat open 24 hours" → 0-24
  str = str.replace(/\b(?:open\s+)?24\s*(?:hours|hrs|h)\b|\b24\/7\b/gi, "0-24");
  // notes in parentheses must not be split apart below
  str = str.replace(/\([^)]*\)/g, m => m.replace(/[,·]/g, " "));
  // "Mon-Fri 7:00-21:00, Sat 10-16" → comma after a time and before a word starts a new group
  str = str.replace(/(\d)\s*,\s*(?=[a-z])/gi, "$1 · ");
  const groups = str.split(/\s*·\s*|\s+\.\s+/).map(g=>g.trim()).filter(Boolean);
  if (!groups.length) return null;
  const schedule = {};
  const fromGeneric = {};
  const closedDays = new Set();
  let closedOther = false, otherRanges = null, prevDays = null;
  for (let group of groups) {
    // seasonal parentheses "(Apr–Oct)"; any other parenthetical is a note and dropped
    let skip = false, seasonal = false;
    group = group.replace(/\(([^)]*)\)/g, (_, inner) => {
      const inside = monthRangeContains(inner, month === undefined ? -1 : month);
      if (inside === null) return "";
      seasonal = true;
      if (month === undefined) skip = "unknown";
      else if (!inside) skip = true;
      return "";
    }).trim();
    if (skip === "unknown") return null;
    const closedMatch = group.match(/^closed\s+(.+)$/i);
    if (closedMatch) {
      if (/^other days$/i.test(closedMatch[1].trim())) { closedOther = true; continue; }
      const dayIndices = parseDaySpec(closedMatch[1]);
      if (dayIndices === null) return null;
      for (const d of dayIndices) closedDays.add(d);
      continue;
    }
    const otherMatch = group.match(/^(.*\d.*?)\s+other days$/i);
    if (otherMatch) {
      const tr = parseTimeRanges(otherMatch[1]);
      if (tr === null) return null;
      otherRanges = tr;
      continue;
    }
    const digitMatch = group.match(/\d/);
    if (!digitMatch) return null;
    let daySpec = group.slice(0, digitMatch.index).trim();
    const timeSpec = group.slice(digitMatch.index).trim();
    let dayIndices;
    if (!daySpec) {
      // "· 10:00–17:00 (Nov–Feb)" continues the previous group's days
      if (!seasonal || !prevDays) return null;
      dayIndices = prevDays;
    } else {
      dayIndices = parseDaySpec(daySpec);
    }
    if (dayIndices === null) return null;
    prevDays = dayIndices;
    if (skip) continue;
    const timeRanges = parseTimeRanges(timeSpec);
    if (timeRanges === null) return null;
    const generic = dayIndices.length === 7 && /^(daily|every day|open)$/i.test(daySpec);
    for (const d of dayIndices) {
      // a specific day overrides an earlier "Daily": "Daily 8-24 · Sun 9-22"
      if (!generic && fromGeneric[d]) { schedule[d] = []; delete fromGeneric[d]; }
      if (generic && schedule[d] && !fromGeneric[d]) continue;
      schedule[d] = (schedule[d] || []).concat(timeRanges);
      if (generic) fromGeneric[d] = true;
    }
  }
  if (otherRanges) {
    for (let d = 0; d < 7; d++) if (!schedule[d] && !closedDays.has(d)) schedule[d] = otherRanges.slice();
  }
  for (const d of closedDays) schedule[d] = [];
  if (closedOther) for (let d = 0; d < 7; d++) if (!schedule[d]) schedule[d] = [];
  if (!Object.keys(schedule).length) return null;
  return { type: "schedule", schedule };
}
function getNowInTimeZone(timeZone){
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit", month: "numeric"
  }).formatToParts(new Date());
  const dayMap = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
  const weekday = parts.find(p => p.type === "weekday").value.toLowerCase().slice(0,3);
  const hour = parseInt(parts.find(p => p.type === "hour").value, 10) % 24;
  const minute = parseInt(parts.find(p => p.type === "minute").value, 10);
  const month = parseInt(parts.find(p => p.type === "month").value, 10) - 1;
  return { day: dayMap[weekday], minutes: hour * 60 + minute, month };
}
// true = open, false = closed, null = don't know (no badge).
// `now` ({day, minutes, month}) is optional — tests pass a fixed one.
function getOpenStatus(hoursStr, timeZone, now){
  now = now || getNowInTimeZone(timeZone);
  const parsed = parseHoursString(hoursStr, now.month);
  if (!parsed) return null;
  if (parsed.type === "always_open") return true;
  const todayRanges = parsed.schedule[now.day];
  let unsure = false;
  const test = (r, t) => {
    const hs = r[0], he = r[1], ss = r.length > 2 ? r[2] : hs, se = r.length > 2 ? r[3] : he;
    if (t >= hs && t < he) return true;
    if (t >= ss && t < se) unsure = true;
    return false;
  };
  // still open from last night's after-midnight range?
  const yesterdayRanges = parsed.schedule[(now.day + 6) % 7];
  if (yesterdayRanges) {
    for (const r of yesterdayRanges) if (test(r, now.minutes + 24*60)) return true;
  }
  if (!todayRanges) return null; // today isn't listed → don't guess
  for (const r of todayRanges) if (test(r, now.minutes)) return true;
  return unsure ? null : false;
}
