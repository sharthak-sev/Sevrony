#!/usr/bin/env node
/**
 * verify_catalog.js -- prove that stripping `raw` from a .sat-test question is
 * lossless with respect to app.js's normalizeQuestion().
 *
 * Rather than re-implementing the normalizer (which would only prove that the
 * copy agrees with itself), this extracts the real function bodies out of
 * app.js by brace-matching and runs them in a sandbox.
 *
 * The only stubs are sanitizeHtml() and stripHtml(), which are DOM-based. Both
 * runs feed them identical inputs, so stubbing cannot mask a difference: any
 * divergence reported here is caused solely by the absence of `raw`.
 *
 * Usage:
 *   node tools/verify_catalog.js <input.sat-test> [--app app.js] [--limit N]
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/** Extract `function <name>(...) { ... }` from source by matching braces. */
function extractFunction(src, name) {
  const sig = new RegExp(`function\\s+${name}\\s*\\(`);
  const start = src.search(sig);
  if (start === -1) throw new Error(`function ${name} not found in app.js`);
  let i = src.indexOf("{", start);
  if (i === -1) throw new Error(`no body for ${name}`);
  let depth = 0;
  let inStr = null;
  let prev = "";
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (c === inStr && prev !== "\\") inStr = null;
    } else if (c === '"' || c === "'" || c === "`") {
      inStr = c;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
    prev = prev === "\\" && c === "\\" ? "" : c;
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

/** Extract `const <name> = { ... };` from source by matching braces. */
function extractConst(src, name) {
  const sig = new RegExp(`const\\s+${name}\\s*=\\s*\\{`);
  const start = src.search(sig);
  if (start === -1) throw new Error(`const ${name} not found in app.js`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1) + ";";
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

function normalizeSubjectPy(value) {
  const t = String(value || "").toLowerCase();
  if (t.includes("reading") || t.includes("writing") || t.includes("rw") ||
      ["ini", "cas", "eoi", "sec"].includes(t)) return "rw";
  return "math";
}

function main() {
  const args = process.argv.slice(2);
  const source = args.find(a => !a.startsWith("--"));
  if (!source) {
    console.error("usage: node tools/verify_catalog.js <input.sat-test> [--app app.js] [--limit N]");
    process.exit(2);
  }
  const appIdx = args.indexOf("--app");
  const appPath = appIdx !== -1 ? args[appIdx + 1] : path.join(__dirname, "..", "app.js");
  const limIdx = args.indexOf("--limit");
  const limit = limIdx !== -1 ? Number(args[limIdx + 1]) : Infinity;

  const app = fs.readFileSync(appPath, "utf8");

  const pieces = [
    extractConst(app, "SUBJECTS"),
    extractConst(app, "DIFFICULTIES"),
    extractConst(app, "DOMAIN_FALLBACKS"),
    extractFunction(app, "findDomainLabel"),
    extractFunction(app, "letterAt"),
    extractFunction(app, "normalizeSubject"),
    extractFunction(app, "findLetterByOptionId"),
    extractFunction(app, "normalizeAnswerOptions"),
    extractFunction(app, "normalizeCorrectAnswers"),
    extractFunction(app, "normalizeQuestion"),
  ];

  // Stubs for the two DOM-dependent helpers. Identical in both runs.
  const prelude = `
    function sanitizeHtml(v) { return String(v == null ? "" : v); }
    function stripHtml(v) { return String(v == null ? "" : v).replace(/<[^>]*>/g, ""); }
  `;

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(prelude + pieces.join("\n") + "\n;this.normalizeQuestion = normalizeQuestion;", sandbox);
  const normalizeQuestion = sandbox.normalizeQuestion;

  const doc = JSON.parse(fs.readFileSync(source, "utf8"));
  let questions = Array.isArray(doc.questions) ? doc.questions : [];
  if (!questions.length && doc.subjects) {
    for (const s of Object.values(doc.subjects)) {
      if (Array.isArray(s?.questions)) questions = questions.concat(s.questions);
    }
  }
  if (!questions.length) { console.error("no questions found"); process.exit(1); }

  const n = Math.min(questions.length, limit);
  const IGNORED = new Set(["raw", "importedAt", "updatedAt", "bankId"]);

  let diffs = 0;
  const fieldDiffs = new Map();
  let rawDifficultyNeeded = 0;
  const samples = [];

  for (let i = 0; i < n; i++) {
    const q = questions[i];
    const stripped = {};
    for (const k of Object.keys(q)) if (k !== "raw") stripped[k] = q[k];

    const withRaw = normalizeQuestion(q, "bank-x", i);
    const without = normalizeQuestion(stripped, "bank-x", i);

    // app.js:1265 -- refreshLocalData() falls back to q.raw only when the
    // normalized difficulty came out "Unspecified". Count where that matters.
    if (withRaw.difficulty === "Unspecified") rawDifficultyNeeded++;

    const keys = new Set([...Object.keys(withRaw), ...Object.keys(without)]);
    let rowDiffered = false;
    for (const k of keys) {
      if (IGNORED.has(k)) continue;
      const a = JSON.stringify(withRaw[k]);
      const b = JSON.stringify(without[k]);
      if (a !== b) {
        rowDiffered = true;
        fieldDiffs.set(k, (fieldDiffs.get(k) || 0) + 1);
        if (samples.length < 5) {
          samples.push({ id: withRaw.id, field: k, withRaw: String(a).slice(0, 160), without: String(b).slice(0, 160) });
        }
      }
    }
    if (rowDiffered) diffs++;
  }

  // Independently confirm the Python builder's subject mapping agrees with app.js's.
  let subjectMismatch = 0;
  for (let i = 0; i < n; i++) {
    const q = questions[i];
    const js = sandbox.normalizeSubject ? sandbox.normalizeSubject(q.subject || q.test) : null;
    if (js && js !== normalizeSubjectPy(q.subject || q.test)) subjectMismatch++;
  }

  console.log(`checked ${n} questions with the real normalizeQuestion() from ${path.basename(appPath)}`);
  console.log(`  rows differing after raw-strip : ${diffs}`);
  console.log(`  rows needing raw for difficulty: ${rawDifficultyNeeded}`);
  console.log(`  subject-mapping mismatches     : ${subjectMismatch}  (builder vs app.js)`);
  if (fieldDiffs.size) {
    console.log("  differing fields:");
    for (const [k, c] of [...fieldDiffs].sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${c}`);
    for (const s of samples) {
      console.log(`    e.g. ${s.id} .${s.field}\n      with raw: ${s.withRaw}\n      without : ${s.without}`);
    }
  }

  const ok = diffs === 0 && rawDifficultyNeeded === 0 && subjectMismatch === 0;
  console.log(ok ? "\nPASS -- stripping `raw` is lossless for this export." : "\nFAIL");
  process.exit(ok ? 0 : 1);
}

main();
