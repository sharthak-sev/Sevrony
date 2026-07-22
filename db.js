(function () {
  "use strict";

  const DB_NAME = "sat-interactive-practice";
  const DB_VERSION = 4;
  let dbPromise = null;

  // --- ENCRYPTION LOGIC ---
  const SENSITIVE_STORES = ["questions", "sessions", "responses", "questionStudyState"];
  const SENSITIVE_FIELDS = ["prompt", "passage", "choices", "correctAnswer", "rationale", "history", "answer", "highlights", "mistakeLog"];

  async function getCryptoKey() {
    const isDemo = localStorage.getItem('sat_demo_mode') === 'true';
    const rawKey = isDemo ? "demo_mode_dummy_key_999999999999" : localStorage.getItem('app_encryption_key');
    if (!rawKey) throw new Error("Privacy Policy not accepted. Master key missing.");
    const enc = new TextEncoder();
    return await crypto.subtle.importKey(
      "raw",
      enc.encode(rawKey.padEnd(32, '0').slice(0, 32)),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptPayload(data) {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(JSON.stringify(data))
    );
    return {
      __encrypted: true,
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    };
  }

  async function decryptPayload(encryptedObj) {
    if (!encryptedObj || !encryptedObj.__encrypted) return encryptedObj;
    const key = await getCryptoKey();
    const iv = new Uint8Array(encryptedObj.iv);
    const data = new Uint8Array(encryptedObj.data);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  }

  async function encryptObject(storeName, obj) {
    if (!obj || !SENSITIVE_STORES.includes(storeName)) return obj;
    
    // Create a copy to avoid mutating the original before saving
    const secureObj = { ...obj };
    let hasSensitive = false;
    const securePayload = {};
    
    for (const field of SENSITIVE_FIELDS) {
      if (secureObj[field] !== undefined) {
        securePayload[field] = secureObj[field];
        delete secureObj[field];
        hasSensitive = true;
      }
    }
    
    if (hasSensitive) {
      secureObj._secure = await encryptPayload(securePayload);
    }
    return secureObj;
  }

  async function decryptObject(storeName, obj) {
    if (!obj || !SENSITIVE_STORES.includes(storeName) || !obj._secure) return obj;
    try {
      const decrypted = await decryptPayload(obj._secure);
      for (const key in decrypted) {
        obj[key] = decrypted[key];
      }
      delete obj._secure;
    } catch (e) {
      console.error("Decryption failed for object in", storeName, obj);
      throw new Error("Data decryption failed. Invalid App Key.");
    }
    return obj;
  }
  // ------------------------

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
    const records = await withStore(storeName, "readonly", store => requestToPromise(store.getAll()));
    if (!records) return records;
    return Promise.all(records.map(r => decryptObject(storeName, r)));
  }

  async function get(storeName, key) {
    const record = await withStore(storeName, "readonly", store => requestToPromise(store.get(key)));
    return decryptObject(storeName, record);
  }

  async function put(storeName, value) {
    const encryptedValue = await encryptObject(storeName, value);
    return withStore(storeName, "readwrite", store => {
      store.put(encryptedValue);
      return value;
    });
  }

  async function putMany(storeName, values) {
    const encryptedValues = await Promise.all(values.map(v => encryptObject(storeName, v)));
    return withStore(storeName, "readwrite", store => {
      for (const val of encryptedValues) {
        store.put(val);
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
    await clear("vocabWords");
    await clear("responses");
    await clear("sessions");
    await clear("questions");
    await clear("questionBanks");
    await clear("questionStudyState");
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
    const records = await withStore(storeName, "readonly", store => {
      const index = store.index(indexName);
      return requestToPromise(index.getAll(key));
    });
    if (!records) return records;
    return Promise.all(records.map(r => decryptObject(storeName, r)));
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
