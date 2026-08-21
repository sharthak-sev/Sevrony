/**
 * Tests the catalog-aware half of sync-worker.js.
 *
 * Worth its own suite because the failure mode is silent data loss: if the
 * local side is filtered but the remote side is not, every catalog question
 * looks like a record this device is missing and mergeRecordSets writes all
 * 2,982 of them back into IndexedDB under their old bank id -- undoing the
 * download and re-inflating the Drive blob at the same time.
 *
 * Run: node tools/test_sync_catalog.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ harness */

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(name, a === e, `got ${a}, want ${e}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/* -------------------------------------------------------------- load target */

/**
 * sync-worker.js is a classic worker script, not a module: it opens with
 * `importScripts` and reads `self`. Rather than refactor production code to
 * suit the test, stub the two globals it touches and evaluate it as a function
 * body that hands back the internals under test.
 */
function loadSyncWorker() {
  const source = readFileSync(join(root, "sync-worker.js"), "utf8")
    .replace(/^\s*importScripts\(.*$/m, "/* importScripts stubbed by the test */");

  const self = {
    SatPracticeDB: {},
    set onmessage(_fn) {
      /* the message handler is not under test */
    },
  };

  const factory = new Function(
    "self",
    `${source}
     return { partitionCatalogQuestions, stripCatalogQuestions, mergeRecordSets, getRecordTimestamp };`
  );
  return factory(self);
}

const { partitionCatalogQuestions, stripCatalogQuestions, mergeRecordSets } = loadSyncWorker();

const CATALOG = "sevrony-catalog";
const LEGACY = "bank-8f2c1a";

const q = (id, bankId, updatedAt = 1000) => ({ id, bankId, updatedAt, stem: `stem ${id}` });

/* ------------------------------------------------------------------- tests */

section("partitionCatalogQuestions");
{
  const local = [q("a1", CATALOG), q("b2", LEGACY), q("c3", CATALOG), q("d4", "bluebook-1")];
  const { syncable, catalogIds } = partitionCatalogQuestions(local);

  eq("keeps only non-catalog questions", syncable.map(r => r.id), ["b2", "d4"]);
  eq("collects catalog ids", [...catalogIds].sort(), ["a1", "c3"]);
}
{
  const { syncable, catalogIds } = partitionCatalogQuestions([]);
  eq("empty input is empty output", syncable, []);
  ok("empty input has no catalog ids", catalogIds.size === 0);
}
{
  // A user who never downloaded the catalog must sync exactly as before.
  const local = [q("b2", LEGACY), q("e5", LEGACY)];
  const { syncable, catalogIds } = partitionCatalogQuestions(local);
  eq("pre-catalog user syncs everything", syncable.map(r => r.id), ["b2", "e5"]);
  ok("pre-catalog user has an empty id set", catalogIds.size === 0);
}

section("stripCatalogQuestions");
{
  const remote = [q("a1", CATALOG), q("b2", LEGACY)];
  const { kept, dropped } = stripCatalogQuestions(remote, new Set());
  eq("drops by bankId even with no local id set", kept.map(r => r.id), ["b2"]);
  eq("counts what it dropped", dropped, 1);
}
{
  // The case that actually matters: the blob predates the download, so the
  // same questions are in it under the legacy bank id.
  const remote = [q("a1", LEGACY), q("c3", LEGACY), q("b2", LEGACY)];
  const { kept, dropped } = stripCatalogQuestions(remote, new Set(["a1", "c3"]));
  eq("drops legacy-tagged questions the catalog now owns", kept.map(r => r.id), ["b2"]);
  eq("reports a stale blob", dropped, 2);
}
{
  const { kept, dropped } = stripCatalogQuestions(undefined, new Set(["a1"]));
  eq("a blob with no questions array is passed through", kept, undefined);
  eq("nothing dropped from a missing array", dropped, 0);
}
{
  const remote = [q("b2", LEGACY)];
  const { kept, dropped } = stripCatalogQuestions(remote, new Set(["a1"]));
  eq("an already-pruned blob keeps everything", kept.map(r => r.id), ["b2"]);
  eq("an already-pruned blob forces no rewrite", dropped, 0);
}

section("merge: the data-loss regression");
{
  // Local has downloaded the catalog; the blob still holds the same questions
  // under the legacy bank id, plus one genuinely local-only question.
  const local = [q("a1", CATALOG, 5000), q("c3", CATALOG, 5000), q("b2", LEGACY, 1000)];
  const remoteBlob = [q("a1", LEGACY, 1000), q("c3", LEGACY, 1000), q("b2", LEGACY, 1000)];

  const { syncable, catalogIds } = partitionCatalogQuestions(local);
  const stripped = stripCatalogQuestions(remoteBlob, catalogIds);
  const merged = mergeRecordSets(syncable, stripped.kept);

  eq("catalog questions are not written back to IndexedDB", merged.localUpdates, []);
  eq("the merged blob carries only the non-catalog question", merged.merged.map(r => r.id), ["b2"]);
  ok("a stale blob is rewritten even though nothing else changed", stripped.dropped > 0);
}
{
  // Same shapes, but WITHOUT the remote-side strip -- proves the test would
  // catch the bug if the strip were ever removed.
  const local = [q("a1", CATALOG, 5000), q("b2", LEGACY, 1000)];
  const remoteBlob = [q("a1", LEGACY, 1000), q("b2", LEGACY, 1000)];
  const { syncable } = partitionCatalogQuestions(local);
  const merged = mergeRecordSets(syncable, remoteBlob);

  ok(
    "control: filtering only the local side WOULD re-inject the catalog",
    merged.localUpdates.length === 1 && merged.localUpdates[0].bankId === LEGACY
  );
}

section("merge: unrelated data is untouched");
{
  // A Bluebook bank the catalog does not cover has to keep syncing normally.
  const local = [q("bb1", "bluebook-1", 1000), q("a1", CATALOG, 5000)];
  const remoteBlob = [q("bb1", "bluebook-1", 9000), q("bb2", "bluebook-1", 9000)];

  const { syncable, catalogIds } = partitionCatalogQuestions(local);
  const stripped = stripCatalogQuestions(remoteBlob, catalogIds);
  const merged = mergeRecordSets(syncable, stripped.kept);

  eq("a newer remote Bluebook question still lands locally", merged.localUpdates.map(r => r.id).sort(), ["bb1", "bb2"]);
  eq("the merged blob keeps both Bluebook questions", merged.merged.map(r => r.id).sort(), ["bb1", "bb2"]);
  eq("no rewrite forced when the blob held no catalog questions", stripped.dropped, 0);
}
{
  // Tombstones for a deleted legacy bank must survive the filter, or the
  // deletion never propagates to the other device.
  const local = [{ id: "gone", bankId: LEGACY, deletedAt: 7000, updatedAt: 7000 }];
  const { syncable, catalogIds } = partitionCatalogQuestions(local);
  const stripped = stripCatalogQuestions([q("gone", LEGACY, 1000)], catalogIds);
  const merged = mergeRecordSets(syncable, stripped.kept);
  eq("a tombstone still reaches the blob", merged.merged.map(r => r.deletedAt), [7000]);
  ok("the tombstone marks the blob as needing a write", merged.remoteNeedsUpdate);
}

section("merge: at catalog scale");
{
  const local = [];
  const remoteBlob = [];
  for (let i = 0; i < 2982; i++) {
    local.push(q(`cb-${i}`, CATALOG, 5000));
    remoteBlob.push(q(`cb-${i}`, LEGACY, 1000));
  }
  local.push(q("own-1", LEGACY, 1000));
  remoteBlob.push(q("own-1", LEGACY, 1000));

  const { syncable, catalogIds } = partitionCatalogQuestions(local);
  const stripped = stripCatalogQuestions(remoteBlob, catalogIds);
  const merged = mergeRecordSets(syncable, stripped.kept);

  eq("2982 catalog questions leave the blob", stripped.dropped, 2982);
  eq("one question remains", merged.merged.length, 1);
  eq("nothing is written back locally", merged.localUpdates.length, 0);

  const before = JSON.stringify({ questions: remoteBlob }).length;
  const after = JSON.stringify({ questions: merged.merged }).length;
  console.log(`        (blob ${(before / 1024).toFixed(1)} KB -> ${(after / 1024).toFixed(1)} KB)`);
  ok("the blob shrinks by more than 99%", after < before * 0.01);
}

console.log(`\n${passed} passed, ${failed} failed`);
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
