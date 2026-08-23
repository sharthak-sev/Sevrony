"use strict";
importScripts('scoring.js?v=2.4.0');

const CURRENT_GRADING_VERSION = 3;
const SENSITIVE_STORES = ["questions", "sessions", "responses", "questionStudyState"];

// v6 renamed the single question catalog into one namespace per exam. Kept in
// step with SevApi.CATALOG_BANK_PREFIX / CONFIG_KEY_PREFIX in api.js.
const CURRENT_CATALOG_SCHEMA_VERSION = 6;
const LEGACY_CATALOG_BANK_ID = "sevrony-catalog";
const LEGACY_CATALOG_CONFIG_KEY = "questionCatalog";
const CATALOG_BANK_PREFIX = "sevrony-catalog-";
const CATALOG_CONFIG_KEY_PREFIX = "questionCatalog_";
const DEFAULT_CATALOG = "sat";
const LOCAL_CATALOG = "local";

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function pause() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function ensureSchema(db, transaction) {
  if (!db.objectStoreNames.contains("questionBanks")) {
    const banks = db.createObjectStore("questionBanks", { keyPath: "id" });
    banks.createIndex("importedAt", "importedAt", { unique: false });
  }
  if (!db.objectStoreNames.contains("questions")) {
    const questions = db.createObjectStore("questions", { keyPath: "id" });
    questions.createIndex("subject", "subject", { unique: false });
    questions.createIndex("domainCode", "domainCode", { unique: false });
    questions.createIndex("difficultyCode", "difficultyCode", { unique: false });
    questions.createIndex("catalog", "catalog", { unique: false });
  } else {
    // This worker runs before db.js opens the database, so for an existing
    // profile the v6 upgrade happens here and db.js's own handler never fires.
    // Both files have to create this index or it would never exist. Adding one
    // to a store that already exists is only legal inside the upgrade
    // transaction, hence the argument.
    const questions = transaction.objectStore("questions");
    if (!questions.indexNames.contains("catalog")) {
      questions.createIndex("catalog", "catalog", { unique: false });
    }
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
    request.onupgradeneeded = event => ensureSchema(event.target.result, event.target.transaction);
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

async function migrateGrades(db) {
  const config = await readAppConfig(db, "gradingVersion");
  const version = config ? config.value : 0;
  if (version >= CURRENT_GRADING_VERSION) return 0;

  let migrated = 0;
  const questions = await readAll(db, "questions");
  const questionMap = new Map(questions.map(q => [q.id, q]));
  
  const responses = await readAll(db, "responses");
  const sessions = await readAll(db, "sessions");
  const sessionMap = new Map(sessions.map(s => [s.id, s]));
  
  const modifiedResponses = [];
  const modifiedSessions = new Set();
  
  for (const response of responses) {
    if (!response.questionId) continue;
    const question = questionMap.get(response.questionId);
    if (!question) continue;
    
    if (response.isAnswered) {
      const score = scoreAnswer(question, response.answer);
      if (score.isCorrect !== response.isCorrect) {
        response.isCorrect = score.isCorrect;
        modifiedResponses.push(response);
        
        const session = sessionMap.get(response.sessionId);
        if (session && !modifiedSessions.has(session.id)) {
          modifiedSessions.add(session.id);
        }
      }
    }
  }
  
  if (modifiedResponses.length > 0) {
    for (const sessionId of modifiedSessions) {
      const session = sessionMap.get(sessionId);
      if (session) {
        const sessionResponses = responses.filter(r => r.sessionId === sessionId && r.isAnswered);
        const totalCorrect = sessionResponses.filter(r => r.isCorrect).length;
        session.totalCorrect = totalCorrect;
        session.totalIncorrect = sessionResponses.length - totalCorrect;
      }
    }
    
    const sessionsToSave = Array.from(modifiedSessions).map(id => sessionMap.get(id));
    
    for (let start = 0; start < modifiedResponses.length; start += 50) {
      await writeChunk(db, "responses", modifiedResponses.slice(start, start + 50));
      await pause();
    }
    
    for (let start = 0; start < sessionsToSave.length; start += 50) {
      await writeChunk(db, "sessions", sessionsToSave.slice(start, start + 50));
      await pause();
    }
    
    migrated += modifiedResponses.length;
  }
  
  await new Promise((resolve, reject) => {
    const tx = db.transaction("appConfig", "readwrite");
    tx.objectStore("appConfig").put({ key: "gradingVersion", value: CURRENT_GRADING_VERSION });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  
  return migrated;
}

function readAppConfig(db, key) {
  try {
    const transaction = db.transaction("appConfig", "readonly");
    return requestToPromise(transaction.objectStore("appConfig").get(key));
  } catch (e) {
    return Promise.resolve(null);
  }
}

/**
 * v6: split the one shared question catalog into a namespace per exam.
 *
 * Phase 1 shipped the SAT bank as "sevrony-catalog" with no `catalog` field on
 * its questions. app.js now keeps only the active exam resident and reads it
 * through the `catalog` index, so every question record needs that field: the
 * exam name for catalog-owned questions, the "local" sentinel for imported and
 * Bluebook ones. The sentinel is not cosmetic -- IndexedDB drops a record from
 * an index entirely when its key path is undefined, so leaving the field unset
 * would make hand-imported questions invisible to every read.
 *
 * Runs in the worker because it rewrites ~3,000 records, and skipping it would
 * strand existing users: their questions carry the old bank id, which no longer
 * matches anything the app looks for.
 */
async function migrateCatalogNamespace(db) {
  const config = await readAppConfig(db, "catalogSchemaVersion");
  if ((config ? config.value : 0) >= CURRENT_CATALOG_SCHEMA_VERSION) return 0;

  // The bank first, because a question's catalog is derived from its bank id and
  // the two have to agree on the same mapping.
  const banks = await readAll(db, "questionBanks");
  const legacyBank = banks.find(bank => bank?.id === LEGACY_CATALOG_BANK_ID);
  if (legacyBank) {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("questionBanks", "readwrite");
      const store = transaction.objectStore("questionBanks");
      store.put({
        ...legacyBank,
        id: CATALOG_BANK_PREFIX + DEFAULT_CATALOG,
        catalog: DEFAULT_CATALOG,
        isCatalog: true,
        // Keep in step with catalogBankLabel() in app.js.
        filename: "Sevrony SAT Question Bank",
        displayTitle: "Sevrony SAT Question Bank",
        updatedAt: Date.now()
      });
      store.delete(LEGACY_CATALOG_BANK_ID);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  const questions = await readAll(db, "questions");
  const pending = [];
  for (const question of questions) {
    if (!question) continue;
    if (question.bankId === LEGACY_CATALOG_BANK_ID) {
      pending.push({ ...question, bankId: CATALOG_BANK_PREFIX + DEFAULT_CATALOG, catalog: DEFAULT_CATALOG });
      continue;
    }
    // A bank id written by a newer build already names its catalog. Trust that
    // over the field, which is what this pass exists to populate.
    if (typeof question.bankId === "string" && question.bankId.startsWith(CATALOG_BANK_PREFIX)) {
      const catalog = question.bankId.slice(CATALOG_BANK_PREFIX.length);
      if (catalog && question.catalog !== catalog) pending.push({ ...question, catalog });
      continue;
    }
    if (question.catalog !== LOCAL_CATALOG) pending.push({ ...question, catalog: LOCAL_CATALOG });
  }

  let migrated = 0;
  for (let start = 0; start < pending.length; start += 200) {
    const chunk = pending.slice(start, start + 200);
    await writeChunk(db, "questions", chunk);
    migrated += chunk.length;
    postMessage({ type: "progress", migrated });
    await pause();
  }

  await new Promise((resolve, reject) => {
    const transaction = db.transaction("appConfig", "readwrite");
    const store = transaction.objectStore("appConfig");
    // The resume cursor is per catalog now. Left under its old key it reads as
    // "never downloaded" and pulls all 2,982 questions down a second time.
    const legacyCursor = store.get(LEGACY_CATALOG_CONFIG_KEY);
    legacyCursor.onsuccess = () => {
      if (legacyCursor.result) {
        store.put({ ...legacyCursor.result, key: CATALOG_CONFIG_KEY_PREFIX + DEFAULT_CATALOG });
        store.delete(LEGACY_CATALOG_CONFIG_KEY);
      }
    };
    store.put({ key: "catalogSchemaVersion", value: CURRENT_CATALOG_SCHEMA_VERSION });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  return migrated;
}

self.onmessage = async event => {
  if (event.data?.type !== "migrate") return;
  try {
    const db = await openDatabase(event.data.dbName, event.data.dbVersion);
    let migrated = await migrate(db, event.data.legacyKey);
    migrated += await migrateGrades(db);
    // Last, so it reads records that decryption has already rewritten in place.
    migrated += await migrateCatalogNamespace(db);
    db.close();
    postMessage({ type: "complete", migrated });
  } catch (error) {
    postMessage({ type: "error", error: error?.message || String(error) });
  }
};
