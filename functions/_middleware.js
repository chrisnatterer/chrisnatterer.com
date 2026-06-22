// Edge middleware: auto-redirect DACH / German-browser visitors to the German
// (/de/) version of pages that have a German equivalent. Mirrors the system used
// on globalizationguide.com.
//
// Signals:
//   - CF-IPCountry header (DACH: DE, AT, CH)
//   - Accept-Language header (first tag starts with "de")
//
// User choice is persisted in a `cn_locale` cookie, set via `?lang=en|de` on the
// header language switcher. Once set, the cookie wins over auto-detection. Bots
// and crawlers are never auto-redirected.

const PATH_MAP = {
  "/": "/de/",
  "/artikel/": "/de/artikel/",
};

const DACH_COUNTRIES = new Set(["DE", "AT", "CH"]);

const BOT_REGEX = /bot|crawl|spider|slurp|facebookexternalhit|preview|whatsapp|telegram|discord|skype|linkedin|googleother|chrome-lighthouse/i;

const COOKIE_NAME = "cn_locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function buildCookie(value) {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

function prefersGerman(acceptLanguage) {
  if (!acceptLanguage) return false;
  const first = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("de");
}

function normalizePath(pathname) {
  return pathname.endsWith("/") ? pathname : pathname + "/";
}

export async function onRequest(context) {
  const { request, next } = context;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return next();
  }

  const url = new URL(request.url);

  // 1. Explicit ?lang= override → set cookie + strip param
  const langParam = url.searchParams.get("lang");
  if (langParam === "en" || langParam === "de") {
    url.searchParams.delete("lang");
    if (!url.searchParams.toString()) url.search = "";
    const headers = new Headers({ Location: url.toString() });
    headers.append("Set-Cookie", buildCookie(langParam));
    return new Response(null, { status: 302, headers });
  }

  const pathname = normalizePath(url.pathname);

  // 2. Only consider redirecting on paths with a known German equivalent
  if (!(pathname in PATH_MAP)) return next();

  // 3. Never redirect bots / crawlers
  const ua = request.headers.get("user-agent") || "";
  if (BOT_REGEX.test(ua)) return next();

  // 4. Respect persisted user choice
  const cookies = parseCookies(request.headers.get("cookie"));
  if (cookies[COOKIE_NAME] === "en") return next();

  // 5. Decide based on geo + browser language (cookie=de also forces DE)
  const country = (request.headers.get("cf-ipcountry") || "").toUpperCase();
  const shouldRedirectToGerman =
    cookies[COOKIE_NAME] === "de" ||
    DACH_COUNTRIES.has(country) ||
    prefersGerman(request.headers.get("accept-language"));

  if (!shouldRedirectToGerman) return next();

  url.pathname = PATH_MAP[pathname];
  const headers = new Headers({ Location: url.toString() });
  headers.append("Set-Cookie", buildCookie("de"));
  headers.append("Vary", "CF-IPCountry, Accept-Language, Cookie");
  return new Response(null, { status: 302, headers });
}
