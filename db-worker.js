"use strict";

const SENSITIVE_STORES = ["questions", "sessions", "responses", "questionStudyState"];

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function pause() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function ensureSchema(db) {
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
  if (!db.objectStoreNames.contains("appConfig")) db.createObjectStore("appConfig", { keyPath: "key" });
  if (!db.objectStoreNames.contains("vocabWords")) {
    const vocabWords = db.createObjectStore("vocabWords", { keyPath: "word" });
    vocabWords.createIndex("status", "status", { unique: false });
    vocabWords.createIndex("nextReviewDate", "nextReviewDate", { unique: false });
  }
  if (!db.objectStoreNames.contains("questionStudyState")) db.createObjectStore("questionStudyState", { keyPath: "id" });
}

function openDatabase(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = event => ensureSchema(event.target.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function legacyKey(rawKey) {
  if (!rawKey) return null;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rawKey.padEnd(32, "0").slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
}

async function decryptRecord(record, key) {
  if (!record?._secure) return record;
  if (!key) throw new Error("Encrypted local data is missing its legacy key.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(record._secure.iv) },
    key,
    new Uint8Array(record._secure.data)
  );
  const plain = { ...record, ...JSON.parse(new TextDecoder().decode(decrypted)) };
  delete plain._secure;
  return plain;
}

function readAll(db, storeName) {
  const transaction = db.transaction(storeName, "readonly");
  return requestToPromise(transaction.objectStore(storeName).getAll());
}

function writeChunk(db, storeName, records) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    for (const record of records) store.put(record);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function migrate(db, rawKey) {
  const key = await legacyKey(rawKey);
  let migrated = 0;
  for (const storeName of SENSITIVE_STORES) {
    const encrypted = (await readAll(db, storeName)).filter(record => record?._secure);
    for (let start = 0; start < encrypted.length; start += 50) {
      const plainRecords = [];
      for (const record of encrypted.slice(start, start + 50)) {
        plainRecords.push(await decryptRecord(record, key));
      }
      await writeChunk(db, storeName, plainRecords);
      migrated += plainRecords.length;
      postMessage({ type: "progress", migrated });
      await pause();
    }
  }
  return migrated;
}

self.onmessage = async event => {
  if (event.data?.type !== "migrate") return;
  try {
    const db = await openDatabase(event.data.dbName, event.data.dbVersion);
    const migrated = await migrate(db, event.data.legacyKey);
    db.close();
    postMessage({ type: "complete", migrated });
  } catch (error) {
    postMessage({ type: "error", error: error?.message || String(error) });
  }
};
