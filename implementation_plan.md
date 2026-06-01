# Implementation Plan: Batch Feature Updates (Sevrony)

This plan details the technical steps to achieve the requested 10 features for the local SAT application, ensuring offline capabilities, security, and an enhanced UX.

## 1. iOS `.sat-test` Import Fix
**Issue**: iOS WebKit strictly filters custom file extensions without known MIME types.
**Solution**: Update `index.html`.
- Modify the file input: `<input id="fileInput" type="file" accept=".sat-test,application/json,.json,text/plain,*/*" hidden>`. The `*/*` or `.json` fallback ensures the file picker remains active on iOS devices.

## 2. Full Test Lockdown Mode
**Issue**: Users shouldn't accidentally leave or get distracted during a full simulated test.
**Solution**: Update `app.js`.
- In `startFullTest()`, invoke `document.documentElement.requestFullscreen().catch(e => console.warn(e));`.
- Add a global `beforeunload` listener (`window.addEventListener('beforeunload', handleUnload)`) to show a warning dialog if the user attempts to close the tab while `state.activeTest` is active.
- Remove the listeners and exit fullscreen when the test concludes or the user returns to the dashboard.

## 3. PostHog Analytics & Privacy Policy
**Issue**: Need legal compliance and safe usage tracking.
**Solution**: 
- **PostHog**: Inject the PostHog initialization snippet into the `<head>` of `index.html`.
- **Privacy Policy**: 
  - Create a `renderPrivacy()` function in `app.js` that displays a clean Privacy Policy document stating that question data, responses, and session history remain strictly local via IndexedDB, and only basic anonymous telemetry is sent to PostHog.
  - Update `renderTopbar()` and `renderSupportModal()` to include a link to the Privacy Policy (setting `state.view = "privacy"`).

## 4. Rebranding to "Sevrony"
**Issue**: The app needs a commercial name change without altering its existing descriptions or functionalities.
**Solution**: 
- Replace literal occurrences of the name "SAT Interactive Practice" and "sat-test-app" with "Sevrony" strictly in structural elements (like `<title>`, meta tags, `manifest.json`, topbar brand text).
- **CRITICAL**: Do NOT change the app's descriptions, the onboarding text, the actual functionality, or any explanatory copy regarding what the app does. It remains a local SAT practice tool.

## 5. Real-Time Config Question Count
**Issue**: Changing filters in the "Create New Test" view doesn't immediately reflect the available question pool size.
**Solution**: Update `bindHomeEvents()` in `app.js`.
- Inside the `change` listener for `configForm`, calculate the new count: `const newCount = countFilteredQuestions(state.config);`.
- Directly mutate the DOM element: `document.querySelector('.start-summary strong').textContent = newCount;`. This prevents re-rendering the whole form and losing input focus.

## 6. Khan Academy Style (Immediate Feedback)
**Issue**: Users want immediate validation during custom practice.
**Solution**: Update `app.js`.
- **Config**: Add a toggle in `renderTestConfig()` for "Immediate Feedback Mode" mapped to `state.config.immediateFeedback`.
- **Test UI**: In `renderQuestionScreen()`, if `immediateFeedback` is active, render a "Submit" button instead of "Next".
- **Action**: Add a new `data-test-action="submit-answer"`. When clicked:
  - Validate the answer and highlight the correct/incorrect choices.
  - Reveal the `rationale` (explanation) div below the question.
  - Stop the `currentQuestionStartedAt` timer to lock in the time spent.
  - Swap the "Submit" button to a "Next" button.

## 7. Topbar Backup Reorganization
**Issue**: The "Import .sat-test" button is redundant on the dashboard, and Backup needs prominence.
**Solution**: Update `app.js`.
- **Topbar**: Remove the "Import" button from `renderTopbar()` and add a "Data & Backups" button (linked to `data-action="backup"`).
- **Views**: Extract the automatic and manual backup UI sections from `renderDashboard()` into a dedicated `renderBackupView()`.
- **Routing**: Clicking the backup button sets `state.view = "backup"` and calls `renderHome()`.

## ~~8. Sticky Notices/Messages~~
**Issue**: Error/Success toasts disappear if scrolled down.
**Solution**: Update `styles.css`.
- Modify `.notice` to use `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; box-shadow: var(--shadow-lg);`. 
- Ensure it overlays nicely over the UI regardless of scroll depth.

## 9. Modern Page Transitions (Context, Drill, Continuity)
**Issue**: The UI feels static and jumps between views.
**Solution**: Implement specific View Transitions using CSS and `document.startViewTransition`.
- **Context Transition**: Used when switching between top-level tabs (e.g., Dashboard to Past Tests). Implemented via a sliding fade animation applied to the `<main>` container.
- **Drill Transition**: Used when going deeper into a hierarchy (e.g., Dashboard -> Review Session, or Start Test), as well as progressing forward in the initial setup (Marketing Page -> Onboarding Wizard -> Main Dashboard). The new content slides in from the right/bottom while the old content scales down slightly and fades.
- **Continuity Transition**: Used for shared elements (like the Topbar or persistent headers) staying in place while the rest of the page morphs. We will use CSS `view-transition-name` on these persistent elements so the browser morphs them cleanly instead of fading them out.

## 10. UI/UX Pro Max Principles & Responsiveness
**Issue**: The app needs a modern, polished aesthetic that works flawlessly across all screen sizes (mobile, tablet, desktop).
**Solution**: 
- I will ingest and strictly follow any UI/UX "skills" or prompt instructions you provide (e.g., 21st.dev style, shadcn aesthetics).
- **CRITICAL**: Before applying any changes, I will ensure they use relative units (`rem`, `%`), flexible CSS grids/flexbox, and media queries to ensure 100% responsiveness. Mobile and tablet layouts will not be broken.
- Refinements will include softening border radii, subtle hover states, improved typography contrast, and ensuring touch-targets remain large enough for iOS/Android users.