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

/**
 * The exams this worker serves, and the one an unnamed request means.
 *
 * A closed set on purpose. The catalog name reaches SQL as a bound parameter, an
 * ETag component and a ticket claim, and it arrives from a URL path segment, so
 * anything outside this list is refused before a single D1 query runs -- an
 * unvalidated segment would otherwise mint tickets and ETags for catalogs that
 * do not exist and answer 503 instead of 404.
 */
export const KNOWN_CATALOGS = ["sat", "psat10", "psat8_9"];
export const DEFAULT_CATALOG = "sat";

/**
 * Resolve a catalog from a URL path segment or request body field.
 *
 * An empty segment resolves to the default rather than failing: the routes are
 * served both with and without a `/:catalog` suffix, because a browser holding a
 * service-worker-cached copy of the single-catalog api.js still requests
 * /api/catalog/meta with no suffix at all.
 *
 * @returns {string|null} the catalog name, or null if the segment names no exam.
 */
export function resolveCatalog(segment) {
  if (segment === undefined || segment === null || segment === "") return DEFAULT_CATALOG;
  const name = String(segment);
  return KNOWN_CATALOGS.includes(name) ? name : null;
}

/**
 * The questions table is keyed on `(catalog, id)`, not on `id` alone.
 *
 * The three exports share no question ids today, but the client's IndexedDB
 * `questions` store is keyed on `id`, so a future overlap would silently
 * overwrite one exam's question with another's on every device. The composite key
 * makes D1 tolerate it and adminRows() below rejects it outright, which keeps the
 * server from ever shipping a collision to a client that cannot survive one.
 */
const DDL = [
  "CREATE TABLE IF NOT EXISTS questions (id TEXT NOT NULL, question_id TEXT, subject TEXT NOT NULL, domain_code TEXT, skill_code TEXT, difficulty_code TEXT, type TEXT, score_band INTEGER, catalog_version TEXT NOT NULL, seq INTEGER NOT NULL, bytes INTEGER NOT NULL, payload TEXT NOT NULL, catalog TEXT NOT NULL, PRIMARY KEY (catalog, id))",
  "CREATE INDEX IF NOT EXISTS idx_questions_seq ON questions(catalog, seq)",
  "CREATE INDEX IF NOT EXISTS idx_questions_filter ON questions(catalog, subject, domain_code, difficulty_code)",
  "CREATE TABLE IF NOT EXISTS catalog_meta (catalog TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (catalog, key))",
];

const QUESTION_COLUMNS =
  "id, question_id, subject, domain_code, skill_code, difficulty_code, type," +
  " score_band, catalog_version, seq, bytes, payload";

const INSERT_SQL =
  "INSERT OR REPLACE INTO questions (id, question_id, subject, domain_code, skill_code," +
  " difficulty_code, type, score_band, catalog_version, seq, bytes, payload, catalog)" +
  " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";

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

/**
 * True when D1 says the catalog tables are not usable yet -- either absent, or
 * present with a schema that is not ours.
 *
 * The "no such column" half is not hypothetical: a D1 database that previously
 * held an earlier experiment's `questions` table still has *a* table by that
 * name, so D1 reports a missing column rather than a missing table. Matching
 * only "no such table" made /stats 500 before upload_catalog.py could reach the
 * --reset that recreates the schema.
 */
function isUninitialisedCatalog(err) {
  const text = `${err?.message || ""} ${err?.cause?.message || ""}`;
  return /no such table/i.test(text) || /no such column/i.test(text);
}

async function readMeta(env, catalog, keys) {
  const placeholders = keys.map(() => "?").join(",");
  try {
    const res = await db(env)
      .prepare(`SELECT key, value FROM catalog_meta WHERE catalog = ? AND key IN (${placeholders})`)
      .bind(catalog, ...keys)
      .all();
    const out = {};
    for (const row of res.results || []) out[row.key] = row.value;
    return out;
  } catch (err) {
    if (isUninitialisedCatalog(err)) return {};
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

async function mintTicket(env, catalog, version, now) {
  const key = await ticketKey(env);
  if (!key) return null;
  const exp = now + TICKET_TTL_MS;
  const claims = `${exp}|${catalog}|${version}`;
  const bytes = new TextEncoder().encode(claims);
  const sig = await crypto.subtle.sign("HMAC", key, bytes);
  return {
    ticket: `${b64urlEncode(bytes)}.${b64urlEncode(new Uint8Array(sig))}`,
    expiresAt: exp,
  };
}

async function checkTicket(env, ticket, catalog, version, now) {
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

  const [expStr, ticketCatalog, ticketVersion] = new TextDecoder().decode(claimBytes).split("|");
  if (Number(expStr) < now) return { ok: false, status: 401, error: "Ticket expired." };
  if (catalog && ticketCatalog !== catalog) {
    return { ok: false, status: 403, error: "Ticket is for a different catalog." };
  }
  if (version && ticketVersion !== version) {
    return { ok: false, status: 409, error: "Catalog version changed.", version };
  }
  return { ok: true };
}

/* -------------------------------------------------------------- public reads */

export async function handleCatalogMeta(request, env, cors, catalog) {
  if (!KNOWN_CATALOGS.includes(catalog)) return json({ error: "Unknown catalog." }, 404, cors);
  const meta = await readMeta(env, catalog, ["version", "count", "bytes", "exportedAt", "formatVersion"]);
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

  // Absent rather than required: a cached single-catalog api.js sends no catalog
  // at all, and rejecting it would 400 every download from an installed PWA that
  // has not picked up the new bundle yet.
  const catalog = resolveCatalog(body.catalog);
  if (!catalog) return json({ error: "Unknown catalog." }, 404, cors);

  const verified = await verifyTurnstile(token, ip, env, TURNSTILE_ACTION);
  if (!verified.ok) return json({ error: verified.error, details: verified.details }, verified.status, cors);

  const meta = await readMeta(env, catalog, ["version"]);
  if (!meta.version) return json({ error: "Catalog is not populated yet." }, 503, cors);

  const now = Date.now();
  const minted = await mintTicket(env, catalog, meta.version, now);
  return json({ ...minted, version: meta.version }, 200, cors);
}

export async function handleCatalogQuestions(request, env, url, cors, adminOk = false, catalog) {
  if (!KNOWN_CATALOGS.includes(catalog)) return json({ error: "Unknown catalog." }, 404, cors);
  const since = clampInt(url.searchParams.get("since"), 0, 0, 1_000_000_000);
  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const now = Date.now();

  const meta = await readMeta(env, catalog, ["version", "count"]);
  if (!meta.version) return json({ error: "Catalog is not populated yet." }, 503, cors);

  if (ticketRequired(env) && !adminOk) {
    const gate = await checkTicket(env, request.headers.get("X-Catalog-Ticket"), catalog, meta.version, now);
    if (!gate.ok) return json({ error: gate.error, version: gate.version }, gate.status, cors);
  }

  const etag = `"${catalog}-${meta.version}-${since}-${limit}"`;
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ...cors, ETag: etag } });
  }

  const res = await db(env)
    .prepare("SELECT seq, payload FROM questions WHERE catalog = ?1 AND seq >= ?2 ORDER BY seq LIMIT ?3")
    .bind(catalog, since, limit)
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
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

/* --------------------------------------------------------------------- admin */

/**
 * POST /api/admin/catalog/{init,migrate,rows,meta,stats}
 *
 * The router has already verified X-Admin-Key before anything here runs.
 */
export async function handleAdminCatalog(request, env, pathname, cors) {
  const action = pathname.slice("/api/admin/catalog/".length);

  if (pathname === "/api/admin/catalog" || action === "") {
    return json({ error: "Specify an action: /init, /migrate, /rows, /meta or /stats." }, 400, cors);
  }

  // /stats is the one action upload_catalog.py calls with no body, to decide
  // whether a resume is possible. Everywhere else an unparseable body means the
  // caller sent something wrong, and swallowing it turns that into a confusing
  // "rows must be a non-empty array" instead of the actual parse failure.
  let body;
  try {
    body = await request.json();
  } catch (err) {
    if (action !== "stats") {
      return json({ error: `Could not parse the request body as JSON: ${err?.message || err}` }, 400, cors);
    }
    body = {};
  }

  if (action === "stats") return adminStats(env, body, cors);

  if (action === "init") return adminInit(env, body, cors);
  if (action === "migrate") return adminMigrate(env, body, cors);
  if (action === "rows") return adminRows(env, body, cors);
  if (action === "meta") return adminMeta(env, body, cors);
  return json({ error: `Unknown admin action: ${action}` }, 404, cors);
}

async function adminInit(env, body, cors) {
  const reset = body.reset === true;

  // Probe BEFORE touching the schema. Without a reset, CREATE TABLE IF NOT EXISTS
  // does nothing at all against a table that already exists under a different
  // schema -- and then the CREATE INDEX ON questions(catalog, seq) that follows it
  // dies on the missing column. A database left over from an earlier import, or
  // from the single-catalog release, therefore fails init with an opaque
  // "no such column"; probing first turns that into an instruction. LIMIT 0 reads
  // no rows.
  if (!reset) {
    try {
      await db(env).prepare("SELECT seq, bytes, payload, catalog_version, catalog FROM questions LIMIT 0").all();
    } catch (err) {
      const text = `${err?.message || ""} ${err?.cause?.message || ""}`;
      if (/no such column/i.test(text)) {
        return json(
          {
            error:
              'The existing "questions" table predates the per-exam catalog column, or came from' +
              " an earlier import. Run the /migrate action to convert it in place (this is the" +
              " production path, and keeps the live SAT bank), or re-run with --reset to drop and" +
              " recreate the catalog tables from scratch.",
          },
          409,
          cors
        );
      }
      // "no such table" is the ordinary first-run case: fall through and create it.
      if (!/no such table/i.test(text)) throw err;
    }
  }

  const statements = [];
  if (reset) {
    statements.push("DROP TABLE IF EXISTS questions", "DROP TABLE IF EXISTS catalog_meta");
  }
  statements.push(...DDL);
  // exec() splits on newlines, so every statement above is a single line.
  await db(env).exec(statements.join("\n"));
  return json({ ok: true, reset }, 200, cors);
}

/** The CREATE statement D1 holds for a table, or null if there is no such table. */
async function tableSql(env, name) {
  const res = await db(env)
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .all();
  return res.results?.[0]?.sql || null;
}

/**
 * Convert a single-catalog database to the per-exam schema, in place.
 *
 * This is the production path. `reset` cannot be used there -- it drops the live
 * SAT bank, which would leave every client that resumes a download staring at
 * "Catalog is not populated yet" until all 2,982 rows had been re-uploaded. And
 * the change cannot be done with ALTER either: the primary key moves from `id` to
 * `(catalog, id)` and `catalog_meta`'s moves from `key` to `(catalog, key)`, and
 * SQLite can only change a primary key by rebuilding the table.
 *
 * So each table is rebuilt the standard way -- create, copy, drop, rename -- with
 * every existing row assigned to the SAT catalog, since that is the only exam the
 * single-catalog release ever served. The copy is a single `INSERT INTO ... SELECT`
 * that D1 executes internally, so 2,982 rows cost this worker no CPU beyond
 * issuing the statement.
 *
 * Idempotent: a table that already has the composite key is left alone, so a
 * partially-applied run can simply be repeated.
 */
async function adminMigrate(env, body, cors) {
  const catalog = resolveCatalog(body.catalog);
  if (!catalog) return json({ error: "Unknown catalog." }, 404, cors);

  const questionsSql = await tableSql(env, "questions");
  const metaSql = await tableSql(env, "catalog_meta");

  // Nothing to convert: let init create the tables in their final shape.
  if (!questionsSql && !metaSql) {
    await db(env).exec(DDL.join("\n"));
    return json({ ok: true, created: true, migrated: [] }, 200, cors);
  }

  const migrated = [];
  const skipped = [];

  if (questionsSql && !/PRIMARY KEY\s*\(\s*catalog\s*,\s*id\s*\)/i.test(questionsSql)) {
    if (!/\bcatalog\b/i.test(questionsSql)) {
      // Single-catalog shape: no catalog column at all, so the copy supplies it.
      await db(env).batch([
        db(env).prepare("DROP TABLE IF EXISTS questions_migrating"),
        db(env).prepare(DDL[0].replace("IF NOT EXISTS questions", "questions_migrating")),
        db(env)
          .prepare(
            `INSERT INTO questions_migrating (${QUESTION_COLUMNS}, catalog)` +
              ` SELECT ${QUESTION_COLUMNS}, ? FROM questions`
          )
          .bind(catalog),
        db(env).prepare("DROP TABLE questions"),
        db(env).prepare("ALTER TABLE questions_migrating RENAME TO questions"),
        db(env).prepare(DDL[1]),
        db(env).prepare(DDL[2]),
      ]);
    } else {
      // Already has the column (an interrupted earlier attempt, or Gemini's
      // intermediate schema) -- only the key and the indexes need rebuilding, so
      // copy the catalog through rather than overwriting it with a default.
      await db(env).batch([
        db(env).prepare("DROP TABLE IF EXISTS questions_migrating"),
        db(env).prepare(DDL[0].replace("IF NOT EXISTS questions", "questions_migrating")),
        db(env).prepare(
          `INSERT INTO questions_migrating (${QUESTION_COLUMNS}, catalog)` +
            ` SELECT ${QUESTION_COLUMNS}, catalog FROM questions`
        ),
        db(env).prepare("DROP TABLE questions"),
        db(env).prepare("ALTER TABLE questions_migrating RENAME TO questions"),
        db(env).prepare(DDL[1]),
        db(env).prepare(DDL[2]),
      ]);
    }
    migrated.push("questions");
  } else if (questionsSql) {
    skipped.push("questions");
  }

  if (metaSql && !/PRIMARY KEY\s*\(\s*catalog\s*,\s*key\s*\)/i.test(metaSql)) {
    const select = /\bcatalog\b/i.test(metaSql)
      ? "SELECT catalog, key, value FROM catalog_meta"
      : "SELECT ?, key, value FROM catalog_meta";
    const copy = db(env).prepare(`INSERT INTO catalog_meta_migrating (catalog, key, value) ${select}`);
    await db(env).batch([
      db(env).prepare("DROP TABLE IF EXISTS catalog_meta_migrating"),
      db(env).prepare(DDL[3].replace("IF NOT EXISTS catalog_meta", "catalog_meta_migrating")),
      /\bcatalog\b/i.test(metaSql) ? copy : copy.bind(catalog),
      db(env).prepare("DROP TABLE catalog_meta"),
      db(env).prepare("ALTER TABLE catalog_meta_migrating RENAME TO catalog_meta"),
    ]);
    migrated.push("catalog_meta");
  } else if (metaSql) {
    skipped.push("catalog_meta");
  }

  // Whatever the rebuild did not cover -- a database that had one table but not
  // the other, say -- still has to end up with the full schema.
  await db(env).exec(DDL.join("\n"));

  return json({ ok: true, catalog, migrated, skipped }, 200, cors);
}

async function adminRows(env, body, cors) {
  const rows = body.rows;
  if (!Array.isArray(rows) || !rows.length) return json({ error: "rows must be a non-empty array." }, 400, cors);
  if (rows.length > MAX_ROWS_PER_UPLOAD) {
    return json({ error: `At most ${MAX_ROWS_PER_UPLOAD} rows per request.` }, 400, cors);
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length !== 13) {
      return json({ error: `rows[${i}] must be an array of 13 columns.` }, 400, cors);
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
    if (resolveCatalog(r[12]) !== r[12]) {
      return json({ error: `rows[${i}] names an unknown catalog: ${String(r[12])}` }, 400, cors);
    }
  }

  const catalog = rows[0][12];
  if (body.catalog !== undefined && body.catalog !== catalog) {
    return json({ error: "body.catalog must match the catalog on every uploaded row." }, 400, cors);
  }
  if (rows.some(row => row[12] !== catalog)) {
    return json({ error: "Every row in an upload batch must belong to the same catalog." }, 400, cors);
  }

  // Reject a question id that another exam already owns.
  //
  // D1's composite key tolerates the collision, but the client's IndexedDB
  // `questions` store is keyed on `id` alone, so shipping one would silently
  // overwrite one exam's question with another's on every device that downloads
  // both. The three current exports share no ids -- this exists so that a future
  // one that does is caught here rather than on a student's laptop.
  //
  // One extra query per batch, 41 bound parameters at the 40-row cap.
  const ids = rows.map(r => r[0]);
  const clash = await db(env)
    .prepare(`SELECT id FROM questions WHERE catalog != ? AND id IN (${ids.map(() => "?").join(",")}) LIMIT 5`)
    .bind(catalog, ...ids)
    .all();
  const clashing = (clash.results || []).map(r => r.id);
  if (clashing.length) {
    return json(
      {
        error:
          `${clashing.length} question id(s) in this batch already belong to a different catalog.` +
          " The client keys its local question store on the id alone, so uploading these would" +
          " corrupt local data for anyone who downloads both exams.",
        ids: clashing,
      },
      409,
      cors
    );
  }

  const stmt = db(env).prepare(INSERT_SQL);
  await db(env).batch(rows.map(r => stmt.bind(...r)));
  return json({ ok: true, written: rows.length }, 200, cors);
}

async function adminMeta(env, body, cors) {
  const entries = Object.entries(body.meta || {});
  if (!entries.length) return json({ error: "meta must be a non-empty object." }, 400, cors);

  const catalog = resolveCatalog(body.catalog);
  if (!catalog) return json({ error: "Unknown catalog." }, 404, cors);

  const stmt = db(env).prepare("INSERT OR REPLACE INTO catalog_meta (catalog, key, value) VALUES (?,?,?)");
  const statements = entries.map(([k, v]) => stmt.bind(catalog, String(k), String(v)));

  // Scoped to this catalog, so pruning one exam's superseded rows cannot touch
  // another's -- their catalog_version strings are independent.
  if (body.prune === true) {
    const version = body.meta.version;
    if (!version) return json({ error: "prune requires meta.version." }, 400, cors);
    statements.push(db(env).prepare("DELETE FROM questions WHERE catalog = ? AND catalog_version != ?").bind(catalog, String(version)));
  }

  await db(env).batch(statements);
  return json({ ok: true, keys: entries.length, pruned: body.prune === true }, 200, cors);
}

/**
 * Aggregate counts, so the catalog can be verified against the source export
 * without shell access to wrangler.
 */
async function adminStats(env, body, cors) {
  let totals, domains, versions, meta;
  const catalog = body.catalog === undefined ? null : resolveCatalog(body.catalog);
  if (body.catalog !== undefined && !catalog) return json({ error: "Unknown catalog." }, 404, cors);
  
  try {
    if (catalog) {
      [totals, domains, versions, meta] = await db(env).batch([
        db(env).prepare(
          "SELECT COUNT(*) AS rows, COUNT(DISTINCT seq) AS distinct_seq, MIN(seq) AS min_seq," +
            " MAX(seq) AS max_seq, SUM(bytes) AS total_bytes, MAX(bytes) AS max_bytes FROM questions WHERE catalog = ?"
        ).bind(catalog),
        db(env).prepare(
          "SELECT subject, domain_code, COUNT(*) AS n FROM questions WHERE catalog = ? GROUP BY subject, domain_code ORDER BY subject, domain_code"
        ).bind(catalog),
        db(env).prepare("SELECT catalog_version, COUNT(*) AS n FROM questions WHERE catalog = ? GROUP BY catalog_version").bind(catalog),
        db(env).prepare("SELECT key, value FROM catalog_meta WHERE catalog = ? ORDER BY key").bind(catalog),
      ]);
    } else {
      [totals, domains, versions, meta] = await db(env).batch([
        db(env).prepare(
          "SELECT COUNT(*) AS rows, COUNT(DISTINCT seq) AS distinct_seq, MIN(seq) AS min_seq," +
            " MAX(seq) AS max_seq, SUM(bytes) AS total_bytes, MAX(bytes) AS max_bytes FROM questions"
        ),
        db(env).prepare(
          "SELECT subject, domain_code, COUNT(*) AS n FROM questions GROUP BY subject, domain_code ORDER BY subject, domain_code"
        ),
        db(env).prepare("SELECT catalog_version, COUNT(*) AS n FROM questions GROUP BY catalog_version"),
        db(env).prepare("SELECT catalog, key, value FROM catalog_meta ORDER BY catalog, key"),
      ]);
    }
  } catch (err) {
    // upload_catalog.py calls stats before init to decide whether to resume, so
    // an uninitialised database has to answer "nothing here" rather than fail.
    if (isUninitialisedCatalog(err)) {
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
