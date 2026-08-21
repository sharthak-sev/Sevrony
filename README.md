# Sevrony

Sevrony is a local-first SAT practice app. It runs in the browser, stores all practice data in IndexedDB, and can optionally sync that data through your own Google Drive.

The question bank is downloaded once from Sevrony's Cloudflare Worker and then lives entirely in your browser. You can also import your own `.sat-test` files and Bluebook result exports.

> **Disclaimer:** Sevrony is a personal educational project and is not affiliated with, endorsed by, or associated with College Board. SAT is a College Board trademark. This repository does not contain or distribute College Board question content — the question bank is served from a separate Cloudflare D1 database that is not part of this repository, and the export used to build it is not committed here.

## What it does

- Download the shared question bank once, then practice entirely offline.
- Import your own `.sat-test` question banks and Bluebook result exports.
- Run custom Math, Reading & Writing, full-test, and retry-mistakes practice sessions.
- Review answers, timings, mistakes, custom tags, highlights, and personal notes.
- Track practice history, accuracy, pacing, and streaks locally.
- Build vocabulary with spaced repetition, flashcards, multiple choice, matching, and AI-assisted sentence checks.
- Export and restore local backups.
- Optionally sync progress, responses, study state, and vocabulary progress across devices through Google Drive.
- Install as a PWA with best-effort offline access after the app has been loaded once.

## Getting started

1. Open [Sevrony](https://sharthak-sev.github.io/).
2. Read and accept the in-app Privacy Policy. Acceptance is required before downloading the question bank, importing, restoring a backup, or linking Google Drive.
3. Click **Download question bank**. This is a one-time transfer of roughly 20 MB that completes a browser verification check first, then streams the bank in pages. Closing the tab mid-download is safe: the next visit resumes where it stopped.
4. Start a practice session from the dashboard, or use the Vocabulary section without any question bank at all.

You can instead import a `.sat-test` file, or a supported Bluebook result export from Past Tests. Sevrony accepts broad file types in its picker for iOS compatibility, but validates the file contents during import.

If you imported a bank by hand before the shared bank existed, the dashboard offers to switch you over. Your answers, sessions, and progress carry over unchanged, because a question is keyed by its own identifier rather than by which file it came from.

## Data and privacy

### Local data

Practice data is stored in this browser's IndexedDB database. This includes questions, sessions, responses, highlights, notes, configuration, and vocabulary progress.

Questions from the shared bank are treated as replaceable rather than as your data: they are excluded from backups and from the Drive sync file, and re-downloaded when a device needs them. Everything you actually produced — answers, timings, notes, highlights, tags, study state — is yours and is always included. In practice this takes a full backup from roughly 47 MB down to a few hundred KB.

Current records are stored as normal IndexedDB objects for responsiveness. Older encrypted records are migrated once in a dedicated browser worker, then rewritten locally without affecting the UI thread. Clearing browser site data removes local progress unless you have a backup or have enabled Google Drive sync.

### Consent and telemetry

The app records an accepted privacy choice in local storage and gates imports, backup restore, IndexedDB mutations, and Google Drive sync on that choice. This is a product-flow gate, not a security boundary: browser-side code and local storage can always be modified by someone using developer tools.

After acceptance, the app may load:

- **PostHog** for explicit product analytics events. Autocapture, heatmaps, surveys, and session recording are disabled.
- **Sentry** for errors and sampled performance tracing. Session Replay is disabled.

If Google Drive sync is linked, the app identifies that linked email in PostHog. Do not import, back up, or sync question material you are not allowed to store.

## Google Drive sync

Cloud sync is optional and disabled by default. When linked, Sevrony uses the Google Drive `appDataFolder` scope and stores one app-private sync file in the linked account.

- Data goes directly between the browser and Google Drive; the Sevrony Cloudflare Worker is not part of this sync path.
- Shared-bank questions are not synced. A newly linked device receives your progress and then downloads the bank itself, which is both faster and far smaller than transferring the questions.
- The app performs timestamp-based bidirectional merges. Vocabulary uses progress-aware conflict resolution so mastered words are not accidentally downgraded.
- Sync runs after local changes, when the app becomes visible, and while a visible tab has a valid cached Google token.
- Unlinking stops sync and removes local OAuth metadata; it does not delete either local data or the Drive file.

Cloud sync is not a replacement for backups. Download a backup before clearing browser data or moving devices.

## Offline behavior

The service worker uses a network-first cache fallback and precaches the main application files, including the IndexedDB migration worker. Imported data stays local, so previously loaded study data can remain usable offline.

Some features still need the network:

- The initial question bank download
- Google Drive sync and sign-in
- AI vocabulary sentence validation
- Telemetry, when accepted
- Remote fonts, KaTeX, Desmos, and Cloudflare Turnstile assets

Offline support is therefore best-effort, not a guarantee that every asset or feature is available.

## Run locally

Serve the repository from a local HTTP origin:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`. Do not rely on `file://`: service workers, browser storage behavior, and some browser APIs require an HTTP(S) origin.

`localhost` and `127.0.0.1` are on the Worker's CORS allowlist, so a local build can talk to the deployed Worker without any changes.

## Tests

The Worker, the download driver, and the sync filter all run offline against a real catalog, using Node's built-in SQLite as a stand-in for D1. No network and no Cloudflare account needed.

```bash
node tools/test_worker.mjs && node tools/test_catalog_client.mjs && node tools/test_sync_catalog.mjs
```

The first two need `catalog.sqlite` in the repository root — see the build step under **Question catalog** below. `tools/test_sync_catalog.mjs` has no prerequisites.

## Deployment

### Static app

Deploy the repository's static app files to the host that serves `index.html` (currently GitHub Pages). `db-worker.js` must be deployed beside `db.js`; it is a browser worker, not a Cloudflare Worker.

When updating the app, deploy the matching `index.html`, `sw.js`, `api.js`, `db.js`, `db-worker.js`, `sync.js`, `sync-worker.js`, `vocab.js`, `scoring.js`, and `app.js` together so the versioned service-worker cache remains consistent.

The `?v=` cache key appears in more places than `sw.js`, because several files load each other at runtime: `index.html` (script and stylesheet tags), `sw.js` (`CACHE_NAME` and the precache list), `db.js` (`new Worker("db-worker.js")`), `db-worker.js` (`importScripts('scoring.js')`), `sync.js` (`new Worker("sync-worker.js")`), `sync-worker.js` (`importScripts("db.js")`), `app.js` (`APP_VERSION`), and `privacy.html`. Bump all of them together — a file that asks for an older key is not in the new cache and will fail offline.

### Cloudflare Worker

The Worker lives in `worker/` as ES modules and is deployed with Wrangler:

```bash
npx wrangler deploy
```

`wrangler.toml` makes **staging the default environment**, so a bare `wrangler deploy` cannot reach production. Deploy production explicitly:

```bash
npx wrangler deploy --env production
```

It serves privacy-consent acknowledgement, feedback submission, AI vocabulary sentence validation, and the shared question catalog. Configure its secrets with `wrangler secret put`; never place them in this repository or the static frontend:

| Secret | Used for |
| --- | --- |
| `TURNSTILE_SECRET` | Cloudflare Turnstile siteverify |
| `GEMINI_API_KEY` | AI vocabulary sentence validation |
| `DISCORD_WEBHOOK_URL` | Feedback relay |
| `ADMIN_KEY` | Catalog ingestion (`/api/admin/*`) |
| `CATALOG_TICKET_KEY` | Signing key for download tickets |

`ADMIN_KEY` grants write access to the catalog. Generate it locally, set it with `wrangler secret put ADMIN_KEY`, and keep it out of source control, out of the frontend, and out of shell history.

### Question catalog

The catalog is a Cloudflare D1 database bound to the Worker as `QUESTIONS_DB`. Build it from a `.sat-test` export that lives outside this repository, then upload it:

```bash
python3 tools/build_catalog_db.py path/to/export.sat-test --version 2026-05-25.1
```

```bash
python3 tools/upload_catalog.py catalog.sqlite --base https://your-worker.workers.dev --reset --verify
```

`catalog.sqlite` is gitignored; rebuild it rather than committing it. The uploader reads the admin key from `SEVRONY_ADMIN_KEY`, from `--admin-key-file`, or by prompting — never from a command-line argument, where it would land in shell history and in `ps` output.

Two properties are worth knowing when an upload goes wrong:

- **Metadata is written last.** An interrupted upload leaves the previous version string describing a complete catalog, so clients keep downloading the old bank rather than a half-written one.
- **`--verify` reads back through the public route.** It walks every page the way a browser would and diffs the ids against the source, so a passing verify means the real download path works, not just that the rows landed.

Use `--resume` to continue an interrupted upload and `--verify-only` to check an existing catalog without writing.

Publishing a new version is safe while people are downloading: a client whose download is invalidated mid-transfer receives a 409, re-reads the metadata, and restarts against the new version.

## Browser notes

- Chrome and Edge provide the best support for the File System Access API used by automatic backup folders.
- Firefox supports manual backup and restore, but not the File System Access API.
- iOS/iPadOS may evict browser storage after long inactivity. Install the app as a PWA and maintain a Drive/manual backup if the data matters.

## Support

If Sevrony helps your SAT prep, you can support the project.

<img src="qr.svg" alt="Payment QR Code" width="220" style="border-radius: 8px; border: 1px solid #ddd; margin: 10px 0;" />

**UPI ID:** `sharthak-jaiswal@fam`

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/sevrony)

## License

Sevrony is released under the [MIT License](LICENSE) and is provided as-is, without warranty.
