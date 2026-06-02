# Sevrony

Sevrony is a browser-based SAT practice environment for imported `.sat-test` question banks. It runs as a static frontend on GitHub Pages and stores your practice data in your browser.

> **Disclaimer:** Sevrony is a personal educational project. It is not affiliated with, endorsed by, or associated with College Board. SAT is a trademark registered by College Board. This repository does not distribute, contain, or host any College Board question content. It is designed solely to provide a practice environment using the user's own authenticated data.

> **Required input:** Sevrony is a sub-application and is NOT functional on its own. It strictly requires a `.sat-test` question bank file, which must be exported using the [sat-qb-exporter](https://github.com/sharthak-sev/sat-qb-exporter) Chrome extension directly from your own authenticated College Board Student Question Bank session.

## What It Does

- Import `.sat-test` files and keep the question bank in IndexedDB.
- Run custom single-subject practice with optional immediate feedback.
- Run a full adaptive-style test flow with Reading and Writing, break, and Math modules.
- Review past tests, explanations, timing, skipped questions, and mistakes.
- Retry questions you previously missed or skipped.
- Back up and restore your local data with manual JSON exports or the File System Access API where supported.
- Install as a PWA on supported browsers.

## Use The App

1. Install or load the [sat-qb-exporter](https://github.com/sharthak-sev/sat-qb-exporter) extension.
2. Export your question bank as an interactive `.sat-test` file directly from your College Board Student Question Bank session.
3. Open [Sevrony on GitHub Pages](https://sharthak-sev.github.io/Sevrony/).
4. Import the `.sat-test` file.
5. Start a custom practice session or a full adaptive-style test.

On iOS, the file picker may not show custom `.sat-test` files unless the app accepts broader file types. Sevrony intentionally keeps a broad file picker accept value for compatibility, then validates the selected file after import.

## Privacy And Telemetry

Sevrony is local-first, not server-backed. Imported questions, answer history, timings, sessions, and backups are stored in your browser or in files/folders you choose.

The hosted GitHub Pages app also includes optional telemetry:

- Telemetry is off until you accept the privacy/telemetry banner.
- If accepted, Sevrony loads PostHog for minimal usage events and Sentry for error/question reports.
- Autocapture and session recording are disabled.
- Telemetry events avoid file names, answers, question text, rationales, and exact scores.
- If you decline telemetry, the practice app still works. Question reports become manual/local instead of being sent through Sentry.

Your telemetry choice is stored in `localStorage` as `sevrony.telemetryConsent`.

## Network And Offline Behavior

The core app is a static site and caches its own files with a service worker after first load. However, the hosted page still uses some remote assets:

- Google Fonts for typography.
- KaTeX from jsDelivr for math rendering.
- Tailwind Play CDN for marketing/onboarding utility classes.
- Desmos for the graphing calculator.
- Ko-fi image assets in the support section.
- PostHog and Sentry only after telemetry consent.

Because of those remote assets, "offline" should be understood as best-effort core app caching, not a guarantee that every visual asset or online-only feature will work without network access. Your imported study data remains local in your browser.

## Run Locally

Serve the repository with any static server:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

Opening `index.html` directly with `file://` may work for basic use, but service workers and the File System Access API require a proper local or hosted origin.

## Browser Notes

- **Chrome / Edge:** Best support, including the File System Access API for automatic backup folders.
- **Brave:** The File System Access API may be disabled by default. Enable it in `brave://flags/#file-system-access-api` if you want automatic folder backups.
- **Firefox:** Manual JSON backup and restore should work, but the File System Access API is not available.
- **iOS / iPadOS:** Import works best through the broad file picker compatibility path. PWA and storage behavior may vary by Safari/iOS version.

## Data Safety

`.sat-test` files can include answer keys and explanations. Treat them as private study material. Do not publish or redistribute exported question banks.

Use **Data & Backups** in the app to download a manual backup before clearing browser data, changing devices, or experimenting with browser storage settings.

## Support

If Sevrony helps you, you can support the project here:

[Ko-fi: sevrony](https://ko-fi.com/sevrony)

<img src="qr.png" alt="Payment QR Code" width="250"/>

UPI ID: `sharthak-jaiswal@fam`

## License

Sevrony is released under the [MIT License](LICENSE). It is provided as-is, without warranty.
