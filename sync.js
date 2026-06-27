(function () {
  "use strict";

  const CLIENT_ID =
    "484594093767-7cnbosef6mfj8e60mvdhp2sphbmvui68.apps.googleusercontent.com";
  const SCOPES = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";
  const SYNC_FILENAME = "sevrony-sync.json";
  const TOKEN_KEY = "sevrony.syncToken";
  const SYNC_META_KEY = "sevrony.syncMeta"; // { email, lastSynced }
  const FILE_ID_KEY = "sevrony.syncFileId"; // cached Drive file ID

  let tokenClient = null;
  let accessToken = null;
  let fileId = null;
  let syncing = false;
  let foregroundSyncing = false;
  let syncTimeout = null;
  let periodicTimer = null;
  let onSyncStateChange = null; // callback when sync starts/ends
  let onSyncUpdate = null; // callback when background sync pulls changes
  let lastVisibilitySync = 0;

  const DB = window.SatPracticeDB;

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

  // ─── Drive API ───────────────────────────────────────────────

  async function driveRequest(url, options = {}) {
    const res = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    });
    if (!res.ok && res.status === 401) {
      accessToken = null;
      localStorage.removeItem(TOKEN_KEY);
      throw new Error("auth_expired");
    }
    return res;
  }

  /**
   * Resolve the Drive file ID. Trusts the localStorage cache without
   * making a verification API call. If the cached ID turns out stale
   * (404 on read/write), callers clear it and retry.
   */
  async function resolveFileId() {
    if (fileId) return fileId;
    const cached = localStorage.getItem(FILE_ID_KEY);
    if (cached) { fileId = cached; return fileId; }
    // No cache — search for it (1 API call, only happens on first sync)
    const res = await driveRequest(
      `https://www.googleapis.com/drive/v3/files?` +
        `spaces=appDataFolder&q=name='${SYNC_FILENAME}'&fields=files(id)`
    );
    const data = await res.json();
    const id = data.files?.[0]?.id || null;
    if (id) { fileId = id; localStorage.setItem(FILE_ID_KEY, id); }
    return id;
  }

  function invalidateFileId() {
    fileId = null;
    localStorage.removeItem(FILE_ID_KEY);
  }

  async function readSyncFile() {
    const id = await resolveFileId();
    if (!id) return null;

    const res = await driveRequest(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`
    );
    if (res.status === 404) { invalidateFileId(); return null; }
    if (!res.ok) return null;
    return res.json();
  }

  async function writeSyncFile(payload) {
    const body = JSON.stringify(payload);
    const id = await resolveFileId();

    if (id) {
      const res = await driveRequest(
        `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body }
      );
      if (res.status === 404) {
        // Stale cache — clear and create a fresh file
        invalidateFileId();
        return writeSyncFile(payload);
      }
    } else {
      // Create new file
      const metadata = { name: SYNC_FILENAME, parents: ["appDataFolder"] };
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", new Blob([body], { type: "application/json" }));
      const res = await driveRequest(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        { method: "POST", body: form }
      );
      const created = await res.json();
      fileId = created.id;
      localStorage.setItem(FILE_ID_KEY, fileId);
    }
  }

  // ─── Bidirectional Merge ────────────────────────────────────

  /**
   * Best available timestamp from a record for merge comparison.
   * Numeric epoch millis only — no JSON.stringify, no deep comparison.
   */
  function getRecordTimestamp(record) {
    if (!record) return 0;
    if (record.updatedAt) return record.updatedAt;
    if (record.deletedAt) return record.deletedAt;
    if (record.completedAt) return new Date(record.completedAt).getTime() || 0;
    if (record.importedAt) return new Date(record.importedAt).getTime() || 0;
    if (record.answeredAt) return new Date(record.answeredAt).getTime() || 0;
    return 0;
  }

  /**
   * Merges two record sets using last-write-wins on timestamps.
   * Pure timestamp comparison — no JSON.stringify (that was killing perf).
   */
  function mergeRecordSets(localRecords, remoteRecords) {
    const localMap = new Map(localRecords.map(r => [r.id, r]));
    const remoteMap = new Map((remoteRecords || []).map(r => [r.id, r]));
    const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
    const merged = [];
    const localUpdates = [];
    let remoteNeedsUpdate = false;

    for (const id of allIds) {
      const local = localMap.get(id);
      const remote = remoteMap.get(id);

      if (local && !remote) {
        // Only exists locally → push to cloud
        merged.push(local);
        remoteNeedsUpdate = true;
      } else if (!local && remote) {
        // Only exists remotely → pull to local
        merged.push(remote);
        localUpdates.push(remote);
      } else {
        // Both exist
        const localTs = getRecordTimestamp(local);
        const remoteTs = getRecordTimestamp(remote);
        if (remoteTs > localTs) {
          merged.push(remote);
          localUpdates.push(remote);
        } else if (localTs > remoteTs) {
          merged.push(local);
          remoteNeedsUpdate = true;
        } else {
          // Exactly equal timestamps, keep remote
          merged.push(remote);
        }
      }
    }

    return { merged, localUpdates, remoteNeedsUpdate };
  }

  /**
   * Core sync: read local + remote → merge → write cloud → update local.
   * Returns true if local DB was modified.
   */
  async function bidirectionalSync(options = {}) {
    // Read local (IndexedDB — instant)
    const [localBanks, localQuestions, localSessions, localResponses] = await Promise.all([
      DB.getAll("questionBanks"),
      DB.getAll("questions"),
      DB.getAll("sessions"),
      DB.getAll("responses"),
    ]);

    const filteredSessions = localSessions.filter(s => s.id !== "__active_test__");

    // If forcePush is enabled (e.g. from a backup restore), write local directly to cloud and skip merge
    if (options.forcePush) {
      await writeSyncFile({
        syncedAt: new Date().toISOString(),
        questionBanks: localBanks,
        questions: localQuestions,
        sessions: filteredSessions,
        responses: localResponses,
      });
      return false; // Local DB was not changed by this sync
    }

    // Read remote (1 API call)
    const remote = await readSyncFile();

    // Merge each store (pure CPU, no I/O, no JSON.stringify)
    const banks = mergeRecordSets(localBanks, remote?.questionBanks);
    const questions = mergeRecordSets(localQuestions, remote?.questions);
    const sessions = mergeRecordSets(filteredSessions, remote?.sessions);
    const responses = mergeRecordSets(localResponses, remote?.responses);

    const hasLocalUpdates = banks.localUpdates.length > 0 || questions.localUpdates.length > 0 || sessions.localUpdates.length > 0 || responses.localUpdates.length > 0;
    const remoteNeedsUpdate = !remote || banks.remoteNeedsUpdate || questions.remoteNeedsUpdate || sessions.remoteNeedsUpdate || responses.remoteNeedsUpdate;

    // If we're in a silent background sync but found new data to pull,
    // light up the UI indicator so the user sees it's actively pulling changes.
    if (hasLocalUpdates && !foregroundSyncing) {
      foregroundSyncing = true;
      notifyStateChange();
      // Ensure the UI indicator is visible for at least 1 second
      await new Promise(r => setTimeout(r, 1000));
    }

    // Write merged state to cloud only if there are local-newer changes (skips redundant API calls)
    if (remoteNeedsUpdate) {
      await writeSyncFile({
        syncedAt: new Date().toISOString(),
        questionBanks: banks.merged,
        questions: questions.merged,
        sessions: sessions.merged,
        responses: responses.merged,
      });
    }

    // Write only remote-newer records to local DB
    let localChanged = false;
    if (banks.localUpdates.length) { await DB.putMany("questionBanks", banks.localUpdates); localChanged = true; }
    if (questions.localUpdates.length) { await DB.putMany("questions", questions.localUpdates); localChanged = true; }
    if (sessions.localUpdates.length) { await DB.putMany("sessions", sessions.localUpdates); localChanged = true; }
    if (responses.localUpdates.length) { await DB.putMany("responses", responses.localUpdates); localChanged = true; }

    return localChanged;
  }

  // ─── Background Sync (visibility + polling) ─────────────────

  function startBackgroundSync() {
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
    if (syncing || !isLinked() || !navigator.onLine) return;
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
    fileId = null;
    tokenClient = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SYNC_META_KEY);
    localStorage.removeItem(FILE_ID_KEY);
  }

  async function sync(isManual = false, options = {}) {
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
      const localChanged = await bidirectionalSync(options);

      const meta = JSON.parse(localStorage.getItem(SYNC_META_KEY) || "{}");
      meta.lastSynced = new Date().toISOString();
      localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));

      syncing = false;
      foregroundSyncing = false;
      notifyStateChange();

      // Ensure background sync is running after a successful sync
      if (!periodicTimer) startBackgroundSync();

      return { ok: true, localChanged };
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
  if (isLinked() && getCachedToken()) {
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
