(function () {
  "use strict";

  const DB_NAME = "sat-interactive-practice";
  const DB_VERSION = 5;
  const CONSENT_KEY = "sevrony.telemetryConsent";
  const CONSENT_ACCEPTED = "accepted";
  const LEGACY_MIGRATION_KEY = "sevrony.db.plaintextMigration.v1";
  let dbPromise = null;

  function hasConsent() {
    if (typeof localStorage === 'undefined') return true; // Worker context — main thread already verified consent
    return localStorage.getItem("sat_demo_mode") === "true" ||
      localStorage.getItem(CONSENT_KEY) === CONSENT_ACCEPTED;
  }

  function requireConsent() {
    if (!hasConsent()) {
      throw new Error("Accept the Privacy Policy before saving or importing practice data.");
    }
  }

  // Encryption used to turn every large question/session into an array of JS
  // numbers.  That multiplied IndexedDB transfer work and caused long main
  // thread tasks during every sync.  Existing encrypted records are rewritten
  // once by db-worker.js before this API serves any request.
  function migrateLegacyEncryption() {
    if (typeof localStorage === 'undefined') return Promise.resolve();
    
    const legacyDone = localStorage.getItem(LEGACY_MIGRATION_KEY) === "done";
    const gradingDone = localStorage.getItem("sevrony.gradingVersion") === "3";
    
    if (legacyDone && gradingDone) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const worker = new Worker("db-worker.js?v=2.3.0");
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("Timed out migrating local practice data."));
      }, 120000);

      worker.onmessage = event => {
        const message = event.data || {};
        if (message.type === "complete") {
          clearTimeout(timer);
          worker.terminate();
          localStorage.setItem(LEGACY_MIGRATION_KEY, "done");
          localStorage.setItem("sevrony.gradingVersion", "3");
          // The old key is no longer needed once every legacy record is plain.
          localStorage.removeItem("app_encryption_key");
          resolve();
        } else if (message.type === "error") {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(message.error || "Could not migrate local practice data."));
        }
      };
      worker.onerror = event => {
        clearTimeout(timer);
        worker.terminate();
        reject(event.error || new Error("Local data migration worker failed."));
      };
      worker.postMessage({
        type: "migrate",
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        legacyKey: localStorage.getItem("app_encryption_key")
      });
    });
  }

  const ready = migrateLegacyEncryption().catch(error => {
    // Do not silently serve encrypted records as if they were valid data.
    console.error("Local data migration failed:", error);
    throw error;
  });

  function open() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("questionBanks")) {
          const banks = db.createObjectStore("questionBanks", { keyPath: "id" });
          banks.createIndex("importedAt", "importedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("questions")) {
          const questions = db.createObjectStore("questions", { keyPath: "id" });
          questions.createIndex("subject", "subject", { unique: false });
          questions.createIndex("domainCode", "domainCode", { unique: false });
          questions.createIndex("difficultyCode", "difficultyCode", { unique: false });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const sessions = db.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("completedAt", "completedAt", { unique: false });
          sessions.createIndex("mode", "mode", { unique: false });
        }
        if (!db.objectStoreNames.contains("responses")) {
          const responses = db.createObjectStore("responses", { keyPath: "id" });
          responses.createIndex("sessionId", "sessionId", { unique: false });
          responses.createIndex("questionId", "questionId", { unique: false });
          responses.createIndex("subject", "subject", { unique: false });
          responses.createIndex("domainCode", "domainCode", { unique: false });
        }
        if (!db.objectStoreNames.contains("appConfig")) {
          db.createObjectStore("appConfig", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("vocabWords")) {
          const vocabWords = db.createObjectStore("vocabWords", { keyPath: "word" });
          vocabWords.createIndex("status", "status", { unique: false });
          vocabWords.createIndex("nextReviewDate", "nextReviewDate", { unique: false });
        }
        if (!db.objectStoreNames.contains("questionStudyState")) {
          db.createObjectStore("questionStudyState", { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function withStore(storeName, mode, callback) {
    await ready;
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let callbackResult;
      transaction.oncomplete = () => resolve(callbackResult);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      callbackResult = callback(store);
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getAll(storeName) {
    return withStore(storeName, "readonly", store => requestToPromise(store.getAll()));
  }

  function get(storeName, key) {
    return withStore(storeName, "readonly", store => requestToPromise(store.get(key)));
  }

  function put(storeName, value) {
    requireConsent();
    return withStore(storeName, "readwrite", store => {
      store.put(value);
      return value;
    });
  }

  function putMany(storeName, values) {
    requireConsent();
    return withStore(storeName, "readwrite", store => {
      for (const value of values) store.put(value);
      return values.length;
    });
  }

  function clear(storeName) {
    requireConsent();
    return withStore(storeName, "readwrite", store => {
      store.clear();
      return true;
    });
  }

  async function clearAll() {
    await clear("vocabWords");
    await clear("responses");
    await clear("sessions");
    await clear("questions");
    await clear("questionBanks");
    await clear("questionStudyState");
  }

  function remove(storeName, key) {
    requireConsent();
    return withStore(storeName, "readwrite", store => {
      store.delete(key);
      return true;
    });
  }

  function removeMany(storeName, keys) {
    requireConsent();
    return withStore(storeName, "readwrite", store => {
      for (const key of keys) store.delete(key);
      return keys.length;
    });
  }

  function getAllByIndex(storeName, indexName, key) {
    return withStore(storeName, "readonly", store => requestToPromise(store.index(indexName).getAll(key)));
  }

  (typeof window !== 'undefined' ? window : self).SatPracticeDB = {
    ready,
    hasConsent,
    getAll,
    getAllByIndex,
    get,
    put,
    putMany,
    remove,
    removeMany,
    clear,
    clearAll
  };
})();
