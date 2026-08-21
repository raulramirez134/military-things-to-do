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
const VALID_BASE_KEYS = ["ramstein", "fortbragg", "camppendleton", "yokota"];

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
  ramstein: { label: "Ramstein", refWord: "gate", dataFile: "data.js" },
  fortbragg: { label: "Fort Bragg", refWord: "post", dataFile: "data-fortbragg.js" },
  camppendleton: { label: "Camp Pendleton", refWord: "base", dataFile: "data-camppendleton.js" },
  yokota: { label: "Yokota", refWord: "base", dataFile: "data-yokota.js" },
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
async function handleListingPage(request, env) {
  const url = new URL(request.url);
  const assetResponse = await env.ASSETS.fetch(request);
  const contentType = assetResponse.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return assetResponse;

  const baseKey = LISTING_BASE_CONFIG[url.searchParams.get("base")] ? url.searchParams.get("base") : "ramstein";
  const id = url.searchParams.get("id");
  if (!id) return assetResponse;

  const cfg = LISTING_BASE_CONFIG[baseKey];
  let html = await assetResponse.text();

  try {
    const dataUrl = new URL("/" + cfg.dataFile, url);
    const dataResponse = await env.ASSETS.fetch(new Request(dataUrl, request));
    const dataText = await dataResponse.text();
    const places = new Function(dataText + "\nreturn places;")();
    const place = places.find(p => p.id === id);
    if (!place) return new Response(html, assetResponse);

    const title = `${place.name} — Military Things To Do`;
    const description = `${place.name}: ${place.blurb} Distance from ${cfg.label} ${cfg.refWord}, hours, contact info, and reviews.`;
    const canonicalUrl = `https://militarythingstodo.com/listing.html?base=${baseKey}&id=${id}`;

    html = html.replace(
      "<title>Listing — Military Things To Do</title>",
      `<title>${escapeHtmlAttr(title)}</title>`
    );
    html = html.replace(
      /<meta name="description" content="[^"]*" id="metaDescTag">/,
      `<meta name="description" content="${escapeHtmlAttr(description)}" id="metaDescTag">`
    );
    html = html.replace(
      /<link rel="canonical" href="[^"]*" id="canonicalTag">/,
      `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" id="canonicalTag">`
    );
    const ogTags = `<meta property="og:title" content="${escapeHtmlAttr(title)}">
<meta property="og:description" content="${escapeHtmlAttr(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}">
<meta property="og:site_name" content="Military Things To Do">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtmlAttr(title)}">
<meta name="twitter:description" content="${escapeHtmlAttr(description)}">
</head>`;
    html = html.replace("</head>", ogTags);
  } catch {
    // If anything goes wrong (malformed data file, unexpected place shape, etc.),
    // just serve the original page unchanged rather than risk a broken response.
    return assetResponse;
  }

  return new Response(html, {
    status: assetResponse.status,
    headers: assetResponse.headers,
  });
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    if (url.pathname === "/listing.html" && request.method === "GET") {
      return handleListingPage(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
