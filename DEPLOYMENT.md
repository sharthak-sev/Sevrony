# Deployment & Infrastructure Guide

This guide covers deployment procedures, secret management, cache versioning, and question catalog ingestion for Sevrony.

---

## 1. Static App Deployment

The frontend is a static web application currently served via GitHub Pages (or any static host).

### Key Files & Cache Coordination

When publishing a new release, deploy all matching application scripts together so the versioned Service Worker cache remains consistent:

- `index.html` (script and stylesheet tags)
- `sw.js` (`CACHE_NAME` and the precache list)
- `api.js`
- `db.js` (`new Worker("db-worker.js")`)
- `db-worker.js` (`importScripts('scoring.js')`)
- `sync.js` (`new Worker("sync-worker.js")`)
- `sync-worker.js` (`importScripts("db.js")`)
- `vocab.js`
- `scoring.js`
- `app.js` (`APP_VERSION`)
- `privacy.html`

> **Important:** The `?v=` cache query parameter appears in multiple files because scripts dynamically load or import workers at runtime. Always bump the version tag across all of the above files simultaneously. If a file requests an older cache key, it will not exist in the newly activated cache and offline access will fail.

---

## 2. Cloudflare Worker

The API backend lives in the `worker/` directory as ES modules and handles Turnstile verification, AI vocabulary sentence checks, feedback relays, and question catalog distribution.

### Environments & Deployment

By default, `wrangler.toml` targets the **staging** environment to prevent accidental production deployments.

```bash
# Deploy to Staging (default)
npx wrangler deploy

# Deploy to Production
npx wrangler deploy --env production
```

### Worker Secrets

Configure secrets using `wrangler secret put <SECRET_NAME>` (add `--env production` for production). **Never** commit secrets to source control or expose them in the static frontend.

| Secret | Description |
| --- | --- |
| `TURNSTILE_SECRET` | Cloudflare Turnstile verification secret |
| `GEMINI_API_KEY` | Google Gemini API key for AI vocabulary sentence validation |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL for relaying user feedback |
| `ADMIN_KEY` | Admin authorization key for catalog ingestion (`/api/admin/*`) |
| `CATALOG_TICKET_KEY` | Secret key used to sign temporary download tickets |

> **Note:** Generate `ADMIN_KEY` locally and configure it via `wrangler secret put ADMIN_KEY`. Use distinct keys for staging and production so staging credentials cannot write to the production catalog.

---

## 3. Question Catalog Management (Cloudflare D1)

The question catalog is stored in Cloudflare D1 (`QUESTIONS_DB`). SAT, PSAT 10, and PSAT 8/9 share a single database (`sevrony-questions` in prod, `sevrony-questions-staging` in staging) partitioned by catalog namespaces.

### Building SQLite Files

Convert `.sat-test` exports into per-exam SQLite databases:

```bash
# SAT
python3 tools/build_catalog_db.py path/to/sat-export.sat-test \
  --catalog sat \
  --version 2026-05-25.1 \
  -o sat.sqlite

# PSAT 10
python3 tools/build_catalog_db.py path/to/psat10-export.sat-test \
  --catalog psat10 \
  --version 2026-08-23.1 \
  -o psat10.sqlite

# PSAT 8/9
python3 tools/build_catalog_db.py path/to/psat8-9-export.sat-test \
  --catalog psat8_9 \
  --version 2026-08-23.1 \
  -o psat8_9.sqlite
```

*(Generated `.sqlite` files are gitignored and should be rebuilt rather than committed.)*

### Ingesting & Uploading to D1

Upload each SQLite catalog to the Worker endpoint in batches:

```bash
# Staging Upload
python3 tools/upload_catalog.py sat.sqlite \
  --catalog sat \
  --base https://your-staging-worker.workers.dev \
  --migrate \
  --verify

python3 tools/upload_catalog.py psat10.sqlite \
  --catalog psat10 \
  --base https://your-staging-worker.workers.dev \
  --verify

python3 tools/upload_catalog.py psat8_9.sqlite \
  --catalog psat8_9 \
  --base https://your-staging-worker.workers.dev \
  --verify
```

The uploader reads the admin key from the `SEVRONY_ADMIN_KEY` environment variable, an `--admin-key-file`, or an interactive prompt (never pass it as a CLI argument to prevent exposure in process lists and shell history).

### Ingestion Safety & Guarantees

- **Atomic Version Flipping:** Metadata records are updated only after all question pages are uploaded. An interrupted upload leaves the previous catalog version active so users never download a partial bank.
- **Verification via Public Route:** `--verify` simulates public client downloads page-by-page and diffs IDs against the source SQLite database to verify end-to-end delivery.
- **Mid-Transfer Invalidation:** If a user is downloading when a new version is published, the client receives a `409 Conflict`, refreshes metadata, and resumes against the new version seamlessly.
- **Resume & Verify Flags:**
  - `--resume`: Continue an interrupted catalog upload without re-uploading completed batches.
  - `--verify-only`: Validate an existing live catalog against a local SQLite file without writing.
