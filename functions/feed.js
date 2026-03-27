/**
 * Instagram Feed API Proxy — Cloudflare Pages Function
 *
 * GET /feed → returns recent Instagram posts as JSON
 *
 * Environment variables (set in Cloudflare Pages dashboard):
 *   INSTAGRAM_TOKEN  — Long-lived Instagram access token
 *   IG_USER_ID       — Instagram user ID
 */

const IG_API_VERSION = "v22.0";
const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
const POST_COUNT = 12;
const CACHE_TTL = 3600; // 1 hour

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed =
    origin === "https://chrisnatterer.com" ||
    origin === "https://www.chrisnatterer.com" ||
    origin.endsWith(".chrisnatterer-com.pages.dev");

  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://chrisnatterer.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestGet({ request, env }) {
  const headers = corsHeaders(request);

  const token = env.INSTAGRAM_TOKEN;
  const userId = env.IG_USER_ID;

  if (!token || !userId) {
    return Response.json(
      { error: "Instagram not configured yet" },
      { status: 503, headers }
    );
  }

  // Check edge cache
  const cache = caches.default;
  const cacheKey = new Request("https://chrisnatterer.com/__ig_cache");
  const cached = await cache.match(cacheKey);
  if (cached) {
    const resp = new Response(cached.body, cached);
    Object.entries(headers).forEach(([k, v]) => resp.headers.set(k, v));
    return resp;
  }

  // Fetch from Instagram Graph API
  const igUrl = `https://graph.instagram.com/${IG_API_VERSION}/${userId}/media?fields=${FIELDS}&limit=${POST_COUNT}&access_token=${token}`;

  try {
    const igRes = await fetch(igUrl);
    const data = await igRes.json();

    if (data.error) {
      console.error("Instagram API error:", data.error.message);
      return Response.json(
        { error: "Instagram API error", detail: data.error.message },
        { status: 502, headers }
      );
    }

    const posts = (data.data || []).map((post) => ({
      id: post.id,
      type: post.media_type,
      image: post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url,
      caption: post.caption || "",
      url: post.permalink,
      date: post.timestamp,
    }));

    const response = Response.json(
      { posts },
      {
        headers: {
          ...headers,
          "Cache-Control": `public, max-age=${CACHE_TTL}`,
        },
      }
    );

    // Cache at edge
    await cache.put(cacheKey, response.clone());

    return response;
  } catch (err) {
    console.error("Instagram fetch error:", err);
    return Response.json(
      { error: "Failed to fetch feed" },
      { status: 502, headers }
    );
  }
}
