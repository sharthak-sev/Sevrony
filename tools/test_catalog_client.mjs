/**
 * End-to-end test of the client download driver (api.js) against the real
 * worker handler, backed by catalog.sqlite through a node:sqlite D1 shim.
 *
 * This is the only way to exercise SevApi.ensureCatalog() offline. It covers
 * the parts that are easy to get wrong and expensive to debug in a browser:
 * the keyset cursor, the resume-from-interruption path, mid-download ticket
 * expiry, and a catalog version changing under an in-flight download.
 *
 * Usage: node tools/test_catalog_client.mjs [catalog.sqlite] [catalog]
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ harness */

let passed = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

const eq = (name, actual, expected) =>
  check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

const section = t => console.log(`\n${t}`);
const note = t => console.log(`        (${t})`);

/* ------------------------------------------------------------------ D1 shim */

/**
 * Minimum of D1's surface that the catalog code uses, with the semantics that
 * matter: bind() returns a NEW statement rather than mutating in place, batch()
 * is transactional, and exec() splits on newlines.
 */
function makeD1(sqlitePath) {
  const sqlite = new DatabaseSync(sqlitePath);

  const makeStmt = (sql, params = []) => ({
    bind: (...next) => makeStmt(sql, next),
    all: async () => ({ results: sqlite.prepare(sql).all(...params), success: true }),
    run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...params) }),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    __sql: sql,
    __params: params,
  });

  return {
    prepare: sql => makeStmt(sql),
    batch: async statements => {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(await s.all());
        sqlite.exec("COMMIT");
        return out;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
    exec: async sql => {
      for (const line of sql.split("\n")) if (line.trim()) sqlite.exec(line);
      return { count: 0 };
    },
    __raw: sqlite,
  };
}

/* --------------------------------------------------------- worker under test */

const TURNSTILE_OK = "good-token";

/**
 * Stands in for Cloudflare's siteverify endpoint. The real service echoes back
 * the `action` the widget was rendered with; api.js always renders with
 * "catalog_download", which is what the ticket route enforces.
 */
async function siteverifyStub(init) {
  // The worker posts FormData, so this has to be read as multipart -- reading it
  // as urlencoded silently yields a null token and a confusing 403.
  const form = await new Response(init.body, { headers: init.headers }).formData();
  const token = form.get("response");
  return new Response(
    JSON.stringify(
      token === TURNSTILE_OK
        ? { success: true, action: "catalog_download" }
        : { success: false, "error-codes": ["invalid-input-response"] }
    ),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

const worker = (await import("../worker/index.js")).default;

const SOURCE = process.argv[2] || "catalog.sqlite";
if (!existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE}. Build it first:\n  python3 tools/build_catalog_db.py <export.sat-test> --catalog sat --version 2026-05-25.1`);
  process.exit(2);
}
const WORK = join(tmpdir(), "sevrony-client-test.sqlite");
rmSync(WORK, { force: true });
copyFileSync(SOURCE, WORK);

const d1 = makeD1(WORK);
const ADMIN_KEY = "test-admin-key-0123456789";
const env = {
  QUESTIONS_DB: d1,
  ADMIN_KEY,
  CATALOG_TICKET_KEY: "test-ticket-key-0123456789",
  CATALOG_REQUIRE_TICKET: "1",
  TURNSTILE_SECRET: "test-turnstile-secret",
};

const BASE = "https://divine-silence-6016.sharthakjaiswal50.workers.dev";
const ORIGIN = "https://sharthak-sev.github.io";
const CATALOG = process.argv[3] || "sat";

const SOURCE_COUNT = d1.__raw.prepare("SELECT COUNT(*) AS n FROM questions WHERE catalog = ?").get(CATALOG).n;
const SOURCE_VERSION = d1.__raw.prepare("SELECT value FROM catalog_meta WHERE catalog = ? AND key = 'version'").get(CATALOG).value;

/* ----------------------------------------------------- browser-shaped globals */

/** Counts every request api.js makes, so the tests can assert on traffic. */
const traffic = { meta: 0, ticket: 0, questions: 0, total: 0 };

/**
 * Rotated per section. The worker rate-limits per IP, and several sections here
 * run a full 20-page download back to back -- without rotation the later ones
 * would be measuring the limiter rather than the download driver.
 */
let clientIp = "10.0.0.1";
let ipCounter = 1;

/** Set to make the next N page requests fail in a specific way. */
let injectPageFailure = null;

const clientFetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;

  // The worker's own outbound call to Cloudflare, made while handling a request
  // that came in through this same stub.
  if (url.startsWith("https://challenges.cloudflare.com/")) return siteverifyStub(init);
  if (!url.startsWith(BASE)) throw new Error(`unexpected outbound fetch: ${url}`);

  const path = url.slice(BASE.length);
  traffic.total++;
  if (path.startsWith("/api/catalog/meta")) traffic.meta++;
  else if (path.startsWith("/api/catalog/ticket")) traffic.ticket++;
  else if (path.startsWith("/api/catalog/questions")) traffic.questions++;

  if (injectPageFailure && path.startsWith("/api/catalog/questions")) {
    // Keyed on `since`, not on a request counter: a retry of page N is a second
    // request for the same `since`, and a counter would silently move the
    // injection point to page N+1.
    const since = Number(new URL(url).searchParams.get("since") || 0);
    const injected = injectPageFailure(since, path);
    if (injected) return injected;
  }

  const request = new Request(url, {
    method: init.method || "GET",
    headers: { Origin: ORIGIN, "CF-Connecting-IP": clientIp, ...(init.headers || {}) },
    body: init.body,
  });
  return worker.fetch(request, env);
};

/** In-memory stand-in for db.js, keyed the same way the real stores are. */
function makeLocalDB() {
  const stores = { appConfig: new Map(), questions: new Map(), questionBanks: new Map() };
  return {
    stores,
    get: async (store, key) => stores[store].get(key) ?? undefined,
    put: async (store, record) => {
      const key = store === "appConfig" ? record.key : record.id;
      stores[store].set(key, record);
      return key;
    },
    putMany: async (store, records) => {
      for (const r of records) await stores[store].set(store === "appConfig" ? r.key : r.id, r);
    },
    remove: async (store, key) => void stores[store].delete(key),
    getAll: async store => [...stores[store].values()],
  };
}

let localDB = makeLocalDB();

const turnstileStub = {
  render: (container, opts) => {
    // Resolve asynchronously, as the real widget does.
    setTimeout(() => opts.callback(TURNSTILE_OK), 0);
    return "widget-1";
  },
  remove: () => {},
};

const makeElement = () => {
  const el = {
    dataset: {},
    style: {},
    innerHTML: "",
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  return el;
};

const documentStub = {
  _byId: new Map(),
  body: makeElement(),
  createElement: () => makeElement(),
  getElementById(id) {
    return this._byId.get(id) || null;
  },
};

globalThis.window = {
  get SatPracticeDB() {
    return localDB;
  },
  turnstile: turnstileStub,
};
globalThis.document = documentStub;
globalThis.fetch = clientFetch;

// api.js is an IIFE that publishes window.SevApi; evaluating it is the load.
new Function("window", "document", "fetch", readFileSync(join(root, "api.js"), "utf8"))(
  globalThis.window,
  documentStub,
  clientFetch
);

const SevApi = globalThis.window.SevApi;
if (!SevApi) {
  console.error("api.js did not publish window.SevApi");
  process.exit(2);
}

/** Mirrors app.js storeCatalogPage(): normalize, drop `raw`, write. */
function makeStore() {
  const seen = new Map();
  const calls = [];
  const store = async (rawQuestions, { version, bankId, catalog }) => {
    calls.push(rawQuestions.length);
    const records = rawQuestions.map(q => {
      const record = { ...q, bankId, catalog, catalogVersion: version };
      delete record.raw;
      return record;
    });
    await localDB.putMany("questions", records);
    for (const r of records) seen.set(r.id, r);
    return records.length;
  };
  return { store, seen, calls };
}

function resetTraffic() {
  traffic.meta = traffic.ticket = traffic.questions = traffic.total = 0;
  injectPageFailure = null;
  clientIp = `10.0.0.${++ipCounter}`;
}

/* ------------------------------------------------------------------- tests */

console.log(`${CATALOG}: ${SOURCE_COUNT} questions, version ${SOURCE_VERSION}`);

section("full download");
{
  resetTraffic();
  const { store, seen, calls } = makeStore();
  const progress = [];
  const t0 = process.hrtime.bigint();
  const result = await SevApi.ensureCatalog(CATALOG, { store, onProgress: p => progress.push(p) });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  eq("status is downloaded", result.status, "downloaded");
  eq("version matches the catalog", result.version, SOURCE_VERSION);
  eq("count matches the source", result.count, SOURCE_COUNT);
  eq("every question was stored exactly once", seen.size, SOURCE_COUNT);
  eq("one ticket for the whole download", traffic.ticket, 1);
  check("pages match the 150-per-page default", traffic.questions === Math.ceil(SOURCE_COUNT / 150), `got ${traffic.questions}`);
  check("progress was reported", progress.length > 5, `got ${progress.length} events`);
  eq("final progress is 100%", progress[progress.length - 1].pct, 100);
  check(
    "no question kept a `raw` field",
    [...seen.values()].every(q => !("raw" in q))
  );
  check(
    "every question carries the catalog bank id",
    [...seen.values()].every(q => q.bankId === `sevrony-catalog-${CATALOG}` && q.catalog === CATALOG)
  );
  note(`${traffic.questions} pages, ${calls.length} store calls, ${ms.toFixed(0)} ms`);
}

section("cursor state");
{
  const cursor = await SevApi.catalog.getState(CATALOG);
  check("cursor exists", Boolean(cursor));
  eq("cursor is complete", cursor.complete, true);
  eq("cursor version matches", cursor.version, SOURCE_VERSION);
  eq("cursor count matches", cursor.count, SOURCE_COUNT);
  eq("cursor expected matches", cursor.expected, SOURCE_COUNT);
  check("cursor has a start and an end time", cursor.startedAt > 0 && cursor.downloadedAt >= cursor.startedAt);
}

section("second run is a no-op");
{
  resetTraffic();
  const { store, seen } = makeStore();
  const result = await SevApi.ensureCatalog(CATALOG, { store });
  eq("status is current", result.status, "current");
  eq("nothing was re-stored", seen.size, 0);
  eq("only the meta request was made", traffic.total, 1);
  eq("no ticket was minted", traffic.ticket, 0);
}

section("force re-download");
{
  resetTraffic();
  const { store, seen } = makeStore();
  const result = await SevApi.ensureCatalog(CATALOG, { store, force: true });
  eq("status is downloaded", result.status, "downloaded");
  eq("all questions came down again", seen.size, SOURCE_COUNT);
}

section("resume after an interruption");
{
  // Simulate a tab closed four pages in: rewind the cursor and drop the
  // questions that would not yet have been written.
  const pagesDone = 4;
  const stoppedAt = pagesDone * 150;
  await SevApi.catalog.setState(CATALOG, {
    version: SOURCE_VERSION,
    count: SOURCE_COUNT,
    since: stoppedAt,
    downloaded: stoppedAt,
    complete: false,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  });

  resetTraffic();
  const { store, seen } = makeStore();
  const result = await SevApi.ensureCatalog(CATALOG, { store });

  eq("status is resumed", result.status, "resumed");
  eq("total count is still the full catalog", result.count, SOURCE_COUNT);
  eq("only the remaining questions were fetched", seen.size, SOURCE_COUNT - stoppedAt);
  check(
    "the resumed pages are the tail of the catalog",
    traffic.questions === Math.ceil((SOURCE_COUNT - stoppedAt) / 150),
    `got ${traffic.questions} pages`
  );
  const cursor = await SevApi.catalog.getState(CATALOG);
  eq("the original startedAt is preserved across the resume", cursor.startedAt, 1_700_000_000_000);
  note(`resumed at question ${stoppedAt}, fetched ${seen.size} more`);
}

section("mid-download ticket expiry");
{
  await SevApi.catalog.clearState(CATALOG);
  resetTraffic();

  // Fail page 3 with a 401 exactly once, as an expired ticket would.
  let expired = false;
  injectPageFailure = since => {
    if (since === 300 && !expired) {
      expired = true;
      return new Response(JSON.stringify({ error: "Ticket expired." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  };

  const { store, seen } = makeStore();
  const result = await SevApi.ensureCatalog(CATALOG, { store });

  eq("the download still completed", result.count, SOURCE_COUNT);
  eq("every question arrived", seen.size, SOURCE_COUNT);
  eq("a second ticket was minted", traffic.ticket, 2);
  note("401 on page 3 -> re-mint -> same page retried");
}

section("version change mid-download");
{
  await SevApi.catalog.clearState(CATALOG);
  resetTraffic();

  // Answer page 5 with the worker's real 409 shape, then let the retry through.
  let bumped = false;
  injectPageFailure = since => {
    if (since === 600 && !bumped) {
      bumped = true;
      return new Response(JSON.stringify({ error: "Catalog version changed.", version: SOURCE_VERSION }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  };

  const { store, seen } = makeStore();
  const result = await SevApi.ensureCatalog(CATALOG, { store });

  eq("the download restarted and finished", result.count, SOURCE_COUNT);
  eq("every question is present after the restart", seen.size, SOURCE_COUNT);
  check("the restart re-read meta", traffic.meta >= 2, `meta requests: ${traffic.meta}`);
  check("the restart re-minted a ticket", traffic.ticket >= 2, `tickets: ${traffic.ticket}`);
  note(`${traffic.questions} page requests including the restart`);
}

section("transient network failure is retried");
{
  await SevApi.catalog.clearState(CATALOG);
  resetTraffic();

  let thrown = 0;
  injectPageFailure = since => {
    if (since === 150 && thrown < 2) {
      thrown++;
      throw new TypeError("Failed to fetch");
    }
    return null;
  };

  const { store, seen } = makeStore();
  const result = await SevApi.ensureCatalog(CATALOG, { store });
  eq("two dropped connections did not lose the download", seen.size, SOURCE_COUNT);
  eq("the count is still right", result.count, SOURCE_COUNT);
  eq("both failures were retried", thrown, 2);
}

section("give up after too many failures");
{
  await SevApi.catalog.clearState(CATALOG);
  resetTraffic();

  injectPageFailure = since => {
    if (since >= 150) throw new TypeError("Failed to fetch");
    return null;
  };

  const { store, seen } = makeStore();
  let error = null;
  try {
    await SevApi.ensureCatalog(CATALOG, { store });
  } catch (err) {
    error = err;
  }
  check("the failure surfaces to the caller", error instanceof Error, String(error));
  check("page 1 was still stored", seen.size > 0, `stored ${seen.size}`);

  const cursor = await SevApi.catalog.getState(CATALOG);
  check("the cursor records the incomplete state", cursor && cursor.complete === false);
  check("the cursor points past what was stored", cursor.since > 0, `since=${cursor.since}`);
  note("a later attempt resumes from this cursor rather than starting over");
}

section("abort");
{
  await SevApi.catalog.clearState(CATALOG);
  resetTraffic();

  const controller = new AbortController();
  const { store, seen } = makeStore();
  const pending = SevApi.ensureCatalog(CATALOG, { store, signal: controller.signal });
  setTimeout(() => controller.abort(), 5);

  let error = null;
  try {
    await pending;
  } catch (err) {
    error = err;
  }
  check("aborting rejects", error !== null, "no error thrown");
  check("it rejects as an abort", error?.name === "AbortError", `got ${error?.name}: ${error?.message}`);
  check("the download stopped short", seen.size < SOURCE_COUNT, `stored ${seen.size}`);
}

section("content integrity");
{
  await SevApi.catalog.clearState(CATALOG);
  localDB = makeLocalDB();
  resetTraffic();

  const { store, seen } = makeStore();
  await SevApi.ensureCatalog(CATALOG, { store });

  const sourceRows = d1.__raw.prepare("SELECT id, subject, domain_code, seq FROM questions WHERE catalog = ? ORDER BY seq").all(CATALOG);
  eq("row count matches", seen.size, sourceRows.length);

  let idMismatch = 0;
  let subjectMismatch = 0;
  let missingStem = 0;
  for (const row of sourceRows) {
    const q = seen.get(row.id);
    if (!q) {
      idMismatch++;
      continue;
    }
    if (q.subject !== row.subject) subjectMismatch++;
    if (!q.stem && !q.prompt && !q.question) missingStem++;
  }
  eq("every source id is present locally", idMismatch, 0);
  eq("subjects survived the round trip", subjectMismatch, 0);
  eq("every question has body text", missingStem, 0);

  const bySubject = {};
  for (const q of seen.values()) bySubject[q.subject] = (bySubject[q.subject] || 0) + 1;
  const expected = {};
  for (const row of sourceRows) expected[row.subject] = (expected[row.subject] || 0) + 1;
  eq("per-subject counts match", JSON.stringify(bySubject), JSON.stringify(expected));
  note(Object.entries(expected).map(([k, v]) => `${k}: ${v}`).join(", "));

  const bytes = JSON.stringify([...seen.values()]).length;
  note(`${(bytes / 1024 / 1024).toFixed(1)} MB stored locally`);
}

section("rate limits leave room for a shared network");
{
  // A computer lab behind one NAT address: several students download at once.
  // The page budget has to absorb that, because the ticket -- not the page
  // route -- is where the per-person cost gate lives.
  resetTraffic();
  const sharedIp = clientIp;
  const downloads = 5;
  const results = [];
  for (let i = 0; i < downloads; i++) {
    clientIp = sharedIp;
    const { store, seen } = makeStore();
    await SevApi.catalog.clearState(CATALOG);
    const result = await SevApi.ensureCatalog(CATALOG, { store });
    results.push(seen.size);
  }
  eq(`${downloads} downloads from one IP all completed`, results.filter(n => n === SOURCE_COUNT).length, downloads);
  note(`${traffic.questions} page requests from a single address`);
}

section("worker refuses an unticketed page");
{
  const res = await worker.fetch(
    new Request(`${BASE}/api/catalog/questions/${CATALOG}?since=0&limit=5`, { headers: { Origin: ORIGIN } }),
    env
  );
  eq("no ticket -> 401", res.status, 401);
}

section("worker origin resolution");
{
  // resolveBase() is the one place a misconfiguration would send real users'
  // downloads -- and their Turnstile tokens -- to someone else's host, so the
  // loopback gate is worth asserting rather than trusting.
  const src = readFileSync(join(root, "api.js"), "utf8");
  const PROD = "https://divine-silence-6016.sharthakjaiswal50.workers.dev";
  const STAGING = "https://sevrony-worker-staging.sharthakjaiswal50.workers.dev";

  const baseFor = (hostname, stored) => {
    const win = {
      location: hostname === undefined ? undefined : { hostname },
      localStorage: stored === undefined ? undefined : { getItem: k => (k === "sevrony.apiBase" ? stored : null) },
      turnstile: turnstileStub,
      get SatPracticeDB() {
        return localDB;
      },
    };
    // Swallow the override notice so it does not interleave with test output.
    new Function("window", "document", "fetch", "console", src)(win, documentStub, clientFetch, {
      info: () => {},
      warn: () => {},
    });
    return win.SevApi.BASE;
  };

  eq("a deployed origin ignores an override entirely", baseFor("sharthak-sev.github.io", STAGING), PROD);
  eq("deployed origin with nothing stored -> production", baseFor("sharthak-sev.github.io", null), PROD);
  eq("localhost honours a workers.dev override", baseFor("localhost", STAGING), STAGING);
  eq("127.0.0.1 honours it too", baseFor("127.0.0.1", STAGING), STAGING);
  eq("localhost with nothing stored -> staging", baseFor("localhost", null), STAGING);
  eq("a trailing slash is trimmed", baseFor("localhost", `${STAGING}/`), STAGING);
  eq("a non-workers.dev host is refused", baseFor("localhost", "https://evil.example.com"), STAGING);
  eq("plain http is refused", baseFor("localhost", "http://x.workers.dev"), STAGING);
  eq("localStorage being unavailable is not fatal", baseFor("localhost", undefined), STAGING);
}

/* -------------------------------------------------------------------- report */

rmSync(WORK, { force: true });
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
}
console.log(failures.length ? "FAIL" : "PASS");
process.exit(failures.length ? 1 : 0);
