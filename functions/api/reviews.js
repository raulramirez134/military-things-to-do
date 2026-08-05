// Cloudflare Pages Function — /api/reviews
// Requires a KV namespace bound as REVIEWS_KV in the Pages project settings
// (Workers & Pages → your project → Settings → Functions → KV namespace bindings).
//
// GET  /api/reviews?id=<listingId>          -> { reviews: [...] }
// POST /api/reviews  { id, name, rating, text } -> { ok: true, reviews: [...] }

const MAX_REVIEWS_PER_LISTING = 200;
const MAX_TEXT_LENGTH = 1000;
const MAX_NAME_LENGTH = 60;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
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

export async function onRequestPost(context) {
  const { request, env } = context;

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

  const key = `reviews:${id}`;
  const raw = await env.REVIEWS_KV.get(key);
  const reviews = raw ? JSON.parse(raw) : [];

  reviews.unshift({
    name,
    rating,
    text,
    date: new Date().toISOString(),
  });

  // Cap how many we keep per listing so storage doesn't grow unbounded
  const trimmed = reviews.slice(0, MAX_REVIEWS_PER_LISTING);

  await env.REVIEWS_KV.put(key, JSON.stringify(trimmed));

  return jsonResponse({ ok: true, reviews: trimmed });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
