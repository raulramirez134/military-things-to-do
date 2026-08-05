// Cloudflare Worker — serves the static site and handles the reviews API.
// Requires a KV binding named REVIEWS_KV (Settings → Bindings → Add binding → KV).
// Requires a secret variable named ADMIN_KEY (Settings → Variables and Secrets →
// Add variable → type: Secret) — this is your personal password for removing reviews.
// Only you know this value; it's never sent to the browser.

const MAX_REVIEWS_PER_LISTING = 200;
const MAX_TEXT_LENGTH = 1000;
const MAX_NAME_LENGTH = 60;

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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handleGetReviews(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "Missing id" }, 400);

  if (!env.REVIEWS_KV) {
    return jsonResponse({ reviews: [], warning: "REVIEWS_KV not bound yet" });
  }

  const raw = await env.REVIEWS_KV.get(`reviews:${id}`);
  const reviews = raw ? JSON.parse(raw) : [];
  return jsonResponse({ reviews });
}

async function handlePostReview(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Reviews storage isn't set up yet (REVIEWS_KV binding missing)." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const id = (body.id || "").toString().slice(0, 200);
  const name = (body.name || "Anonymous").toString().slice(0, MAX_NAME_LENGTH);
  const text = (body.text || "").toString().slice(0, MAX_TEXT_LENGTH);
  let rating = Number(body.rating);

  if (!id) return jsonResponse({ error: "Missing id" }, 400);
  if (!text.trim()) return jsonResponse({ error: "Review text is required" }, 400);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: "Rating must be between 1 and 5" }, 400);
  }
  rating = Math.round(rating);

  if (containsBlockedWords(text) || containsBlockedWords(name)) {
    return jsonResponse({ error: "Your review couldn't be posted because it contains language that isn't allowed here." }, 400);
  }

  const key = `reviews:${id}`;
  const raw = await env.REVIEWS_KV.get(key);
  const reviews = raw ? JSON.parse(raw) : [];

  reviews.unshift({ name, rating, text, date: new Date().toISOString(), removed: false });
  const trimmed = reviews.slice(0, MAX_REVIEWS_PER_LISTING);

  await env.REVIEWS_KV.put(key, JSON.stringify(trimmed));
  return jsonResponse({ ok: true, reviews: trimmed });
}

async function handleDeleteReview(request, env) {
  if (!env.REVIEWS_KV) {
    return jsonResponse({ error: "Reviews storage isn't set up yet (REVIEWS_KV binding missing)." }, 503);
  }
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: "Admin removal isn't set up yet (ADMIN_KEY secret missing)." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const id = (body.id || "").toString();
  const date = (body.date || "").toString();
  const adminKey = (body.adminKey || "").toString();

  if (adminKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin password." }, 401);
  }
  if (!id || !date) return jsonResponse({ error: "Missing id or date" }, 400);

  const key = `reviews:${id}`;
  const raw = await env.REVIEWS_KV.get(key);
  const reviews = raw ? JSON.parse(raw) : [];

  const idx = reviews.findIndex(r => r.date === date);
  if (idx === -1) return jsonResponse({ error: "Review not found" }, 404);

  // Replace with a generic placeholder rather than deleting outright —
  // keeps the removal visible and the reason consistent for everyone.
  reviews[idx] = {
    date: reviews[idx].date,
    removed: true,
  };

  await env.REVIEWS_KV.put(key, JSON.stringify(reviews));
  return jsonResponse({ ok: true, reviews });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/reviews") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
      if (request.method === "GET") return handleGetReviews(request, env);
      if (request.method === "POST") return handlePostReview(request, env);
      if (request.method === "DELETE") return handleDeleteReview(request, env);
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Everything else: serve the static site files
    return env.ASSETS.fetch(request);
  },
};
