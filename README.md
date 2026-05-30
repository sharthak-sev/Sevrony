# SAT Interactive Practice App (Sub-App)

> **Disclaimer**: This project is a personal educational tool and is **not affiliated with, endorsed by, or associated with College Board**. SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this product. This tool does not distribute, contain, or host any College Board content. It is designed solely to provide an offline practice environment using the user's own authenticated data.

> [!WARNING]
> **This is a sub-application and is NOT functional on its own.**  
> It strictly requires a `.sat-test` question bank file, which must be saved using the **sat-qb-exporter** Chrome extension from your own authenticated College Board session.

This is a standalone, offline, frontend-only practice environment designed to simulate a testing experience similar to the official format using your exported question banks.

## Key Features

- **PWA Ready**: Install the app directly to your device (Windows, macOS, iOS, Android) for a native, fullscreen experience. Once loaded, it works completely offline via Service Workers.
- **Gamification & Streaks**: Stay motivated by tracking your daily practice streaks and visualizing your activity on the dashboard.
- **In-App Issue Reporting**: Flag broken or poorly formatted questions directly from the test review screen to help improve the question bank. *(Note: Please disable ad-blockers like uBlock Origin or Brave Shields when using the app, as they often block the reporting telemetry).*
- **Adaptive Testing**: Simulate the official digital SAT with adaptive routing based on your performance in Module 1.
- **Targeted Practice**: Generate custom tests focusing on specific subjects, or use the "Retry Mistakes" feature to focus on your weak points.

## Workflow

1. Use the [sat-qb-exporter](https://github.com/sharthak-sev/sat-qb-exporter) extension to save questions from your College Board account and click **Export as Interactive Test** to save a `.sat-test` file.
2. Open this app. [sat-test-app](https://sharthak-sev.github.io/sat-test-app/)
3. Click **Import .sat-test** and load the exported file.
4. Use **Create New Test** to start either:
   - **Custom Practice**: Single-subject practice focusing on specific areas with a per-question count-up timer.
   - **Full Adaptive Test**: Full test simulation with RW Module 1, adaptive RW Module 2, a 10-minute break, Math Module 1, and adaptive Math Module 2 (scoring uses a custom item response approximation).
5. Use **Retry Mistakes** to selectively practice only the questions you've previously gotten wrong or skipped.
6. Use **Past Tests** to review completed sessions, track time analytics per-question, and read explanations.

## Run Locally

Open `index.html` in a browser, or serve this folder with any static server:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

No build step, package install, accounts, or backend servers are required. **Everything is strictly offline.**

## Cross-Platform Advantage

Unlike the official Bluebook app which is restricted to Windows, Mac, and specific managed iPads/Chromebooks, this web-based app **runs flawlessly on almost any device with a modern browser**:

- **Windows & macOS**
- **Linux** (Fun fact: this app was developed entirely on Linux!)
- **Android & iOS** (Tablets and smartphones)
- **ChromeOS** (Even unmanaged personal Chromebooks)

Because it runs directly in your browser without requiring installation, you can practice the SAT anywhere, on any device you own.

## Browser Compatibility & Automatic Backups

The app features an **Automatic Backups** system that silently saves your progress to a chosen folder on your hard drive after every test. This relies on the **File System Access API**.

- **Chrome / Edge**: Supported natively.
- **Brave**: This powerful API is disabled by default for privacy reasons. To enable it in Brave, type `brave://flags/#file-system-access-api` into your address bar, set it to **Enabled**, and restart your browser.
- **Firefox**: The API is currently unsupported.
- **Local Files (`file://`)**: Browsers block the API for raw local files. If you aren't using the live GitHub Pages link, you must run the app using a local server (e.g. `python3 -m http.server`) to use this feature.

If you cannot enable the API, you can always use the **Manual Transfer** section to manually download a `.json` backup of your progress to move between devices or prevent data loss.

## Data & Privacy

This app relies entirely on frontend technologies (HTML, CSS, JS) and uses **IndexedDB (Dexie.js)** to store all user history, question banks, and analytics locally on your device.

- `.sat-test` files include answer keys so the app can score your practice. **Treat exported files as private study material.** Do not distribute them.
- Your test history, timings, and custom practice data never leave your browser.
- Use the **Danger Zone** on the dashboard to wipe all stored local data at any time.

## Support This Project

If you found this tool helpful for your SAT prep, consider supporting the author! ❤️

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/sevrony)

<img src="qr.png" alt="Payment QR Code" width="250" style="border-radius: 8px; border: 1px solid #ddd; margin: 10px 0;">

**UPI ID**: `sharthak-jaiswal@fam`

## License

This project is open-sourced under the [MIT License](LICENSE). It is provided "AS IS" without warranty of any kind.
