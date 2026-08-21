/**
 * Sevrony Worker -- HTTP entry point.
 *
 * Routing happens before any method dispatch. The previous single-file worker
 * returned a banner string on *every* GET before it looked at the path, which
 * would have shadowed every catalog route.
 *
 * Route map:
 *   GET  /                          banner (unchanged)
 *   POST /                          vocabulary AI sentence check (unchanged)
 *   POST /api/consent               consent acknowledgement (unchanged)
 *   POST /api/feedback              Discord feedback relay (unchanged)
 *   GET  /api/catalog/meta          catalog version + size
 *   POST /api/catalog/ticket        exchange a Turnstile token for a page ticket
 *   GET  /api/catalog/questions     keyset-paginated question payloads
 *   POST /api/admin/catalog/*       catalog ingestion (X-Admin-Key)
 */

import { handleVocabCheck, handleConsent, handleFeedback } from "./vocab.js";
import { handleCatalogMeta, handleCatalogTicket, handleCatalogQuestions, handleAdminCatalog } from "./catalog.js";
import { corsHeadersFor, json, preflight } from "./http.js";

/**
 * Per-route request budgets: [maxRequests, windowMs].
 *
 * The old limiter was a single 5-per-10s bucket shared by every endpoint --
 * correct for one vocab sentence, but a catalog download is ~20 sequential
 * GETs and would have been 429'd at the fourth page.
 *
 * This map lives in the isolate, so it is per-edge-location and best-effort:
 * a soft brake on accidental hammering, not a security control. Durable-Object
 * backed limiting is the upgrade path if abuse ever shows up.
 */
const RATE_LIMITS = {
  "vocab": [5, 10_000],
  "/api/consent": [10, 60_000],
  "/api/feedback": [5, 60_000],
  "/api/catalog/meta": [30, 60_000],
  // The per-person cost gate belongs here, not on the pages: a ticket costs a
  // Turnstile solve, and one ticket is good for one download.
  "/api/catalog/ticket": [10, 60_000],
  // Deliberately generous. A full download is ~20 sequential GETs, so a tight
  // budget here does not stop scraping (the ticket already does) -- it only
  // breaks shared networks, where a computer lab starting 20 downloads in one
  // class period arrives as 400 requests from a single NAT address. Pages are
  // immutable and edge-cacheable, so the marginal cost of a repeat is near zero.
  "/api/catalog/questions": [600, 60_000],
};

function rateLimited(key, ip) {
  const budget = RATE_LIMITS[key];
  if (!budget) return false;
  const [max, windowMs] = budget;
  const now = Date.now();
  if (!globalThis.__sevronyRate) globalThis.__sevronyRate = new Map();
  const bucketKey = `${key}:${ip}`;
  const hits = (globalThis.__sevronyRate.get(bucketKey) || []).filter(t => now - t < windowMs);
  if (hits.length >= max) return true;
  hits.push(now);
  globalThis.__sevronyRate.set(bucketKey, hits);
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const cors = corsHeadersFor(request, env);

    if (request.method === "OPTIONS") return preflight(cors);

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const isAdminRoute = pathname.startsWith("/api/admin/") || pathname === "/api/admin";

    // Admin auth is scoped to /api/admin/* plus an explicit bypass on the catalog
    // read path (below). It used to be a global check, which meant configuring the
    // secret at all would have 401'd every browser call.
    const adminOk =
      Boolean(env.ADMIN_KEY) && timingSafeEqual(request.headers.get("X-Admin-Key") || "", env.ADMIN_KEY);

    if (isAdminRoute) {
      if (!env.ADMIN_KEY) return json({ error: "ADMIN_KEY is not configured on this worker." }, 503, cors);
      if (!adminOk) return json({ error: "Unauthorized." }, 401, cors);
    }

    // Holding the admin key means holding write access to the catalog, so it is
    // strictly stronger than a download ticket. Honouring it here lets
    // tools/upload_catalog.py --verify read pages back through the real public
    // route instead of a special-cased debug endpoint.
    const limit = (key) => !adminOk && rateLimited(key, ip);

    try {
      if (isAdminRoute) {
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
        return await handleAdminCatalog(request, env, pathname, cors);
      }

      // ---- catalog ----
      if (pathname === "/api/catalog/meta") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);
        if (limit(pathname)) return tooMany(cors);
        return await handleCatalogMeta(request, env, cors);
      }

      if (pathname === "/api/catalog/ticket") {
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
        if (limit(pathname)) return tooMany(cors);
        return await handleCatalogTicket(request, env, ip, cors);
      }

      if (pathname === "/api/catalog/questions") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);
        if (limit(pathname)) return tooMany(cors);
        return await handleCatalogQuestions(request, env, url, cors, adminOk);
      }

      // ---- endpoints that already shipped ----
      if (pathname === "/api/consent") {
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
        if (limit(pathname)) return tooMany(cors);
        return handleConsent(cors);
      }

      if (pathname === "/api/feedback") {
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
        if (limit(pathname)) return tooMany(cors);
        return await handleFeedback(request, env, cors);
      }

      if (request.method === "GET") {
        return new Response(
          "Vocabulary AI Worker is running! Please send a POST request with { word, meaning, sentence }.",
          { status: 200, headers: cors }
        );
      }

      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

      // Default POST target is the vocabulary checker. vocab.js posts to the
      // bare origin, so this fallback must stay for already-cached clients.
      if (limit("vocab")) return tooMany(cors);
      return await handleVocabCheck(request, env, ip, cors);
    } catch (e) {
      return json({ error: e?.message || "Unhandled worker error" }, 500, cors);
    }
  },
};

function tooMany(cors) {
  return json({ error: "Rate limit exceeded. Please wait a few seconds before trying again." }, 429, cors);
}

/** Constant-time-ish string compare so the admin key can't be probed byte by byte. */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
