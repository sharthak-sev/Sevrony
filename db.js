(function () {
  "use strict";

  const DB_NAME = "sat-interactive-practice";
  const DB_VERSION = 2;
  let dbPromise = null;

  function open() {
    if (dbPromise) {
      return dbPromise;
    }

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
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  async function withStore(storeName, mode, callback) {
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

  async function getAll(storeName) {
    return withStore(storeName, "readonly", store => requestToPromise(store.getAll()));
  }

  async function get(storeName, key) {
    return withStore(storeName, "readonly", store => requestToPromise(store.get(key)));
  }

  async function put(storeName, value) {
    return withStore(storeName, "readwrite", store => {
      store.put(value);
      return value;
    });
  }

  async function putMany(storeName, values) {
    return withStore(storeName, "readwrite", store => {
      for (const value of values) {
        store.put(value);
      }
      return values.length;
    });
  }

  async function clear(storeName) {
    return withStore(storeName, "readwrite", store => {
      store.clear();
      return true;
    });
  }

  async function clearAll() {
    await clear("responses");
    await clear("sessions");
    await clear("questions");
    await clear("questionBanks");
  }

  async function remove(storeName, key) {
    return withStore(storeName, "readwrite", store => {
      store.delete(key);
      return true;
    });
  }

  async function removeMany(storeName, keys) {
    return withStore(storeName, "readwrite", store => {
      for (const key of keys) {
        store.delete(key);
      }
      return keys.length;
    });
  }

  async function getAllByIndex(storeName, indexName, key) {
    return withStore(storeName, "readonly", store => {
      const index = store.index(indexName);
      return requestToPromise(index.getAll(key));
    });
  }

  window.SatPracticeDB = {
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
