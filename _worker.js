// Cloudflare Worker — serves the static site and handles the reviews API.
// Requires a KV binding named REVIEWS_KV (Settings → Bindings → Add binding → KV).
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

  const id = (body.id || "").toString().slice(0, 200);
  const name = (body.name || "Anonymous").toString().slice(0, MAX_NAME_LENGTH);
  const text = (body.text || "").toString().slice(0, MAX_TEXT_LENGTH);
  let rating = Number(body.rating);

  if (!id) return jsonResponse({ error: "Missing id" }, 400, request);
  if (!text.trim()) return jsonResponse({ error: "Review text is required" }, 400, request);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: "Rating must be between 1 and 5" }, 400, request);
  }
  rating = Math.round(rating);

  if (containsBlockedWords(text) || containsBlockedWords(name)) {
    return jsonResponse({ error: "Your review couldn't be posted because it contains language that isn't allowed here." }, 400, request);
  }

  const key = `reviews:${id}`;
  const raw = await env.REVIEWS_KV.get(key);
  const reviews = raw ? JSON.parse(raw) : [];

  reviews.unshift({ name, rating, text, date: new Date().toISOString(), removed: false });
  const trimmed = reviews.slice(0, MAX_REVIEWS_PER_LISTING);

  await env.REVIEWS_KV.put(key, JSON.stringify(trimmed));
  return jsonResponse({ ok: true, reviews: trimmed }, 200, request);
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

  reviews[idx] = {
    date: reviews[idx].date,
    removed: true,
  };

  await env.REVIEWS_KV.put(key, JSON.stringify(reviews));
  return jsonResponse({ ok: true, reviews }, 200, request);
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

    return env.ASSETS.fetch(request);
  },
};
