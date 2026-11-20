// Cloudflare Worker — serves the static site and handles the reviews API.
// Requires a KV binding named REVIEWS_KV (Settings → Bindings → Add binding → KV).
// Requires an R2 binding named PHOTOS_BUCKET (Settings → Bindings → Add binding → R2)
// for review photo uploads.
// Requires a secret variable named ADMIN_KEY (Settings → Variables and Secrets →
// Add variable → type: Secret) — this is your personal password for removing reviews.
// Requires a secret variable named TURNSTILE_SECRET_KEY (same place, type: Secret) —
// this comes from the Turnstile widget you created in the Cloudflare dashboard.
// Only you know these values; they're never sent to the browser.

const MAX_REVIEWS_PER_LISTING = 200;
const MAX_TEXT_LENGTH = 1000;
const MAX_NAME_LENGTH = 60;
const ALLOWED_ORIGIN = "https://militarythingstodo.com";
const RATE_LIMIT_MAX_PER_HOUR = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB — the client compresses before upload, this is a server-side safety net
const ALLOWED_PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Basic automatic filter — blocks the most obvious profanity/slurs outright.
// This is a first line of defense, not a complete solution; you can still
// remove anything that slips through using the admin removal feature.
const BLOCKED_WORDS = [
  "fuck", "shit", "bitch", "asshole", "cunt", "faggot", "retard", "nigger", "nigga",
  "whore", "slut", "rape", "kike", "spic", "chink", "tranny",
];

function containsBlockedWords(str) {
  const lower = str.toLowerCase();
  return BLOCKED_WORDS.some(word => lower.includes(word));
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allow = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
  };
}

function jsonResponse(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeaders(request) : {}),
    },
  });
}

async function verifyTurnstile(token, ip, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return { ok: true, warning: "Turnstile not configured" };
  }
  if (!token) return { ok: false };

  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  if (ip) formData.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    return { ok: data.success === true };
  } catch {
    return { ok: false };
  }
}

async function checkRateLimit(ip, env) {
  if (!env.REVIEWS_KV || !ip) return { ok: true };

  const key = `ratelimit:${ip}`;
  const raw = await env.REVIEWS_KV.get(key);
  const count = raw ? parseInt(raw, 10) || 0 : 0;

  if (count >= RATE_LIMIT_MAX_PER_HOUR) {
    return { ok: false };
  }

  await env.REVIEWS_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  return { ok: true };
}

async function handleGetReviews(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "Missing id" }, 400, request);

  if (!env.REVIEWS_KV) {
    return jsonResponse({ reviews: [], warning: "REVIEWS_KV not bound yet" }, 200, request);
  }

  const raw = await env.REVIEWS_KV.get(`reviews:${id}`);
  const reviews = raw ? JSON.parse(raw) : [];
  return jsonResponse({ reviews }, 200, request);
}

async function handlePostReview(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Reviews storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  }

  const ip = request.headers.get("CF-Connecting-IP");

  const rateLimit = await checkRateLimit(ip, env);
  if (!rateLimit.ok) {
    return jsonResponse({ error: "Too many reviews submitted recently — please try again later." }, 429, request);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ error: "Invalid form submission" }, 400, request);
  }

  const turnstileResult = await verifyTurnstile(formData.get("turnstileToken"), ip, env);
  if (!turnstileResult.ok) {
    return jsonResponse({ error: "Verification failed — please try again." }, 400, request);
  }

  const id = (formData.get("id") || "").toString().slice(0, 200);
  const name = (formData.get("name") || "Anonymous").toString().slice(0, MAX_NAME_LENGTH);
  const text = (formData.get("text") || "").toString().slice(0, MAX_TEXT_LENGTH);
  let rating = Number(formData.get("rating"));

  if (!id) return jsonResponse({ error: "Missing id" }, 400, request);
  if (!text.trim()) return jsonResponse({ error: "Review text is required" }, 400, request);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: "Rating must be between 1 and 5" }, 400, request);
  }
  rating = Math.round(rating);

  if (containsBlockedWords(text) || containsBlockedWords(name)) {
    return jsonResponse({ error: "Your review couldn't be posted because it contains language that isn't allowed here." }, 400, request);
  }

  // Optional photo upload
  let photoKey = null;
  const photo = formData.get("photo");
  if (photo && typeof photo === "object" && photo.size > 0) {
    if (!env.PHOTOS_BUCKET) {
      return jsonResponse({ error: "Photo uploads aren't set up yet (PHOTOS_BUCKET binding missing)." }, 503, request);
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return jsonResponse({ error: "Photo is too large — please use a smaller image." }, 400, request);
    }
    const ext = ALLOWED_PHOTO_TYPES[photo.type];
    if (!ext) {
      return jsonResponse({ error: "Photo must be a JPEG, PNG, or WebP image." }, 400, request);
    }
    photoKey = `photos/${id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    await env.PHOTOS_BUCKET.put(photoKey, photo.stream(), {
      httpMetadata: { contentType: photo.type },
    });
  }

  const key = `reviews:${id}`;
  const raw = await env.REVIEWS_KV.get(key);
  const reviews = raw ? JSON.parse(raw) : [];

  reviews.unshift({ name, rating, text, date: new Date().toISOString(), removed: false, photoKey });
  const trimmed = reviews.slice(0, MAX_REVIEWS_PER_LISTING);

  await env.REVIEWS_KV.put(key, JSON.stringify(trimmed));
  return jsonResponse({ ok: true, reviews: trimmed }, 200, request);
}

async function handlePhoto(request, env, photoKey) {
  if (!env.PHOTOS_BUCKET) {
    return new Response("Photo storage not configured", { status: 503 });
  }
  const object = await env.PHOTOS_BUCKET.get(photoKey);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

async function handleDeleteReview(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Reviews storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  }
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: "Admin removal isn't set up yet (ADMIN_KEY secret missing)." }, 503, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, request);
  }

  const id = (body.id || "").toString();
  const date = (body.date || "").toString();
  const adminKey = (body.adminKey || "").toString();

  if (adminKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin password." }, 401, request);
  }
  if (!id || !date) return jsonResponse({ error: "Missing id or date" }, 400, request);

  const key = `reviews:${id}`;
  const raw = await env.REVIEWS_KV.get(key);
  const reviews = raw ? JSON.parse(raw) : [];

  const idx = reviews.findIndex(r => r.date === date);
  if (idx === -1) return jsonResponse({ error: "Review not found" }, 404, request);

  // Clean up the associated photo in R2, if any, so removed content is fully gone.
  if (reviews[idx].photoKey && env.PHOTOS_BUCKET) {
    await env.PHOTOS_BUCKET.delete(reviews[idx].photoKey).catch(() => {});
  }

  reviews[idx] = {
    date: reviews[idx].date,
    removed: true,
  };

  await env.REVIEWS_KV.put(key, JSON.stringify(reviews));
  return jsonResponse({ ok: true, reviews }, 200, request);
}

const MAX_SUGGESTIONS_STORED = 500;
const MAX_SUGGESTION_FIELD_LENGTH = 500;
const VALID_BASE_KEYS = ["ramstein", "fortbragg", "camppendleton", "yokota", "norfolk", "humphreys", "campbell", "stuttgart", "wiesbaden"];

// Owner notification via Discord webhook — best-effort only. If the webhook
// isn't configured yet, or Discord is briefly unreachable, this never blocks
// or breaks the actual submission; it just quietly does nothing.
async function notifyDiscord(message, env) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch {
    // Notification failures should never affect the actual submission.
  }
}

async function handlePostSuggestion(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  }

  const ip = request.headers.get("CF-Connecting-IP");
  const rateLimitKey = ip ? `ratelimit-suggest:${ip}` : null;
  if (rateLimitKey) {
    const raw = await env.REVIEWS_KV.get(rateLimitKey);
    const count = raw ? parseInt(raw, 10) || 0 : 0;
    if (count >= RATE_LIMIT_MAX_PER_HOUR) {
      return jsonResponse({ error: "Too many suggestions submitted recently — please try again later." }, 429, request);
    }
    await env.REVIEWS_KV.put(rateLimitKey, String(count + 1), { expirationTtl: 3600 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, request);
  }

  const turnstileResult = await verifyTurnstile(body.turnstileToken, ip, env);
  if (!turnstileResult.ok) {
    return jsonResponse({ error: "Verification failed — please try again." }, 400, request);
  }

  const base = (body.base || "").toString();
  const name = (body.name || "").toString().slice(0, MAX_SUGGESTION_FIELD_LENGTH);
  const category = (body.category || "").toString().slice(0, MAX_SUGGESTION_FIELD_LENGTH);
  const details = (body.details || "").toString().slice(0, MAX_TEXT_LENGTH);
  const submitterName = (body.submitterName || "").toString().slice(0, MAX_NAME_LENGTH);
  const submitterContact = (body.submitterContact || "").toString().slice(0, MAX_SUGGESTION_FIELD_LENGTH);

  if (!VALID_BASE_KEYS.includes(base)) return jsonResponse({ error: "Please select a valid base." }, 400, request);
  if (!name.trim()) return jsonResponse({ error: "Business/place name is required." }, 400, request);

  if (containsBlockedWords(name) || containsBlockedWords(details) || containsBlockedWords(submitterName)) {
    return jsonResponse({ error: "Your submission couldn't be posted because it contains language that isn't allowed here." }, 400, request);
  }

  const key = "suggestions";
  const raw = await env.REVIEWS_KV.get(key);
  const suggestions = raw ? JSON.parse(raw) : [];

  suggestions.unshift({
    id: crypto.randomUUID(),
    base, name, category, details, submitterName, submitterContact,
    date: new Date().toISOString(),
    handled: false,
  });
  const trimmed = suggestions.slice(0, MAX_SUGGESTIONS_STORED);

  await env.REVIEWS_KV.put(key, JSON.stringify(trimmed));

  const baseLabel = LISTING_BASE_CONFIG[base] ? LISTING_BASE_CONFIG[base].label : base;
  await notifyDiscord(
    `💡 **New listing suggestion** — ${baseLabel}\n**${name}**${category ? ` (${category})` : ""}\n${details ? details.slice(0, 200) : "No details provided."}\nReview it: https://militarythingstodo.com/admin.html`,
    env
  );

  return jsonResponse({ ok: true }, 200, request);
}

async function handleGetSuggestions(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  }
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: "Admin access isn't set up yet (ADMIN_KEY secret missing)." }, 503, request);
  }
  const url = new URL(request.url);
  const adminKey = url.searchParams.get("adminKey") || "";
  if (adminKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin password." }, 401, request);
  }
  const raw = await env.REVIEWS_KV.get("suggestions");
  const suggestions = raw ? JSON.parse(raw) : [];
  return jsonResponse({ suggestions }, 200, request);
}

async function handleMarkSuggestionHandled(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  }
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: "Admin access isn't set up yet (ADMIN_KEY secret missing)." }, 503, request);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, request);
  }
  const adminKey = (body.adminKey || "").toString();
  const id = (body.id || "").toString();
  if (adminKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin password." }, 401, request);
  }
  if (!id) return jsonResponse({ error: "Missing id" }, 400, request);

  const raw = await env.REVIEWS_KV.get("suggestions");
  const suggestions = raw ? JSON.parse(raw) : [];
  const idx = suggestions.findIndex(s => s.id === id);
  if (idx === -1) return jsonResponse({ error: "Suggestion not found" }, 404, request);

  suggestions[idx].handled = true;
  await env.REVIEWS_KV.put("suggestions", JSON.stringify(suggestions));
  return jsonResponse({ ok: true }, 200, request);
}

const MAX_FEEDBACK_STORED = 500;
const VALID_FEEDBACK_TYPES = [
  "Suggest a new listing",
  "Correction (hours, phone, address, etc.)",
  "Claim this listing",
  "Complaint",
  "General feedback",
];

async function handlePostFeedback(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  }

  const ip = request.headers.get("CF-Connecting-IP");
  const rateLimitKey = ip ? `ratelimit-feedback:${ip}` : null;
  if (rateLimitKey) {
    const raw = await env.REVIEWS_KV.get(rateLimitKey);
    const count = raw ? parseInt(raw, 10) || 0 : 0;
    if (count >= RATE_LIMIT_MAX_PER_HOUR) {
      return jsonResponse({ error: "Too many messages submitted recently — please try again later." }, 429, request);
    }
    await env.REVIEWS_KV.put(rateLimitKey, String(count + 1), { expirationTtl: 3600 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, request);
  }

  const turnstileResult = await verifyTurnstile(body.turnstileToken, ip, env);
  if (!turnstileResult.ok) {
    return jsonResponse({ error: "Verification failed — please try again." }, 400, request);
  }

  const base = (body.base || "").toString();
  const type = VALID_FEEDBACK_TYPES.includes(body.type) ? body.type : "General feedback";
  const name = (body.name || "").toString().slice(0, MAX_NAME_LENGTH);
  const email = (body.email || "").toString().slice(0, MAX_SUGGESTION_FIELD_LENGTH);
  const message = (body.message || "").toString().slice(0, MAX_TEXT_LENGTH);
  const listingName = (body.listingName || "").toString().slice(0, MAX_SUGGESTION_FIELD_LENGTH);
  const listingId = (body.listingId || "").toString().slice(0, 200);

  if (!message.trim()) return jsonResponse({ error: "Please enter a message." }, 400, request);
  if (containsBlockedWords(message) || containsBlockedWords(name) || containsBlockedWords(listingName)) {
    return jsonResponse({ error: "Your message couldn't be sent because it contains language that isn't allowed here." }, 400, request);
  }

  const key = "feedback";
  const raw = await env.REVIEWS_KV.get(key);
  const items = raw ? JSON.parse(raw) : [];

  items.unshift({
    id: crypto.randomUUID(),
    base: VALID_BASE_KEYS.includes(base) ? base : null,
    listingName: listingName || null,
    listingId: listingId || null,
    type, name, email, message,
    date: new Date().toISOString(),
    handled: false,
  });
  const trimmed = items.slice(0, MAX_FEEDBACK_STORED);

  await env.REVIEWS_KV.put(key, JSON.stringify(trimmed));

  const baseLabel = VALID_BASE_KEYS.includes(base) && LISTING_BASE_CONFIG[base] ? LISTING_BASE_CONFIG[base].label : "General";
  await notifyDiscord(
    `📬 **New feedback** (${type}) — ${baseLabel}${listingName ? `\nRegarding: **${listingName}**` : ""}\n${message.slice(0, 200)}\nReview it: https://militarythingstodo.com/admin.html`,
    env
  );

  return jsonResponse({ ok: true }, 200, request);
}

async function handleGetFeedback(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  }
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: "Admin access isn't set up yet (ADMIN_KEY secret missing)." }, 503, request);
  }
  const url = new URL(request.url);
  const adminKey = url.searchParams.get("adminKey") || "";
  if (adminKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin password." }, 401, request);
  }
  const raw = await env.REVIEWS_KV.get("feedback");
  const items = raw ? JSON.parse(raw) : [];
  return jsonResponse({ feedback: items }, 200, request);
}

async function handleMarkFeedbackHandled(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  }
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: "Admin access isn't set up yet (ADMIN_KEY secret missing)." }, 503, request);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, request);
  }
  const adminKey = (body.adminKey || "").toString();
  const id = (body.id || "").toString();
  if (adminKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin password." }, 401, request);
  }
  if (!id) return jsonResponse({ error: "Missing id" }, 400, request);

  const raw = await env.REVIEWS_KV.get("feedback");
  const items = raw ? JSON.parse(raw) : [];
  const idx = items.findIndex(s => s.id === id);
  if (idx === -1) return jsonResponse({ error: "Feedback item not found" }, 404, request);

  items[idx].handled = true;
  await env.REVIEWS_KV.put("feedback", JSON.stringify(items));
  return jsonResponse({ ok: true }, 200, request);
}

const LISTING_BASE_CONFIG = {
  ramstein: { label: "Ramstein", full: "Ramstein Air Base", refWord: "gate", unit: "km", dataFile: "data.js" },
  fortbragg: { label: "Fort Bragg", full: "Fort Bragg", refWord: "post", unit: "mi", dataFile: "data-fortbragg.js" },
  camppendleton: { label: "Camp Pendleton", full: "Camp Pendleton", refWord: "base", unit: "mi", dataFile: "data-camppendleton.js" },
  yokota: { label: "Yokota", full: "Yokota Air Base", refWord: "base", unit: "km", dataFile: "data-yokota.js" },
  norfolk: { label: "Naval Station Norfolk", full: "Naval Station Norfolk", refWord: "gate", unit: "mi", dataFile: "data-norfolk.js" },
  humphreys: { label: "Camp Humphreys", full: "Camp Humphreys", refWord: "gate", unit: "km", dataFile: "data-humphreys.js" },
  campbell: { label: "Fort Campbell", full: "Fort Campbell", refWord: "gate", unit: "mi", dataFile: "data-campbell.js" },
  stuttgart: { label: "Stuttgart", full: "USAG Stuttgart", refWord: "base", unit: "km", dataFile: "data-stuttgart.js" },
  wiesbaden: { label: "Wiesbaden", full: "USAG Wiesbaden", refWord: "base", unit: "km", dataFile: "data-wiesbaden.js" },
};
const SITE = "https://militarythingstodo.com";

// schema.org type per category (same map listing.html uses)
const SCHEMA_TYPE_MAP = {
  restaurant: "Restaurant", bars: "BarOrPub", grocery: "GroceryStore",
  shopping: "Store", farmers: "Store", furniture: "Store", tailor: "Store",
  cars: "AutomotiveBusiness", auto: "AutomotiveBusiness", phone: "Store",
  health: "MedicalBusiness", banking: "BankOrCreditUnion", religious: "PlaceOfWorship",
  fitness: "ExerciseGym", wine: "Winery", attraction: "TouristAttraction",
  museum: "Museum", castles: "TouristAttraction", tokyo: "TouristAttraction",
  sandiego: "TouristAttraction", onsen: "TouristAttraction", outdoors: "TouristAttraction",
  beaches: "TouristAttraction", rec: "TouristAttraction", ski: "TouristAttraction",
  mountains: "TouristAttraction", coast: "TouristAttraction", pets: "Store", kids: "TouristAttraction",
};

function escapeHtmlAttr(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Social media / messaging apps (Facebook, X, iMessage, Slack, Discord, etc.) don't
// execute JavaScript when generating link previews — they read the raw HTML that's
// actually sent over the wire. Since listing.html is a client-rendered page, the
// title/description it updates via JS is invisible to those crawlers, so every
// shared listing link showed the same generic preview. This intercepts the request
// server-side and injects the correct per-listing tags before the HTML is sent,
// so previews (and non-JS search engines) see the real listing every time.
// Cloudflare Workers forbid eval / new Function ("Code generation from strings disallowed"),
// so the data files can't simply be executed. Each listing is a single line of the form
// { id:"x", name:"...", ..., blurb:"...", ... }, so pull the fields out with a string-aware regex.
function parsePlaceLine(line) {
  const str = (key) => {
    const m = line.match(new RegExp(`\\b${key}:\\s*("(?:[^"\\\\]|\\\\.)*")`));
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  };
  const num = (key) => { const m = line.match(new RegExp(`\\b${key}:\\s*(-?[0-9.]+)`)); return m ? parseFloat(m[1]) : null; };
  const id = str("id"), name = str("name");
  if (!id || !name) return null;
  return { id, name, cat: str("cat") || "", blurb: str("blurb") || "", addr: str("addr") || "", hours: str("hours") || "",
    phone: str("phone"), area: str("area"), dist: num("dist"), lat: num("lat"), lng: num("lng") };
}
function extractPlace(dataText, id) {
  const marker = `id:${JSON.stringify(id)}`;
  const at = dataText.indexOf(marker);
  if (at === -1) return null;
  const start = dataText.lastIndexOf("\n", at) + 1;
  let end = dataText.indexOf("\n", at);
  if (end === -1) end = dataText.length;
  const place = parsePlaceLine(dataText.slice(start, end));
  return place && place.id === id ? place : null;
}
function extractAllPlaces(dataText) {
  return dataText.split("\n").filter((l) => /^\s*\{\s*id:"/.test(l)).map(parsePlaceLine).filter(Boolean);
}
function extractCatLabels(dataText) {
  const m = dataText.match(/const catLabels\s*=\s*\{([^\n]*)\}/);
  const out = {};
  if (m) for (const p of m[1].matchAll(/([a-z]+)\s*:\s*("(?:[^"\\]|\\.)*")/g)) { try { out[p[1]] = JSON.parse(p[2]); } catch {} }
  return out;
}
function distLabel(place, cfg, baseKey) {
  const ref = baseKey === "camppendleton" ? (place.area === "south" ? "South Area" : "North Area") : cfg.refWord;
  if (place.dist == null) return "";
  if (place.dist === 0) return `On ${cfg.refWord === "post" ? "post" : "base"}`;
  const km = place.dist.toFixed(1), mi = (place.dist * 0.621371).toFixed(1);
  return cfg.unit === "mi" ? `${mi} mi / ${km} km from ${ref}` : `${km} km / ${mi} mi from ${ref}`;
}
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:—–-]\s*$/, "") + "…";
}
function jsonLd(obj, id) {
  return `<script type="application/ld+json"${id ? ` id="${id}"` : ""}>${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}
const ogImageFor = (baseKey) => `${SITE}/og/${baseKey}.jpg`;

async function handleListingPage(request, env) {
  const url = new URL(request.url);
  const assetResponse = await env.ASSETS.fetch(request);
  const contentType = assetResponse.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return assetResponse;

  const baseKey = LISTING_BASE_CONFIG[url.searchParams.get("base")] ? url.searchParams.get("base") : "ramstein";
  const id = url.searchParams.get("id");
  if (!id) return assetResponse;

  const cfg = LISTING_BASE_CONFIG[baseKey];
  const hub = `/${baseKey}`;
  let html = await assetResponse.text();
  // The body can only be read once, so any fallback must rebuild the response from `html`.
  const passthrough = new Response(html, { status: assetResponse.status, headers: assetResponse.headers });
  const E = escapeHtmlAttr;

  try {
    const dataUrl = new URL("/" + cfg.dataFile, url);
    const dataResponse = await env.ASSETS.fetch(new Request(dataUrl, request));
    const dataText = await dataResponse.text();
    const place = extractPlace(dataText, id);

    // Shared by both branches: the right base in the top bar
    html = html.replace('<a class="brand" href="/ramstein">', `<a class="brand" href="${hub}">`)
      .replace('<a class="back-link" href="/ramstein">← Back to Ramstein listings</a>', `<a class="back-link" href="${hub}">← Back to ${E(cfg.label)} listings</a>`);

    if (!place) {
      // Unknown listing: a real 404 (not a 200 "not found" page), with a way back
      html = html.replace(/<div class="header-inner" id="headerInner">[\s\S]*?<\/div>\n/, `<div class="header-inner" id="headerInner"><h1 class="title">Listing not found</h1></div>\n`)
        .replace('<div class="main-col" id="mainContent"></div>', `<div class="main-col" id="mainContent"><div class="not-found"><p>That listing doesn't exist — it may have been renamed or removed.</p><p><a href="${hub}">← Back to the full ${E(cfg.label)} list</a></p></div></div>`)
        .replace("<head>", '<head>\n<meta name="robots" content="noindex">');
      const h = new Headers(assetResponse.headers);
      return new Response(html, { status: 404, headers: h });
    }

    const catLabels = extractCatLabels(dataText);
    const catLabel = catLabels[place.cat] || "";
    const dist = distLabel(place, cfg, baseKey);
    const title = `${place.name} — ${cfg.label} | Military Things To Do`;
    const short = place.dist ? ` ${cfg.unit === "mi" ? (place.dist * 0.621371).toFixed(1) + " mi" : place.dist.toFixed(1) + " km"} from ${cfg.label} ${cfg.refWord}.` : "";
    const description = clip(place.blurb + short, 160);
    const canonicalUrl = `${SITE}/listing?base=${baseKey}&id=${id}`;

    html = html.replace("<title>Listing — Military Things To Do</title>", `<title>${E(title)}</title>`);
    html = html.replace(/<meta name="description" content="[^"]*" id="metaDescTag">/, `<meta name="description" content="${E(description)}" id="metaDescTag">`);
    html = html.replace(/<link rel="canonical" href="[^"]*" id="canonicalTag">/, `<link rel="canonical" href="${E(canonicalUrl)}" id="canonicalTag">`);

    // Readable without JavaScript (AI answer engines, link previews, Google's first pass).
    // listing.html's script replaces these blocks with the full interactive version.
    const header = `<div class="header-inner" id="headerInner">
      <div class="header-copy">
        ${catLabel ? `<div class="tag-inline">${E(catLabel)}</div>` : ""}
        <h1 class="title">${E(place.name)}</h1>
      </div>
    </div>\n`;
    html = html.replace(/<div class="header-inner" id="headerInner">[\s\S]*?<\/div>\n/, header);
    const row = (k, v) => `<div class="detail-card"><div><div class="k">${k}</div><div class="v">${E(v)}</div></div></div>`;
    const main = `<div class="main-col" id="mainContent">
      <p class="blurb-block">${E(place.blurb)}</p>
      <div class="detail-grid">
        ${place.addr ? row("Address", place.addr) : ""}
        ${dist ? row(`Distance from ${cfg.label}`, dist) : ""}
        ${place.hours ? row("Hours", place.hours) : ""}
        ${row("Phone", place.phone || "Not listed")}
      </div>
      <p><a href="${hub}">← All ${E(cfg.label)} listings</a></p>
    </div>`;
    html = html.replace('<div class="main-col" id="mainContent"></div>', main);

    // Structured data: the business itself + breadcrumbs. No aggregateRating — the ratings
    // shown on the page come from Google, and Google's rules forbid marking up ratings from other sites.
    const ld = { "@context": "https://schema.org", "@type": SCHEMA_TYPE_MAP[place.cat] || "LocalBusiness",
      name: place.name, description: place.blurb, url: canonicalUrl };
    if (place.addr) ld.address = { "@type": "PostalAddress", streetAddress: place.addr };
    if (place.lat != null && place.lng != null) ld.geo = { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng };
    if (place.phone) ld.telephone = place.phone;
    const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Military Things To Do", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: cfg.full, item: `${SITE}/${baseKey}` },
      { "@type": "ListItem", position: 3, name: place.name, item: canonicalUrl } ] };

    const headTags = `<meta property="og:title" content="${E(title)}">
<meta property="og:description" content="${E(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${E(canonicalUrl)}">
<meta property="og:site_name" content="Military Things To Do">
<meta property="og:image" content="${ogImageFor(baseKey)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${E(title)}">
<meta name="twitter:description" content="${E(description)}">
<meta name="twitter:image" content="${ogImageFor(baseKey)}">
${jsonLd(ld, "ldListing")}
${jsonLd(crumbs, "ldCrumbs")}
</head>`;
    html = html.replace("</head>", headTags);
  } catch (err) {
    console.log("listing inject failed:", String(err && err.stack || err));
    // If anything goes wrong (malformed data file, unexpected place shape, etc.),
    // just serve the original page unchanged rather than risk a broken response.
    return passthrough;
  }

  return new Response(html, {
    status: assetResponse.status,
    headers: assetResponse.headers,
  });
}

// Base pages (/ramstein, /humphreys, …) build their listing cards with JavaScript. Crawlers that
// don't run JavaScript (ChatGPT search, Perplexity, Claude, link previews) would see no listings at
// all, so pre-fill every category grid with plain cards; the page's own render() replaces them.
async function handleBasePage(request, env, baseKey) {
  const assetResponse = await env.ASSETS.fetch(request);
  const contentType = assetResponse.headers.get("Content-Type") || "";
  if (assetResponse.status !== 200 || !contentType.includes("text/html")) return assetResponse;
  let html = await assetResponse.text();
  const passthrough = new Response(html, { status: 200, headers: assetResponse.headers });
  try {
    const cfg = LISTING_BASE_CONFIG[baseKey];
    const dataResponse = await env.ASSETS.fetch(new Request(new URL("/" + cfg.dataFile, request.url), request));
    const dataText = await dataResponse.text();
    const places = extractAllPlaces(dataText);
    if (!places.length) return passthrough;
    const labels = extractCatLabels(dataText);
    const E = escapeHtmlAttr;
    const byCat = {};
    for (const p of places) (byCat[p.cat] = byCat[p.cat] || []).push(p);
    html = html.replace(/<div class="grid" data-group="([a-z]+)" id="grid-\1"><\/div>/g, (m, cat) => {
      const items = (byCat[cat] || []).slice().sort((a, b) => (a.dist ?? 999) - (b.dist ?? 999));
      if (!items.length) return m;
      const cards = items.map((p) => `<div class="card" data-cat="${E(cat)}"><div class="card-top"><div class="name-row"><a class="card-name" href="/listing?base=${baseKey}&amp;id=${E(p.id)}">${E(p.name)}</a></div></div>` +
        (labels[cat] ? `<div class="tag ${E(cat)}">${E(labels[cat])}</div>` : "") +
        `<div class="card-blurb">${E(p.blurb)}</div>` + (p.addr ? `<div class="card-addr">${E(p.addr)}</div>` : "") +
        `<div class="card-meta"><span class="dist">${E(distLabel(p, cfg, baseKey))}</span><span>${E(p.hours)}</span></div></div>`).join("");
      return `<div class="grid" data-group="${cat}" id="grid-${cat}">${cards}</div>`;
    });
  } catch (err) {
    console.log("base page prefill failed:", String(err && err.stack || err));
    return passthrough;
  }
  return new Response(html, { status: 200, headers: assetResponse.headers });
}

// Full backup export — pulls every review (stored per-listing under "reviews:{id}"),
// every suggestion, and every feedback message into one downloadable JSON file, so
// there's a real way to recover this data if anything ever goes wrong on Cloudflare's
// end. Admin-only, same password as everything else in admin.html.
async function handleExportData(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  }
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: "Admin access isn't set up yet (ADMIN_KEY secret missing)." }, 503, request);
  }
  const url = new URL(request.url);
  const adminKey = url.searchParams.get("adminKey") || "";
  if (adminKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin password." }, 401, request);
  }

  const reviews = {};
  let cursor;
  do {
    const listResult = await env.REVIEWS_KV.list({ prefix: "reviews:", cursor });
    for (const key of listResult.keys) {
      const value = await env.REVIEWS_KV.get(key.name);
      if (value) {
        const listingId = key.name.slice("reviews:".length);
        try { reviews[listingId] = JSON.parse(value); } catch { /* skip malformed entries rather than fail the whole export */ }
      }
    }
    cursor = listResult.list_complete ? undefined : listResult.cursor;
  } while (cursor);

  const suggestionsRaw = await env.REVIEWS_KV.get("suggestions");
  const feedbackRaw = await env.REVIEWS_KV.get("feedback");

  let suggestions = [], feedback = [];
  try { suggestions = suggestionsRaw ? JSON.parse(suggestionsRaw) : []; } catch { /* leave empty if malformed */ }
  try { feedback = feedbackRaw ? JSON.parse(feedbackRaw) : []; } catch { /* leave empty if malformed */ }

  const exportData = {
    exportedAt: new Date().toISOString(),
    reviewCount: Object.values(reviews).reduce((sum, arr) => sum + arr.length, 0),
    reviews,
    suggestions,
    feedback,
  };

  const dateStamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="military-things-backup-${dateStamp}.json"`,
    },
  });
}

// ---- Currency exchange rates (Service Credit Union) ----
// Service CU publishes the official military accommodation rate once per business day
// (by 4 p.m. CET). Their rates page reads it from a public JSON feed; we read the same feed
// at most every few hours, keep the last good copy in KV, and serve that — so a slow or
// failed read never breaks a page.
const SCU_RATES_URL = "https://servicecu.org/international-services/exchange-rates/";
const SCU_RATES_API = "https://servicecu.org/api/default/exchangerates?%24orderby=Date%20desc%2CPublicationDate%20desc&%24top=10";
const RATES_KV_KEY = "fx:scu:v3";
const RATES_REFRESH_MS = 3 * 60 * 60 * 1000;     // re-read Service CU at most every 3 hours
const RATES_RETRY_MS = 30 * 60 * 1000;           // after a failed read, wait 30 min before retrying
const SCU_CURRENCIES = { EUR: "Euro", CZK: "Czech Koruna", DKK: "Danish Krone", GBP: "British Pound", PLN: "Polish Zloty", RON: "Romanian Leu", SEK: "Swedish Krona", CHF: "Swiss Franc", NOK: "Norwegian Krone", AUD: "Australian Dollar", CAD: "Canadian Dollar", HKD: "Hong Kong Dollar", ILS: "Israeli New Shekel", NZD: "New Zealand Dollar", SGD: "Singapore Dollar", ZAR: "South African Rand" };

function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function scuItemRates(item) {
  let arr = [];
  try { arr = JSON.parse((item && item.Data) || "[]"); } catch { arr = []; }
  const out = {};
  for (const r of Array.isArray(arr) ? arr : []) {
    const code = String((r && r.currency) || "").trim().toUpperCase();
    const rate = parseFloat(String(r.accommodation_rate || "").replace(",", "."));
    if (!SCU_CURRENCIES[code] || !(rate > 0)) continue;
    const reconv = parseFloat(String(r.reconversion_rate || "").replace(",", "."));
    out[code] = { rate, reconversion: reconv > 0 ? reconv : null, start: String(r.rate_start_date || "").slice(0, 10) };
  }
  return out;
}

// Turns Service CU's feed ({ value: [ { Date, Data: "<json list>" }, ... ] }, newest first) into
// the rows we show. "Change" compares with the most recent earlier set that actually differs.
function parseScuFeed(json) {
  const items = Array.isArray(json && json.value) ? json.value : [];
  if (!items.length) return null;
  const cur = scuItemRates(items[0]);
  if (!cur.EUR) return null;
  const sig = (m) => JSON.stringify(Object.keys(m).sort().map(k => [k, m[k].rate]));
  let prev = null;
  for (const it of items.slice(1)) { const m = scuItemRates(it); if (Object.keys(m).length && sig(m) !== sig(cur)) { prev = m; break; } }
  const rates = Object.keys(SCU_CURRENCIES).filter(c => cur[c]).map(code => {
    const r = cur[code], p = prev && prev[code];
    const change = p ? (r.rate > p.rate ? "up" : r.rate < p.rate ? "down" : "same") : "";
    return { code, name: SCU_CURRENCIES[code], rate: r.rate, change, reconversion: code === "EUR" ? r.reconversion : null, validFrom: r.start };
  });
  // Service CU shows "Last updated" as the day before the rates take effect.
  let updated = "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cur.EUR.start);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - 1));
    updated = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
  }
  return { source: "Service Credit Union", sourceUrl: SCU_RATES_URL, updated, validFrom: cur.EUR.start, rates };
}

// ---- Community Bank (on-base bank in Japan and Korea) — yen and won ----
// Community Bank prints the day's in-country rate on its public currency pages.
const CB_PAGES = {
  yen: { url: "https://www.dodcommunitybank.com/home/currency_exchange/yen", code: "JPY", name: "Japanese Yen", symbol: "¥", country: "Japan" },
  won: { url: "https://www.dodcommunitybank.com/home/currency_exchange/won", code: "KRW", name: "Korean Won", symbol: "₩", country: "South Korea" },
};

function parseCommunityBank(html, page) {
  // Currency signs may arrive as entities (&#8361; for won) — drop entities so their digits aren't read as the rate.
  html = String(html || "").replace(/&#x?[0-9a-f]+;|&[a-z]+;/gi, " ");
  const num = (id) => {
    const m = new RegExp('id="' + id + '"[^>]*>[\\s\\S]{0,200}?<span>\\s*[^0-9<]*([0-9][0-9,.]*)\\s*</span>', "i").exec(html);
    return m ? parseFloat(m[1].replace(/,/g, "")) : NaN;
  };
  const buy = num("dollar_buys"), back = num("dollar_equivalent");
  const eff = (/id="date_effective"[^>]*>[^<]*<\/span>\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i.exec(html) || [])[1] || "";
  if (!(buy > 0)) return null;
  let validFrom = "";
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(eff);
  if (m) validFrom = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return {
    source: "Community Bank", sourceUrl: page.url, updated: eff, validFrom, country: page.country,
    rates: [{ code: page.code, name: page.name, symbol: page.symbol, rate: buy, change: "", reconversion: back > 0 ? back : null, validFrom }],
  };
}

// Reads a rates source at most every few hours, keeps the last good copy in KV and serves that.
async function cachedRates(env, kvKey, load, force = false) {
  const kv = env.REVIEWS_KV;
  let cached = null;
  if (kv) {
    try { cached = JSON.parse((await kv.get(kvKey)) || "null"); } catch { cached = null; }
  }
  const now = Date.now();
  const fresh = cached && cached.fetchedAt && now - cached.fetchedAt < RATES_REFRESH_MS;
  const recentlyFailed = cached && cached.failedAt && now - cached.failedAt < RATES_RETRY_MS;
  if (force || (!fresh && !recentlyFailed)) {
    let parsed = null, failReason = "";
    try { ({ parsed, failReason } = await load()); } catch { failReason = "could not reach the rates source"; }
    if (parsed) cached = { ...parsed, fetchedAt: now };
    else cached = cached ? { ...cached, failedAt: now, failReason } : { failedAt: now, failReason, rates: [] };
    if (kv) { try { await kv.put(kvKey, JSON.stringify(cached)); } catch {} }
  }
  return cached;
}

const RATES_UA = "Mozilla/5.0 (compatible; MilitaryThingsToDo/1.0; +https://militarythingstodo.com)";

// One place that knows how to (re)read each rates source. `force` skips the freshness check —
// used by the hourly scheduled refresh so new official rates show up within the hour.
async function getRates(env, which, force = false) {
  if (which === "scu") {
    return cachedRates(env, RATES_KV_KEY, async () => {
      const res = await fetch(SCU_RATES_API, { headers: { "User-Agent": RATES_UA, "Accept": "application/json" } });
      if (!res.ok) return { parsed: null, failReason: `Service CU answered ${res.status}` };
      let parsed = null;
      try { parsed = parseScuFeed(await res.json()); } catch { parsed = null; }
      return { parsed, failReason: parsed ? "" : "Service CU feed had no usable rates" };
    }, force);
  }
  if (CB_PAGES[which]) {
    const page = CB_PAGES[which];
    return cachedRates(env, `fx:cb2:${which}`, async () => {
      const res = await fetch(page.url, { headers: { "User-Agent": RATES_UA, "Accept": "text/html" } });
      if (!res.ok) return { parsed: null, failReason: `Community Bank answered ${res.status}` };
      const parsed = parseCommunityBank(await res.text(), page);
      return { parsed, failReason: parsed ? "" : "Community Bank page had no rate" };
    }, force);
  }
  return undefined;
}

// Hourly cron (wrangler.jsonc "triggers"): re-read every source. A failed read keeps the
// last good rates in place, so the site never shows an empty box because of a hiccup.
async function refreshAllRates(env) {
  for (const which of ["scu", ...Object.keys(CB_PAGES)]) {
    try { await getRates(env, which, true); } catch {}
  }
}

async function handleGetRates(request, env) {
  const which = new URL(request.url).searchParams.get("source") || "scu";
  if (which !== "scu" && !CB_PAGES[which]) return jsonResponse({ error: "Unknown rates source" }, 400, request);
  const cached = await getRates(env, which);
  if (!cached || !cached.rates || cached.rates.length === 0) {
    return jsonResponse({ error: "Exchange rates are temporarily unavailable.", reason: (cached && cached.failReason) || "" }, 503, request);
  }
  const { failedAt, failReason, ...out } = cached;
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900", ...corsHeaders(request) },
  });
}

// ---- Exchange (on-post) gas prices — entered by the site owner in admin.html ----
// The Exchange no longer publishes overseas pump prices in a readable feed, so the owner
// types them in from the pump sign / Exchange posts. Stored per base in KV.
const GAS_BASES = ["ramstein", "fortbragg", "camppendleton", "yokota", "norfolk", "humphreys", "campbell", "stuttgart", "wiesbaden"];
const LITERS_PER_GALLON = 3.785411784;

async function handleGetGas(request, env) {
  const base = new URL(request.url).searchParams.get("base") || "";
  if (!GAS_BASES.includes(base)) return jsonResponse({ error: "Unknown base" }, 400, request);
  if (!env.REVIEWS_KV) return jsonResponse({ prices: [] }, 200, request);
  let data = null;
  try { data = JSON.parse((await env.REVIEWS_KV.get(`gas:${base}`)) || "null"); } catch { data = null; }
  return new Response(JSON.stringify(data || { prices: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", ...corsHeaders(request) },
  });
}

async function handlePostGas(request, env) {
  if (!env.REVIEWS_KV) return jsonResponse({ error: "Storage isn't set up yet (REVIEWS_KV binding missing)." }, 503, request);
  if (!env.ADMIN_KEY) return jsonResponse({ error: "Admin access isn't set up yet (ADMIN_KEY secret missing)." }, 503, request);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400, request); }
  if ((body.adminKey || "").toString() !== env.ADMIN_KEY) return jsonResponse({ error: "Incorrect admin password." }, 401, request);
  const base = (body.base || "").toString();
  if (!GAS_BASES.includes(base)) return jsonResponse({ error: "Unknown base" }, 400, request);

  if (body.clear === true) {
    await env.REVIEWS_KV.delete(`gas:${base}`);
    return jsonResponse({ ok: true, cleared: true }, 200, request);
  }
  const asOf = (body.asOf || "").toString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return jsonResponse({ error: "Please pick the date the prices apply from." }, 400, request);
  const region = stripTags(body.region || "").slice(0, 40);
  const prices = [];
  for (const p of Array.isArray(body.prices) ? body.prices.slice(0, 6) : []) {
    const type = stripTags(p && p.type).slice(0, 30);
    const gallon = Math.round(parseFloat(p && p.gallon) * 1000) / 1000;
    if (!type || !(gallon >= 0.5 && gallon <= 20)) continue;
    prices.push({ type, gallon, liter: Math.round((gallon / LITERS_PER_GALLON) * 1000) / 1000 });
  }
  if (prices.length === 0) return jsonResponse({ error: "Enter at least one price per gallon (between $0.50 and $20)." }, 400, request);
  const record = { base, region, asOf, prices, savedAt: new Date().toISOString() };
  await env.REVIEWS_KV.put(`gas:${base}`, JSON.stringify(record));
  return jsonResponse({ ok: true, record }, 200, request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/rates" && request.method === "GET") {
      return handleGetRates(request, env);
    }

    if (url.pathname === "/api/gas") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            ...corsHeaders(request),
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
      if (request.method === "GET") return handleGetGas(request, env);
      if (request.method === "POST") return handlePostGas(request, env);
      return jsonResponse({ error: "Method not allowed" }, 405, request);
    }

    if (url.pathname === "/api/reviews") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            ...corsHeaders(request),
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
      if (request.method === "GET") return handleGetReviews(request, env);
      if (request.method === "POST") return handlePostReview(request, env);
      if (request.method === "DELETE") return handleDeleteReview(request, env);
      return jsonResponse({ error: "Method not allowed" }, 405, request);
    }

    if (url.pathname.startsWith("/api/photo/")) {
      const photoKey = decodeURIComponent(url.pathname.slice("/api/photo/".length));
      if (request.method === "GET") return handlePhoto(request, env, photoKey);
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/api/suggestions") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            ...corsHeaders(request),
            "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
      if (request.method === "POST") return handlePostSuggestion(request, env);
      if (request.method === "GET") return handleGetSuggestions(request, env);
      if (request.method === "PATCH") return handleMarkSuggestionHandled(request, env);
      return jsonResponse({ error: "Method not allowed" }, 405, request);
    }

    if (url.pathname === "/api/feedback") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            ...corsHeaders(request),
            "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
      if (request.method === "POST") return handlePostFeedback(request, env);
      if (request.method === "GET") return handleGetFeedback(request, env);
      if (request.method === "PATCH") return handleMarkFeedbackHandled(request, env);
      return jsonResponse({ error: "Method not allowed" }, 405, request);
    }

    if (url.pathname === "/api/export" && request.method === "GET") {
      return handleExportData(request, env);
    }

    // Cloudflare serves pages at clean URLs (/listing) and 307-redirects /listing.html there,
    // so the per-listing tag injection must match the clean path (the .html path only redirects).
    if ((url.pathname === "/listing" || url.pathname === "/listing.html") && request.method === "GET") {
      return handleListingPage(request, env);
    }
    const pageKey = url.pathname.slice(1);
    if (request.method === "GET" && Object.prototype.hasOwnProperty.call(LISTING_BASE_CONFIG, pageKey)) {
      return handleBasePage(request, env, pageKey);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshAllRates(env));
  },
};
