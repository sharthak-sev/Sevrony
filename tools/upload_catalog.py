#!/usr/bin/env python3
"""Upload catalog.sqlite into the Cloudflare D1 question catalog via the Worker.

Requires network access, so this runs on your machine, not in the agent sandbox.
Standard library only -- nothing to pip install.

    export SEVRONY_ADMIN_KEY='...'          # the value you gave `wrangler secret put ADMIN_KEY`
    python3 tools/upload_catalog.py catalog.sqlite \
        --base https://sevrony-worker-staging.sharthakjaiswal50.workers.dev \
        --catalog sat --reset --verify

The admin key is read from the environment (or prompted for), never from argv:
command-line arguments land in shell history and in `ps` output.

Interrupted uploads are safe to re-run -- rows go up in `seq` order in
all-or-nothing batches and are written with INSERT OR REPLACE, so `--resume`
picks up from whatever is already there.
"""

import argparse
import getpass
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request

COLUMNS = (
    "id, question_id, subject, domain_code, skill_code, difficulty_code,"
    " type, score_band, catalog_version, seq, bytes, payload, catalog"
)
DEFAULT_BATCH = 25
PAGE_SIZE = 150
RETRIES = 4

# Cloudflare's edge rejects urllib's default "Python-urllib/3.x" signature on
# workers.dev with a plain-text `error code: 1010` before the request ever
# reaches the worker -- which reads as a mystery 403 from our own admin routes.
# Any ordinary User-Agent gets through.
USER_AGENT = "sevrony-upload-catalog/1.0"


class WorkerError(RuntimeError):
    pass


def call(base, path, admin_key, body=None, method="POST", timeout=120):
    """One authenticated request to the worker, with backoff on 5xx / network errors."""
    url = f"{base.rstrip('/')}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    last = None

    for attempt in range(RETRIES):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("X-Admin-Key", admin_key)
        req.add_header("User-Agent", USER_AGENT)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                raw = res.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            # A bare `error code: NNNN` body is Cloudflare's edge talking, not our
            # worker -- the request was refused before any route ran, so the admin
            # key and the payload are not what is wrong.
            if re.search(r"error code: \d{4}", detail):
                detail += (
                    "  <- this is a Cloudflare edge error, not a worker response."
                    " The request never reached the worker; check that --base is the"
                    " right hostname and that nothing is rewriting the User-Agent."
                )
            # 4xx is our bug or a bad key -- retrying will not help.
            if e.code < 500:
                raise WorkerError(f"{method} {path} -> {e.code}: {detail}") from None
            last = f"{e.code}: {detail}"
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = str(e)

        if attempt < RETRIES - 1:
            wait = 2 ** attempt
            print(f"    retrying in {wait}s ({last})", file=sys.stderr)
            time.sleep(wait)

    raise WorkerError(f"{method} {path} failed after {RETRIES} attempts: {last}")


def resolve_admin_key(args):
    if args.admin_key_file:
        with open(args.admin_key_file, encoding="utf-8") as fh:
            key = fh.read().strip()
        if key:
            return key
    key = os.environ.get(args.admin_key_env, "").strip()
    if key:
        return key
    return getpass.getpass(f"ADMIN_KEY (not found in ${args.admin_key_env}): ").strip()


def load_local(path, target_catalog):
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        meta = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM catalog_meta WHERE catalog = ?", (target_catalog,))}
        (count,) = conn.execute("SELECT COUNT(*) FROM questions WHERE catalog = ?", (target_catalog,)).fetchone()
        ids = {r[0] for r in conn.execute("SELECT id FROM questions WHERE catalog = ?", (target_catalog,))}
    finally:
        conn.close()
    if not meta.get("version"):
        sys.exit(f"{path} has no catalog_meta.version for catalog {target_catalog} -- rebuild it with build_catalog_db.py")
    return meta, count, ids


def iter_batches(path, target_catalog, start_seq, size):
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        cur = conn.execute(
            f"SELECT {COLUMNS} FROM questions WHERE catalog = ? AND seq >= ? ORDER BY seq", (target_catalog, start_seq)
        )
        while True:
            chunk = cur.fetchmany(size)
            if not chunk:
                return
            yield [list(row) for row in chunk]
    finally:
        conn.close()


def upload(args, base, admin_key):
    meta, count, local_ids = load_local(args.source, args.catalog)
    version = meta["version"]
    print(f"local  {args.source} ({args.catalog}): {count} rows, version {version}")

    before = call(base, "/api/admin/catalog/stats", admin_key, {"catalog": args.catalog})
    print(f"remote before: {before.get('rows', 0)} rows, versions {before.get('byVersion', {})}")

    start_seq = 0
    if args.resume and not args.reset:
        remote_max = before.get("maxSeq")
        if isinstance(remote_max, int) and before.get("rows"):
            start_seq = remote_max + 1
            print(f"resuming at seq {start_seq}")

    if args.migrate:
        migration = call(base, "/api/admin/catalog/migrate", admin_key, {"catalog": args.catalog})
        print(f"schema migrated: {', '.join(migration.get('migrated', [])) or 'already current'}")

    call(base, "/api/admin/catalog/init", admin_key, {"reset": bool(args.reset), "catalog": args.catalog})
    print(f"schema ready{' (tables recreated)' if args.reset else ''}")

    sent = 0
    t0 = time.time()
    for batch in iter_batches(args.source, args.catalog, start_seq, args.batch):
        call(base, "/api/admin/catalog/rows", admin_key, {"rows": batch, "catalog": args.catalog})
        sent += len(batch)
        last_seq = batch[-1][9]
        pct = 100.0 * (last_seq + 1) / count
        print(f"  seq {batch[0][9]:>5}..{last_seq:<5} {pct:5.1f}%  ({sent} sent)", flush=True)

    # Written last: an interrupted upload leaves the old version string in place,
    # so /api/catalog/meta keeps describing a catalog that is actually complete.
    call(base, "/api/admin/catalog/meta", admin_key, {"meta": meta, "prune": True, "catalog": args.catalog})
    print(f"meta written, old versions pruned  ({time.time() - t0:.0f}s, {sent} rows)")

    after = call(base, "/api/admin/catalog/stats", admin_key, {"catalog": args.catalog})
    report_stats(after, count)
    return version, count, local_ids


def report_stats(stats, expected_count):
    print("remote after:")
    print(f"  rows           {stats.get('rows')}  (expected {expected_count})")
    print(f"  seq contiguous {stats.get('seqContiguous')}  [{stats.get('minSeq')}..{stats.get('maxSeq')}]")
    print(f"  total bytes    {(stats.get('totalBytes') or 0) / 1e6:.2f} MB")
    print(f"  largest row    {(stats.get('maxRowBytes') or 0) / 1024:.0f} KB")
    print(f"  versions       {stats.get('byVersion')}")
    print("  by domain:")
    for k, v in sorted((stats.get("byDomain") or {}).items()):
        print(f"    {k:<12} {v}")


def verify(args, base, admin_key, version, count, local_ids, max_pages):
    """Read every page back through the public route and diff against the source."""
    print(f"\nverifying via the public catalog route for {args.catalog}...")
    meta = call(base, f"/api/catalog/meta/{args.catalog}", admin_key, method="GET")
    problems = []
    if meta.get("version") != version:
        problems.append(f"/api/catalog/meta/{args.catalog} version {meta.get('version')!r} != {version!r}")
    if meta.get("count") != count:
        problems.append(f"/api/catalog/meta/{args.catalog} count {meta.get('count')} != {count}")
    print(f"  meta: version {meta.get('version')}, count {meta.get('count')}, requiresTicket {meta.get('requiresTicket')}")

    seen = set()
    since = 0
    pages = 0
    seqs = []
    while pages < max_pages:
        page = call(base, f"/api/catalog/questions/{args.catalog}?since={since}&limit={PAGE_SIZE}", admin_key, method="GET")
        got = page.get("questions") or []
        pages += 1
        for q in got:
            qid = q.get("id") or q.get("externalId")
            if qid in seen:
                problems.append(f"duplicate id {qid} in page starting at {since}")
            seen.add(qid)
            if "raw" in q:
                problems.append(f"{qid} still carries a `raw` field")
        seqs.append((since, len(got)))
        print(f"  page since={since:<5} {len(got):>3} questions  (total {len(seen)})", flush=True)
        if page.get("done") or not got:
            break
        since = page["nextSince"]

    if len(seen) != count:
        problems.append(f"read {len(seen)} unique questions, expected {count}")
    missing = local_ids - seen
    extra = seen - local_ids
    if missing:
        problems.append(f"{len(missing)} ids missing remotely, e.g. {sorted(missing)[:3]}")
    if extra:
        problems.append(f"{len(extra)} unexpected ids remotely, e.g. {sorted(extra)[:3]}")

    if problems:
        print("\nFAIL")
        for p in problems:
            print(f"  !! {p}")
        return False
    print(f"\nPASS -- {len(seen)} questions readable over {pages} pages, ids match the source exactly.")
    return True


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("source", nargs="?", default="catalog.sqlite", help="path to catalog.sqlite")
    ap.add_argument("--base", required=True, help="worker origin, e.g. https://sevrony-worker-staging.<sub>.workers.dev")
    ap.add_argument("--catalog", required=True, help="catalog identifier, e.g. sat, psat10, psat8_9")
    ap.add_argument("--batch", type=int, default=DEFAULT_BATCH, help=f"rows per request (default {DEFAULT_BATCH}, worker caps at 40)")
    ap.add_argument("--reset", action="store_true", help="DROP and recreate the catalog tables first")
    ap.add_argument("--migrate", action="store_true", help="upgrade the legacy single-catalog schema in place before uploading")
    ap.add_argument("--resume", action="store_true", help="skip rows already present (by remote maxSeq)")
    ap.add_argument("--verify", action="store_true", help="after upload, read every page back and diff against the source")
    ap.add_argument("--verify-only", action="store_true", help="skip the upload; only run verification")
    ap.add_argument("--verify-pages", type=int, default=10_000, help="cap pages read during verification")
    ap.add_argument("--admin-key-env", default="SEVRONY_ADMIN_KEY", help="env var holding ADMIN_KEY")
    ap.add_argument("--admin-key-file", help="file holding ADMIN_KEY (one line)")
    args = ap.parse_args()

    if args.batch > 40:
        sys.exit("--batch cannot exceed 40 (worker limit, keeps D1 under 50 queries per invocation)")
    if args.reset and args.migrate:
        sys.exit("--reset and --migrate are mutually exclusive")
    if not args.base.startswith("https://") and "localhost" not in args.base and "127.0.0.1" not in args.base:
        sys.exit("--base must be https:// (the admin key travels in a header)")

    admin_key = resolve_admin_key(args)
    if not admin_key:
        sys.exit("no admin key provided")

    base = args.base.rstrip("/")
    try:
        if args.verify_only:
            meta, count, local_ids = load_local(args.source, args.catalog)
            ok = verify(args, base, admin_key, meta["version"], count, local_ids, args.verify_pages)
        else:
            version, count, local_ids = upload(args, base, admin_key)
            ok = True
            if args.verify:
                ok = verify(args, base, admin_key, version, count, local_ids, args.verify_pages)
    except WorkerError as e:
        sys.exit(f"\n{e}")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
