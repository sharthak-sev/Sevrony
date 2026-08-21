/**
 * Read-only question catalog served out of D1, plus the admin ingestion routes.
 *
 * CPU DISCIPLINE -- the read path must never JSON.parse or JSON.stringify a
 * question payload. A worker gets 10 ms of CPU per request; parsing a 1 MB page
 * of questions only to re-serialise it would blow that budget on its own.
 * D1 hands back `payload` as a string that is already valid JSON, so a page is
 * assembled by concatenating those strings inside a hand-written envelope.
 */

import { json, clampInt, b64urlEncode, b64urlDecode } from "./http.js";
import { verifyTurnstile } from "./vocab.js";

const TICKET_TTL_MS = 10 * 60 * 1000;
const TURNSTILE_ACTION = "catalog_download";
const DEFAULT_PAGE_SIZE = 150;
const MAX_PAGE_SIZE = 300;
/** D1 allows 50 queries per invocation; stay well under it. */
const MAX_ROWS_PER_UPLOAD = 40;

const DDL = [
  "CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, question_id TEXT, subject TEXT NOT NULL, domain_code TEXT, skill_code TEXT, difficulty_code TEXT, type TEXT, score_band INTEGER, catalog_version TEXT NOT NULL, seq INTEGER NOT NULL, bytes INTEGER NOT NULL, payload TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_questions_seq ON questions(seq)",
  "CREATE INDEX IF NOT EXISTS idx_questions_filter ON questions(subject, domain_code, difficulty_code)",
  "CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

const INSERT_SQL =
  "INSERT OR REPLACE INTO questions (id, question_id, subject, domain_code, skill_code," +
  " difficulty_code, type, score_band, catalog_version, seq, bytes, payload)" +
  " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";

function db(env) {
  if (!env.QUESTIONS_DB) throw new Error("QUESTIONS_DB binding is missing from this worker.");
  return env.QUESTIONS_DB;
}

/**
 * Whether page requests must carry a ticket.
 *
 * Deliberately not "on if the secret happens to exist": a missing secret then
 * silently means an ungated catalog. Instead the requirement is declared in
 * wrangler.toml, and a declared-but-unconfigured gate returns 503 so the
 * misconfiguration surfaces on the first request rather than never.
 */
function ticketRequired(env) {
  return String(env.CATALOG_REQUIRE_TICKET ?? "1") !== "0";
}

/** True when D1 is reporting that the catalog tables have not been created yet. */
function isMissingTable(err) {
  return /no such table/i.test(err?.message || "") || /no such table/i.test(err?.cause?.message || "");
}

async function readMeta(env, keys) {
  const placeholders = keys.map(() => "?").join(",");
  try {
    const res = await db(env)
      .prepare(`SELECT key, value FROM catalog_meta WHERE key IN (${placeholders})`)
      .bind(...keys)
      .all();
    const out = {};
    for (const row of res.results || []) out[row.key] = row.value;
    return out;
  } catch (err) {
    // A database created but never initialised should read as "empty catalog",
    // not as an internal error -- otherwise the first request after
    // `wrangler d1 create` is an opaque 500.
    if (isMissingTable(err)) return {};
    throw err;
  }
}

/* ------------------------------------------------------------------ tickets */

async function ticketKey(env) {
  const secret = env.CATALOG_TICKET_KEY;
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function mintTicket(env, version, now) {
  const key = await ticketKey(env);
  if (!key) return null;
  const exp = now + TICKET_TTL_MS;
  const claims = `${exp}|${version}`;
  const bytes = new TextEncoder().encode(claims);
  const sig = await crypto.subtle.sign("HMAC", key, bytes);
  return {
    ticket: `${b64urlEncode(bytes)}.${b64urlEncode(new Uint8Array(sig))}`,
    expiresAt: exp,
  };
}

/**
 * @returns {{ok: true}} or {{ok: false, status, error}} -- status 409 signals
 * "your ticket is for an older catalog version", which the client handles by
 * restarting the download rather than by treating it as an auth failure.
 */
async function checkTicket(env, ticket, version, now) {
  const key = await ticketKey(env);
  if (!key) return { ok: false, status: 503, error: "CATALOG_TICKET_KEY is not configured on this worker." };
  if (!ticket) return { ok: false, status: 401, error: "Missing X-Catalog-Ticket." };

  const [claimsB64, sigB64] = String(ticket).split(".");
  if (!claimsB64 || !sigB64) return { ok: false, status: 401, error: "Malformed ticket." };

  let claimBytes;
  let sigBytes;
  try {
    claimBytes = b64urlDecode(claimsB64);
    sigBytes = b64urlDecode(sigB64);
  } catch {
    return { ok: false, status: 401, error: "Malformed ticket." };
  }

  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, claimBytes);
  if (!valid) return { ok: false, status: 401, error: "Invalid ticket." };

  const [expStr, ticketVersion] = new TextDecoder().decode(claimBytes).split("|");
  if (Number(expStr) < now) return { ok: false, status: 401, error: "Ticket expired." };
  if (version && ticketVersion !== version) {
    return { ok: false, status: 409, error: "Catalog version changed.", version };
  }
  return { ok: true };
}

/* -------------------------------------------------------------- public reads */

/** GET /api/catalog/meta */
export async function handleCatalogMeta(request, env, cors) {
  const meta = await readMeta(env, ["version", "count", "bytes", "exportedAt", "formatVersion"]);
  if (!meta.version) return json({ error: "Catalog is not populated yet." }, 503, cors);

  return json(
    {
      version: meta.version,
      count: Number(meta.count || 0),
      bytes: Number(meta.bytes || 0),
      exportedAt: meta.exportedAt || null,
      formatVersion: meta.formatVersion || null,
      pageSize: DEFAULT_PAGE_SIZE,
      requiresTicket: ticketRequired(env),
    },
    200,
    cors,
    { "Cache-Control": "public, max-age=300", "X-Catalog-Version": meta.version }
  );
}

/**
 * POST /api/catalog/ticket
 *
 * Accepts a Turnstile token today. Phase 2 adds a session bearer token as a
 * second accepted proof; the ticket format does not change.
 */
export async function handleCatalogTicket(request, env, ip, cors) {
  if (!ticketRequired(env)) return json({ error: "Tickets are disabled on this worker." }, 400, cors);
  if (!env.CATALOG_TICKET_KEY) {
    return json({ error: "CATALOG_TICKET_KEY is not configured on this worker." }, 503, cors);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* treated as missing token below */
  }

  const token = body["cf-turnstile-response"] || body.turnstileToken;
  if (!token) return json({ error: "Missing security token." }, 400, cors);

  const verified = await verifyTurnstile(token, ip, env, TURNSTILE_ACTION);
  if (!verified.ok) return json({ error: verified.error, details: verified.details }, verified.status, cors);

  const meta = await readMeta(env, ["version"]);
  if (!meta.version) return json({ error: "Catalog is not populated yet." }, 503, cors);

  const now = Date.now();
  const minted = await mintTicket(env, meta.version, now);
  return json({ ...minted, version: meta.version }, 200, cors);
}

/** GET /api/catalog/questions?since=&limit= */
export async function handleCatalogQuestions(request, env, url, cors, adminOk = false) {
  const since = clampInt(url.searchParams.get("since"), 0, 0, 1_000_000_000);
  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const now = Date.now();

  const meta = await readMeta(env, ["version", "count"]);
  if (!meta.version) return json({ error: "Catalog is not populated yet." }, 503, cors);

  if (ticketRequired(env) && !adminOk) {
    const gate = await checkTicket(env, request.headers.get("X-Catalog-Ticket"), meta.version, now);
    if (!gate.ok) return json({ error: gate.error, version: gate.version }, gate.status, cors);
  }

  // (version, since, limit) fully determines the body, so a matching ETag can be
  // answered without touching D1 at all.
  const etag = `"${meta.version}-${since}-${limit}"`;
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ...cors, ETag: etag } });
  }

  // `since` is inclusive: the first page asks for since=0 and gets seq 0.
  const res = await db(env)
    .prepare("SELECT seq, payload FROM questions WHERE seq >= ?1 ORDER BY seq LIMIT ?2")
    .bind(since, limit)
    .all();

  const rows = res.results || [];
  const payloads = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) payloads[i] = rows[i].payload;

  const nextSince = rows.length ? rows[rows.length - 1].seq + 1 : since;
  const done = rows.length < limit;

  const body =
    `{"version":${JSON.stringify(meta.version)}` +
    `,"count":${Number(meta.count || 0)}` +
    `,"since":${since}` +
    `,"nextSince":${nextSince}` +
    `,"done":${done}` +
    `,"questions":[${payloads.join(",")}]}`;

  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      ETag: etag,
      "X-Catalog-Version": meta.version,
      // Content for a given (version, since, limit) never changes -- a new
      // catalog gets a new version string and therefore new cache entries.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

/* --------------------------------------------------------------------- admin */

/**
 * POST /api/admin/catalog/{init,rows,meta,stats}
 *
 * The router has already verified X-Admin-Key before anything here runs.
 */
export async function handleAdminCatalog(request, env, pathname, cors) {
  const action = pathname.slice("/api/admin/catalog/".length);

  if (pathname === "/api/admin/catalog" || action === "") {
    return json({ error: "Specify an action: /init, /rows, /meta or /stats." }, 400, cors);
  }

  if (action === "stats") return adminStats(env, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400, cors);
  }

  if (action === "init") return adminInit(env, body, cors);
  if (action === "rows") return adminRows(env, body, cors);
  if (action === "meta") return adminMeta(env, body, cors);
  return json({ error: `Unknown admin action: ${action}` }, 404, cors);
}

async function adminInit(env, body, cors) {
  const statements = [];
  if (body.reset === true) {
    statements.push("DROP TABLE IF EXISTS questions", "DROP TABLE IF EXISTS catalog_meta");
  }
  statements.push(...DDL);
  // exec() splits on newlines, so every statement above is a single line.
  await db(env).exec(statements.join("\n"));
  return json({ ok: true, reset: body.reset === true }, 200, cors);
}

async function adminRows(env, body, cors) {
  const rows = body.rows;
  if (!Array.isArray(rows) || !rows.length) return json({ error: "rows must be a non-empty array." }, 400, cors);
  if (rows.length > MAX_ROWS_PER_UPLOAD) {
    return json({ error: `At most ${MAX_ROWS_PER_UPLOAD} rows per request.` }, 400, cors);
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length !== 12) {
      return json({ error: `rows[${i}] must be an array of 12 columns.` }, 400, cors);
    }
    const payload = r[11];
    // A cheap shape check. Full JSON validation would mean a second parse of the
    // whole body; upload_catalog.py --verify instead reads pages back through
    // the public route and json-decodes them, which proves the same thing
    // end-to-end without spending worker CPU on every upload.
    if (typeof payload !== "string" || payload.charCodeAt(0) !== 123 /* { */) {
      return json({ error: `rows[${i}] payload must be a JSON object string.` }, 400, cors);
    }
    if (typeof r[9] !== "number") return json({ error: `rows[${i}] seq must be a number.` }, 400, cors);
  }

  const stmt = db(env).prepare(INSERT_SQL);
  await db(env).batch(rows.map(r => stmt.bind(...r)));
  return json({ ok: true, written: rows.length }, 200, cors);
}

async function adminMeta(env, body, cors) {
  const entries = Object.entries(body.meta || {});
  if (!entries.length) return json({ error: "meta must be a non-empty object." }, 400, cors);

  const stmt = db(env).prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?,?)");
  const statements = entries.map(([k, v]) => stmt.bind(String(k), String(v)));

  // Drop rows left behind by a previous catalog version so a shrinking bank
  // does not leave orphans that would break `seq` contiguity.
  if (body.prune === true) {
    const version = body.meta.version;
    if (!version) return json({ error: "prune requires meta.version." }, 400, cors);
    statements.push(db(env).prepare("DELETE FROM questions WHERE catalog_version != ?").bind(String(version)));
  }

  await db(env).batch(statements);
  return json({ ok: true, keys: entries.length, pruned: body.prune === true }, 200, cors);
}

/**
 * Aggregate counts, so the catalog can be verified against the source export
 * without shell access to wrangler.
 */
async function adminStats(env, cors) {
  let totals, domains, versions, meta;
  try {
    [totals, domains, versions, meta] = await db(env).batch([
      db(env).prepare(
        "SELECT COUNT(*) AS rows, COUNT(DISTINCT seq) AS distinct_seq, MIN(seq) AS min_seq," +
          " MAX(seq) AS max_seq, SUM(bytes) AS total_bytes, MAX(bytes) AS max_bytes FROM questions"
      ),
      db(env).prepare(
        "SELECT subject, domain_code, COUNT(*) AS n FROM questions GROUP BY subject, domain_code ORDER BY subject, domain_code"
      ),
      db(env).prepare("SELECT catalog_version, COUNT(*) AS n FROM questions GROUP BY catalog_version"),
      db(env).prepare("SELECT key, value FROM catalog_meta ORDER BY key"),
    ]);
  } catch (err) {
    // upload_catalog.py calls stats before init to decide whether to resume, so
    // an uninitialised database has to answer "nothing here" rather than fail.
    if (isMissingTable(err)) {
      return json({ rows: 0, initialised: false, seqContiguous: false, byDomain: {}, byVersion: {}, meta: {} }, 200, cors);
    }
    throw err;
  }

  const t = totals.results?.[0] || {};
  const byDomain = {};
  for (const r of domains.results || []) byDomain[`${r.subject}:${r.domain_code}`] = r.n;
  const metaObj = {};
  for (const r of meta.results || []) metaObj[r.key] = r.value;

  return json(
    {
      rows: t.rows || 0,
      initialised: true,
      seqContiguous: (t.rows || 0) > 0 && t.min_seq === 0 && t.max_seq === (t.rows || 0) - 1 && t.distinct_seq === t.rows,
      minSeq: t.min_seq,
      maxSeq: t.max_seq,
      distinctSeq: t.distinct_seq,
      totalBytes: t.total_bytes || 0,
      maxRowBytes: t.max_bytes || 0,
      byDomain,
      byVersion: (versions.results || []).reduce((a, r) => ({ ...a, [r.catalog_version]: r.n }), {}),
      meta: metaObj,
    },
    200,
    cors
  );
}
