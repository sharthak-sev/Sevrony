#!/usr/bin/env python3
"""Build the Sevrony question-catalog SQLite database from a .sat-test export.

Local only -- no network. The resulting file is a plain SQLite DB whose rows are
uploaded to D1 by tools/upload_catalog.py.

Each row's `payload` is the original .sat-test question object with `raw`
removed. Everything normalizeQuestion() reads from raw.metadata / raw.detail
also exists as a top-level field in the export, so stripping it is lossless --
tools/verify_catalog.py proves that against the real file.

Usage:
    python3 tools/build_catalog_db.py <input.sat-test> [-o catalog.sqlite] [--version 2026-05-25.1]
"""

import argparse
import json
import os
import sqlite3
import sys

# D1 hard limits we must not exceed.
D1_MAX_ROW_BYTES = 2_000_000

SCHEMA = """
CREATE TABLE questions (
  id              TEXT PRIMARY KEY,
  question_id     TEXT,
  subject         TEXT NOT NULL,
  domain_code     TEXT,
  skill_code      TEXT,
  difficulty_code TEXT,
  type            TEXT,
  score_band      INTEGER,
  catalog_version TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  bytes           INTEGER NOT NULL,
  payload         TEXT NOT NULL
);
CREATE INDEX idx_questions_seq ON questions(seq);
CREATE INDEX idx_questions_filter ON questions(subject, domain_code, difficulty_code);

CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def extract_questions(doc):
    """Return the question list from either the flat or per-subject export shape."""
    if isinstance(doc.get("questions"), list):
        return doc["questions"]
    out = []
    for section in (doc.get("subjects") or {}).values():
        if isinstance(section, dict) and isinstance(section.get("questions"), list):
            out.extend(section["questions"])
    return out


def normalize_subject(value):
    """Mirror of normalizeSubject() in app.js:5835."""
    t = str(value or "").lower()
    if "reading" in t or "writing" in t or "rw" in t or t in ("ini", "cas", "eoi", "sec"):
        return "rw"
    return "math"


def build(src_path, out_path, version, force):
    if os.path.exists(out_path):
        if not force:
            sys.exit(f"refusing to overwrite {out_path} (pass --force)")
        os.remove(out_path)

    with open(src_path, encoding="utf-8") as fh:
        doc = json.load(fh)

    questions = extract_questions(doc)
    if not questions:
        sys.exit("no questions found in export")

    # Sort to match refreshLocalData()'s ordering (app.js:1273) so that `seq`
    # page boundaries stay stable across rebuilds of the same source file.
    def sort_key(q):
        return (
            str(normalize_subject(q.get("subject") or q.get("test"))),
            str(q.get("questionId") or q.get("id") or ""),
        )

    questions.sort(key=sort_key)

    rows = []
    seen_ids = set()
    total_bytes = 0
    oversized = []

    for seq, q in enumerate(questions):
        payload_obj = {k: v for k, v in q.items() if k != "raw"}
        payload = json.dumps(payload_obj, separators=(",", ":"), ensure_ascii=False)
        nbytes = len(payload.encode("utf-8"))
        total_bytes += nbytes

        qid = str(q.get("id") or q.get("externalId") or "")
        if not qid:
            sys.exit(f"question at seq {seq} has no id")
        if qid in seen_ids:
            sys.exit(f"duplicate question id {qid!r} at seq {seq}")
        seen_ids.add(qid)

        if nbytes > D1_MAX_ROW_BYTES:
            oversized.append((qid, nbytes))

        score_band = q.get("scoreBand")
        if not isinstance(score_band, int):
            try:
                score_band = int(score_band)
            except (TypeError, ValueError):
                score_band = None

        rows.append(
            (
                qid,
                str(q.get("questionId") or ""),
                normalize_subject(q.get("subject") or q.get("test")),
                str(q.get("domainCode") or ""),
                str(q.get("skillCode") or ""),
                str(q.get("difficultyCode") or ""),
                str(q.get("type") or ""),
                score_band,
                version,
                seq,
                nbytes,
                payload,
            )
        )

    if oversized:
        for qid, n in oversized:
            print(f"  !! {qid} is {n} bytes, over D1's 2 MB row cap", file=sys.stderr)
        sys.exit(f"{len(oversized)} row(s) exceed the D1 row limit")

    conn = sqlite3.connect(out_path)
    try:
        conn.executescript(SCHEMA)
        conn.executemany(
            "INSERT INTO questions (id, question_id, subject, domain_code, skill_code,"
            " difficulty_code, type, score_band, catalog_version, seq, bytes, payload)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            rows,
        )
        meta = {
            "version": version,
            "count": str(len(rows)),
            "bytes": str(total_bytes),
            "source": json.dumps(doc.get("source") or {}, separators=(",", ":")),
            "exportedAt": str(doc.get("exportedAt") or ""),
            "formatVersion": str(doc.get("formatVersion") or ""),
        }
        conn.executemany(
            "INSERT INTO catalog_meta (key, value) VALUES (?,?)", sorted(meta.items())
        )
        conn.commit()

        # Post-write assertions against what actually landed on disk.
        (count,) = conn.execute("SELECT COUNT(*) FROM questions").fetchone()
        (max_seq,) = conn.execute("SELECT MAX(seq) FROM questions").fetchone()
        (distinct_seq,) = conn.execute("SELECT COUNT(DISTINCT seq) FROM questions").fetchone()
        assert count == len(rows), "row count mismatch after insert"
        assert distinct_seq == count, "seq values are not unique"
        assert max_seq == count - 1, "seq values are not contiguous from 0"
    finally:
        conn.close()

    by_subject = {}
    for r in rows:
        by_subject[r[2]] = by_subject.get(r[2], 0) + 1

    print(f"wrote {out_path}")
    print(f"  version   {version}")
    print(f"  questions {count}  ({', '.join(f'{k}={v}' for k, v in sorted(by_subject.items()))})")
    print(f"  payload   {total_bytes/1e6:.2f} MB  (avg {total_bytes/count/1024:.1f} KB/row)")
    print(f"  largest   {max(r[10] for r in rows)/1024:.0f} KB")
    print(f"  seq       0..{max_seq} contiguous, unique")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="path to the .sat-test export")
    ap.add_argument("-o", "--output", default="catalog.sqlite", help="output SQLite path")
    ap.add_argument("--version", required=True, help="catalog version string, e.g. 2026-05-25.1")
    ap.add_argument("--force", action="store_true", help="overwrite an existing output file")
    args = ap.parse_args()
    build(args.source, args.output, args.version, args.force)


if __name__ == "__main__":
    main()
