/* ===========================================================
   Sevrony API client
   -----------------------------------------------------------
   Single source of truth for the Cloudflare Worker origin, and the
   download driver for the shared question catalog.

   Loaded before every other script so `SevApi.BASE` is available while
   the other modules are still initialising.

   Split of responsibility for ensureCatalog(): this file owns the network
   -- meta, ticket, paging, retries, version changes and the resume cursor.
   The caller injects `store`, because normalising a question and writing it
   to IndexedDB needs app.js internals that do not belong here.
   =========================================================== */
(function () {
  "use strict";

  /** The worker that serves real users in production. */
  const PROD_BASE = "https://divine-silence-6016.sharthakjaiswal50.workers.dev";
  /** The staging worker for local testing and validation before production deploy. */
  const STAGING_BASE = "https://sevrony-worker-staging.sharthakjaiswal50.workers.dev";

  /**
   * Resolve the worker origin.
   *
   * On localhost / 127.0.0.1, defaults to STAGING_BASE so local tests automatically
   * use the multi-catalog staging environment without requiring a manual localStorage override.
   * An explicit localStorage.getItem("sevrony.apiBase") override is still supported.
   */
  function resolveBase() {
    const host = window.location?.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") return PROD_BASE;
    try {
      const override = (window.localStorage?.getItem("sevrony.apiBase") || "").replace(/\/+$/, "");
      if (/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(override)) {
        return override;
      }
    } catch {
      /* storage can be disabled outright; fall through to staging */
    }
    return STAGING_BASE;
  }

  const BASE = resolveBase();

  /** Matches the `action` the worker expects on a catalog ticket request. */
  const TURNSTILE_ACTION = "catalog_download";
  const TURNSTILE_SITEKEY = "0x4AAAAAAEC6PoP81MryKKvo";

  /**
   * One catalog per exam, namespaced. The bank id and the resume-cursor key both
   * carry the catalog name so three exams can sit in IndexedDB side by side --
   * `sevrony-catalog-sat`, `questionCatalog_psat10`, and so on.
   *
   * Kept in step with CATALOG_BANK_PREFIX / CATALOG_CONFIG_KEY_PREFIX in
   * db-worker.js, which renames the single-catalog release's unsuffixed
   * `sevrony-catalog` bank and `questionCatalog` cursor into this shape.
   */
  const CATALOG_BANK_PREFIX = "sevrony-catalog-";
  const CONFIG_KEY_PREFIX = "questionCatalog_";

  /**
   * The catalog a call falls back to when none is named.
   *
   * A service worker can serve this file from cache while a newer app.js is
   * live, or the reverse. Defaulting keeps that combination on the SAT catalog
   * instead of requesting /api/catalog/meta/undefined.
   */
  const DEFAULT_CATALOG = "sat";

  const PAGE_SIZE = 150;
  const PAGE_RETRIES = 3;
  const REQUEST_TIMEOUT_MS = 45000;

  function url(path) {
    return BASE + path;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function timedFetch(input, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeout || REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    if (init.signal) init.signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      if (init.signal) init.signal.removeEventListener("abort", onAbort);
    }
  }

  async function readError(res) {
    try {
      const body = await res.json();
      return body.error || `Request failed (${res.status})`;
    } catch (e) {
      return `Request failed (${res.status})`;
    }
  }

  /* -------------------------------------------------------- catalog: network */

  async function meta(catalogName = DEFAULT_CATALOG, options = {}) {
    const res = await timedFetch(url(`/api/catalog/meta/${catalogName}`), { signal: options.signal });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  /**
   * Solve a Turnstile challenge without showing anything.
   *
   * The widget is rendered into a zero-sized, transparent, pointer-events:none
   * container because Turnstile refuses to run in a detached node and will not
   * hand back a token for one that was never laid out. Managed mode almost
   * always resolves invisibly; if it ever needs interaction the challenge is
   * unreachable and the timeout-callback surfaces that as an error rather than
   * hanging.
   */
  function getTurnstileToken(action) {
    return new Promise((resolve, reject) => {
      if (!window.turnstile) {
        return reject(new Error("Security script blocked. Please disable your ad-blocker or tracking protection for this site."));
      }

      const containerId = "cf-turnstile-catalog";
      let container = document.getElementById(containerId);
      if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        container.style.position = "absolute";
        container.style.opacity = "0";
        container.style.pointerEvents = "none";
        container.style.width = "0px";
        container.style.height = "0px";
        document.body.appendChild(container);
      } else {
        if (container.dataset.widgetId) {
          try { window.turnstile.remove(container.dataset.widgetId); } catch (e) {}
        }
        container.innerHTML = "";
      }

      let widgetId;
      const cleanup = () => setTimeout(() => {
        try { window.turnstile.remove(widgetId); } catch (e) {}
      }, 500);

      try {
        widgetId = window.turnstile.render(container, {
          sitekey: TURNSTILE_SITEKEY,
          action: action || TURNSTILE_ACTION,
          callback: token => { cleanup(); resolve(token); },
          "error-callback": () => { cleanup(); reject(new Error("Security check failed. Please refresh and try again.")); },
          "timeout-callback": () => { cleanup(); reject(new Error("Security check timed out. Please try again.")); }
        });
        container.dataset.widgetId = widgetId;
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Trade a Turnstile token for a short-lived download ticket.
   *
   * The ticket is an HMAC the worker issues once and then checks on every page
   * request, so the human check happens a single time per download rather than
   * on each of the ~20 pages. It is bound to the catalog, so a ticket minted for
   * one exam cannot be replayed against another.
   */
  async function ticket(catalogName = DEFAULT_CATALOG, options = {}) {
    const token = await getTurnstileToken(TURNSTILE_ACTION);
    const res = await timedFetch(url("/api/catalog/ticket"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "cf-turnstile-response": token, "catalog": catalogName }),
      signal: options.signal
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  async function page(catalogName = DEFAULT_CATALOG, { since = 0, limit = PAGE_SIZE, ticket: tkt, signal } = {}) {
    const headers = {};
    if (tkt) headers["X-Catalog-Ticket"] = tkt;
    const res = await timedFetch(url(`/api/catalog/questions/${catalogName}?since=${since}&limit=${limit}`), { headers, signal });

    // 409 means the catalog was re-uploaded mid-download, so the `seq` cursor
    // this client holds no longer points where it thinks. Signalled rather than
    // thrown: the caller re-reads meta and restarts from seq 0, which is the
    // only way to avoid a torn mix of two versions in IndexedDB.
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      return { versionChanged: body.version || null };
    }
    if (!res.ok) {
      const err = new Error(await readError(res));
      err.status = res.status;
      throw err;
    }
    return { page: await res.json() };
  }

  /* --------------------------------------------------------- catalog: cursor */

  /**
   * The resume cursor, one record per catalog.
   *
   * Held in IndexedDB rather than localStorage so it survives in the same place
   * as the questions it describes -- a cleared localStorage with a full question
   * store would otherwise re-download the whole catalog.
   */
  function DB() {
    const db = window.SatPracticeDB;
    if (!db) throw new Error("Local database is not ready yet.");
    return db;
  }

  async function getState(catalogName = DEFAULT_CATALOG) {
    try {
      const record = await DB().get("appConfig", CONFIG_KEY_PREFIX + catalogName);
      return record?.value || null;
    } catch (e) {
      return null;
    }
  }

  async function setState(catalogName, value) {
    await DB().put("appConfig", { key: CONFIG_KEY_PREFIX + catalogName, value, updatedAt: Date.now() });
    return value;
  }

  async function clearState(catalogName = DEFAULT_CATALOG) {
    try {
      await DB().remove("appConfig", CONFIG_KEY_PREFIX + catalogName);
    } catch (e) {
      /* nothing to clear is the same outcome as clearing it */
    }
  }

  /**
   * Download one exam's catalog to completion, resuming if a previous attempt
   * stopped part-way.
   *
   * `store` is injected because normalising a question and writing it to
   * IndexedDB needs app.js internals. Everything else -- meta, ticket, paging,
   * retries, version changes, the cursor -- is owned here.
   */
  async function ensureCatalog(catalogName = DEFAULT_CATALOG, opts = {}) {
    const { store, onProgress, force = false, signal } = opts;
    if (typeof store !== "function") throw new Error("ensureCatalog requires a store callback.");

    const report = (phase, downloaded, total) => {
      if (onProgress) {
        onProgress({ phase, downloaded, total, pct: total ? Math.min(100, Math.round((downloaded / total) * 100)) : 0 });
      }
    };

    report("meta", 0, 0);
    const remote = await meta(catalogName, { signal });
    let local = await getState(catalogName);

    if (!force && local && local.complete && local.version === remote.version) {
      return { status: "current", version: remote.version, count: local.count };
    }

    let since = 0;
    let downloaded = 0;
    const resuming = !force && local && local.version === remote.version && Number.isFinite(local.since) && local.since > 0;
    if (resuming) {
      since = local.since;
      downloaded = local.downloaded || local.since;
    }

    let tkt = null;
    if (remote.requiresTicket) {
      report("ticket", downloaded, remote.count);
      tkt = (await ticket(catalogName, { signal })).ticket;
    }

    let version = remote.version;
    const startedAt = local?.startedAt || Date.now();
    let guard = 0;

    while (guard++ < 500) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      let result;
      let attempt = 0;
      for (;;) {
        try {
          result = await page(catalogName, { since, limit: remote.pageSize || PAGE_SIZE, ticket: tkt, signal });
          break;
        } catch (err) {
          if (err.name === "AbortError") throw err;
          if (err.status === 401 && remote.requiresTicket && attempt === 0) {
            tkt = (await ticket(catalogName, { signal })).ticket;
            attempt++;
            continue;
          }
          if (++attempt > PAGE_RETRIES) throw err;
          await sleep(500 * Math.pow(2, attempt - 1));
        }
      }

      if (result.versionChanged) {
        const fresh = await meta(catalogName, { signal });
        remote.count = fresh.count;
        remote.version = fresh.version;
        remote.requiresTicket = fresh.requiresTicket;
        version = fresh.version;
        since = 0;
        downloaded = 0;
        tkt = remote.requiresTicket ? (await ticket(catalogName, { signal })).ticket : null;
        continue;
      }

      const body = result.page;
      version = body.version;
      const questions = body.questions || [];

      if (questions.length) {
        await store(questions, { version, catalog: catalogName, bankId: CATALOG_BANK_PREFIX + catalogName });
      }
      downloaded += questions.length;
      report("download", downloaded, body.count || remote.count);

      await setState(catalogName, {
        version,
        count: body.count || remote.count,
        since: body.nextSince,
        downloaded,
        complete: false,
        startedAt,
        updatedAt: Date.now()
      });

      if (body.done || !questions.length) break;
      since = body.nextSince;
    }

    const finalState = await setState(catalogName, {
      version,
      count: downloaded,
      expected: remote.count,
      since: 0,
      downloaded,
      complete: true,
      startedAt,
      downloadedAt: Date.now(),
      updatedAt: Date.now()
    });

    report("done", downloaded, downloaded);
    return { status: resuming ? "resumed" : "downloaded", version, count: downloaded, state: finalState };
  }

  window.SevApi = {
    BASE,
    url,
    CATALOG_BANK_PREFIX,
    CONFIG_KEY_PREFIX,
    DEFAULT_CATALOG,
    getTurnstileToken,
    catalog: { meta, ticket, page, getState, setState, clearState },
    ensureCatalog
  };
})();
