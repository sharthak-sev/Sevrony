# Sevrony

Sevrony is a local-first SAT practice app. It runs in the browser, stores all practice data in IndexedDB, and syncs your progress and history seamlessly across devices with Google Sign-in.

The question bank is downloaded once from Sevrony's Cloudflare Worker after signing in and then lives entirely in your browser. You can also import your own `.sat-test` files and Bluebook result exports.

> **Disclaimer:** Sevrony is a personal educational project. It is not affiliated with, endorsed by, or associated with College Board. SAT is a College Board trademark. Sevrony serves SAT question content it does not own; if you are College Board and want it taken down, open an issue and it comes down.

## What it does

- Choose SAT®, PSAT/NMSQT® and PSAT™ 10, or PSAT™ 8/9. Each question bank downloads from the shared catalog service and keeps its practice history separate.
- Practice entirely offline once the question bank is downloaded.
- Import your own `.sat-test` question banks and Bluebook result exports.
- Run custom Math, Reading & Writing, full-test, and retry-mistakes practice sessions.
- Review answers, timings, mistakes, custom tags, highlights, and personal notes in the Mistakes Log.
- Track practice history, accuracy, pacing, and streaks locally.
- Build vocabulary with spaced repetition, flashcards, multiple choice, matching, and AI-assisted sentence checks.
- Export and restore lightweight local backups (<0.5 MB).
- Automatic cloud sync for progress, responses, study state, and vocabulary across devices through Google Drive.
- Install as a PWA with best-effort offline access after the app has been loaded once.

## Getting started

1. Open [Sevrony](https://sharthak-sev.github.io/Sevrony/).
2. Read and accept the in-app Privacy Policy. Acceptance is required before downloading the question bank, importing, restoring a backup, or linking Google Drive.
3. Pick an exam, then click **Sign in with Google**. This securely signs you in, connects cloud sync for your practice data, and downloads that exam's question bank. Switching exams keeps downloaded questions offline in IndexedDB, but loads only the selected exam into memory; its history, dashboard metrics, streak, and Mistakes Log are scoped to that exam.
4. Start a practice session from the dashboard, review past tests, or build your vocabulary.

You can also expand the **Advanced: import your own .sat-test file** section during setup to import a custom `.sat-test` export, or import Bluebook test results from Past Tests. Sevrony accepts broad file types in its picker for iOS compatibility, but validates the file contents during import.

If you previously imported questions by hand before the shared bank existed, the dashboard automatically retires duplicate banks after downloading from Sevrony. Your answers, sessions, and progress carry over unchanged, because questions are keyed by their College Board identifiers.

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

When Google Drive sync is linked upon sign-in, the app identifies that linked email in PostHog. Do not import, back up, or sync question material you are not allowed to store.

## Google Drive sync

When you sign in with Google, Sevrony uses the Google Drive `appDataFolder` scope to store an app-private sync file in your account.

- Data goes directly between the browser and Google Drive; the Sevrony Cloudflare Worker is not part of this sync path.
- Shared-bank questions are not synced. A newly linked device receives your progress and then downloads the bank itself, which is both faster and far smaller than transferring the questions.
- The app performs timestamp-based bidirectional merges. Vocabulary uses progress-aware conflict resolution so mastered words are not accidentally downgraded.
- Sync runs after local changes, when the app becomes visible, and while a visible tab has a valid cached Google token.
- Unlinking stops sync and removes local OAuth metadata; it does not delete either local data or the Drive file.

Cloud sync is not a replacement for backups. Download a backup before clearing browser data or moving devices.

## Offline behavior

The service worker uses a network-first cache fallback and precaches the main application files, including the IndexedDB migration worker. Imported data stays local, so previously loaded study data can remain usable offline.

Some features still need the network:

- The initial Google sign-in and question bank download
- Google Drive cloud sync
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

`localhost` and `127.0.0.1` are on the Worker's CORS allowlist. When running on loopback (`localhost` or `127.0.0.1`), `api.js` automatically defaults to the staging Worker (`https://sevrony-worker-staging.<subdomain>.workers.dev`), allowing you to test all three catalogs immediately without manual configuration.

You can also specify an explicit Worker origin override in the browser console:

```js
localStorage.setItem("sevrony.apiBase", "https://sevrony-worker-staging.<subdomain>.workers.dev")
```

Reload, and the console confirms the override. Remove the key to return to default. This only works from a loopback origin and only for a `https://…workers.dev` host: on the deployed site it is inert, so a stray value cannot redirect a real user's downloads.

## Tests

The Worker, the download driver, and the sync filter all run offline against real catalogs, using Node's built-in SQLite as a stand-in for D1. No network and no Cloudflare account needed.

```bash
node tools/test_worker.mjs && \
node tools/test_catalog_client.mjs catalog-sat.sqlite sat && \
node tools/test_catalog_client.mjs catalog-psat10.sqlite psat10 && \
node tools/test_catalog_client.mjs catalog-psat8_9.sqlite psat8_9 && \
node tools/test_sync_catalog.mjs
```

The catalog client tests take the SQLite database path and catalog name (`sat`, `psat10`, `psat8_9`). `tools/test_sync_catalog.mjs` and `tools/test_worker.mjs` test the bidirectional sync logic and worker endpoints.

## Deployment & Infrastructure

For details on static asset cache coordination, Cloudflare Worker secrets, and Cloudflare D1 question catalog ingestion, see [DEPLOYMENT.md](DEPLOYMENT.md).

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
