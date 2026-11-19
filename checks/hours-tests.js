// Unit tests for /hours.js (the shared Open/Closed parser). Used by check-static.js.
// Each case: [hours string, day (0=Sun), "HH:MM", month (1-12), expected]
//   expected: true = Open, false = Closed, null = no badge (unsure / unreadable)
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const CASES = [
  // classic formats (must never regress)
  ["Mon-Fri 9:00-17:00", 2, "12:00", 7, true],
  ["Mon-Fri 9:00-17:00", 2, "20:00", 7, false],
  ["Mon-Fri 9:00-17:00", 0, "12:00", 7, null],          // Sunday not listed → no badge
  ["Mon-Fri 9:00-17:00 · Closed Sat/Sun", 0, "12:00", 7, false],
  ["Daily 10:00-20:00", 6, "19:59", 7, true],
  ["Daily 10:00-20:00", 6, "20:00", 7, false],
  ["Daily 18:00-02:00", 6, "00:30", 7, true],           // after midnight, from Friday's range
  ["Daily 18:00-02:00", 6, "02:00", 7, false],
  ["Open 24 hours", 3, "03:00", 7, true],
  ["24/7", 3, "03:00", 7, true],
  ["Tue-Sun 11-22 . Closed Mon", 1, "12:00", 7, false],
  ["Fri-Sun 17-1", 6, "00:30", 7, true],                // Sat 00:30 from Fri range
  ["Fri-Sun 17-1", 1, "00:30", 7, true],                // Mon 00:30 from Sun range
  ["Fri-Sun 17-1", 2, "00:30", 7, null],                // Tue: not listed
  // uncertainty markers → never a badge
  ["By appointment", 2, "12:00", 7, null],
  ["Daily, hours vary", 2, "12:00", 7, null],
  ["Daily 10:00-17:30 (seasonal hours vary)", 2, "12:00", 7, null],
  ["Daily, dawn to dusk", 2, "12:00", 7, null],
  ["Sunday services — see chapel schedule", 0, "10:00", 7, null],
  // alternatives "closes 20 or 22"
  ["Daily 11-20/22", 2, "19:00", 7, true],
  ["Daily 11-20/22", 2, "21:00", 7, null],
  ["Daily 11-20/22", 2, "22:30", 7, false],
  ["Fri-Sun 10/12-2", 6, "11:00", 7, null],
  ["Fri-Sun 10/12-2", 6, "13:00", 7, true],
  ["Fri-Sun 10/12-2", 6, "01:00", 7, true],
  ["Daily 8:00/9:00-20:00", 2, "08:30", 7, null],
  // & and split shifts
  ["Tue–Thu 11:00–14:00 & 17:00–21:00 · Closed Sun–Mon", 3, "15:00", 7, false],
  ["Tue–Thu 11:00–14:00 & 17:00–21:00 · Closed Sun–Mon", 3, "18:00", 7, true],
  ["Tue–Thu 11:00–14:00 & 17:00–21:00 · Closed Sun–Mon", 1, "18:00", 7, false],
  ["Mon–Wed & Fri 8:00–12:30, 13:30–16:00 · Thu 9:00–12:30, 13:30–16:00", 5, "13:00", 7, false],
  ["Mon–Wed & Fri 8:00–12:30, 13:30–16:00 · Thu 9:00–12:30, 13:30–16:00", 5, "14:00", 7, true],
  ["Mon–Wed & Fri 8:00–12:30, 13:30–16:00 · Thu 9:00–12:30, 13:30–16:00", 4, "08:30", 7, false],
  ["Mon, Tue, Wed, Fri 09:00–12:00 & 13:00–16:00 · Thu 13:00–16:00", 4, "10:00", 7, false],
  // weekends / holidays words
  ["Mon–Fri 08:00–16:30 · Closed weekends, US and Korean holidays", 6, "10:00", 7, false],
  ["Mon–Fri 5:00–20:30 · Sat–Sun & holidays 7:30–19:00", 0, "08:00", 7, true],
  ["Tue–Sat 10:00–18:00 · Closed Sun & Mon", 1, "12:00", 7, false],
  ["Tue-Fri 10-16 . Closed weekends", 6, "12:00", 7, false],
  // "Daily" then a specific override; closed is authoritative
  ["Daily 8-24, Sun 9-22", 0, "23:00", 7, false],
  ["Daily 8-24, Sun 9-22", 1, "23:00", 7, true],
  ["Daily 10:00–18:00 · Closed Mon & Thu", 4, "12:00", 7, false],
  ["Daily 10:00–18:00 · Closed Mon & Thu", 5, "12:00", 7, true],
  // "other days"
  ["Closed Mon · 11:00–21:00 other days", 1, "12:00", 7, false],
  ["Closed Mon · 11:00–21:00 other days", 3, "12:00", 7, true],
  ["Wed 17-22 · Sat 10-12 · Closed other days", 2, "18:00", 7, false],
  ["Wed 17-22 · Sat 10-12 · Closed other days", 3, "18:00", 7, true],
  // comma between groups, 24 hours inside a group, leading label
  ["Mon–Fri 7:00–21:00, Sat 10:00–16:00", 6, "12:00", 7, true],
  ["Mon–Fri 7:00–21:00, Sat 10:00–16:00", 0, "12:00", 7, null],
  ["Wed–Sun 9:00–15:00, closed Mon–Tue", 2, "10:00", 7, false],
  ["Mon 5-24 . Tue-Thu 24hrs . Fri 0-23 . Sat/Sun 5-23", 3, "03:00", 7, true],
  ["Mon-Fri 7:30-16:30 · Sat open 24 hours · Closed Sun", 6, "03:00", 7, true],
  ["Office: Mon–Fri 9:30–18:00 · Sat 9:30–17:00 · Sun 11:00–17:00", 0, "12:00", 7, true],
  ["Office Mon–Thu 9:00–17:00 · Fri 9:00–16:00 · Closed Sat/Sun", 5, "16:30", 7, false],
  ["Water park 10:00–17:00 · Sauna 9:00–18:00", 2, "12:00", 7, null],   // two facilities → unsure
  ["Sun 9-12:30 . Office Mon-Fri 8-16", 2, "10:00", 7, null],
  // seasonal month ranges
  ["Daily 9:00–18:00 (Apr–Oct) · 9:00–17:00 (Nov–Mar)", 2, "17:30", 7, true],
  ["Daily 9:00–18:00 (Apr–Oct) · 9:00–17:00 (Nov–Mar)", 2, "17:30", 12, false],
  ["Daily 9:00–18:00 (Apr–Oct) · 9:00–17:00 (Nov–Mar)", 2, "16:30", 1, true],
  ["Tue–Sun 10:00–18:00 (Mar–Oct) · 10:00–17:00 (Nov–Feb)", 1, "12:00", 7, null],
  // notes in parentheses are ignored
  ["Mon–Wed & Sun 11:00–21:00 · Fri–Sat 11:00–23:00 (US holidays 15:00–21:00)", 5, "22:00", 7, true],
  ["Mon–Wed 11:00–21:00 · Sun 13:00–21:30 (lunch weekdays 11–13, bar from 13:00)", 0, "20:00", 7, true],
  // unreadable things stay unreadable
  ["2nd & 4th Sundays, April–December, 11:00–16:00", 0, "12:00", 7, null],
  ["Saturdays 9:00–12:00, mid-May–September", 6, "10:00", 7, null],
  ["Mon–Wed bar 13:00–21:00", 1, "14:00", 7, null],
  ["Emergency Dept. 24/7 · Appointment line Mon–Fri 7:15–16:45", 1, "03:00", 7, null],
];

function loadHours(root) {
  const ctx = { Intl, Date, Math, String, Object, Array, Set, parseInt };
  vm.createContext(ctx);
  // const declarations stay in the script scope, so expose what we test
  vm.runInContext(fs.readFileSync(path.join(root, "hours.js"), "utf8") +
    "\n;this.__h = { parseHoursString, getOpenStatus, getNowInTimeZone };", ctx, { filename: "hours.js" });
  return ctx.__h;
}

function runCases(h) {
  const failures = [];
  for (const [s, day, hm, month, want] of CASES) {
    const [hh, mm] = hm.split(":").map(Number);
    let got;
    try { got = h.getOpenStatus(s, "UTC", { day, minutes: hh * 60 + mm, month: month - 1 }); }
    catch (e) { got = "THREW " + e.message; }
    if (got !== want) failures.push(`"${s}" on day ${day} at ${hm} (month ${month}): want ${want}, got ${got}`);
  }
  return { total: CASES.length, failures };
}

// Every parsed schedule must be sane: 0 ≤ start < end ≤ 48h, days 0–6
function sanity(parsed) {
  if (!parsed || parsed.type !== "schedule") return null;
  for (const [d, ranges] of Object.entries(parsed.schedule)) {
    if (!/^[0-6]$/.test(d)) return `bad day index ${d}`;
    for (const r of ranges) {
      const [hs, he] = r, ss = r.length > 2 ? r[2] : hs, se = r.length > 2 ? r[3] : he;
      if (!(ss >= 0 && ss <= hs && se >= he && se <= 48 * 60)) return `odd range ${JSON.stringify(r)}`;
      if (!(hs < he) && r.length === 2) return `empty range ${JSON.stringify(r)}`;
    }
  }
  return null;
}

module.exports = { CASES, loadHours, runCases, sanity };
