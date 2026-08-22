/**
 * test_worker.mjs -- exercise the real worker/index.js against the real
 * catalog.sqlite, offline.
 *
 * A D1 binding is a thin async wrapper over SQLite, so a shim backed by
 * node:sqlite reproduces it closely enough to test routing, auth, ticket
 * signing, pagination, ETags, CORS and the concatenated page body. What it
 * cannot test is Cloudflare's 10 ms CPU ceiling and real D1 latency -- those
 * need a deploy.
 *
 * Usage: node tools/test_worker.mjs [catalog.sqlite]
 */

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ------------------------------------------------------------------ D1 shim */

function makeD1(sqlitePath) {
  const db = new DatabaseSync(sqlitePath);

  const wrap = (sql, params) => ({
    bind(...args) {
      // D1 statements are immutable: bind() returns a NEW statement. catalog.js
      // relies on this when it reuses one prepared INSERT across a batch.
      return wrap(sql, args);
    },
    all() {
      const stmt = db.prepare(sql);
      return { results: stmt.all(...params), success: true, meta: {} };
    },
    run() {
      const stmt = db.prepare(sql);
      const info = stmt.run(...params);
      return { success: true, meta: { changes: Number(info.changes || 0) } };
    },
    first() {
      const stmt = db.prepare(sql);
      return stmt.get(...params) ?? null;
    },
    __sql: sql,
    __params: params,
  });

  return {
    prepare: (sql) => wrap(sql, []),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const out = statements.map(s => (/^\s*(select|pragma)/i.test(s.__sql) ? s.all() : s.run()));
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async exec(sql) {
      // D1's exec() splits on newlines and runs each line as one statement.
      for (const line of sql.split("\n").map(s => s.trim()).filter(Boolean)) db.exec(line);
      return { count: sql.split("\n").length };
    },
    __close: () => db.close(),
  };
}

/* ------------------------------------------------- fetch stub (Turnstile, Discord) */

const TURNSTILE_OK = "good-token";
const TURNSTILE_WRONG_ACTION = "wrong-action-token";

const DISCORD_URL = "https://discord.test/api/webhooks/stub";
// Last payload the worker relayed, so the feedback tests can assert on what
// Discord would actually have received rather than only on the status code.
let discordSeen = null;
let discordFails = false;

globalThis.fetch = async (url, init) => {
  if (String(url).includes("turnstile/v0/siteverify")) {
    const token = init.body.get("response");
    if (token === TURNSTILE_OK) {
      return new Response(JSON.stringify({ success: true, action: "catalog_download" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (token === TURNSTILE_WRONG_ACTION) {
      return new Response(JSON.stringify({ success: true, action: "check_sentence" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (String(url) === DISCORD_URL) {
    const payload = JSON.parse(init.body.get("payload_json"));
    discordSeen = {
      embed: payload.embeds[0],
      files: [...init.body.keys()].filter(k => k.startsWith("file")),
    };
    if (discordFails) return new Response("nope", { status: 500, statusText: "Internal Server Error" });
    // Discord answers a webhook post with 204; the body must be null at that status.
    return new Response(null, { status: 204 });
  }
  throw new Error(`unexpected outbound fetch to ${url}`);
};

const worker = (await import("../worker/index.js")).default;

/* ----------------------------------------------------------------- harness */

const SOURCE = process.argv[2] || "catalog.sqlite";
const WORK = join(tmpdir(), "sevrony-worker-test.sqlite");
const FRESH = join(tmpdir(), "sevrony-worker-fresh.sqlite");
for (const p of [WORK, FRESH]) if (existsSync(p)) rmSync(p);
if (!existsSync(SOURCE)) {
  console.error(`missing ${SOURCE} -- run tools/build_catalog_db.py first`);
  process.exit(2);
}
copyFileSync(SOURCE, WORK);

const ADMIN_KEY = "test-admin-key-0123456789";
const env = {
  QUESTIONS_DB: makeD1(WORK),
  ADMIN_KEY,
  CATALOG_TICKET_KEY: "test-ticket-hmac-key",
  TURNSTILE_SECRET: "test-turnstile-secret",
  CATALOG_REQUIRE_TICKET: "1",
  ALLOWED_ORIGINS: "",
  DISCORD_WEBHOOK_URL: DISCORD_URL,
};

const ORIGIN = "https://sharthak-sev.github.io";
const BASE = "https://worker.test";

function req(path, { method = "GET", headers = {}, body, origin = ORIGIN, ip = "1.2.3.4" } = {}) {
  const h = { ...headers, Origin: origin, "cf-connecting-ip": ip };
  // FormData goes through untouched so fetch sets its own multipart boundary --
  // the feedback route is the one caller that posts a form rather than JSON.
  if (body !== undefined && typeof body !== "string" && !(body instanceof FormData)) {
    h["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  return new Request(BASE + path, { method, headers: h, body });
}

const call = (path, opts, e = env) => worker.fetch(req(path, opts), e);

let passed = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(`${name}${detail ? " -- " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " -- " + detail : ""}`);
  }
}
function section(t) {
  console.log(`\n${t}`);
}

/* ------------------------------------------------------------------- tests */

section("routing / regressions from the single-file worker");
{
  const r = await call("/");
  const text = await r.text();
  check("GET / still returns the banner", r.status === 200 && text.startsWith("Vocabulary AI Worker is running!"), `${r.status}`);
}
{
  // The old worker answered every GET with the banner before it looked at the
  // path -- this is the regression the restructure exists to fix.
  const r = await call("/api/catalog/meta");
  const ct = r.headers.get("Content-Type") || "";
  check("GET /api/catalog/meta is not shadowed by the banner", ct.includes("application/json"), ct);
}
{
  const r = await call("/", { method: "POST", body: { word: "x" } });
  const j = await r.json();
  check("POST / still falls through to the vocab handler", r.status === 400 && /Missing parameters/.test(j.error), `${r.status} ${j.error}`);
}
{
  const r = await call("/api/consent", { method: "POST", body: {} });
  const j = await r.json();
  check("POST /api/consent unchanged", r.status === 200 && j.success === true);
}
{
  const r = await call("/api/catalog/meta", { method: "POST" });
  check("wrong method on a catalog route -> 405", r.status === 405, `${r.status}`);
}

section("feedback");
{
  // This is the channel a user reports a broken release through, so it gets the
  // same treatment as the catalog routes. Every case below uses its own IP: the
  // bucket is 5/minute per address and shared IPs would 429 later assertions.
  const form = (fields = {}, files = []) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (const f of files) fd.append("file", f);
    return fd;
  };
  const send = (fd, { ip, e } = {}) =>
    call("/api/feedback", { method: "POST", body: fd, ip: ip || "9.0.0.1" }, e);

  {
    const r = await send(form({ type: "Bug", message: "" }), { ip: "9.0.0.2" });
    const j = await r.json();
    check("feedback with an empty message -> 400", r.status === 400 && /Message is required/.test(j.error), `${r.status} ${j.error}`);
  }
  {
    const r = await call("/api/feedback", { ip: "9.0.0.3" });
    check("GET /api/feedback -> 405", r.status === 405, `${r.status}`);
  }
  {
    discordSeen = null;
    const r = await send(form({
      type: "Bug",
      message: "catalog download stalls at page 4",
      email: "someone@example.com",
      context: JSON.stringify({ version: "2.3.0", urlHash: "#/dashboard", userAgent: "UA", viewport: "390x844" }),
    }), { ip: "9.0.0.4" });
    const j = await r.json();
    check("feedback with a message -> 200", r.status === 200 && j.success === true, `${r.status}`);
    const f = (discordSeen?.embed.fields || []).reduce((m, x) => (m[x.name] = x.value, m), {});
    check("the report reaches Discord intact", f.Message === "catalog download stalls at page 4" && f.Email === "someone@example.com", JSON.stringify(f));
    check("app version rides along for triage", f["App Version"] === "2.3.0" && f["Route / Hash"] === "#/dashboard", JSON.stringify(f));
    check("the embed is titled by report type", discordSeen?.embed.title === "New Feedback: Bug", discordSeen?.embed.title);
  }
  {
    discordSeen = null;
    const files = Array.from({ length: 7 }, (_, i) => new File([`png${i}`], `shot${i}.png`, { type: "image/png" }));
    const r = await send(form({ type: "Bug", message: "with attachments" }, files), { ip: "9.0.0.7" });
    check("attachments are forwarded", r.status === 200 && discordSeen.files.length > 0, `${r.status} ${discordSeen?.files.length}`);
    check("no more than 5 attachments are relayed", discordSeen.files.length === 5, `${discordSeen?.files.length}`);
  }
  {
    // The exact staging failure: the secret was never set on that environment.
    // A 500 here is correct, but the client must not blame the user's network
    // for it -- see the status-code split in app.js.
    const r = await send(form({ type: "Bug", message: "hello" }), {
      ip: "9.0.0.5",
      e: { ...env, DISCORD_WEBHOOK_URL: undefined },
    });
    const j = await r.json();
    check("missing DISCORD_WEBHOOK_URL -> 500, not a silent success", r.status === 500 && /DISCORD_WEBHOOK_URL/.test(j.error), `${r.status} ${j.error}`);
  }
  {
    discordFails = true;
    const r = await send(form({ type: "Bug", message: "hello" }), { ip: "9.0.0.6" });
    const j = await r.json();
    discordFails = false;
    check("Discord rejecting the relay -> 500", r.status === 500 && /Discord API error/.test(j.error), `${r.status} ${j.error}`);
  }
  {
    let last = 0;
    for (let i = 0; i < 7; i++) {
      const r = await send(form({ type: "Bug", message: `spam ${i}` }), { ip: "9.9.9.9" });
      last = r.status;
    }
    check("feedback is rate limited at 5/minute per IP", last === 429, `${last}`);
  }
}

section("CORS");
{
  const r = await call("/", { method: "OPTIONS" });
  const methods = r.headers.get("Access-Control-Allow-Methods") || "";
  check("preflight -> 204", r.status === 204, `${r.status}`);
  check("preflight advertises GET, POST, DELETE, OPTIONS", /GET/.test(methods) && /DELETE/.test(methods), methods);
  check("preflight allows X-Catalog-Ticket", (r.headers.get("Access-Control-Allow-Headers") || "").includes("X-Catalog-Ticket"));
}
{
  const r = await call("/api/catalog/meta", { origin: ORIGIN });
  check("allowed origin is echoed", r.headers.get("Access-Control-Allow-Origin") === ORIGIN, String(r.headers.get("Access-Control-Allow-Origin")));
  check("Vary: Origin is set", (r.headers.get("Vary") || "").includes("Origin"));
}
{
  const r = await call("/api/catalog/meta", { origin: "https://evil.example.com" });
  check("unknown origin gets no ACAO header", r.headers.get("Access-Control-Allow-Origin") === null, String(r.headers.get("Access-Control-Allow-Origin")));
}
{
  const r = await call("/api/catalog/meta", { origin: "http://localhost:8080" });
  check("localhost origin is allowed", r.headers.get("Access-Control-Allow-Origin") === "http://localhost:8080");
}

section("catalog meta");
let META;
{
  const r = await call("/api/catalog/meta");
  META = await r.json();
  check("meta -> 200", r.status === 200, `${r.status}`);
  check("meta reports 2982 questions", META.count === 2982, String(META.count));
  check("meta reports a version", typeof META.version === "string" && META.version.length > 0, String(META.version));
  check("meta reports requiresTicket", META.requiresTicket === true);
  check("meta is cacheable but short-lived", /max-age=300/.test(r.headers.get("Cache-Control") || ""));
}

section("download ticket");
let TICKET;
{
  const r = await call("/api/catalog/questions?since=0&limit=5");
  check("page without a ticket -> 401", r.status === 401, `${r.status}`);
}
{
  const r = await call("/api/catalog/ticket", { method: "POST", body: { "cf-turnstile-response": "bad" } });
  check("bad Turnstile token -> 403", r.status === 403, `${r.status}`);
}
{
  const r = await call("/api/catalog/ticket", { method: "POST", body: { "cf-turnstile-response": TURNSTILE_WRONG_ACTION } });
  const j = await r.json();
  check("Turnstile token minted for another action -> 403", r.status === 403 && String(j.details).includes("action-mismatch"), JSON.stringify(j));
}
{
  const r = await call("/api/catalog/ticket", { method: "POST", body: { "cf-turnstile-response": TURNSTILE_OK } });
  const j = await r.json();
  TICKET = j.ticket;
  check("valid Turnstile token -> ticket", r.status === 200 && typeof TICKET === "string" && TICKET.includes("."), JSON.stringify(j).slice(0, 120));
  check("ticket expires within ~10 minutes", j.expiresAt > Date.now() && j.expiresAt <= Date.now() + 10 * 60 * 1000 + 5000);
  check("ticket is bound to the catalog version", j.version === META.version);
}
{
  const tampered = TICKET.slice(0, -3) + (TICKET.endsWith("AAA") ? "BBB" : "AAA");
  const r = await call("/api/catalog/questions?since=0&limit=5", { headers: { "X-Catalog-Ticket": tampered } });
  check("tampered ticket -> 401", r.status === 401, `${r.status}`);
}
{
  const r = await call("/api/catalog/questions?since=0&limit=5", { headers: { "X-Catalog-Ticket": "not-even-close" } });
  check("malformed ticket -> 401", r.status === 401, `${r.status}`);
}
{
  const realNow = Date.now;
  Date.now = () => realNow() - 11 * 60 * 1000; // mint an already-expired ticket
  const minted = await (await call("/api/catalog/ticket", { method: "POST", body: { "cf-turnstile-response": TURNSTILE_OK } })).json();
  Date.now = realNow;
  const r = await call("/api/catalog/questions?since=0&limit=5", { headers: { "X-Catalog-Ticket": minted.ticket } });
  const j = await r.json();
  check("expired ticket -> 401", r.status === 401 && /expired/i.test(j.error), `${r.status} ${j.error}`);
}
{
  // A ticket signed for a different catalog version must read as "restart your
  // download", not "you are unauthorised".
  const staleEnv = { ...env, QUESTIONS_DB: env.QUESTIONS_DB };
  const bumped = makeD1(WORK);
  await bumped.prepare("UPDATE catalog_meta SET value = 'bumped.9' WHERE key = 'version'").bind().run();
  const r = await call("/api/catalog/questions?since=0&limit=5", { headers: { "X-Catalog-Ticket": TICKET } }, staleEnv);
  const j = await r.json();
  check("ticket for an older version -> 409 with the new version", r.status === 409 && j.version === "bumped.9", `${r.status} ${JSON.stringify(j)}`);
  await bumped.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'version'").bind(META.version).run();
  bumped.__close();
}

section("catalog pages");
const TH = { "X-Catalog-Ticket": TICKET };
{
  const r = await call("/api/catalog/questions?since=0&limit=10", { headers: TH });
  const text = await r.text();
  let page;
  check("page -> 200", r.status === 200, `${r.status}`);
  try {
    page = JSON.parse(text);
    check("hand-concatenated page body is valid JSON", true);
  } catch (e) {
    check("hand-concatenated page body is valid JSON", false, e.message);
  }
  check("page honours limit", page?.questions?.length === 10, String(page?.questions?.length));
  check("since is inclusive -- first page starts at seq 0", page?.since === 0 && page?.nextSince === 10, `since=${page?.since} next=${page?.nextSince}`);
  check("page is not done", page?.done === false);
  check("page echoes the version", page?.version === META.version);
  check("questions carry no `raw` field", page?.questions?.every(q => !("raw" in q)));
  check("questions carry an id", page?.questions?.every(q => typeof q.id === "string" && q.id));
  check("page is immutably cacheable", /immutable/.test(r.headers.get("Cache-Control") || ""));
}
{
  const r1 = await call("/api/catalog/questions?since=0&limit=10", { headers: TH });
  const etag = r1.headers.get("ETag");
  const r2 = await call("/api/catalog/questions?since=0&limit=10", { headers: { ...TH, "If-None-Match": etag } });
  check("ETag is returned", Boolean(etag), String(etag));
  check("matching If-None-Match -> 304", r2.status === 304, `${r2.status}`);
}
{
  const r = await call("/api/catalog/questions?since=0&limit=99999", { headers: TH });
  const page = await r.json();
  check("limit is clamped to 300", page.questions.length === 300, String(page.questions.length));
}
{
  const r = await call("/api/catalog/questions?since=notanumber&limit=abc", { headers: TH });
  const page = await r.json();
  check("garbage params fall back to defaults", page.since === 0 && page.questions.length === 150, `since=${page.since} n=${page.questions.length}`);
}
{
  const r = await call("/api/catalog/questions?since=99999&limit=150", { headers: TH });
  const page = await r.json();
  check("past-the-end page is empty and done", page.questions.length === 0 && page.done === true);
}

section("full download walk");
{
  const t0 = Date.now();
  const ids = new Set();
  let since = 0;
  let pages = 0;
  let done = false;
  let bytes = 0;
  let badSeq = false;

  while (!done && pages < 200) {
    const r = await call(`/api/catalog/questions?since=${since}&limit=150`, { headers: TH });
    const text = await r.text();
    bytes += text.length;
    const page = JSON.parse(text);
    pages++;
    if (page.since !== since) badSeq = true;
    for (const q of page.questions) ids.add(q.id);
    done = page.done;
    since = page.nextSince;
  }

  check("walk reaches done", done === true);
  check("walk collects exactly 2982 unique questions", ids.size === 2982, String(ids.size));
  check("walk takes ~20 pages at 150/page", pages === 20, String(pages));
  check("every page echoed the requested since", !badSeq);
  console.log(`        (${pages} pages, ${(bytes / 1e6).toFixed(1)} MB, ${Date.now() - t0} ms)`);
}

section("admin auth");
{
  const r = await call("/api/admin/catalog/stats", { method: "POST" });
  check("admin route without a key -> 401", r.status === 401, `${r.status}`);
}
{
  const r = await call("/api/admin/catalog/stats", { method: "POST", headers: { "X-Admin-Key": "wrong" } });
  check("admin route with a wrong key -> 401", r.status === 401, `${r.status}`);
}
{
  const noKeyEnv = { ...env, ADMIN_KEY: "" };
  const r = await call("/api/admin/catalog/stats", { method: "POST", headers: { "X-Admin-Key": "x" } }, noKeyEnv);
  check("unconfigured ADMIN_KEY -> 503, never open", r.status === 503, `${r.status}`);
}
{
  const r = await call("/api/admin/catalog/stats", { method: "POST", headers: { "X-Admin-Key": ADMIN_KEY } });
  const s = await r.json();
  check("admin stats -> 200", r.status === 200, `${r.status}`);
  check("stats: 2982 rows", s.rows === 2982, String(s.rows));
  check("stats: seq contiguous 0..2981", s.seqContiguous === true && s.minSeq === 0 && s.maxSeq === 2981);
  check("stats: no row exceeds D1's 2 MB cap", s.maxRowBytes < 2_000_000, `${s.maxRowBytes}`);
  check("stats: a single catalog version", Object.keys(s.byVersion).length === 1, JSON.stringify(s.byVersion));

  // Expected per-domain counts come from counts.byDomain in the .sat-test export.
  const expected = {
    "math:H": 449, "math:P": 372, "math:Q": 246, "math:S": 227,
    "rw:INI": 507, "rw:CAS": 437, "rw:EOI": 365, "rw:SEC": 379,
  };
  const mismatches = Object.entries(expected).filter(([k, v]) => s.byDomain[k] !== v);
  check("stats: per-domain counts match the source export", mismatches.length === 0, JSON.stringify(mismatches));
}
{
  const r = await call("/api/catalog/questions?since=0&limit=5", { headers: { "X-Admin-Key": ADMIN_KEY } });
  check("admin key substitutes for a download ticket", r.status === 200, `${r.status}`);
}

section("rate limiting");
{
  const ip = "9.9.9.9";
  let first429 = -1;
  for (let i = 0; i < 40; i++) {
    const r = await worker.fetch(req("/api/catalog/meta", { ip }), env);
    if (r.status === 429) { first429 = i; break; }
  }
  check("meta is rate limited after its budget (30/min)", first429 === 30, `first 429 at request ${first429}`);
}
{
  const ip = "9.9.9.10";
  let limited = false;
  for (let i = 0; i < 40; i++) {
    const r = await worker.fetch(req("/api/catalog/meta", { ip, headers: { "X-Admin-Key": ADMIN_KEY } }), env);
    if (r.status === 429) { limited = true; break; }
  }
  check("admin key is exempt from rate limiting", !limited);
}
{
  // The catalog budget must clear a full 20-page download in one window.
  const ip = "9.9.9.11";
  let limited = false;
  for (let i = 0; i < 20; i++) {
    const r = await worker.fetch(req(`/api/catalog/questions?since=${i * 150}&limit=150`, { ip, headers: TH }), env);
    if (r.status === 429) { limited = true; break; }
  }
  check("a full 20-page download fits inside the page budget", !limited);
}

section("admin ingestion round-trip (empty database)");
{
  const fresh = makeD1(FRESH);
  const fEnv = { ...env, QUESTIONS_DB: fresh };
  const AH = { "X-Admin-Key": ADMIN_KEY };

  {
    const r = await call("/api/catalog/meta", {}, fEnv);
    check("empty catalog -> 503 rather than a broken 200", r.status === 503, `${r.status}`);
  }
  {
    // upload_catalog.py asks for stats before it runs init.
    const r = await call("/api/admin/catalog/stats", { method: "POST", headers: AH }, fEnv);
    const s = await r.json();
    check("stats on an uninitialised database -> 200 with rows 0", r.status === 200 && s.rows === 0 && s.initialised === false, `${r.status} ${JSON.stringify(s)}`);
  }

  const init = await call("/api/admin/catalog/init", { method: "POST", headers: AH, body: { reset: true } }, fEnv);
  check("init -> 200", init.status === 200, `${init.status}`);

  // Pull 30 real rows out of the built catalog and push them through the route.
  const src = new DatabaseSync(WORK);
  const rows = src
    .prepare(
      "SELECT id, question_id, subject, domain_code, skill_code, difficulty_code, type," +
        " score_band, catalog_version, seq, bytes, payload FROM questions ORDER BY seq LIMIT 30"
    )
    .all()
    .map(r => Object.values(r));
  src.close();

  const put = await call("/api/admin/catalog/rows", { method: "POST", headers: AH, body: { rows: rows.slice(0, 25) } }, fEnv);
  const putJson = await put.json();
  check("rows -> 200 and reports what it wrote", put.status === 200 && putJson.written === 25, JSON.stringify(putJson));

  const tooMany = await call("/api/admin/catalog/rows", { method: "POST", headers: AH, body: { rows: new Array(41).fill(rows[0]) } }, fEnv);
  check("rows over the 40-per-request cap -> 400", tooMany.status === 400, `${tooMany.status}`);

  const badShape = await call("/api/admin/catalog/rows", { method: "POST", headers: AH, body: { rows: [["only", "two"]] } }, fEnv);
  check("row with the wrong column count -> 400", badShape.status === 400, `${badShape.status}`);

  const badPayload = await call("/api/admin/catalog/rows", { method: "POST", headers: AH, body: { rows: [[...rows[0].slice(0, 11), "not json"]] } }, fEnv);
  check("row whose payload is not a JSON object -> 400", badPayload.status === 400, `${badPayload.status}`);

  const metaPut = await call(
    "/api/admin/catalog/meta",
    { method: "POST", headers: AH, body: { meta: { version: META.version, count: "25", bytes: "1234" }, prune: true } },
    fEnv
  );
  check("meta -> 200", metaPut.status === 200, `${metaPut.status}`);

  const back = await call("/api/catalog/questions?since=0&limit=150", { headers: AH }, fEnv);
  const page = await back.json();
  check("uploaded rows read back through the public route", page.questions.length === 25, String(page.questions.length));
  check("round-tripped payloads still parse and keep their ids", page.questions.every(q => typeof q.id === "string"));
  check("round-tripped payloads still carry no `raw`", page.questions.every(q => !("raw" in q)));

  // prune must delete rows left over from a previous catalog version.
  await call("/api/admin/catalog/rows", { method: "POST", headers: AH, body: { rows: rows.slice(25).map(r => [...r.slice(0, 8), "old.version", ...r.slice(9)]) } }, fEnv);
  const beforePrune = await (await call("/api/admin/catalog/stats", { method: "POST", headers: AH }, fEnv)).json();
  await call("/api/admin/catalog/meta", { method: "POST", headers: AH, body: { meta: { version: META.version }, prune: true } }, fEnv);
  const afterPrune = await (await call("/api/admin/catalog/stats", { method: "POST", headers: AH }, fEnv)).json();
  check("prune drops rows from superseded versions", beforePrune.rows === 30 && afterPrune.rows === 25, `${beforePrune.rows} -> ${afterPrune.rows}`);

  fresh.__close();
}

section("legacy database from an earlier import");
{
  // Reproduces the D1 that broke a real upload: a database whose `questions`
  // table predates this schema. The table EXISTS, so D1 answers "no such column"
  // rather than "no such table" -- which a missing-table-only guard walks past.
  const LEGACY = join(tmpdir(), "sevrony-worker-legacy.sqlite");
  if (existsSync(LEGACY)) rmSync(LEGACY);
  const seed = new DatabaseSync(LEGACY);
  seed.exec("CREATE TABLE questions (id TEXT PRIMARY KEY, subject TEXT, data TEXT)");
  seed.exec("INSERT INTO questions VALUES ('old-1','math','{}')");
  seed.close();

  const legacy = makeD1(LEGACY);
  const lEnv = { ...env, QUESTIONS_DB: legacy };
  const AH = { "X-Admin-Key": ADMIN_KEY };

  {
    const r = await call("/api/admin/catalog/stats", { method: "POST", headers: AH }, lEnv);
    const s = await r.json();
    check(
      "stats on a legacy table -> 200, not a 500 that strands the uploader",
      r.status === 200 && s.initialised === false && s.rows === 0,
      `${r.status} ${JSON.stringify(s)}`
    );
  }
  {
    // The CREATE INDEX in the DDL is what actually dies here, so the probe has to
    // run before any schema statement rather than after.
    const r = await call("/api/admin/catalog/init", { method: "POST", headers: AH, body: { reset: false } }, lEnv);
    const b = await r.json();
    check("init without reset -> 409, not 500", r.status === 409, `${r.status} ${JSON.stringify(b)}`);
    check("the 409 tells the operator to use --reset", /--reset/.test(b.error || ""), b.error);
  }
  {
    const r = await call("/api/admin/catalog/init", { method: "POST", headers: AH, body: { reset: true } }, lEnv);
    check("init with reset recreates the schema -> 200", r.status === 200, `${r.status}`);

    const row = ["n1", "qn1", "math", "H", "H.C.", "E", "mcq", 3, "v-legacy", 0, 24, '{"id":"n1"}'];
    const w = await call("/api/admin/catalog/rows", { method: "POST", headers: AH, body: { rows: [row] } }, lEnv);
    const wb = await w.json();
    check("rows insert once the schema is ours", w.status === 200 && wb.written === 1, `${w.status} ${JSON.stringify(wb)}`);

    const after = await call("/api/admin/catalog/stats", { method: "POST", headers: AH }, lEnv);
    const s = await after.json();
    check("the legacy row is gone and only the new one remains", s.initialised === true && s.rows === 1, JSON.stringify(s));
  }

  legacy.__close();
  if (existsSync(LEGACY)) rmSync(LEGACY);
}

section("failure isolation");
{
  const noDb = { ...env, QUESTIONS_DB: undefined };
  const r = await call("/api/catalog/meta", {}, noDb);
  check("missing D1 binding -> 500 on catalog routes", r.status === 500, `${r.status}`);
  const v = await call("/", {}, noDb);
  check("missing D1 binding leaves the vocab banner working", v.status === 200, `${v.status}`);
}

/* ------------------------------------------------------------------ summary */

env.QUESTIONS_DB.__close();
for (const p of [WORK, FRESH]) if (existsSync(p)) rmSync(p);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  !! ${f}`);
  process.exit(1);
}
console.log("PASS");
