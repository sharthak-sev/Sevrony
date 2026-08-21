/**
 * Shared HTTP helpers: CORS, JSON responses, small parsing utilities.
 */

/**
 * Origins allowed to make credentialed browser calls.
 *
 * The old worker sent `Access-Control-Allow-Origin: "*"`, which let any page on
 * the internet drive the Gemini and Discord endpoints on our quota. Requests
 * with no Origin header (curl, tools/upload_catalog.py) are unaffected -- CORS
 * is a browser-enforced policy, so omitting the header only blocks browsers.
 *
 * Extra origins can be added without a code change via the ALLOWED_ORIGINS var
 * in wrangler.toml (comma-separated).
 */
const STATIC_ALLOWED = [
  "https://sharthak-sev.github.io",
];

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (STATIC_ALLOWED.includes(origin)) return true;
  // Any localhost / 127.0.0.1 port, for local development.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  const extra = (env?.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

export function corsHeadersFor(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization, X-Admin-Key, X-Catalog-Ticket, If-None-Match",
    "Access-Control-Expose-Headers": "ETag, X-Catalog-Version",
    // The ACAO value depends on the request's Origin, so caches must key on it.
    "Vary": "Origin",
  };
  if (isAllowedOrigin(origin, env)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function preflight(cors) {
  return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Max-Age": "86400" } });
}

export function json(obj, status = 200, cors = {}, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

/** Parse an integer query param, clamped. Falls back to `fallback` on garbage. */
export function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function b64urlEncode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
