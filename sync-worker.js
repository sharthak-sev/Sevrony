/**
 * sync-worker.js — Runs bidirectional Google Drive ↔ IndexedDB sync off the main thread.
 *
 * The main thread (sync.js) posts:
 *   { token, fileId, vocabState, options }
 *
 * This worker replies with:
 *   { localChanged, newFileId, mergedVocabState }
 *
 * Because Web Workers cannot access localStorage, every value the worker
 * needs is passed in via postMessage, and any values that need updating
 * are passed back in the response.
 */
"use strict";

importScripts("db.js?v=2.3.0");

const SYNC_FILENAME = "sevrony-sync.json";
const DB = self.SatPracticeDB;

// ─── Drive API (token is per-request, no module-level accessToken) ───

async function driveRequest(url, token, options = {}) {
  const res = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok && res.status === 401) {
    throw new Error("auth_expired");
  }
  return res;
}

/**
 * Resolve the Drive file ID.
 * Workers can't read localStorage, so the cached fileId is passed in via postMessage.
 * If no fileId is provided, we search for the file (1 API call, first sync only).
 * Returns { id, isNew } so caller knows whether the main thread cache should be updated.
 */
async function resolveFileId(cachedFileId, token) {
  if (cachedFileId) return { id: cachedFileId, isNew: false };

  const res = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?` +
      `spaces=appDataFolder&q=name='${SYNC_FILENAME}'&fields=files(id)`,
    token
  );
  const data = await res.json();
  const id = data.files?.[0]?.id || null;
  return { id, isNew: !!id }; // isNew = true if we discovered it
}

async function readSyncFile(fileId, token) {
  if (!fileId) return null;
  const res = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    token
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

/**
 * Write payload to Drive. Returns the (possibly new) fileId.
 */
async function writeSyncFile(payload, fileId, token) {
  const body = JSON.stringify(payload);

  if (fileId) {
    const res = await driveRequest(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      token,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body }
    );
    if (res.status === 404) {
      // Stale cache — create a fresh file
      return writeSyncFile(payload, null, token);
    }
    return fileId;
  }

  // Create new file
  const metadata = { name: SYNC_FILENAME, parents: ["appDataFolder"] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([body], { type: "application/json" }));
  const res = await driveRequest(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    token,
    { method: "POST", body: form }
  );
  const created = await res.json();
  return created.id;
}

// ─── Bidirectional Merge ────────────────────────────────────

function getRecordTimestamp(record) {
  if (!record) return 0;
  if (record.updatedAt) return record.updatedAt;
  if (record.deletedAt) return record.deletedAt;
  if (record.completedAt) return new Date(record.completedAt).getTime() || 0;
  if (record.importedAt) return new Date(record.importedAt).getTime() || 0;
  if (record.answeredAt) return new Date(record.answeredAt).getTime() || 0;
  return 0;
}

/* ─── Shared question catalog ─────────────────────────────────
   Catalog questions are re-downloadable from the worker, so they are kept out
   of the Drive blob entirely — that is what takes a synced account from ~47 MB
   down to a few hundred KB. They are stripped from BOTH sides of the merge:
   dropping them only from the local side would make every remote copy look
   like a record this device is missing, and mergeRecordSets would faithfully
   write all 2,982 of them back into IndexedDB under their old bank id.
   ───────────────────────────────────────────────────────────── */

const CATALOG_BANK_ID = "sevrony-catalog";

/**
 * @returns {{syncable: object[], catalogIds: Set<string>}}
 */
function partitionCatalogQuestions(localQuestions) {
  const syncable = [];
  const catalogIds = new Set();
  for (const q of localQuestions) {
    if (q && q.bankId === CATALOG_BANK_ID) catalogIds.add(q.id);
    else syncable.push(q);
  }
  return { syncable, catalogIds };
}

/**
 * Drop catalog questions from a remote blob.
 *
 * `catalogIds` matters as much as the bankId check: a blob written before this
 * device adopted the catalog still carries those same questions under whatever
 * random bank id the original .sat-test import used.
 *
 * @returns {{kept: object[]|undefined, dropped: number}} `dropped > 0` means the
 * remote file is stale and must be rewritten even if nothing else changed.
 */
function stripCatalogQuestions(remoteQuestions, catalogIds) {
  if (!Array.isArray(remoteQuestions)) return { kept: remoteQuestions, dropped: 0 };
  const kept = [];
  let dropped = 0;
  for (const q of remoteQuestions) {
    if (q && (q.bankId === CATALOG_BANK_ID || catalogIds.has(q.id))) dropped++;
    else kept.push(q);
  }
  return { kept, dropped };
}

function mergeRecordSets(localRecords, remoteRecords, idField = "id") {
  const localMap = new Map(localRecords.map(r => [r[idField], r]));
  const remoteMap = new Map((remoteRecords || []).map(r => [r[idField], r]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const merged = [];
  const localUpdates = [];
  let remoteNeedsUpdate = false;

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local && !remote) {
      merged.push(local);
      remoteNeedsUpdate = true;
    } else if (!local && remote) {
      merged.push(remote);
      localUpdates.push(remote);
    } else {
      const localTs = getRecordTimestamp(local);
      const remoteTs = getRecordTimestamp(remote);
      if (remoteTs > localTs) {
        merged.push(remote);
        localUpdates.push(remote);
      } else if (localTs > remoteTs) {
        merged.push(local);
        remoteNeedsUpdate = true;
      } else {
        merged.push(remote);
      }
    }
  }

  return { merged, localUpdates, remoteNeedsUpdate };
}

function mergeVocabWords(localRecords, remoteRecords) {
  const localMap = new Map(localRecords.map(r => [r.word, r]));
  const remoteMap = new Map((remoteRecords || []).map(r => [r.word, r]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const merged = [];
  const localUpdates = [];
  let remoteNeedsUpdate = false;

  const progressValue = (status) => {
    if (status === "Mastered") return 2;
    if (status === "Learning") return 1;
    return 0;
  };

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local && !remote) {
      merged.push(local);
      remoteNeedsUpdate = true;
    } else if (!local && remote) {
      merged.push(remote);
      localUpdates.push(remote);
    } else {
      const localProg = progressValue(local.status);
      const remoteProg = progressValue(remote.status);

      const localTs = getRecordTimestamp(local);
      const remoteTs = getRecordTimestamp(remote);

      if (remote.status === "New" && local.status !== "New" && remoteTs > localTs) {
        merged.push(remote);
        localUpdates.push(remote);
      } else if (local.status === "New" && remote.status !== "New" && localTs > remoteTs) {
        merged.push(local);
        remoteNeedsUpdate = true;
      } else if (remoteProg > localProg) {
        merged.push(remote);
        localUpdates.push(remote);
      } else if (localProg > remoteProg) {
        merged.push(local);
        remoteNeedsUpdate = true;
      } else {
        if (remoteTs > localTs) {
          merged.push(remote);
          localUpdates.push(remote);
        } else if (localTs > remoteTs) {
          merged.push(local);
          remoteNeedsUpdate = true;
        } else {
          merged.push(remote);
        }
      }
    }
  }

  return { merged, localUpdates, remoteNeedsUpdate };
}

/**
 * Core sync: read local + remote → merge → write cloud → update local.
 */
async function bidirectionalSync(token, cachedFileId, vocabState, options = {}) {
  // Read local (IndexedDB — the whole reason this runs in a worker)
  const [localBanks, localQuestions, localSessions, localResponses, localVocabWords, localStudyStates] = await Promise.all([
    DB.getAll("questionBanks"),
    DB.getAll("questions"),
    DB.getAll("sessions"),
    DB.getAll("responses"),
    DB.getAll("vocabWords"),
    DB.getAll("questionStudyState"),
  ]);

  const filteredSessions = localSessions.filter(s => s.id !== "__active_test__");
  const { syncable: syncableQuestions, catalogIds } = partitionCatalogQuestions(localQuestions);

  // Resolve file ID (uses cached value from main thread, or searches Drive)
  let { id: currentFileId } = await resolveFileId(cachedFileId, token);
  let newFileId = currentFileId !== cachedFileId ? currentFileId : null;

  // forcePush: write local directly to cloud, skip merge
  if (options.forcePush) {
    const finalFileId = await writeSyncFile({
      syncedAt: new Date().toISOString(),
      questionBanks: localBanks,
      questions: syncableQuestions,
      sessions: filteredSessions,
      responses: localResponses,
      vocabWords: localVocabWords,
      questionStudyState: localStudyStates,
      vocabState: vocabState,
    }, currentFileId, token);

    if (finalFileId !== cachedFileId) newFileId = finalFileId;
    return { localChanged: false, newFileId, mergedVocabState: null };
  }

  // Read remote (1 API call)
  const remote = await readSyncFile(currentFileId, token);

  // Merge each store (pure CPU — exactly why we're in a worker)
  const remoteQuestions = stripCatalogQuestions(remote?.questions, catalogIds);
  const banks = mergeRecordSets(localBanks, remote?.questionBanks);
  const questions = mergeRecordSets(syncableQuestions, remoteQuestions.kept);
  const sessions = mergeRecordSets(filteredSessions, remote?.sessions);
  const responses = mergeRecordSets(localResponses, remote?.responses);
  const vocabWords = mergeVocabWords(localVocabWords, remote?.vocabWords);
  const studyStates = mergeRecordSets(localStudyStates, remote?.questionStudyState);

  const localVocabState = vocabState;
  let mergedVocabState = localVocabState;
  let vocabStateLocalChanged = false;
  let vocabStateRemoteNeedsUpdate = false;

  if (remote?.vocabState) {
    const remoteTs = remote.vocabState.updatedAt || 0;
    const localTs = localVocabState ? (localVocabState.updatedAt || 0) : 0;
    if (remoteTs > localTs) {
      mergedVocabState = remote.vocabState;
      vocabStateLocalChanged = true;
    } else if (localTs > remoteTs) {
      mergedVocabState = localVocabState;
      vocabStateRemoteNeedsUpdate = true;
    } else {
      mergedVocabState = remote.vocabState;
    }
  } else if (localVocabState) {
    vocabStateRemoteNeedsUpdate = true;
  }

  const hasLocalUpdates = banks.localUpdates.length > 0 || questions.localUpdates.length > 0 || sessions.localUpdates.length > 0 || responses.localUpdates.length > 0 || vocabWords.localUpdates.length > 0 || studyStates.localUpdates.length > 0 || vocabStateLocalChanged;
  // remoteQuestions.dropped forces exactly one rewrite of a pre-catalog blob:
  // without it an otherwise-idle account would keep its 47 MB file forever.
  const remoteNeedsUpdate = !remote || remoteQuestions.dropped > 0 || banks.remoteNeedsUpdate || questions.remoteNeedsUpdate || sessions.remoteNeedsUpdate || responses.remoteNeedsUpdate || vocabWords.remoteNeedsUpdate || studyStates.remoteNeedsUpdate || vocabStateRemoteNeedsUpdate;

  // Write merged state to cloud only if there are local-newer changes
  if (remoteNeedsUpdate) {
    const finalFileId = await writeSyncFile({
      syncedAt: new Date().toISOString(),
      questionBanks: banks.merged,
      questions: questions.merged,
      sessions: sessions.merged,
      responses: responses.merged,
      vocabWords: vocabWords.merged,
      questionStudyState: studyStates.merged,
      vocabState: mergedVocabState,
    }, currentFileId, token);

    if (finalFileId !== cachedFileId) newFileId = finalFileId;
  }

  // Write only remote-newer records to local DB
  let localChanged = false;
  if (banks.localUpdates.length) { await DB.putMany("questionBanks", banks.localUpdates); localChanged = true; }
  if (questions.localUpdates.length) { await DB.putMany("questions", questions.localUpdates); localChanged = true; }
  if (sessions.localUpdates.length) { await DB.putMany("sessions", sessions.localUpdates); localChanged = true; }
  if (responses.localUpdates.length) { await DB.putMany("responses", responses.localUpdates); localChanged = true; }
  if (vocabWords.localUpdates.length) { await DB.putMany("vocabWords", vocabWords.localUpdates); localChanged = true; }
  if (studyStates.localUpdates.length) { await DB.putMany("questionStudyState", studyStates.localUpdates); localChanged = true; }

  if (vocabStateLocalChanged) localChanged = true;

  return {
    localChanged,
    newFileId,
    mergedVocabState: vocabStateLocalChanged ? mergedVocabState : null,
  };
}

// ─── Worker Message Handler ─────────────────────────────────

self.onmessage = async function (event) {
  const { token, fileId, vocabState, options } = event.data;

  try {
    const result = await bidirectionalSync(token, fileId, vocabState, options || {});
    self.postMessage({ type: "complete", ...result });
  } catch (err) {
    self.postMessage({ type: "error", error: err.message || "Sync worker failed" });
  }
};
