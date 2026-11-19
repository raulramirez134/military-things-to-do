// Single source of truth for the check suite. When you add a base, add it here first.
// `tokens` are distinctive proper nouns for that base: if one shows up on ANOTHER base's page or
// data file, it is almost certainly a leftover from a template copy (see check-static.js "leftovers").
module.exports = {
  siteUrl: "https://militarythingstodo.com",
  // Phone numbers that are legitimately shared between base pages (national / DoD-wide lines), digits only.
  sharedNumbers: ["988", "8003429647", "8779955247", "8002221222", "911", "18003429647", "18002221222", "18779955247", "18772727337", "110", "112", "119"],
  // Businesses that must never be listed (confirmed closed or off-limits). Matched against listing names.
  neverList: [
    { re: /508 locals/i, why: "closed (Norfolk)" },
    { re: /pagoda ice cream/i, why: "closed 2026 (Norfolk)" },
    { re: /bahama breeze/i, why: "closed Sept 2026 (Fayetteville)" },
    { re: /walk-?on'?s/i, why: "closed (Fayetteville)" },
    { re: /mash house/i, why: "closed (Fayetteville)" },
    { re: /coffee scene/i, why: "closed (Fayetteville)" },
    { re: /country fish fry/i, why: "closed (Fayetteville)" },
    { re: /southern pines brewing|the traveler|hatchet brewing/i, why: "closed (Southern Pines)" },
    { re: /o'?connor brewing|smartmouth/i, why: "closed (Norfolk)" },
    { re: /kid'?s club daycare|military pawn shop|wolf soldier|wolf military/i, why: "USAG Humphreys off-limits list (Dec 2025)", base: "humphreys" },
    { re: /\b(abba|woomi|uptown|sun realty|un village)\b/i, why: "USAG Humphreys off-limits realtor (Dec 2025)", base: "humphreys", cat: "housing" },
  ],
  // Categories that must not exist for a base (off-limits business types).
  bannedCats: { humphreys: ["tattoo"] },
  bases: {
    ramstein: {
      label: "Ramstein", status: "live", page: "ramstein.html", data: "data.js", guide: "guide.html",
      tz: "Europe/Berlin", unit: "km", refWord: "gate", refs: [[49.4512593, 7.5844778]],
      bbox: [46.5, 5.5, 50.5, 12], tokens: ["Ramstein", "Landstuhl", "Kaiserslautern"],
      phone: /^(\+49|0)/, topbar: "RAMSTEIN",
    },
    fortbragg: {
      label: "Fort Bragg", status: "live", page: "fortbragg.html", data: "data-fortbragg.js", guide: "guide-fortbragg.html",
      tz: "America/New_York", unit: "mi", refWord: "post", refs: [[35.1415, -79.006]],
      bbox: [34.5, -83, 36.8, -75], tokens: ["Fort Bragg", "Fayetteville", "Womack"],
      phone: /^(\+1|\(?\d{3}\)?)/, topbar: "FORT BRAGG",
    },
    camppendleton: {
      label: "Camp Pendleton", status: "live", page: "camppendleton.html", data: "data-camppendleton.js", guide: "guide-camppendleton.html",
      tz: "America/Los_Angeles", unit: "mi", refWord: "base", refs: [[33.2276, -117.393], [33.3756458, -117.5647693]],
      bbox: [32.4, -118, 34, -116.8], tokens: ["Pendleton", "Oceanside"],
      phone: /^(\+1|\(?\d{3}\)?)/, topbar: "PENDLETON",
    },
    yokota: {
      label: "Yokota", status: "live", page: "yokota.html", data: "data-yokota.js", guide: "guide-yokota.html",
      tz: "Asia/Tokyo", unit: "km", refWord: "base", refs: [[35.7428, 139.3384]],
      bbox: [34.8, 138.4, 36.2, 140.3], tokens: ["Yokota", "Fussa", "374th"],
      phone: /^(\+81|0)/, topbar: "YOKOTA",
    },
    norfolk: {
      label: "Naval Station Norfolk", status: "live", page: "norfolk.html", data: "data-norfolk.js", guide: "guide-norfolk.html",
      tz: "America/New_York", unit: "mi", refWord: "gate", refs: [[36.9468, -76.3098]],
      bbox: [36.3, -77.2, 37.6, -75.6], tokens: ["Norfolk", "Hampton Roads", "Portsmouth"],
      phone: /^(\+1|\(?\d{3}\)?)/, topbar: "NORFOLK",
    },
    humphreys: {
      label: "Camp Humphreys", status: "live", page: "humphreys.html", data: "data-humphreys.js", guide: "guide-humphreys.html",
      tz: "Asia/Seoul", unit: "km", refWord: "gate", refs: [[36.967, 127.033]],
      bbox: [36.4, 126.5, 38.0, 127.6], tokens: ["Humphreys", "Pyeongtaek", "Anjeong", "Allgood"],
      phone: /^(\+82|0)/, topbar: "HUMPHREYS",
    },
  },
};
