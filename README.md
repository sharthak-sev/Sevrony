# Sevrony

Sevrony is a local-first SAT practice app for question banks that you import yourself. It runs in the browser, stores practice data in IndexedDB, and can optionally sync that data through your own Google Drive.

> **Disclaimer:** Sevrony is a personal educational project and is not affiliated with, endorsed by, or associated with College Board. SAT is a College Board trademark. This repository does not distribute or host College Board question content.

## What it does

- Import `.sat-test` question banks and Bluebook result exports.
- Run custom Math, Reading & Writing, full-test, and retry-mistakes practice sessions.
- Review answers, timings, mistakes, custom tags, highlights, and personal notes.
- Track practice history, accuracy, pacing, and streaks locally.
- Build vocabulary with spaced repetition, flashcards, multiple choice, matching, and AI-assisted sentence checks.
- Export and restore local backups.
- Optionally sync question banks, progress, responses, study state, and vocabulary progress across devices through Google Drive.
- Install as a PWA with best-effort offline access after the app has been loaded once.

## Getting started

1. Open [Sevrony](https://sharthak-sev.github.io/).
2. Read and accept the in-app Privacy Policy. Acceptance is required before importing, restoring a backup, or linking Google Drive.
3. Import a `.sat-test` file, or import a supported Bluebook result export from Past Tests.
4. Start a practice session from the dashboard, or use the Vocabulary section without importing a question bank.

Sevrony accepts broad file types in its picker for iOS compatibility, but validates the file contents during import.

## Data and privacy

### Local data

Practice data is stored in this browser's IndexedDB database. This includes imported questions, sessions, responses, highlights, notes, configuration, and vocabulary progress.

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
- The app performs timestamp-based bidirectional merges. Vocabulary uses progress-aware conflict resolution so mastered words are not accidentally downgraded.
- Sync runs after local changes, when the app becomes visible, and while a visible tab has a valid cached Google token.
- Unlinking stops sync and removes local OAuth metadata; it does not delete either local data or the Drive file.

Cloud sync is not a replacement for backups. Download a backup before clearing browser data or moving devices.

## Offline behavior

The service worker uses a network-first cache fallback and precaches the main application files, including the IndexedDB migration worker. Imported data stays local, so previously loaded study data can remain usable offline.

Some features still need the network:

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

## Deployment

### Static app

Deploy the repository's static app files to the host that serves `index.html` (currently GitHub Pages). `db-worker.js` must be deployed beside `db.js`; it is a browser worker, not a Cloudflare Worker.

When updating the app, deploy the matching `index.html`, `sw.js`, `db.js`, `db-worker.js`, `sync.js`, `vocab.js`, and `app.js` together so the versioned service-worker cache remains consistent.

### Cloudflare Worker

`cloudflare-worker.js` is a separate server-side Worker used for privacy-consent acknowledgement, feedback submission, and AI vocabulary sentence validation. Deploy it to Cloudflare when changing that file and configure its required secrets there (for example, Turnstile and Gemini credentials). Never place those secrets in this repository or the static frontend.

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
