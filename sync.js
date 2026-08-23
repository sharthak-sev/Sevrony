(function () {
  "use strict";

  const CLIENT_ID =
    "484594093767-7cnbosef6mfj8e60mvdhp2sphbmvui68.apps.googleusercontent.com";
  const SCOPES = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";
  const TOKEN_KEY = "sevrony.syncToken";
  const SYNC_META_KEY = "sevrony.syncMeta"; // { email, lastSynced }
  const FILE_ID_KEY = "sevrony.syncFileId"; // cached Drive file ID

  let tokenClient = null;
  let accessToken = null;
  let syncing = false;
  let foregroundSyncing = false;
  let syncTimeout = null;
  let periodicTimer = null;
  let onSyncStateChange = null; // callback when sync starts/ends
  let onSyncUpdate = null; // callback when background sync pulls changes
  let lastVisibilitySync = 0;

  const DB = window.SatPracticeDB;

  function hasPrivacyConsent() {
    return DB.hasConsent?.() !== false;
  }

  function notifyStateChange() {
    if (onSyncStateChange) onSyncStateChange();
  }

  // ─── GIS Library Loading ─────────────────────────────────────

  function loadGIS() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () =>
        reject(new Error("Failed to load Google Identity Services"));
      document.head.appendChild(script);
    });
  }

  // ─── Token Management ────────────────────────────────────────

  function getLinkedEmail() {
    const meta = JSON.parse(localStorage.getItem(SYNC_META_KEY) || "null");
    return meta?.email || undefined;
  }

  function initTokenClient(callback) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          callback(null, response.error);
          return;
        }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, "https://www.googleapis.com/auth/drive.appdata")) {
          google.accounts.oauth2.revoke(response.access_token);
          callback(null, new Error("Drive access denied"));
          return;
        }
        storeToken(response);
        callback(accessToken, null);
      },
      error_callback: (err) => {
        // Handles popup_failed_to_open, popup_closed, etc.
        callback(null, err);
      },
    });
  }

  function storeToken(response) {
    accessToken = response.access_token;
    const expiry = Date.now() + (response.expires_in || 3600) * 1000;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: accessToken, expiry }));
    notifyStateChange();
  }

  function getCachedToken() {
    const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    if (stored && stored.expiry > Date.now() + 60000) {
      accessToken = stored.token;
      return accessToken;
    }
    return null;
  }

  async function getValidToken(interactive = false) {
    // Fast path — cached token still valid
    const cached = getCachedToken();
    if (cached) return cached;

    // Non-interactive callers (auto-sync, background) never show popups
    if (!interactive) return null;

    // Interactive — only when user explicitly clicks "Sync Now"
    await loadGIS();
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 60000);
      const email = getLinkedEmail();

      const handleResponse = (token, err) => {
        clearTimeout(timer);
        resolve(err ? null : token);
      };

      if (!tokenClient) {
        initTokenClient(handleResponse);
      } else {
        tokenClient.callback = (response) => {
          clearTimeout(timer);
          if (response.error) { resolve(null); return; }
          if (!google.accounts.oauth2.hasGrantedAllScopes(response, "https://www.googleapis.com/auth/drive.appdata")) {
            google.accounts.oauth2.revoke(response.access_token);
            resolve(null);
            return;
          }
          storeToken(response);
          resolve(accessToken);
        };
        tokenClient.error_callback = (err) => {
          clearTimeout(timer);
          resolve(null);
        };
      }
      // login_hint skips account picker → faster popup
      const reqOpts = { prompt: "" };
      if (email) reqOpts.login_hint = email;
      tokenClient.requestAccessToken(reqOpts);
    });
  }

  // ─── Background Sync (visibility + polling) ─────────────────

  function startBackgroundSync() {
    if (!hasPrivacyConsent()) return;
    stopBackgroundSync();
    // Poll every 15s while tab is visible
    periodicTimer = setInterval(() => {
      if (document.visibilityState === "visible") backgroundSyncOnce();
    }, 15000);
    // Sync when tab becomes visible (e.g. user switches to phone)
    document.addEventListener("visibilitychange", handleVisibility);
  }

  function stopBackgroundSync() {
    if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null; }
    document.removeEventListener("visibilitychange", handleVisibility);
  }

  function handleVisibility() {
    if (document.visibilityState !== "visible") return;
    // Throttle: at most once per 5 seconds
    if (Date.now() - lastVisibilitySync < 5000) return;
    lastVisibilitySync = Date.now();
    backgroundSyncOnce();
  }

  /**
   * Background sync: runs silently, never shows popups.
   * If the token is expired, does nothing.
   * If remote has changes, pulls them and notifies the app.
   */
  async function backgroundSyncOnce() {
    if (syncing || !hasPrivacyConsent() || !isLinked() || !navigator.onLine) return;
    if (!getCachedToken()) {
      notifyStateChange();
      return; // expired token → can't sync silently
    }

    try {
      const result = await doSync(false, { foreground: false });
      if (result.ok && result.localChanged && onSyncUpdate) {
        onSyncUpdate();
      }
    } catch (_) {
      // Background sync failures are silent
    }
  }

  // ─── Public API ──────────────────────────────────────────────

  async function link() {
    if (!hasPrivacyConsent()) throw new Error("consent_required");
    await loadGIS();
    return new Promise((resolve, reject) => {
      initTokenClient((token, err) => {
        if (err) { reject(err); return; }
        fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => r.json())
          .then(info => {
            localStorage.setItem(SYNC_META_KEY, JSON.stringify({
              email: info.email,
              lastSynced: null,
            }));
            startBackgroundSync();
            resolve(info.email);
          })
          .catch(reject);
      });
      tokenClient.requestAccessToken();
    });
  }

  async function unlink() {
    stopBackgroundSync();
    accessToken = null;
    tokenClient = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SYNC_META_KEY);
    localStorage.removeItem(FILE_ID_KEY);
  }

  async function sync(isManual = false, options = {}) {
    if (localStorage.getItem("sat_demo_mode") === "true") return { ok: false, reason: "demo_mode" };
    if (!hasPrivacyConsent()) return { ok: false, reason: "consent_required" };
    if (!isLinked()) return { ok: false, reason: "not_linked" };
    if (!navigator.onLine) return { ok: false, reason: "offline" };
    
    if (!isManual && !getCachedToken()) {
      notifyStateChange();
      return Promise.resolve({ ok: false, reason: "auth_expired" });
    }

    const foreground = options.silent ? false : true;

    if (isManual) {
      if (syncTimeout) {
        clearTimeout(syncTimeout);
        syncTimeout = null;
        syncing = false;
      }
      return doSync(true, { foreground, ...options });
    }

    if (foreground && !syncing) {
      syncing = true;
      foregroundSyncing = true;
      notifyStateChange();
    }

    // Debounce auto-sync by 3s to coalesce rapid mutations
    return new Promise(resolve => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(async () => {
        syncTimeout = null;
        resolve(await doSync(false, { foreground, fromDebounce: true }));
      }, 3000);
    });
  }

  /**
   * doSync — thin wrapper that delegates all heavy work to sync-worker.js.
   *
   * 1. Obtains a valid token (may show GIS popup if isManual).
   * 2. Reads localStorage values the worker can't access.
   * 3. Posts them to the worker.
   * 4. Awaits the worker's response.
   * 5. Updates localStorage with any new fileId / vocabState.
   * 6. Terminates the worker.
   */
  async function doSync(isManual, options = {}) {
    if (syncing && !options.fromDebounce) {
      return { ok: false, reason: "already_syncing" };
    }

    syncing = true;
    foregroundSyncing = options.foreground !== false;
    notifyStateChange();
    
    const token = await getValidToken(isManual);
    if (!token) {
      syncing = false;
      foregroundSyncing = false;
      notifyStateChange();
      return { ok: false, reason: "auth_expired" };
    }
    notifyStateChange();

    try {
      // Gather everything the worker needs from localStorage
      const fileId = localStorage.getItem(FILE_ID_KEY) || null;
      const vocabStateStr = localStorage.getItem("sat_vocab_state");
      const vocabState = vocabStateStr ? JSON.parse(vocabStateStr) : null;

      // Spawn worker and await result
      const result = await new Promise((resolve, reject) => {
        const worker = new Worker("sync-worker.js?v=2.4.0");
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error("Sync worker timed out"));
        }, 120000);

        worker.onmessage = (event) => {
          clearTimeout(timer);
          worker.terminate();
          const msg = event.data || {};
          if (msg.type === "error") {
            reject(new Error(msg.error || "Sync worker failed"));
          } else {
            resolve(msg);
          }
        };

        worker.onerror = (event) => {
          clearTimeout(timer);
          worker.terminate();
          reject(event.error || new Error("Sync worker crashed"));
        };

        worker.postMessage({
          token,
          fileId,
          vocabState,
          options: { forcePush: options.forcePush || false },
        });
      });

      // Update localStorage with any values the worker couldn't write itself
      if (result.newFileId) {
        localStorage.setItem(FILE_ID_KEY, result.newFileId);
      }

      if (result.mergedVocabState) {
        localStorage.setItem("sat_vocab_state", JSON.stringify(result.mergedVocabState));
        if (window.Vocab && window.Vocab.reloadState) {
          window.Vocab.reloadState();
        }
      }

      const meta = JSON.parse(localStorage.getItem(SYNC_META_KEY) || "{}");
      meta.lastSynced = new Date().toISOString();
      localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));

      syncing = false;
      foregroundSyncing = false;
      notifyStateChange();

      // Ensure background sync is running after a successful sync
      if (!periodicTimer) startBackgroundSync();

      return { ok: true, localChanged: result.localChanged };
    } catch (err) {
      syncing = false;
      foregroundSyncing = false;
      notifyStateChange();
      
      console.error("Cloud sync failed:", err);
      if (err.message === "auth_expired") {
        accessToken = null;
        localStorage.removeItem(TOKEN_KEY);
        notifyStateChange();
      }
      return { ok: false, reason: err.message };
    }
  }

  function isLinked() {
    return !!localStorage.getItem(SYNC_META_KEY);
  }

  function getStatus() {
    const meta = JSON.parse(localStorage.getItem(SYNC_META_KEY) || "null");
    const hasToken = !!getCachedToken();
    return {
      linked: !!meta,
      email: meta?.email || null,
      lastSynced: meta?.lastSynced || null,
      syncing: foregroundSyncing,
      backgroundSyncing: syncing && !foregroundSyncing,
      tokenValid: hasToken,
    };
  }

  // ─── Init ────────────────────────────────────────────────────

  // If already linked and token is valid, start background sync immediately
  if (hasPrivacyConsent() && isLinked() && getCachedToken()) {
    startBackgroundSync();
  }

  // ─── Expose ──────────────────────────────────────────────────

  window.SevSync = {
    link,
    unlink,
    sync,
    isLinked,
    getStatus,
    preload: loadGIS,
    /** Register a callback that fires when background sync pulls changes from another device */
    onUpdate(callback) { onSyncUpdate = callback; },
    /** Register a callback that fires when sync state changes (start/stop) */
    onStateChange(callback) { onSyncStateChange = callback; },
  };
})();
