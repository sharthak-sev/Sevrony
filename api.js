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

  const BASE = "https://divine-silence-6016.sharthakjaiswal50.workers.dev";

  /** Matches the `action` the worker expects on a catalog ticket request. */
  const TURNSTILE_ACTION = "catalog_download";
  const TURNSTILE_SITEKEY = "0x4AAAAAAEC6PoP81MryKKvo";

  const CATALOG_BANK_ID = "sevrony-catalog";
  const CONFIG_KEY = "questionCatalog";
  const PAGE_SIZE = 150;
  const PAGE_RETRIES = 3;
  const REQUEST_TIMEOUT_MS = 45000;

  function url(path) {
    return BASE + path;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** fetch with a timeout, so a stalled page cannot hang the download forever. */
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

  async function meta(options = {}) {
    const res = await timedFetch(url("/api/catalog/meta"), { signal: options.signal });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  /**
   * Render an invisible Turnstile widget and resolve with its token.
   *
   * Mirrors vocab.js's helper, including the reason it is positioned offscreen
   * rather than hidden: browsers throttle `display: none` subtrees and the
   * widget hangs.
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

  async function ticket(options = {}) {
    const token = await getTurnstileToken(TURNSTILE_ACTION);
    const res = await timedFetch(url("/api/catalog/ticket"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "cf-turnstile-response": token }),
      signal: options.signal
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  /**
   * Fetch one page.
   * @returns {{page: object}|{versionChanged: string}}
   */
  async function page({ since = 0, limit = PAGE_SIZE, ticket: tkt, signal } = {}) {
    const headers = {};
    if (tkt) headers["X-Catalog-Ticket"] = tkt;
    const res = await timedFetch(url(`/api/catalog/questions?since=${since}&limit=${limit}`), { headers, signal });

    // 409 is the worker telling us the catalog was replaced mid-download.
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

  function DB() {
    const db = window.SatPracticeDB;
    if (!db) throw new Error("Local database is not ready yet.");
    return db;
  }

  async function getState() {
    try {
      const record = await DB().get("appConfig", CONFIG_KEY);
      return record?.value || null;
    } catch (e) {
      return null;
    }
  }

  async function setState(value) {
    await DB().put("appConfig", { key: CONFIG_KEY, value, updatedAt: Date.now() });
    return value;
  }

  async function clearState() {
    try {
      await DB().remove("appConfig", CONFIG_KEY);
    } catch (e) {
      /* nothing stored yet */
    }
  }

  /* ------------------------------------------------------ catalog: the driver */

  /**
   * Download the shared catalog into local storage, resuming where a previous
   * attempt stopped.
   *
   * @param {object}   opts
   * @param {Function} opts.store       async (questions, {version}) => void -- required
   * @param {Function} [opts.onProgress] ({downloaded, total, pct, phase}) => void
   * @param {boolean}  [opts.force]     re-download even if already complete
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<{status: string, version?: string, count?: number}>}
   *          status is "current" | "downloaded" | "resumed"
   */
  async function ensureCatalog(opts = {}) {
    const { store, onProgress, force = false, signal } = opts;
    if (typeof store !== "function") throw new Error("ensureCatalog requires a store callback.");

    const report = (phase, downloaded, total) => {
      if (onProgress) {
        onProgress({ phase, downloaded, total, pct: total ? Math.min(100, Math.round((downloaded / total) * 100)) : 0 });
      }
    };

    report("meta", 0, 0);
    const remote = await meta({ signal });
    let local = await getState();

    if (!force && local && local.complete && local.version === remote.version) {
      return { status: "current", version: remote.version, count: local.count };
    }

    // A version change invalidates the cursor: `seq` is only meaningful within
    // one build of the catalog.
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
      tkt = (await ticket({ signal })).ticket;
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
          result = await page({ since, limit: remote.pageSize || PAGE_SIZE, ticket: tkt, signal });
          break;
        } catch (err) {
          if (err.name === "AbortError") throw err;
          // A long download can outlive a 10-minute ticket; mint a fresh one
          // and retry the same page rather than losing the whole transfer.
          if (err.status === 401 && remote.requiresTicket && attempt === 0) {
            tkt = (await ticket({ signal })).ticket;
            attempt++;
            continue;
          }
          if (++attempt > PAGE_RETRIES) throw err;
          await sleep(500 * Math.pow(2, attempt - 1));
        }
      }

      if (result.versionChanged) {
        // Start over against the new build. Anything already stored is replaced
        // by id as the new pages land.
        const fresh = await meta({ signal });
        remote.count = fresh.count;
        remote.version = fresh.version;
        remote.requiresTicket = fresh.requiresTicket;
        version = fresh.version;
        since = 0;
        downloaded = 0;
        tkt = remote.requiresTicket ? (await ticket({ signal })).ticket : null;
        continue;
      }

      const body = result.page;
      version = body.version;
      const questions = body.questions || [];

      if (questions.length) await store(questions, { version, bankId: CATALOG_BANK_ID });
      downloaded += questions.length;
      report("download", downloaded, body.count || remote.count);

      // The cursor is persisted after every page, so a closed tab or a dropped
      // connection costs at most one page on the next attempt.
      await setState({
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

    const finalState = await setState({
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
    CATALOG_BANK_ID,
    CONFIG_KEY,
    getTurnstileToken,
    catalog: { meta, ticket, page, getState, setState, clearState },
    ensureCatalog
  };
})();
