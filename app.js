(function () {
  "use strict";

  /** Catalog ids, in the order the picker offers them. */
  const CATALOGS = ["sat", "psat10", "psat8_9"];
  const DEFAULT_CATALOG = "sat";
  const LOCAL_CATALOG = "local";

  const CATALOG_LABELS = {
    sat: "SAT®",
    psat10: "PSAT/NMSQT® and PSAT™ 10",
    psat8_9: "PSAT™ 8/9"
  };

  const CATALOG_SHORT_LABELS = {
    sat: "SAT",
    psat10: "PSAT 10",
    psat8_9: "PSAT 8/9"
  };

  const CATALOG_QUESTION_COUNT_LABELS = {
    sat: "2,900+",
    psat10: "2,900+",
    psat8_9: "2,500+"
  };

  const CATALOG_DETAILS = {
    sat: {
      id: "sat",
      shortLabel: "SAT",
      label: "SAT®",
      fullTitle: "Digital SAT®",
      gradeLevel: "11th–12th Grade",
      countLabel: "2,900+",
      countChip: "2.9k",
      badge: "Official"
    },
    psat10: {
      id: "psat10",
      shortLabel: "PSAT 10",
      label: "PSAT/NMSQT® and PSAT™ 10",
      fullTitle: "PSAT/NMSQT® & PSAT™ 10",
      gradeLevel: "10th–11th Grade",
      countLabel: "2,900+",
      countChip: "2.9k",
      badge: "NMSQT"
    },
    psat8_9: {
      id: "psat8_9",
      shortLabel: "PSAT 8/9",
      label: "PSAT™ 8/9",
      fullTitle: "PSAT™ 8/9",
      gradeLevel: "8th–9th Grade",
      countLabel: "2,500+",
      countChip: "2.5k",
      badge: "Foundation"
    }
  };

  const APP_VERSION = "v2.4.0";
  const DB = window.SatPracticeDB;
  const app = document.querySelector("#app");
  const fileInput = document.querySelector("#fileInput");
  const TELEMETRY_CONSENT_KEY = "sevrony.telemetryConsent";
  const TELEMETRY_ACCEPTED = "accepted";

  const POSTHOG_TOKEN = "phc_sChR2EdGVdwA9yins4d7MeNqiHUqEiicXcTtM3DZ7cPn";
  const POSTHOG_API_HOST = "https://us.i.posthog.com";
  const SENTRY_LOADER_URL = "https://js.sentry-cdn.com/610da841a6875eae790cbc1fd6ea96b1.min.js";
  const COLLEGE_BOARD_BASE_URL = "https://mypractice.collegeboard.org/";
  const TUTORIAL_DONE_KEY = "sevrony.tutorial.v1.done";

  // Vocabulary can be used without importing an SAT question bank. Keep an
  // in-progress vocab session out of the question-bank onboarding flow.
  function hasActiveVocabSession() {
    return Boolean(window.Vocab?.isSessionActive?.());
  }

  function hasRestorablePracticeData() {
    return state.questions.length > 0 || state.sessions.length > 0 || hasActiveVocabSession();
  }

window.handleSkillCheckboxChange = function(cb) {
    const skill = cb.value;
    const container = cb.closest('div').parentElement;
    const btn = container.querySelector('button[data-action="toggle-skill-limit"]');
    const limitDiv = container.querySelector('div[id^="limit_"]');
    if (cb.checked) {
        if (btn) { btn.style.display = "inline-block"; btn.textContent = '+'; }
    } else {
        if (btn) { btn.style.display = "none"; btn.textContent = '+'; }
        if (limitDiv) {
            limitDiv.style.display = "none";
            const input = limitDiv.querySelector('input');
            if (input) input.value = "";
        }
        if (state && state.showSkillLimits) state.showSkillLimits[skill] = false;
    }
    window.updateSelectAllButtons();
};

window.updateSelectAllButtons = function() {
    const skills = Array.from(document.querySelectorAll('input[name="skill"]'));
    if (!skills.length) return;
    const allChecked = skills.every(cb => cb.checked);
    const noneChecked = skills.every(cb => !cb.checked);
    
    document.querySelectorAll('[data-action="select-all-skills"]').forEach(btn => {
        btn.style.display = allChecked ? "none" : "inline-block";
    });
    document.querySelectorAll('[data-action="deselect-all-skills"]').forEach(btn => {
        btn.style.display = noneChecked ? "none" : "inline-block";
    });
};


  function isDemoMode() {
    return localStorage.getItem("sat_demo_mode") === "true";
  }
  const TUTORIAL_STEPS = [
    {
      selector: "[data-tour-target='dashboard-hero']",
      title: "Your dashboard",
      body: "This is the command center for your practice sessions, accuracy, and weak areas. Let's get you familiar with it."
    },
    {
      selector: "[data-tour-target='create-test']",
      title: "Start practice",
      body: "Create adaptive drills or full sections from your imported SAT question bank. Get ready to boost your score!"
    },
    {
      selector: "[data-tour-target='metrics']",
      title: "Track what changed",
      body: "These cards update automatically from completed sessions, so you always know where you stand."
    },
    {
      selector: "[data-tour-target='mistakes-log-nav']",
      title: "Master your mistakes",
      body: "Use the Mistakes Log to review missed questions, add custom tags, and write personal notes to improve."
    },
    {
      selector: "[data-tour-target='vocab-nav']",
      title: "Build your vocabulary",
      body: "Practice high-frequency SAT vocabulary using our smart spaced-repetition system."
    },
    {
      selector: "[data-tour-target='history-nav']",
      title: "Review past work",
      body: "Past Tests keeps full tests, Bluebook imports, reviews, retries, and deletion controls in one place."
    },
    {
      selector: "[data-tour-target='sync'], [data-tour-target='backup-nav']",
      title: "Sync and backups",
      body: "Link your Google Drive to sync your progress across devices, or restore data anytime from Data & Backups."
    }
  ];

  const SUBJECTS = {
    math: "Math",
    rw: "Reading and Writing"
  };

  const DIFFICULTIES = {
    E: "Easy",
    M: "Medium",
    H: "Hard"
  };

  const DOMAIN_FALLBACKS = {
    math: [
      { code: "H", label: "Algebra" },
      { code: "P", label: "Advanced Math" },
      { code: "Q", label: "Problem-Solving and Data Analysis" },
      { code: "S", label: "Geometry and Trigonometry" }
    ],
    rw: [
      { code: "INI", label: "Information and Ideas" },
      { code: "CAS", label: "Craft and Structure" },
      { code: "EOI", label: "Expression of Ideas" },
      { code: "SEC", label: "Standard English Conventions" }
    ]
  };

  const FULL_TEST = {
    rw: { seconds: 32 * 60, size: 27 },
    math: { seconds: 35 * 60, size: 22 },
    breakSeconds: 10 * 60,
    adaptiveThreshold: 0.6
  };

  /* ---- Phase 1: 7-band difficulty → IRT b-value mapping ---- */
  const SCORE_BAND_DIFFICULTY = {
    1: -2.5, 2: -1.67, 3: -0.83, 4: 0.0, 5: 0.83, 6: 1.67, 7: 2.5
  };

  /* ---- Phase 2/6: Route-aware score ceiling ---- */
  const LOWER_ROUTE_CEILING = 620;

  /* ---- Phase 3: Content domain question blueprints (per module) ---- */
  const MODULE_BLUEPRINT = {
    rw: { INI: 7, CAS: 7, EOI: 6, SEC: 7 },
    math: { H: 8, P: 7, Q: 4, S: 3 }
  };

  /* ---- Phase 7: Module 1 difficulty distribution ---- */
  const MODULE1_DIFFICULTY_MIX = {
    rw: { E: 9, M: 9, H: 9 },
    math: { E: 7, M: 8, H: 7 }
  };

  /* ---- SAT Math Reference Sheet formulas ---- */
  const REFERENCE_FORMULAS = [
    { section: "Circles", formulas: [
      { label: "Area of a circle", tex: "A = \\pi r^2" },
      { label: "Circumference", tex: "C = 2\\pi r" },
      { label: "Arc length", tex: "\\text{arc} = \\frac{x}{360} \\cdot 2\\pi r" },
    ]},
    { section: "Rectangles & Triangles", formulas: [
      { label: "Area of a rectangle", tex: "A = lw" },
      { label: "Area of a triangle", tex: "A = \\frac{1}{2}bh" },
      { label: "Pythagorean theorem", tex: "a^2 + b^2 = c^2" },
    ]},
    { section: "Special Right Triangles", formulas: [
      { label: "45-45-90 triangle", tex: "x,\\; x,\\; x\\sqrt{2}" },
      { label: "30-60-90 triangle", tex: "x,\\; x\\sqrt{3},\\; 2x" },
    ]},
    { section: "Volume", formulas: [
      { label: "Rectangular prism", tex: "V = lwh" },
      { label: "Cylinder", tex: "V = \\pi r^2 h" },
      { label: "Sphere", tex: "V = \\frac{4}{3}\\pi r^3" },
      { label: "Cone", tex: "V = \\frac{1}{3}\\pi r^2 h" },
      { label: "Pyramid", tex: "V = \\frac{1}{3}lwh" },
    ]},
    { section: "Radians & Degrees", formulas: [
      { label: "Radians in a circle", tex: "2\\pi \\text{ radians} = 360°" },
    ]},
  ];

  const KEYBOARD_SHORTCUTS = [
    { action: "Open/Close Keyboard Shortcuts", shortcut: "F1" },
    { action: "Close overlays", shortcut: "Escape" },
    { action: "Next / Submit current question", shortcut: "Enter, ArrowRight, or Control + Alt + X" },
    { action: "Back one question in full tests", shortcut: "ArrowLeft or Control + Alt + B" },
    { action: "Mark for Review", shortcut: "Alt + P" },
    { action: "Mark for Review", shortcut: "M or Control + Alt + V" },
    { action: "Open/Close Calculator", shortcut: "Alt + C or Control + Alt + C" },
    { action: "Open/Close Reference Sheet", shortcut: "Control + Alt + R" },
    { action: "Hide/Show Timer", shortcut: "Alt + T or Control + Alt + T" },
    { action: "Select option A-D", shortcut: "A, B, C, D" },
    { action: "Select option A-D", shortcut: "Control + Shift + 1-4" },
    { action: "Cross out option A-D", shortcut: "Control + Alt + 1-4" }
  ];

  /* ===========================================================
     STATE & INITIALIZATION
     =========================================================== */

  let sessionBubbleDismissed = false;
  const state = {
    banks: [],
    questions: [],
    sessions: [],
    responses: [],
    // Ids of the sessions belonging to the active catalog. Recomputed once per
    // refreshLocalData() rather than derived per render.
    activeSessionIds: new Set(),
    backupHandle: null,
    backupMessage: null,
    view: "dashboard",
    historyTab: "full",
    activeCatalog: readActiveCatalog(),
    reviewSessionId: null,
    mistakesSessionId: null,
    reviewFilterIncorrect: false,
    reviewFilterSkipped: false,
    selectedMistakeDomains: null,
    selectedMistakeTypes: null,
    notice: null,
    telemetryConsent: readTelemetryConsent(),
    telemetryLoading: null,
    config: {
      subject: "math",
      domainCodes: [],
      skillCodes: [],
      difficulties: ["E", "M", "H"],
      excludeAnswered: true,
      limit: 20
    },
    activeTest: null,
    lastResult: null,
    ticker: null,
    transitionLocked: false,
    eliminatedChoices: {},
    showDesmos: false,
    showRefSheet: false,
    showShortcuts: false,
    showSupport: false,
    showAdvancedDomains: false,
    showPacingConfig: false,
    pacingConfig: null,
    showAdvancedMistakeSkills: false,
    busy: null,
    tutorial: {
      active: false,
      step: 0,
      previousFocus: null
    },
    questionStudyState: {},
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // Lockdown Mode Utilities
  function enterFullscreen() {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function handleVisibilityChange() {
    if (state.activeTest?.mode === "full" && document.hidden) {
      const test = state.activeTest;
      test.infractions = (test.infractions || 0) + 1;
      persistActiveTest();
      showNotice(`Warning: You left the test window during a Full Test. (Infraction ${test.infractions})`, "error");
      renderActiveTest();
    }
  }

  function handleBeforeUnload(e) {
    if (state.activeTest?.mode === "full") {
      e.preventDefault();
      e.returnValue = "";
    }
  }

  async function init() {
    if (window.location.search.includes("demo=true")) {
      try {
        const loading = document.getElementById("initial-loading");
        if (loading) loading.style.display = "flex";
        localStorage.setItem("sat_demo_mode", "true");
        const res = await fetch("demo-state.json?t=" + Date.now());
        const demoState = await res.json();
        await window.SatPracticeDB.clearAll();
        if (demoState.questionBanks) await window.SatPracticeDB.putMany("questionBanks", demoState.questionBanks);
        if (demoState.questions) await window.SatPracticeDB.putMany("questions", demoState.questions);
        if (demoState.sessions) await window.SatPracticeDB.putMany("sessions", demoState.sessions);
        if (demoState.responses) await window.SatPracticeDB.putMany("responses", demoState.responses);
        if (demoState.vocabWords) await window.SatPracticeDB.putMany("vocabWords", demoState.vocabWords);
        if (demoState.appConfig) await window.SatPracticeDB.putMany("appConfig", demoState.appConfig);
        localStorage.removeItem("sevrony.tutorial.v1.done");
        localStorage.removeItem("sat_vocab_state");
        // Clear any leftover Google auth state for a clean sandbox
        if (window.SevSync) {
            try { await window.SevSync.unlink(); } catch (_) {}
        }
        const url = new URL(window.location);
        url.searchParams.delete("demo");
        window.history.replaceState({exit_demo: true}, document.title, url);
        state._justEnteredDemo = true;
      } catch (e) {
        console.error("Failed to load demo state:", e);
      }
    }

    if (isDemoMode()) {
        const banner = document.createElement("div");
        banner.className = "demo-banner";
        banner.innerHTML = `
            <div class="demo-banner-content">
                <div class="demo-indicator">
                    <span class="pulse-dot"></span>
                    <span class="demo-label">Demo Mode</span>
                </div>
                <span class="demo-text">Ready for the real thing?</span>
            </div>
            <button id="exit-demo-btn">Get Started</button>
        `;
        document.body.appendChild(banner);
        document.getElementById("exit-demo-btn").addEventListener("click", async () => {
            await window.SatPracticeDB.clearAll();
            localStorage.removeItem("sat_demo_mode");
            localStorage.removeItem("sat_vocab_state");
            localStorage.removeItem("sevrony.tutorial.v1.done");
            // Clear Google auth state to prevent data leak
            if (window.SevSync) {
                try { await window.SevSync.unlink(); } catch (_) {}
            }
            window.location.replace(window.location.pathname);
        });
    }

    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    window.addEventListener("pageshow", (e) => {
      if (e.persisted) {
        window.location.reload();
      }
    });

    window.addEventListener("popstate", (e) => {
      if (e.state && e.state.exit_demo) {
        window.SatPracticeDB.clearAll().then(() => {
          localStorage.removeItem("sat_demo_mode");
          localStorage.removeItem("sat_vocab_state");
          localStorage.removeItem("sevrony.tutorial.v1.done");
          if (window.SevSync) window.SevSync.unlink();
          window.history.back();
          setTimeout(() => {
            window.location.replace(window.location.pathname);
          }, 100);
        });
        return;
      }
      if (state.tutorial.active) {
        window.history.pushState({view: "dashboard"}, "", window.location.pathname);
        return;
      }
      if (e.state) {
        state.view = e.state.view || "dashboard";
        
        // Enforce tutorial if incomplete (skip enforcement in demo mode — let users explore freely)
        if (localStorage.getItem(TUTORIAL_DONE_KEY) !== "true" && !isDemoMode()) {
           if (state.view !== "marketing" && state.view !== "privacy") {
               if (state.view !== "vocab" || !hasActiveVocabSession()) {
                   state.view = "dashboard";
                   window.history.replaceState({view: "dashboard"}, "", window.location.pathname);
               }
           }
        }
        
        state.reviewSessionId = e.state.reviewSessionId || null;
        state.historyTab = e.state.historyTab || "full";
        state.viewSubject = e.state.viewSubject || null;
        lastPushedStateStr = JSON.stringify(e.state);
        
        // Guard: data was wiped but user pressed back to a data-dependent view.
        // Use pushState (not replaceState) to create a "wall" — each back-press
        // pushes the user forward again, trapping them at the correct view.
        const dataViews = ["dashboard", "history", "config", "mistakes", "mistakes-log", "results", "review"];
        if (state.questions.length === 0 && dataViews.includes(state.view)) {
            state.view = "onboarding";
            window.history.pushState({view: "onboarding"}, "", window.location.pathname);
            renderHome(true);
            return;
        }
        
        // Guard: data exists but stale entry says "onboarding" — user pressed
        // back past the initial setup. Force them to dashboard.
        if (state.questions.length > 0 && state.view === "onboarding") {
            state.view = "dashboard";
            window.history.pushState({view: "dashboard"}, "", "#dashboard");
            renderHome(true);
            return;
        }
        
        if (!state.activeTest) renderHome(true);
      }
    });

    window.addEventListener("hashchange", () => {
      if (state.tutorial.active) return;
      if (window.location.hash) {
        const hashView = window.location.hash.slice(1);
        if (["dashboard", "history", "config", "mistakes", "mistakes-log", "results", "review", "marketing", "privacy", "backup", "vocab", "vocab-mastered"].includes(hashView)) {
           let targetView = hashView;
           
           // Enforce tutorial if incomplete (skip enforcement in demo mode — let users explore freely)
           if (localStorage.getItem(TUTORIAL_DONE_KEY) !== "true" && !isDemoMode()) {
               if (targetView !== "marketing" && targetView !== "privacy") {
                   if (targetView !== "vocab" || !hasActiveVocabSession()) {
                       targetView = "dashboard";
                       window.history.replaceState({view: "dashboard"}, "", window.location.pathname);
                   }
               }
           }
           
           if (state.view !== targetView) {
               state.view = targetView;
               if (!state.activeTest) renderHome(true);
           }
        }
      }
    });

    window.addEventListener("scroll", () => {
      const btn = document.querySelector(".scroll-top-btn");
      if (btn) {
        if (window.scrollY > 300) {
          btn.classList.add("visible");
        } else {
          btn.classList.remove("visible");
        }
      }
    });

    if (window.location.hash) {
      const hashView = window.location.hash.slice(1);
      if (["dashboard", "history", "config", "mistakes", "mistakes-log", "results", "review", "marketing", "privacy", "backup", "vocab", "vocab-mastered"].includes(hashView)) {
         state.view = hashView;
      }
    }
    
    // Enforce tutorial if incomplete on initial load (skip enforcement in demo mode — let users explore freely)
    if (hasActiveVocabSession()) {
        state.view = "vocab";
    }

    if (localStorage.getItem(TUTORIAL_DONE_KEY) !== "true" && !isDemoMode()) {
        if (state.view !== "marketing" && state.view !== "privacy") {
            if (state.view !== "vocab" || !hasActiveVocabSession()) {
                state.view = "dashboard";
                window.history.replaceState({view: "dashboard"}, "", window.location.pathname);
            }
        }
    }

    initPersistentDesmos();
    initTelemetryConsent();
    if (window.Vocab) window.Vocab.init();
    fileInput.addEventListener("change", handleFileImport);
    document.addEventListener("keydown", handleKeyboard);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    
    // Fix native select focus retention in Chrome
    let lastInteractionWasMouse = false;
    document.addEventListener("mousedown", () => lastInteractionWasMouse = true, true);
    document.addEventListener("keydown", () => lastInteractionWasMouse = false, true);
    document.addEventListener("mousedown", (e) => {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === "SELECT" && e.target !== activeEl) {
        activeEl.blur();
      }
    });
    document.addEventListener("change", (e) => {
      if (e.target && e.target.tagName === "SELECT" && lastInteractionWasMouse) {
        e.target.blur();
      }
    });
    
    // Global Drag and Drop support
    document.addEventListener("dragover", e => {
      e.preventDefault();
      const dropZone = document.querySelector(".drop-zone");
      if (dropZone) dropZone.classList.add("drag-active");
    });
    document.addEventListener("dragleave", e => {
      const dropZone = document.querySelector(".drop-zone");
      if (dropZone && e.target === document.body) dropZone.classList.remove("drag-active");
    });
    document.addEventListener("drop", e => {
      e.preventDefault();
      const dropZone = document.querySelector(".drop-zone");
      if (dropZone) dropZone.classList.remove("drag-active");
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event("change"));
      }
    });

    await refreshLocalData();

    // Scrub any contaminated demo data from real accounts (caused by legacy sync bug)
    if (!isDemoMode()) {
        const now = Date.now();
        let scrubbed = false;
        
        const demoSessions = state.sessions.filter(s => s.id.startsWith("session-demo-"));
        if (demoSessions.length > 0) {
            console.log("Scrubbing contaminated demo sessions...");
            demoSessions.forEach(s => { s.deletedAt = now; s.updatedAt = now; });
            await window.SatPracticeDB.putMany("sessions", demoSessions);
            scrubbed = true;
        }

        const demoResponses = state.responses.filter(r => r.id.startsWith("session-demo-"));
        if (demoResponses.length > 0) {
            console.log("Scrubbing contaminated demo responses...");
            demoResponses.forEach(r => { r.deletedAt = now; r.updatedAt = now; });
            await window.SatPracticeDB.putMany("responses", demoResponses);
            scrubbed = true;
        }

        if (scrubbed) {
            await refreshLocalData();
            if (window.SevSync && window.SevSync.isLinked()) {
                window.SevSync.sync(false, { silent: true });
            }
        }
    }

    await restoreActiveTest();
    ensureConfigDefaults();

    // Cloud sync: register for background sync updates from other devices
    // Entirely disabled in demo mode to prevent encryption key / consent race conditions
    if (window.SevSync && !isDemoMode()) {
      SevSync.onUpdate(() => {
        refreshLocalData().then(() => renderHome());
      });
      SevSync.onStateChange(() => {
        const wrappers = document.querySelectorAll('.sync-status-wrapper');
        if (wrappers.length > 0) {
          for (const wrapper of wrappers) {
            wrapper.outerHTML = renderSyncWidget();
          }
        } else {
          const widgets = document.querySelectorAll('.sync-status-container');
          for (const widget of widgets) {
            widget.outerHTML = renderSyncWidget();
          }
        }
        const newWrappers = document.querySelectorAll('.sync-status-wrapper');
        for (const newWrapper of newWrappers) {
          for (const btn of newWrapper.querySelectorAll("[data-action]")) {
            btn.addEventListener("click", handleHomeAction);
          }
        }
      });
    }
    // Auto cloud-sync on open (best-effort, non-blocking)
    if (window.SevSync?.isLinked() && !isDemoMode()) {
      SevSync.sync(false, { silent: true }).then(result => {
        if (result.ok && result.localChanged) {
          // A sync from another device brings the catalog bank record across
          // but not its questions, which this device then has to fetch itself.
          refreshLocalData().then(() => { renderHome(); resumeCatalogIfNeeded(); });
        }
      });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const debugQid = urlParams.get('debug');
    if (debugQid) {
      const q = state.questions.find(x => x.id === debugQid || x.externalId === debugQid || x.questionId === debugQid);
      if (q) {
        startCustomPractice({ subject: q.subject, domainCodes: [], difficulties: [], limit: 1, excludeAnswered: false }, [q]);
        return;
      } else {
        state.notice = { type: "error", text: "Debug question not found in your local test banks. Import the bank first." };
      }
    }

    if (state.activeTest) {
      renderActiveTest();
    } else {
      state.reviewSessionId = sessionStorage.getItem('reviewSessionId') || null;
      state.historyTab = sessionStorage.getItem('historyTab') || "full";
      state.viewSubject = sessionStorage.getItem('viewSubject') || null;

      const activeSessions = getActiveSessions();
      const fullTests = activeSessions.filter(s => s.mode === "full" || s.mode === "bluebook");
      const subjectTests = activeSessions.filter(s => s.mode !== "full" && s.mode !== "bluebook");
      if (fullTests.length === 0 && subjectTests.length > 0) {
        state.historyTab = "subject";
      }

      const lastResultSessionId = sessionStorage.getItem('lastResultSessionId');
      if (lastResultSessionId) {
        const session = state.sessions.find(s => s.id === lastResultSessionId);
        if (session) {
          const sessionResponses = state.responses.filter(r => r.sessionId === lastResultSessionId);
          state.lastResult = { session, responses: sessionResponses };
        }
      }
      
      if (state.view === "results" && !state.lastResult) {
        state.view = "dashboard";
      }
      renderHome(false, !state._justEnteredDemo);
      delete state._justEnteredDemo;
      maybeStartTutorial();

      // Deliberately not awaited: the dashboard is already painted, and in the
      // common case this is a single /api/catalog/meta request that changes
      // nothing. Skipped while a test is in progress so a resumed download can
      // never put a busy overlay over someone's timed section.
      resumeCatalogIfNeeded();
    }
  }

  async function initPersistentDesmos() {
    let container = document.getElementById("persistent-desmos");
    if (container) return;

    container = document.createElement("div");
    container.id = "persistent-desmos";
    container.style.display = "none";
    
    container.innerHTML = `
      <div class="desmos-drag-header" id="desmos-drag-handle">
        <strong>Graphing Calculator</strong>
        <button class="overlay-close" type="button" data-test-action="close-desmos">✕</button>
      </div>
      <div id="desmos-calculator-inner"></div>
    `;
    document.body.appendChild(container);

    const header = container.querySelector("#desmos-drag-handle");
    let isDragging = false, startX, startY, initialLeft, initialTop;
    header.addEventListener("mousedown", e => {
      if (e.target.tagName.toLowerCase() === 'button') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", e => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      container.style.left = `${initialLeft + dx}px`;
      container.style.top = `${initialTop + dy}px`;
      container.style.bottom = "auto";
      container.style.right = "auto";
      container.style.transform = "none";
    });
    window.addEventListener("mouseup", () => {
      isDragging = false;
      document.body.style.userSelect = "";
    });

    // Touch support for mobile drag (desktop only — mobile uses full-screen)
    header.addEventListener("touchstart", e => {
      if (e.target.tagName.toLowerCase() === 'button') return;
      if (window.matchMedia('(max-width: 920px)').matches) return; // full-screen on mobile
      const touch = e.touches[0];
      isDragging = true;
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
    }, { passive: true });
    window.addEventListener("touchmove", e => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      container.style.left = `${initialLeft + dx}px`;
      container.style.top = `${initialTop + dy}px`;
      container.style.bottom = "auto";
      container.style.right = "auto";
      container.style.transform = "none";
    }, { passive: true });
    window.addEventListener("touchend", () => {
      isDragging = false;
    });

    container.querySelector("[data-test-action='close-desmos']").addEventListener("click", () => {
      state.showDesmos = false;
      container.style.display = "none";
      if (state.activeTest) renderActiveTest();
    });

    const script = document.createElement("script");
    script.src = "https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6";
    script.onload = () => {
      const inner = document.getElementById("desmos-calculator-inner");
      if (window.Desmos) window.Desmos.GraphingCalculator(inner, { expressions: true, settingsMenu: false });
    };
    document.head.appendChild(script);
  }

  function initTelemetryConsent() {
    if (isTelemetryAccepted()) {
      enableTelemetry();
    }
    renderTelemetryBanner();
  }

  function readTelemetryConsent() {
    try {
      const value = localStorage.getItem(TELEMETRY_CONSENT_KEY);
      return value === TELEMETRY_ACCEPTED ? value : null;
    } catch (_) {
      return null;
    }
  }

  function isTelemetryAccepted() {
    return state.telemetryConsent === TELEMETRY_ACCEPTED;
  }

  function requirePrivacyConsent() {
    if (isDemoMode() || DB.hasConsent?.()) return true;
    showNotice("Accept the Privacy Policy before importing data or connecting cloud sync.", "error");
    renderTelemetryBanner();
    return false;
  }

  function setTelemetryConsent(value) {
    if (value !== TELEMETRY_ACCEPTED) return;
    state.telemetryConsent = value;
    try {
      localStorage.setItem(TELEMETRY_CONSENT_KEY, value);
    } catch (_) { /* ignore storage failures */ }

    if (value === TELEMETRY_ACCEPTED) {
      enableTelemetry();
    } else if (window.posthog?.opt_out_capturing) {
      window.posthog.opt_out_capturing();
    }
    renderTelemetryBanner();
  }

  function resetTelemetryConsent() {
    state.telemetryConsent = null;
    try {
      localStorage.removeItem(TELEMETRY_CONSENT_KEY);
    } catch (_) { /* ignore storage failures */ }
    if (window.posthog?.opt_out_capturing) {
      window.posthog.opt_out_capturing();
    }
    renderTelemetryBanner();
  }

  function renderTelemetryBanner() {
    const existing = document.querySelector(".telemetry-banner");
    if (existing) existing.remove();
    if (state.telemetryConsent || state.view === "privacy" || isDemoMode()) return;

    const banner = document.createElement("section");
    banner.className = "telemetry-banner";
    banner.setAttribute("aria-label", "Privacy Consent");
    banner.innerHTML = `
      <div class="telemetry-content">
        <div>
          <strong>Privacy & Terms</strong>
          <p>By using Sevrony, you agree to our Privacy Policy.</p>
        </div>
        <div class="telemetry-actions">
          <button type="button" class="ghost-btn" data-telemetry-action="details">Read Policy</button>
          <button type="button" class="primary-btn" data-telemetry-action="accept">Accept & Continue</button>
        </div>
      </div>
    `;
    banner.querySelector("[data-telemetry-action='accept']").addEventListener("click", async (e) => {
      const btn = e.target;
      const originalText = btn.textContent;
      btn.textContent = "Verifying...";
      btn.disabled = true;
      
      try {
        const res = await fetch(SevApi.url("/api/consent"), {
          method: "POST"
        });
        if (!res.ok) throw new Error("Verification failed");
        
        const data = await res.json();
        if (data.success) {
          setTelemetryConsent(TELEMETRY_ACCEPTED);
          captureTelemetry("Telemetry Consent Accepted");
          await window.Vocab?.init?.();
          renderHome();
        } else {
          throw new Error("Invalid server response");
        }
      } catch (err) {
        console.error("Consent API error:", err);
        btn.textContent = originalText;
        btn.disabled = false;
        alert("Failed to verify privacy policy consent. Please check your connection and try again.");
      }
    });
    banner.querySelector("[data-telemetry-action='details']").addEventListener("click", () => {
      window.location.hash = "privacy";
    });
    document.body.appendChild(banner);
  }

  function enableTelemetry() {
    if (!isTelemetryAccepted()) return Promise.resolve(false);
    if (state.telemetryLoading) return state.telemetryLoading;
    state.telemetryLoading = Promise.all([loadPostHog(), loadSentry()])
      .then(() => true)
      .catch(err => {
        console.warn("Telemetry failed to load", err);
        return false;
      });
    return state.telemetryLoading;
  }

  function loadPostHog() {
    if (window.posthog?.__loaded) return Promise.resolve(true);

    return new Promise(resolve => {
      if (!window.posthog?._i) {
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="Di ji init en nn Ar tn an Yi capture calculateEventProperties dn register register_once register_for_session unregister unregister_for_session gn getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync mn identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty fn hn createPersonProfile setInternalOrTestUser pn Ji opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing un debug $r vn getPageViewId captureTraceFeedback captureTraceMetric Zi".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      }

      window.posthog.init(POSTHOG_TOKEN, {
        api_host: POSTHOG_API_HOST,
        defaults: "2026-01-30",
        person_profiles: "always",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        // Session replay snapshots were a second major source of long tasks in
        // the supplied trace. Keep product analytics, but do not record the UI.
        disable_session_recording: true,
        disable_surveys: true,
        enable_heatmaps: false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*"
        },
        advanced_disable_feature_flags: true,
        property_denylist: ["name", "filename", "answer", "correctAnswers", "question", "prompt", "stimulus", "rationale"],
        secure_cookie: location.protocol === "https:",
        loaded: (ph) => {
          if (window.SevSync?.isLinked()) {
            const email = window.SevSync.getStatus()?.email;
            if (email) ph.identify(email);
          }
          resolve(true);
        }
      });
      setTimeout(() => resolve(Boolean(window.posthog)), 5000);
    });
  }

  function loadSentry() {
    if (window.Sentry) return Promise.resolve(true);
    
    window.Sentry = window.Sentry || {};
    window.Sentry.onLoad = window.Sentry.onLoad || function(cb) {
      (window.Sentry.onLoad.q = window.Sentry.onLoad.q || []).push(cb);
    };
    
    window.Sentry.onLoad(function() {
      window.Sentry.init({
        integrations: [window.Sentry.browserTracingIntegration()],
        tracesSampleRate: 0.1,
        tracePropagationTargets: ["localhost", /^https:\/\/sharthak-sev\.github\.io/],
      });
    });

    return loadScriptOnce("sentry-loader", SENTRY_LOADER_URL);
  }

  function loadScriptOnce(id, src) {
    return new Promise(resolve => {
      const existing = document.getElementById(id);
      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve(true);
          return;
        }
        if (existing.dataset.failed === "true") {
          resolve(false);
          return;
        }
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => { script.dataset.loaded = "true"; resolve(true); };
      script.onerror = () => { script.dataset.failed = "true"; resolve(false); };
      document.head.appendChild(script);
    });
  }

  function captureTelemetry(eventName, properties = {}) {
    if (!isTelemetryAccepted()) return;
    enableTelemetry().then(() => {
      if (window.posthog?.capture) {
        window.posthog.capture(eventName, properties);
      }
    });
  }

  function isDeletedRecord(record) {
    return Boolean(record?.deletedAt);
  }

  function getRecordTimestamp(record) {
    if (!record) return 0;
    if (record.updatedAt) return Number(record.updatedAt) || 0;
    if (record.deletedAt) return Number(record.deletedAt) || 0;
    if (record.completedAt) return new Date(record.completedAt).getTime() || 0;
    if (record.importedAt) return new Date(record.importedAt).getTime() || 0;
    if (record.answeredAt) return new Date(record.answeredAt).getTime() || 0;
    return 0;
  }

  function responseIdentity(response) {
    const sessionId = response?.sessionId || "";
    const questionId = response?.questionId || "";
    if (sessionId && questionId) {
      const sequence = response.sequence === 0 || response.sequence ? String(response.sequence) : "";
      return `${sessionId}::${questionId}::${sequence}`;
    }
    return response?.id || uid("response-key");
  }

  function dedupeResponses(responses) {
    const byKey = new Map();
    for (const response of responses || []) {
      if (!response || isDeletedRecord(response)) continue;
      const key = responseIdentity(response);
      const existing = byKey.get(key);
      if (!existing || getRecordTimestamp(response) >= getRecordTimestamp(existing)) {
        byKey.set(key, response);
      }
    }
    return [...byKey.values()];
  }

  function hydrateCanonicalResponses(sessions, storedResponses) {
    const embeddedResponses = [];
    for (const session of sessions || []) {
      for (const response of session.responses || []) {
        embeddedResponses.push({
          ...response,
          sessionId: response.sessionId || session.id,
          updatedAt: response.updatedAt || session.updatedAt
        });
      }
    }
    return dedupeResponses([...(storedResponses || []), ...embeddedResponses])
      .sort((a, b) => String(b.answeredAt).localeCompare(String(a.answeredAt)));
  }

  function buildPortablePayload() {
    return {
      exportedAt: new Date().toISOString(),
      questionBanks: state.banks.filter(record => !isDeletedRecord(record)),
      // Catalog questions are re-downloadable from the server by id, so they are
      // deliberately left out of exports and Drive backups. This is what takes a
      // backup from ~47 MB down to ~0.3 MB. The catalog *bank* record still goes
      // in, so a restore knows to fetch the questions again.
      questions: state.questions.filter(record => !isDeletedRecord(record) && !isCatalogQuestion(record)),
      sessions: state.sessions.filter(record => !isDeletedRecord(record)),
      responses: dedupeResponses(state.responses),
      questionStudyState: Object.values(state.questionStudyState || {})
    };
  }

  async function putManyChunked(storeName, values, chunkSize = 300, onProgress = null) {
    const records = values || [];
    for (let i = 0; i < records.length; i += chunkSize) {
      await DB.putMany(storeName, records.slice(i, i + chunkSize));
      if (onProgress) {
        onProgress(Math.min(100, Math.round(((i + chunkSize) / records.length) * 100)));
      }
      await nextPaint();
    }
    return records.length;
  }

  function nextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  async function tombstoneSessionPackage(sessionId) {
    const now = Date.now();
    const session = await DB.get("sessions", sessionId);
    if (!session) return;

    await DB.put("sessions", { ...session, deletedAt: now, updatedAt: now });

    const storedResponses = await DB.getAllByIndex("responses", "sessionId", sessionId);
    const responseMap = new Map();
    for (const response of [...storedResponses, ...state.responses, ...(session.responses || [])]) {
      if (response?.sessionId !== sessionId) continue;
      const id = response.id || `${sessionId}:deleted:${response.questionId || response.sequence || responseMap.size}`;
      responseMap.set(id, { ...response, id, sessionId, deletedAt: now, updatedAt: now });
    }
    if (responseMap.size) await DB.putMany("responses", [...responseMap.values()]);

    if (session.mode !== "bluebook") return;

    const banks = state.banks || [];
    const questions = state.questions || [];
    
    const ownedBankIds = new Set(
      banks
        .filter(bank => bank.id === sessionId || bank.id === session.bankId || bank.displayTitle === session.title)
        .map(bank => bank.id)
    );
    ownedBankIds.add(sessionId);

    const banksToTombstone = banks
      .filter(bank => ownedBankIds.has(bank.id))
      .map(bank => ({ ...bank, deletedAt: now, updatedAt: now }));
    const questionsToTombstone = questions
      .filter(question => ownedBankIds.has(question.bankId))
      .map(question => ({ ...question, deletedAt: now, updatedAt: now }));

    if (banksToTombstone.length) await DB.putMany("questionBanks", banksToTombstone);
    if (questionsToTombstone.length) await putManyChunked("questions", questionsToTombstone);
  }

  // --- HIGHLIGHT MANAGEMENT ---
  function getQuestionHighlights(questionId) {
    return state.questionStudyState[questionId]?.highlights || [];
  }

  async function saveHighlight(questionId, surface, start, end, quote) {
    const studyState = state.questionStudyState[questionId] || { id: questionId, highlights: [], updatedAt: 0 };
    const newHighlight = {
      id: uid('hl'),
      surface, start, end, quote,
      color: 'yellow',
      createdAt: Date.now()
    };
    
    let highlights = [...studyState.highlights, newHighlight].filter(h => h.surface === surface);
    highlights.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const h of highlights) {
      const last = merged[merged.length - 1];
      if (last && h.start <= last.end) {
        last.end = Math.max(last.end, h.end);
        last.quote = ''; 
        last.id = h.id; 
      } else {
        merged.push({...h});
      }
    }
    
    const otherSurface = studyState.highlights.filter(h => h.surface !== surface);
    studyState.highlights = [...otherSurface, ...merged];
    studyState.updatedAt = Date.now();
    state.questionStudyState[questionId] = studyState;
    await DB.put('questionStudyState', studyState);
  }

  async function removeHighlight(questionId, highlightId) {
    const studyState = state.questionStudyState[questionId];
    if (!studyState) return;
    studyState.highlights = studyState.highlights.filter(h => h.id !== highlightId);
    studyState.updatedAt = Date.now();
    await DB.put('questionStudyState', studyState);
  }

  async function clearQuestionHighlights(questionId) {
    const studyState = state.questionStudyState[questionId];
    if (!studyState) return;
    studyState.highlights = [];
    studyState.updatedAt = Date.now();
    await DB.put('questionStudyState', studyState);
  }

  function applyHighlights(container, highlights, surface) {
    if (!container || !highlights.length) return;
    const surfaceHighlights = highlights.filter(h => h.surface === surface);
    if (!surfaceHighlights.length) return;
    
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let totalOffset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      textNodes.push({ node, start: totalOffset, end: totalOffset + node.length });
      totalOffset += node.length;
    }
    
    const sorted = [...surfaceHighlights].sort((a, b) => a.start - b.start);
    
    for (let hi = sorted.length - 1; hi >= 0; hi--) {
      const hl = sorted[hi];
      for (let ti = textNodes.length - 1; ti >= 0; ti--) {
        const tn = textNodes[ti];
        const overlapStart = Math.max(hl.start, tn.start);
        const overlapEnd = Math.min(hl.end, tn.end);
        if (overlapStart < overlapEnd) {
          const relStart = overlapStart - tn.start;
          const relEnd = overlapEnd - tn.start;
          const range = document.createRange();
          range.setStart(tn.node, relStart);
          range.setEnd(tn.node, relEnd);
          const mark = document.createElement('mark');
          mark.className = 'sev-highlight';
          mark.dataset.highlightId = hl.id;
          mark.dataset.questionId = hl._questionId || '';
          mark.style.backgroundColor = 'rgba(255, 230, 100, 0.5)';
          mark.style.cursor = 'pointer';
          mark.title = 'Click to remove highlight';
          range.surroundContents(mark);
        }
      }
    }
  }

  function updateClearHighlightsButton(questionId) {
    const headerRow = app.querySelector('.question-header-row');
    if (!headerRow) return;
    const hasHighlights = getQuestionHighlights(questionId).length > 0;
    let btn = headerRow.querySelector('button[data-test-action="clear-highlights"]');
    
    if (hasHighlights && !btn) {
      const btnHtml = `<button class="ghost-btn" type="button" data-test-action="clear-highlights" style="font-size: 12px; padding: 4px 8px; margin-left: auto;">
                  Clear Highlights
                </button>`;
      headerRow.insertAdjacentHTML('beforeend', btnHtml);
      const newBtn = headerRow.querySelector('button[data-test-action="clear-highlights"]');
      if (newBtn && typeof handleTestAction === 'function') {
        newBtn.addEventListener("click", handleTestAction);
      }
    } else if (!hasHighlights && btn) {
      btn.remove();
    }
  }

  function bindHighlightClicks() {
    for (const mark of app.querySelectorAll('mark.sev-highlight')) {
      mark.addEventListener('click', async (e) => {
        e.stopPropagation();
        const hlId = mark.dataset.highlightId;
        const ctx = getCurrentContext();
        if (!ctx) return;
        await removeHighlight(ctx.question.id, hlId);
        renderActiveTest();
      });
    }
  }

  function handleTextSelection(surface) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    
    const test = state.activeTest;
    if (!test) return;
    const ctx = getCurrentContext();
    if (!ctx) return;
    const question = ctx.question;
    
    if (question.subject !== 'rw') return;
    
    const container = surface === 'stimulus' 
      ? app.querySelector('.passage-pane .html-content')
      : app.querySelector('.question-pane .html-content.prompt');
      
    if (!container) return;
    const range = sel.getRangeAt(0);
    if (!range.intersectsNode(container)) return;
    
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let offset = 0;
    let startOffset = -1, endOffset = -1;
    
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (range.intersectsNode(node)) {
        if (startOffset === -1) {
          startOffset = (node === range.startContainer) ? offset + range.startOffset : offset;
        }
        endOffset = (node === range.endContainer) ? offset + range.endOffset : offset + node.length;
      }
      offset += node.length;
    }
    
    if (startOffset >= 0 && endOffset > startOffset) {
      const quote = container.textContent.substring(startOffset, endOffset).trim();
      saveHighlight(question.id, surface, startOffset, endOffset, quote);
      sel.removeAllRanges();
      
      const highlights = getQuestionHighlights(question.id);
      container.querySelectorAll('mark.sev-highlight').forEach(m => {
        const parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
        parent.normalize();
      });
      applyHighlights(container, highlights.map(h => ({...h, _questionId: question.id})), surface);
      bindHighlightClicks();
      updateClearHighlightsButton(question.id);
    }
  }

  function applyAllVisibleHighlights() {
    const activeCtx = state.activeTest ? getCurrentContext() : null;
    if (activeCtx && activeCtx.question.subject === 'rw') {
      const hlList = getQuestionHighlights(activeCtx.question.id);
      if (hlList.length) {
        const passageEl = app.querySelector('.passage-pane .html-content');
        const promptEl = app.querySelector('.question-pane .html-content.prompt');
        applyHighlights(passageEl, hlList, 'stimulus');
        applyHighlights(promptEl, hlList, 'prompt');
        bindHighlightClicks();
      }
    }
    
    for (const card of app.querySelectorAll('.review-card, .shadcn-accordion-item')) {
      const qidEl = card.querySelector('[data-qid]') || card.querySelector('[data-id]');
      if (!qidEl) continue;
      const stimulusEl = card.querySelector('.review-stimulus.html-content, .question-content .html-content:first-child');
      const promptEl = card.querySelector('.html-content.prompt');
      const responseId = qidEl.dataset.id || qidEl.dataset.qid;
      if (!responseId) continue;
      const response = state.responses.find(r => r.id === responseId);
      const questionId = response?.questionId || responseId;
      const hlList = getQuestionHighlights(questionId);
      if (hlList.length) {
        applyHighlights(stimulusEl, hlList, 'stimulus');
        applyHighlights(promptEl, hlList, 'prompt');
      }
    }
  }
  // ------------------------------

  /**
   * Reload every store the UI reads from.
   *
   * `questions` is the one store big enough to matter: all three catalogs
   * together are 8,416 records, so it is read through the `catalog` index and
   * only the active exam plus the user's own imports are kept resident. That
   * keeps `state.questions` at roughly a third of the total and means the rest
   * of the app can treat it as "the questions" with no filtering -- an earlier
   * attempt filtered at every call site instead and leaked one catalog's history
   * into another's dashboard.
   */
  async function refreshLocalData() {
    let [banks, catalogQuestions, localQuestions, sessions, oldResponses, studyStates] = await Promise.all([
      DB.getAll("questionBanks"),
      DB.getAllByIndex("questions", "catalog", state.activeCatalog),
      DB.getAllByIndex("questions", "catalog", LOCAL_CATALOG),
      DB.getAll("sessions"),
      DB.getAll("responses"),
      DB.getAll("questionStudyState")
    ]);

    // Safety fallback: if the index returned 0 questions but the questions store has records
    // lacking a catalog stamp, heal them immediately so unindexed records are never lost.
    if (catalogQuestions.length === 0 && localQuestions.length === 0) {
      const allRaw = await DB.getAll("questions");
      if (allRaw.length > 0 && allRaw.some(q => !q.catalog)) {
        const healed = allRaw.map(q => {
          if (!q.catalog) {
            if (typeof q.bankId === "string" && q.bankId.startsWith(SevApi.CATALOG_BANK_PREFIX)) {
              q.catalog = q.bankId.slice(SevApi.CATALOG_BANK_PREFIX.length);
            } else if (q.bankId === "sevrony-catalog") {
              q.catalog = "sat";
              q.bankId = "sevrony-catalog-sat";
            } else {
              q.catalog = LOCAL_CATALOG;
            }
          }
          return q;
        });
        await DB.putMany("questions", healed);
        catalogQuestions = healed.filter(q => q.catalog === state.activeCatalog);
        localQuestions = healed.filter(q => q.catalog === LOCAL_CATALOG);
      }
    }

    const questions = catalogQuestions.concat(localQuestions);

    state.banks = banks.filter(record => !isDeletedRecord(record)).sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
    state.questions = questions.filter(record => !isDeletedRecord(record)).map(q => {
      if (q.difficulty === "Unspecified" && q.raw) {
        const d = q.difficultyCode || q.raw.difficultyCode || q.raw.difficultyLevel || q.raw.difficulty_level || "";
        if (d) {
          q.difficultyCode = d;
          q.difficulty = q.raw.difficulty || DIFFICULTIES[d] || d || "Unspecified";
        }
      }
      return q;
    }).sort((a, b) => {
      const subject = String(a.subject).localeCompare(String(b.subject));
      if (subject !== 0) return subject;
      return String(a.questionId || a.id).localeCompare(String(b.questionId || b.id));
    });

    const validSessions = sessions.filter(s => s.id !== "__active_test__" && !s.deletedAt);
    state.sessions = validSessions.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));

    state.responses = hydrateCanonicalResponses(validSessions, oldResponses);

    // Sessions and responses stay fully resident -- they are small, and a backup
    // has to cover every catalog. Scope is derived from the session's own stamp
    // rather than from question membership, so a catalog that is not downloaded
    // still reports its own history instead of silently reporting none.
    state.activeSessionIds = new Set(
      validSessions.filter(s => sessionCatalog(s) === state.activeCatalog).map(s => s.id)
    );

    const backupConf = await DB.get("appConfig", "backupHandle");
    state.backupHandle = backupConf ? backupConf.handle : null;

    state.questionStudyState = {};
    for (const s of studyStates) { state.questionStudyState[s.id] = s; }
  }

  /* ===========================================================
     BUSY VIEW & INTEGRATED TIP LOADER
     =========================================================== */

  let _currentRoute = null;

  const BUSY_CARDS = [
    {
      id: "adaptive",
      tag: "Adaptive Engine",
      badge: "01",
      title: "Multistage Routing",
      desc: "Module 2 dynamically calibrates difficulty to your real-time performance, matching the College Board adaptive algorithm.",
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
    },
    {
      id: "desmos",
      tag: "Desmos Calculator",
      badge: "02",
      title: "Embedded Graphing",
      desc: "Full built-in graphing suite with regression tables, slider constants, and system solver shortcuts.",
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/><circle cx="14" cy="15" r="2"/></svg>`
    },
    {
      id: "vocab",
      tag: "Spaced Repetition",
      badge: "03",
      title: "Vocabulary SRS",
      desc: "Master 1,200+ high-frequency SAT vocabulary words with automated Leitner active recall intervals.",
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
    },
    {
      id: "mistakes",
      tag: "Mistake Matrix",
      badge: "04",
      title: "Error Diagnostics",
      desc: "Isolate recurring traps—content gaps, calculation slips, pacing pressure—and generate targeted retry drill sessions.",
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`
    },
    {
      id: "offline",
      tag: "Offline Engine",
      badge: "05",
      title: "Zero Cloud Latency",
      desc: "Your practice sessions, questions, and metrics are stored and scored client-side in IndexedDB with instant responsiveness.",
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>`
    }
  ];

  const COSMIC_LOADING_PHRASES = [
    "Constructing the universe from scratch...",
    "Splitting atoms and balancing equations...",
    "Synthesizing College Board quantum states...",
    "Calibrating multidimensional scoring matrices...",
    "Decompressing the Desmos singularity...",
    "Charging neural pathways for test endurance...",
    "Warming up adaptive difficulty engines...",
    "Generating 1600-grade brain frequencies...",
    "Aligning spacetime with test day...",
    "Achieving perfect cognitive equilibrium..."
  ];

  let _busyDeckTimer = null;
  let _busyCardIndex = 0;
  let _busyDeckPaused = false;

  function getCosmicPhrase(progress) {
    if (progress == null || progress <= 0) return COSMIC_LOADING_PHRASES[0];
    const idx = Math.min(
      Math.floor((progress / 100) * COSMIC_LOADING_PHRASES.length),
      COSMIC_LOADING_PHRASES.length - 1
    );
    return COSMIC_LOADING_PHRASES[idx];
  }

  function advanceBusyDeck() {
    _busyCardIndex = (_busyCardIndex + 1) % BUSY_CARDS.length;
    updateBusyCardView();
  }

  function updateBusyCardView() {
    const card = BUSY_CARDS[_busyCardIndex];
    if (!card) return;

    const iconEl = document.getElementById("busy-tip-icon");
    const tagEl = document.getElementById("busy-tip-tag");
    const countEl = document.getElementById("busy-tip-counter");
    const titleEl = document.getElementById("busy-tip-title");
    const descEl = document.getElementById("busy-tip-desc");
    const bodyEl = document.getElementById("busy-tip-body");

    if (bodyEl) {
      bodyEl.style.opacity = "0.3";
      setTimeout(() => {
        if (iconEl) iconEl.innerHTML = card.icon;
        if (tagEl) tagEl.textContent = card.tag;
        if (countEl) countEl.textContent = `0${_busyCardIndex + 1} / 05`;
        if (titleEl) titleEl.textContent = card.title;
        if (descEl) descEl.textContent = card.desc;
        bodyEl.style.opacity = "1";
      }, 120);
    }

    const dots = document.querySelectorAll(".busy-tip-dot");
    dots.forEach((dot, idx) => {
      dot.classList.toggle("is-active", idx === _busyCardIndex);
    });
  }

  function mountBusyDeck() {
    cleanupBusyDeck();
    _busyDeckPaused = false;

    const tipBox = document.getElementById("busy-tip-box");

    if (tipBox) {
      tipBox.onclick = () => { advanceBusyDeck(); };
      tipBox.onmouseenter = () => { _busyDeckPaused = true; };
      tipBox.onmouseleave = () => { _busyDeckPaused = false; };
      tipBox.ontouchstart = () => { _busyDeckPaused = true; };
      tipBox.ontouchend = () => { _busyDeckPaused = false; };
    }

    const dots = document.querySelectorAll(".busy-tip-dot");
    dots.forEach(dot => {
      dot.onclick = (e) => {
        e.stopPropagation();
        const targetIdx = parseInt(dot.getAttribute("data-dot-index"), 10);
        if (!isNaN(targetIdx)) {
          _busyCardIndex = targetIdx;
          updateBusyCardView();
        }
      };
    });

    _busyDeckTimer = setInterval(() => {
      if (!_busyDeckPaused && document.querySelector(".busy-shell")) {
        advanceBusyDeck();
      }
    }, 2800);
  }

  function cleanupBusyDeck() {
    if (_busyDeckTimer) {
      clearInterval(_busyDeckTimer);
      _busyDeckTimer = null;
    }
  }

  function updateBusyDOM(busy) {
    const titleEl = document.getElementById("busy-title-label");
    const descEl = document.getElementById("busy-desc-text");
    const fillEl = document.getElementById("busy-progress-fill");
    const pctEl = document.getElementById("busy-pct-badge");
    const statusEl = document.getElementById("busy-progress-status");

    const isIndet = busy?.progress == null;
    const pctVal = isIndet ? null : Math.round(busy.progress);

    if (titleEl && busy?.title) {
      titleEl.textContent = busy.title;
    }

    if (descEl) {
      const desc = busy?.title === "Signing in"
        ? "Choose your Google account to connect."
        : "Setting up your practice environment.";
      if (descEl.textContent !== desc) {
        descEl.textContent = desc;
      }
    }

    if (statusEl) {
      const slogan = busy?.detail || getCosmicPhrase(pctVal);
      if (statusEl.textContent !== slogan) {
        statusEl.style.opacity = "0.3";
        setTimeout(() => {
          statusEl.textContent = slogan;
          statusEl.style.opacity = "1";
        }, 120);
      }
    }

    if (fillEl) {
      if (isIndet) {
        fillEl.className = "busy-progress-fill indeterminate";
        fillEl.style.width = "";
      } else {
        fillEl.className = "busy-progress-fill";
        fillEl.style.width = `${Math.min(100, Math.max(0, pctVal))}%`;
      }
    }

    if (pctEl) {
      pctEl.textContent = isIndet ? "Syncing..." : `${pctVal}%`;
    }
  }

  function setBusy(title, detail, variant = "sync", progress = null) {
    state.busy = { title, detail, variant, progress };
    const shell = document.querySelector(".busy-shell");
    if (shell && document.body.contains(shell)) {
      if (!_busyDeckTimer) {
        mountBusyDeck();
      }
      updateBusyDOM(state.busy);
      return;
    }
    renderHome(true, true);
  }

  function clearBusy(shouldRender = true) {
    cleanupBusyDeck();
    state.busy = null;
    if (shouldRender) renderHome(true, true);
  }

  function renderBusyView(busy) {
    const title = escapeHtml(busy?.title || "Preparing Sevrony");
    const isIndet = busy?.progress == null;
    const pctVal = isIndet ? null : Math.round(busy.progress);
    const slogan = escapeHtml(busy?.detail || getCosmicPhrase(pctVal));
    const desc = busy?.title === "Signing in"
      ? "Choose your Google account to connect."
      : "Setting up your practice environment.";
    const currentCard = BUSY_CARDS[_busyCardIndex] || BUSY_CARDS[0];

    const dotsHtml = BUSY_CARDS.map((_, idx) => `
      <div class="busy-tip-dot ${idx === _busyCardIndex ? 'is-active' : ''}" data-dot-index="${idx}" role="button" aria-label="Tip ${idx + 1}"></div>
    `).join("");

    const progressWidth = isIndet ? "" : `style="width: ${Math.min(100, Math.max(0, pctVal))}%"`;
    const fillClass = isIndet ? "busy-progress-fill indeterminate" : "busy-progress-fill";
    const pctText = isIndet ? "Syncing..." : `${pctVal}%`;

    return `
      <main class="busy-shell" aria-busy="true" aria-live="polite">
        <div class="busy-card animate-fade-in-up">
          
          <div class="busy-logo-badge">
            <img src="logo.svg" alt="Sevrony Logo" />
          </div>

          <h1 class="busy-title" id="busy-title-label">${title}</h1>
          <p class="busy-desc" id="busy-desc-text">${desc}</p>

          <div class="busy-tip-box" id="busy-tip-box" title="Click to view next tip">
            <div class="busy-tip-header">
              <div class="busy-tip-tag-wrap">
                <div class="busy-tip-icon-wrap" id="busy-tip-icon">
                  ${currentCard.icon}
                </div>
                <span class="busy-tip-tag" id="busy-tip-tag">${currentCard.tag}</span>
              </div>
              <span class="busy-tip-count" id="busy-tip-counter">0${_busyCardIndex + 1} / 05</span>
            </div>

            <div class="busy-tip-body" id="busy-tip-body">
              <h3 class="busy-tip-title" id="busy-tip-title">${currentCard.title}</h3>
              <p class="busy-tip-desc" id="busy-tip-desc">${currentCard.desc}</p>
            </div>

            <div class="busy-tip-footer">
              <div class="busy-tip-dots">
                ${dotsHtml}
              </div>
            </div>
          </div>

          <div class="busy-progress-wrap">
            <div class="busy-progress-meta">
              <span class="busy-progress-status" id="busy-progress-status">${slogan}</span>
              <span class="busy-progress-pct" id="busy-pct-badge">${pctText}</span>
            </div>
            <div class="busy-progress-track">
              <div class="${fillClass}" id="busy-progress-fill" ${progressWidth}></div>
            </div>
          </div>

        </div>
      </main>
    `;
  }

  function routeTransition(newRoute, doRender) {
    const isRouteChanging = _currentRoute !== newRoute;
    _currentRoute = newRoute;
    if (isRouteChanging) captureTelemetry("$pageview", { view: newRoute });
    doRender();
    if (isRouteChanging) {
      window.scrollTo(0, 0);
    }
  }

  let lastPushedStateStr = "";
  function pushHistoryState(replace = false) {
    const currentState = {
      view: state.view,
      reviewSessionId: state.reviewSessionId,
      historyTab: state.historyTab,
      viewSubject: state.viewSubject
    };
    
    sessionStorage.setItem('reviewSessionId', state.reviewSessionId || '');
    sessionStorage.setItem('historyTab', state.historyTab || 'full');
    sessionStorage.setItem('viewSubject', state.viewSubject || '');

    const stateStr = JSON.stringify(currentState);
    if (stateStr !== lastPushedStateStr) {
      if (replace) {
        window.history.replaceState(currentState, "", "#" + state.view);
      } else {
        window.history.pushState(currentState, "", "#" + state.view);
      }
      lastPushedStateStr = stateStr;
    }
  }

  function isIosSafariWarningNeeded() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const isLinked = window.SevSync?.isLinked();
    const dismissed = localStorage.getItem('sevrony.iosWarningDismissed') === 'true';
    return isIos && !isStandalone && !isLinked && !dismissed;
  }

  function renderIosWarningBanner() {
    if (isDemoMode() || !isIosSafariWarningNeeded()) return "";
    return `
      <div class="banner warning-banner" style="display:flex; justify-content:space-between; align-items:flex-start; padding:12px 16px; background:var(--yellow-dim, rgba(234, 179, 8, 0.1)); border: 1px solid var(--yellow, #eab308); border-radius:8px; margin: 0 16px 16px 16px;">
        <div style="font-size: 14px; line-height: 1.5; color: var(--ink);">
          <strong style="color: var(--yellow);">iOS Data Wipe Risk:</strong> Apple's iOS deletes app data after 7 days of inactivity. 
          <a href="#" data-action="setup-cloud-sync" style="color:var(--blue); font-weight:bold; text-decoration:underline;">Enable Cloud Sync</a> or 
          <strong>Add to Home Screen</strong> to keep your progress permanently.
        </div>
        <button class="ghost-btn" data-action="dismiss-ios-warning" style="margin-left: 12px; padding: 4px; border-radius: 4px;" aria-label="Dismiss">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ink-muted);"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;
  }

  function renderHome(skipPush = false, replace = false) {
    if (state.activeTest) return;
    stopTicker();
    
    renderTelemetryBanner();

    state.showDesmos = false;
    const pd = document.getElementById("persistent-desmos");
    if (pd) pd.style.display = "none";

    if (state.busy) {
      app.className = "";
      app.innerHTML = renderBusyView(state.busy);
      mountBusyDeck();
      return;
    }

    if (state.questions.length === 0 && ["dashboard", "history", "config", "mistakes", "mistakes-log", "results", "review", "marketing"].includes(state.view)) {
      state.view = "onboarding";
    }

    if (!skipPush) pushHistoryState(replace);

    if ((state.view === "onboarding" || state.view === "backup") && !isDemoMode()) {
      window.SevSync?.preload();
    }

    routeTransition(state.view, () => {
      if (state.view === "marketing") {
        app.className = "";
        app.innerHTML = renderMarketing();
        bindHomeEvents();
        return;
      }

      if (state.view === "onboarding") {
        app.className = "";
        app.innerHTML = `
          ${state.notice ? renderNotice(state.notice) : ""}
          ${renderOnboarding()}
        `;
        bindHomeEvents();
        return;
      }

      if (state.view === "privacy") {
        app.className = "";
        app.innerHTML = renderPrivacy();
        bindHomeEvents();
        return;
      }

      let shellClass = "app-shell";
      const isMobile = window.innerWidth <= 920;
      let savedState = localStorage.getItem("sidebarCollapsed");
      
      if (isMobile) {
        savedState = "true";
        localStorage.setItem("sidebarCollapsed", "true");
      }
      
      if (savedState === "true") {
        shellClass += " sidebar-collapsed";
      }
      app.className = shellClass;
      app.innerHTML = `
        ${state.view === "vocab" && window.Vocab?.isSessionActive?.() ? '' : renderSidebar()}
        <div class="main-content-wrapper">
          ${state.notice ? renderNotice(state.notice) : ""}
          ${renderIosWarningBanner()}
          <main class="main-grid">
            ${state.view === "results" && state.lastResult ? renderSessionDashboard(state.lastResult) : ""}
            ${state.view === "config" ? renderTestConfig() : ""}
            ${state.view === "history" ? renderTestHistory() : ""}
            ${state.view === "review" ? renderTestReview() : ""}
            ${state.view === "dashboard" ? renderDashboard() : ""}
            ${state.view === "mistakes" ? renderMistakesDashboard() : ""}
            ${state.view === "mistakes-log" ? renderMistakesLog() : ""}
            ${state.view === "vocab" ? window.Vocab.renderDashboard() : ""}
            ${state.view === "vocab-mastered" ? window.Vocab.renderMastered() : ""}
            ${state.view === "backup" ? renderBackupView() : ""}
          </main>
        </div>
      `;
      bindHomeEvents();
    });
  }
  window.renderHome = renderHome;

  function renderPrivacy() {
    const consentLabel = state.telemetryConsent === TELEMETRY_ACCEPTED
      ? "Accepted"
      : "Not chosen";
    return `
      <main class="page-container" style="max-width: 800px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px; display: flex; align-items: center; gap: 16px;">
          <button type="button" data-action="privacy-back" class="ghost-btn icon-btn" style="padding: 8px; border-radius: 50%;" aria-label="Go back">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div>
            <h1 style="font-size: 2.5rem; margin-bottom: 8px; margin-top: 0;">Privacy Policy</h1>
            <p class="eyebrow" style="margin: 0; color: var(--muted-foreground);">Last updated: June 2026</p>
          </div>
        </div>
        
        <div class="panel" style="padding: 32px; display: flex; flex-direction: column; gap: 24px;">
          <div>
            <style>
  [data-custom-class='body'], [data-custom-class='body'] * {
          background: transparent !important;
        }
[data-custom-class='title'], [data-custom-class='title'] * {
          font-family: inherit !important;
font-size: 26px !important;
color: var(--foreground) !important;
        }
[data-custom-class='subtitle'], [data-custom-class='subtitle'] * {
          font-family: inherit !important;
color: var(--muted-foreground) !important;
font-size: 14px !important;
        }
[data-custom-class='heading_1'], [data-custom-class='heading_1'] * {
          font-family: inherit !important;
font-size: 19px !important;
color: var(--foreground) !important;
        }
[data-custom-class='heading_2'], [data-custom-class='heading_2'] * {
          font-family: inherit !important;
font-size: 17px !important;
color: var(--foreground) !important;
        }
[data-custom-class='body_text'], [data-custom-class='body_text'] * {
          color: var(--muted-foreground) !important;
font-size: 14px !important;
font-family: inherit !important;
        }
[data-custom-class='link'], [data-custom-class='link'] * {
          color: var(--blue) !important;
font-size: 14px !important;
font-family: inherit !important;
        }
</style>
      <div data-custom-class="body">
      <div style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text">This Privacy Notice for <bdt class="question noTranslate">Sharthak Jaiswal</bdt><bdt class="block-component"> (doing business as <bdt class="question noTranslate">Sevrony</bdt>)<bdt class="statement-end-if-in-editor"></bdt></bdt> (<bdt class="block-component"></bdt>"<strong>we</strong>," "<strong>us</strong>," or "<strong>our</strong>"<bdt class="statement-end-if-in-editor"></bdt></span><span data-custom-class="body_text">), describes how and why we might access, collect, store, use, and/or share (<bdt class="block-component"></bdt>"<strong>process</strong>"<bdt class="statement-end-if-in-editor"></bdt>) your personal information when you use our services (<bdt class="block-component"></bdt>"<strong>Services</strong>"<bdt class="statement-end-if-in-editor"></bdt>), including when you:</span></span></span><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Visit our website<bdt class="block-component"></bdt> at <span style="color: var(--blue);"><bdt class="question noTranslate"><a target="_blank" data-custom-class="link" href="https://sharthak-sev.github.io">https://sharthak-sev.github.io</a></bdt></span><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"> or any website of ours that links to this Privacy Notice</bdt></span></span></span></span></span></span></span></span></li></ul><div><bdt class="block-component"><span style="font-size: 15px;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Use <bdt class="question noTranslate">Sevrony</bdt>. <bdt class="question">A platform offering free, timed, adaptive SAT practice tests that allows users to locally store their practice history and review their performance.</bdt></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"></span></bdt></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Engage with us in other related ways, including any marketing or events<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>Questions or concerns? </strong>Reading this Privacy Notice will help you understand your privacy rights and choices. We are responsible for making decisions about how your personal information is processed. If you do not agree with our policies and practices, please do not use our Services.<bdt class="block-component"></bdt> If you still have any questions or concerns, please contact us at <bdt class="question noTranslate"><a target="_blank" data-custom-class="link" href="mailto:altersevrony@gmail.com">altersevrony@gmail.com</a></bdt>.</span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><strong><span style="font-size: 15px;"><span data-custom-class="heading_1"><h2>SUMMARY OF KEY POINTS</h2></span></span></strong></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong><em>This summary provides key points from our Privacy Notice, but you can find out more details about any of these topics by clicking the link following each key point or by using our </em></strong></span></span><a data-custom-class="link" href="#toc"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text"><strong><em>table of contents</em></strong></span></span></a><span style="font-size: 15px;"><span data-custom-class="body_text"><strong><em> below to find the section you are looking for.</em></strong></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>What personal information do we process?</strong> When you visit, use, or navigate our Services, we may process personal information depending on how you interact with us and the Services, the choices you make, and the products and features you use. Learn more about </span></span><a data-custom-class="link" href="#personalinfo"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text">personal information you disclose to us</span></span></a><span data-custom-class="body_text">.</span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>Do we process any sensitive personal information? </strong>Some of the information may be considered <bdt class="block-component"></bdt>"special" or "sensitive"<bdt class="statement-end-if-in-editor"></bdt> in certain jurisdictions, for example your racial or ethnic origins, sexual orientation, and religious beliefs. <bdt class="block-component"></bdt>We do not process sensitive personal information.<bdt class="else-block"></bdt></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>Do we collect any information from third parties?</strong> <bdt class="block-component"></bdt>We do not collect any information from third parties.<bdt class="else-block"></bdt></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>How do we process your information?</strong> We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes with your consent. We process your information only when we have a valid legal reason to do so. Learn more about </span></span><a data-custom-class="link" href="#infouse"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text">how we process your information</span></span></a><span data-custom-class="body_text">.</span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>In what situations and with which <bdt class="block-component"></bdt>types of <bdt class="statement-end-if-in-editor"></bdt>parties do we share personal information?</strong> We may share information in specific situations and with specific <bdt class="block-component"></bdt>categories of <bdt class="statement-end-if-in-editor"></bdt>third parties. Learn more about </span></span><a data-custom-class="link" href="#whoshare"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text">when and with whom we share your personal information</span></span></a><span style="font-size: 15px;"><span data-custom-class="body_text">.<bdt class="block-component"></bdt></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>How do we keep your information safe?</strong> We have adequate <bdt class="block-component"></bdt>organizational<bdt class="statement-end-if-in-editor"></bdt> and technical processes and procedures in place to protect your personal information. However, no electronic transmission over the internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other <bdt class="block-component"></bdt>unauthorized<bdt class="statement-end-if-in-editor"></bdt> third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Learn more about </span></span><a data-custom-class="link" href="#infosafe"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text">how we keep your information safe</span></span></a><span data-custom-class="body_text">.</span><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>What are your rights?</strong> Depending on where you are located geographically, the applicable privacy law may mean you have certain rights regarding your personal information. Learn more about </span></span><a data-custom-class="link" href="#privacyrights"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text">your privacy rights</span></span></a><span data-custom-class="body_text">.</span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>How do you exercise your rights?</strong> The easiest way to exercise your rights is by <bdt class="block-component"></bdt>visiting <span style="color: var(--blue);"><bdt class="question noTranslate">mailto:<a target="_blank" data-custom-class="link" href="mailto:altersevrony@gmail.com">altersevrony@gmail.com</a></bdt></span><bdt class="else-block"></bdt>, or by contacting us. We will consider and act upon any request in accordance with applicable data protection laws.</span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">Want to learn more about what we do with any information we collect? </span></span><a data-custom-class="link" href="#toc"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text">Review the Privacy Notice in full</span></span></a><span style="font-size: 15px;"><span data-custom-class="body_text">.</span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><br></div><div id="toc" style="line-height: 1.5;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>TABLE OF CONTENTS</h2></span></strong></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#infocollect"><span style="color: var(--blue);">1. WHAT INFORMATION DO WE COLLECT?</span></a></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#infouse"><span style="color: var(--blue);">2. HOW DO WE PROCESS YOUR INFORMATION?<bdt class="block-component"></bdt></span></a></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#legalbases"><span style="color: var(--blue);">3. <span style="font-size: 15px;"><span style="color: var(--blue);">WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR PERSONAL INFORMATION?</span></span><bdt class="statement-end-if-in-editor"></bdt></span></a></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span style="color: var(--blue);"><a data-custom-class="link" href="#whoshare">4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</a></span><span data-custom-class="body_text"><bdt class="block-component"></bdt></a><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="block-component"></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#cookies"><span style="color: var(--blue);">5. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?</span></a><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span><bdt class="block-component"></bdt></span></div><div style="line-height: 1.5;"><a data-custom-class="link" href="#ai"><span style="color: rgb (0, 58, 250);">6. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?</span></a><span style="font-size: 15px;"><bdt class="statement-end-if-in-editor"></bdt></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#sociallogins"><span style="color: var(--blue);"><span style="color: var(--blue);"><span style="color: var(--blue);">7. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</span></span></span></a><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span> <bdt class="block-component"></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#intltransfers"><span style="color: var(--blue);">8. IS YOUR INFORMATION TRANSFERRED INTERNATIONALLY?</span></a><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#inforetain"><span style="color: var(--blue);">9. HOW LONG DO WE KEEP YOUR INFORMATION?</span></a><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><bdt class="block-component"></bdt></span></span></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#infosafe"><span style="color: var(--blue);">10. HOW DO WE KEEP YOUR INFORMATION SAFE?</span></a><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span style="color: var(--blue);"><a data-custom-class="link" href="#privacyrights">11. WHAT ARE YOUR PRIVACY RIGHTS?</a></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#DNT"><span style="color: var(--blue);">12. CONTROLS FOR DO-NOT-TRACK FEATURES<bdt class="block-component"></bdt></span></a></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#uslaws"><span style="color: var(--blue);">13. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</span></a></span><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><div style="line-height: 1.5;"><a data-custom-class="link" href="#otherlaws"><span style="color: var(--blue); font-size: 15px;">14. DO OTHER REGIONS HAVE SPECIFIC PRIVACY RIGHTS?</span></a><span style="font-size: 15px;"><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></span></div><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></span></bdt></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><a data-custom-class="link" href="#policyupdates"><span style="color: var(--blue);">15. DO WE MAKE UPDATES TO THIS NOTICE?</span></a></span></div><div style="line-height: 1.5;"><a data-custom-class="link" href="#contact"><span style="color: var(--blue); font-size: 15px;">16. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</span></a></div><div style="line-height: 1.5;"><a data-custom-class="link" href="#request"><span style="color: var(--blue);">17. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</span></a></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><br></div><div id="infocollect" style="line-height: 1.5;"><span style="color: var(--foreground);"><span style="color: var(--foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--foreground);"><span style="font-size: 15px; color: var(--foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>1. WHAT INFORMATION DO WE COLLECT?</h2></span></strong></span></span></span></span></span><span data-custom-class="heading_2" id="personalinfo" style="color: var(--foreground);"><span style="font-size: 15px;"><strong><h3>Personal information you disclose to us</h3></strong></span></span><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short:</em></strong></span></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em> </em></strong><em>We collect personal information that you provide to us.</em></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We collect personal information that you voluntarily provide to us when you <span style="font-size: 15px;"><bdt class="block-component"></bdt></span>register on the Services, </span><span style="font-size: 15px;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="statement-end-if-in-editor"></bdt></span></span><span data-custom-class="body_text">express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.</span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>Personal Information Provided by You.</strong> The personal information that we collect depends on the context of your interactions with us and the Services, the choices you make, and the products and features you use. The personal information we collect may include the following:<span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></span></span></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="question">email addresses</bdt></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></span></span></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="question">contact or authentication data</bdt></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></span></span></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="question">names</bdt></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></div><div id="sensitiveinfo" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>Sensitive Information.</strong> <bdt class="block-component"></bdt>We do not process sensitive information.</span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="else-block"></bdt></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>Payment Data.</strong> We may collect data necessary to process your payment if you choose to make purchases, such as your payment instrument number, and the security code associated with your payment instrument. All payment data is handled and stored by<bdt class="forloop-component"></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span> <bdt class="question noTranslate">ko-fi</bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt> and <span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question noTranslate">UPI(National Payments Corporation of India)</bdt></span><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></span></span></span></span></span>. You may find their privacy notice link(s) here:<span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span> <span style="color: var(--blue);"><bdt class="question noTranslate"><a target="_blank" data-custom-class="link" href="https://more.ko-fi.com/privacy">https://more.ko-fi.com/privacy</a></bdt></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="forloop-component"></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt> and <span style="font-size: 15px; color: var(--blue);"><span style="font-size: 15px; color: var(--blue);"><span data-custom-class="body_text"><bdt class="question noTranslate"><a target="_blank" data-custom-class="link" href="https://www.npci.org.in/privacy-policy">https://www.npci.org.in/privacy-policy</a></bdt></span><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span><bdt class="forloop-component"></bdt><span style="font-size: 15px;"><span data-custom-class="body_text">.<bdt class="block-component"></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"><bdt class="block-component"></bdt></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>Social Media Login Data. </strong>We may provide you with the option to register with us using your existing social media account details, like your Facebook, X, or other social media account. If you choose to register in this way, we will collect certain profile information about you from the social media provider, as described in the section called <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt><span style="font-size: 15px;"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--blue);"><a data-custom-class="link" href="#sociallogins">HOW DO WE HANDLE YOUR SOCIAL LOGINS?</a></span></span></span></span><bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt> below.</span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="statement-end-if-in-editor"><bdt class="statement-end-if-in-editor"></bdt></bdt></span></span></span></span><bdt class="block-component"></span></span></bdt></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">All personal information that you provide to us must be true, complete, and accurate, and you must notify us of any changes to such personal information.</span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span><span data-custom-class="heading_2" style="color: var(--foreground);"><span style="font-size: 15px;"><strong><h3>Information automatically collected</h3></strong></span></span><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short:</em></strong></span></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em> </em></strong><em>Some information — such as your Internet Protocol (IP) address and/or browser and device characteristics — is collected automatically when you visit our Services.</em></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We automatically collect certain information when you visit, use, or navigate the Services. This information does not reveal your specific identity (like your name or contact information) but may include device and usage information, such as your IP address, browser and device characteristics, operating system, language preferences, referring URLs, device name, country, location, information about how and when you use our Services, and other technical information. This information is primarily needed to maintain the security and operation of our Services, and for our internal analytics and reporting purposes.</span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Like many businesses, we also collect information through cookies and similar technologies. <bdt class="block-component"></bdt><bdt class="block-component"></bdt></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></span><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">The information we collect includes:<bdt class="block-component"></bdt></span></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><em>Log and Usage Data.</em> Log and usage data is service-related, diagnostic, usage, and performance information our servers automatically collect when you access or use our Services and which we record in log files. Depending on how you interact with us, this log data may include your IP address, device information, browser type, and settings and information about your activity in the Services<span style="font-size: 15px;"> </span>(such as the date/time stamps associated with your usage, pages and files viewed, searches, and other actions you take such as which features you use), device event information (such as system activity, error reports (sometimes called <bdt class="block-component"></bdt>"crash dumps"<bdt class="statement-end-if-in-editor"></bdt>), and hardware settings).<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><em>Device Data.</em> We collect device data such as information about your computer, phone, tablet, or other device you use to access the Services. Depending on the device used, this device data may include information such as your IP address (or proxy server), device and application identification numbers, location, browser type, hardware model, Internet service provider and/or mobile carrier, operating system, and system configuration information.<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><em>Location Data.</em> We collect location data such as information about your device's location, which can be either precise or imprecise. How much information we collect depends on the type and settings of the device you use to access the Services. For example, we may use GPS and other technologies to collect geolocation data that tells us your current location (based on your IP address). You can opt out of allowing us to collect this information either by refusing access to the information or by disabling your Location setting on your device. However, if you choose to opt out, you may not be able to use certain aspects of the Services.<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></li></ul><div><bdt class="block-component"><span style="font-size: 15px;"></bdt></bdt><bdt class="statement-end-if-in-editor"></bdt></bdt></span></span></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><strong><span data-custom-class="heading_2"><h3>Google API</h3></span></strong><span data-custom-class="body_text">Our use of information received from Google APIs will adhere to </span></span><a data-custom-class="link" href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer" target="_blank"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text">Google API Services User Data Policy</span></span></a><span style="font-size: 15px;"><span data-custom-class="body_text">, including the </span></span><a data-custom-class="link" href="https://developers.google.com/terms/api-services-user-data-policy#limited-use" rel="noopener noreferrer" target="_blank"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text">Limited Use requirements</span></span></a><span style="font-size: 15px;"><span data-custom-class="body_text">.</span> <br></span></div><div><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"></span></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"><bdt class="block-component"></bdt></bdt></span></span></span></span></bdt></span></span></span></span></span></span></span></span><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></div><div style="line-height: 1.5;"><br></div><div id="infouse" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>2. HOW DO WE PROCESS YOUR INFORMATION?</h2></span></strong></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short: </em></strong><em>We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law.<bdt class="block-component"></bdt> We process the personal information for the following purposes listed below.<bdt class="statement-end-if-in-editor"></bdt> We may also process your information for other purposes <bdt class="block-component"></bdt>only with your prior explicit<bdt class="else-block"></bdt> consent.</em></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>We process your personal information for a variety of reasons, depending on how you interact with our Services, including:</strong><bdt class="block-component"></bdt></span></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>To facilitate account creation and authentication and otherwise manage user accounts. </strong>We may process your information so you can create and log in to your account, as well as keep your account in working order.<span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>To deliver and facilitate delivery of services to the user. </strong>We may process your information to provide you with the requested service.<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>To respond to user inquiries/offer support to users. </strong>We may process your information to respond to your inquiries and solve any potential issues you might have with the requested service.<bdt class="statement-end-if-in-editor"></bdt></span></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><p style="font-size: 15px; line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px; line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px; line-height: 1.5;"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px; line-height: 1.5;"><bdt class="block-component"></bdt></p><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>To request feedback. </strong>We may process your information when necessary to request feedback and to contact you about your use of our Services.<span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></bdt></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"><span data-custom-class="body_text"></bdt></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></bdt></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><strong>To protect our Services.</strong> We may process your information as part of our efforts to keep our Services safe and secure, including fraud monitoring and prevention.</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><strong>To identify usage trends.</strong> We may process information about how you use our Services to better understand how they are being used so we can improve them.</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></bdt></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></bdt></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></bdt></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><strong>To save or protect an individual's vital interest.</strong> We may process your information when necessary to save or protect an individual’s vital interest, such as to prevent harm.</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></bdt></span></span><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><div style="line-height: 1.5;"><br></div><div id="legalbases" style="line-height: 1.5;"><strong><span style="font-size: 15px;"><span data-custom-class="heading_1"><h2>3. WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR INFORMATION?</h2></span></span></strong><em><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>In Short: </strong>We only process your personal information when we believe it is necessary and we have a valid legal reason (i.e.<bdt class="block-component"></bdt>,<bdt class="statement-end-if-in-editor"></bdt> legal basis) to do so under applicable law, like with your consent, to comply with laws, to provide you with services to enter into or <bdt class="block-component"></bdt>fulfill<bdt class="statement-end-if-in-editor"></bdt> our contractual obligations, to protect your rights, or to <bdt class="block-component"></bdt>fulfill<bdt class="statement-end-if-in-editor"></bdt> our legitimate business interests.</span></span></em></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><em><span style="font-size: 15px;"><span data-custom-class="body_text"><strong><u>If you are located in the EU or UK, this section applies to you.</u></strong></span></span></em></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">The General Data Protection Regulation (GDPR) and UK GDPR require us to explain the valid legal bases we rely on in order to process your personal information. As such, we may rely on the following legal bases to process your personal information:</span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>Consent. </strong>We may process your information if you have given us permission (i.e.<bdt class="block-component"></bdt>,<bdt class="statement-end-if-in-editor"></bdt> consent) to use your personal information for a specific purpose. You can withdraw your consent at any time. Learn more about </span></span><a data-custom-class="link" href="#withdrawconsent"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text">withdrawing your consent</span></span></a><span data-custom-class="body_text">.</span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><strong>Performance of a Contract.</strong> We may process your personal information when we believe it is necessary to <bdt class="block-component"></bdt>fulfill<bdt class="statement-end-if-in-editor"></bdt> our contractual obligations to you, including providing our Services or at your request prior to entering into a contract with you.</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><strong>Legitimate Interests.</strong> We may process your information when we believe it is reasonably necessary to achieve our legitimate business interests and those interests do not outweigh your interests and fundamental rights and freedoms. For example, we may process your personal information for some of the purposes described in order to:</span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></div><ul style="margin-left: 40px;"><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt>Analyze<bdt class="statement-end-if-in-editor"></bdt> how our Services are used so we can improve them to engage and retain users<bdt class="statement-end-if-in-editor"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></div><ul style="margin-left: 40px;"><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">Diagnose problems and/or prevent fraudulent activities<bdt class="statement-end-if-in-editor"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></div><ul style="margin-left: 40px;"><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">Understand how our users use our products and services so we can improve user experience<bdt class="statement-end-if-in-editor"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><strong>Legal Obligations.</strong> We may process your information where we believe it is necessary for compliance with our legal obligations, such as to cooperate with a law enforcement body or regulatory agency, exercise or defend our legal rights, or disclose your information as evidence in litigation in which we are involved.<bdt class="statement-end-if-in-editor"></bdt><br></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><strong>Vital Interests.</strong> We may process your information where we believe it is necessary to protect your vital interests or the vital interests of a third party, such as situations involving potential threats to the safety of any person.</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"><bdt class="block-component"></bdt></bdt></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><strong><u><em>If you are located in Canada, this section applies to you.</em></u></strong></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="statement-end-if-in-editor"></bdt></span></span></div><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">We may process your information if you have given us specific permission (i.e.<bdt class="block-component"></bdt>,<bdt class="statement-end-if-in-editor"></bdt> express consent) to use your personal information for a specific purpose, or in situations where your permission can be inferred (i.e.<bdt class="block-component"></bdt>,<bdt class="statement-end-if-in-editor"></bdt> implied consent). You can </span></span><a data-custom-class="link" href="#withdrawconsent"><span data-custom-class="body_text"><span style="color: var(--blue); font-size: 15px;">withdraw your consent</span></span></a><span data-custom-class="body_text"><span style="font-size: 15px;"> at any time.</span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">In some exceptional cases, we may be legally permitted under applicable law to process your information without your consent, including, for example:</span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">If collection is clearly in the interests of an individual and consent cannot be obtained in a timely way</span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">For investigations and fraud detection and prevention<bdt class="statement-end-if-in-editor"></bdt></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">For business transactions provided certain conditions are met</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">If it is contained in a witness statement and the collection is necessary to assess, process, or settle an insurance claim</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">For identifying injured, ill, or deceased persons and communicating with next of kin</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">If we have reasonable grounds to believe an individual has been, is, or may be victim of financial abuse<bdt class="statement-end-if-in-editor"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">If it is reasonable to expect collection and use with consent would compromise the availability or the accuracy of the information and the collection is reasonable for purposes related to investigating a breach of an agreement or a contravention of the laws of Canada or a province<bdt class="statement-end-if-in-editor"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">If disclosure is required to comply with a subpoena, warrant, court order, or rules of the court relating to the production of records<bdt class="statement-end-if-in-editor"></bdt></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">If it was produced by an individual in the course of their employment, business, or profession and the collection is consistent with the purposes for which the information was produced<bdt class="statement-end-if-in-editor"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">If the collection is solely for journalistic, artistic, or literary purposes<bdt class="statement-end-if-in-editor"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">If the information is publicly available and is specified by the regulations</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">We may disclose de-identified information for approved research or statistics projects, subject to ethics oversight and confidentiality commitments<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><div style="line-height: 1.5;"><br></div><div id="whoshare" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short:</em></strong><em> We may share information in specific situations described in this section and/or with the following <bdt class="block-component"></bdt>categories of <bdt class="statement-end-if-in-editor"></bdt>third parties.</em></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>Vendors, Consultants, and Other Third-Party Service Providers.</strong> We may share your data with third-party vendors, service providers, contractors, or agents (<bdt class="block-component"></bdt>"<strong>third parties</strong>"<bdt class="statement-end-if-in-editor"></bdt>) who perform services for us or on our behalf and require access to such information to do that work. <bdt class="block-component"></bdt>We have contracts in place with our third parties, which are designed to help safeguard your personal information. This means that they cannot do anything with your personal information unless we have instructed them to do it. They will also not share your personal information with any <bdt class="block-component"></bdt>organization<bdt class="statement-end-if-in-editor"></bdt> apart from us. They also commit to pr</span><span data-custom-class="body_text">otect the data they hold on our behalf and to retain it for the period we instruct. <bdt class="statement-end-if-in-editor"></bdt></span><bdt class="block-component"></bdt></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">The <bdt class="block-component"></bdt>categories of <bdt class="statement-end-if-in-editor"></bdt>third parties we may share personal information with are as follows:</span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">AI Platforms</bdt></span></span></span></li></ul><div><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">Cloud Computing Services</bdt></span></span></span></li></ul><div><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">Communication & Collaboration Tools</bdt></span></span></span></li></ul><div><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">Data Analytics Services</bdt></span></span></span></li></ul><div><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">Data Storage Service Providers</bdt></span></span></span></li></ul><div><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">Performance Monitoring Tools</bdt></span></span></span></li></ul><div><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">User Account Registration & Authentication Services</bdt></span></span></span></li></ul><div><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">Website Hosting Service Providers</bdt></span></span></span></li></ul><div><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></span></span></span></bdt></span></span></span></bdt></span></span></span></span></span></span><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><span style="font-size: 15px;"><bdt class="block-component"></bdt></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span><span data-custom-class="body_text"></span><span data-custom-class="body_text"></span><span data-custom-class="body_text"></span><span data-custom-class="body_text"></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">We <bdt class="block-component"></bdt>also <bdt class="statement-end-if-in-editor"></bdt>may need to share your personal information in the following situations:</span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><strong>Business Transfers.</strong> We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.</span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"><span data-custom-class="body_text"></span></bdt></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></bdt></span></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"><span data-custom-class="heading_1"><bdt class="block-component"></bdt></span></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div id="cookies" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>5. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short:</em></strong><em> We may use cookies and other tracking technologies to collect and store your information.</em></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We may use cookies and similar tracking technologies (like web beacons and pixels) to gather information when you interact with our Services. Some online tracking technologies help us maintain the security of our Services<bdt class="block-component"></bdt> and your account<bdt class="statement-end-if-in-editor"></bdt>, prevent crashes, fix bugs, save your preferences, and assist with basic site functions.</span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We also permit third parties and service providers to use online tracking technologies on our Services for analytics and advertising, including to help manage and display advertisements, to tailor advertisements to your interests, or to send abandoned shopping cart reminders (depending on your communication preferences). The third parties and service providers use their technology to provide advertising about products and services tailored to your interests which may appear either on our Services or on other websites.</span></span></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">To the extent these online tracking technologies are deemed to be a <bdt class="block-component"></bdt>"sale"/"sharing"<bdt class="statement-end-if-in-editor"></bdt> (which includes targeted advertising, as defined under the applicable laws) under applicable US state laws, you can opt out of these online tracking technologies by submitting a request as described below under section <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span><span data-custom-class="body_text"><a data-custom-class="link" href="#uslaws"><span style="color: var(--blue); font-size: 15px;">DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</span></a></span><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span><bdt class="statement-end-if-in-editor"></bdt></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Specific information about how we use such technologies and how you can refuse certain cookies is set out in our Cookie Notice<span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt>.</span></span></span></span></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></span><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><div style="line-height: 1.5;"><br></div><div id="ai" style="line-height: 1.5;"><span style="font-size: 15px;"><strong><span data-custom-class="heading_1"><h2>6. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?</h2></span></strong><strong><em><span data-custom-class="body_text">In Short:</span></em></strong><em><span data-custom-class="body_text"> We offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies.</span></em></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">As part of our Services, we offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies (collectively, <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt>AI Products<bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt>). These tools are designed to enhance your experience and provide you with innovative solutions. The terms in this Privacy Notice govern your use of the AI Products within our Services.</span><bdt class="block-component"></bdt></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><strong><span data-custom-class="body_text">Use of AI Technologies</span></strong></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">We provide the AI Products through third-party service providers (<bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt>AI Service Providers<bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt>), including <bdt class="forloop-component"></bdt><bdt class="block-component"></bdt><bdt class="question noTranslate">Google Cloud AI</bdt><bdt class="block-component"></bdt><bdt class="forloop-component"></bdt>. As outlined in this Privacy Notice, your input, output, and personal information will be shared with and processed by these AI Service Providers to enable your use of our AI Products for purposes outlined in <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt></span></span><span data-custom-class="body_text"><a data-custom-class="link" href="#legalbases"><span style="color: var(--blue); font-size: 15px;">WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR PERSONAL INFORMATION?</span></a><span style="font-size: 15px;"><bdt class="else-block"></bdt><bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt> You must not use the AI Products in any way that violates the terms or policies of any AI Service Provider.</span><bdt class="statement-end-if-in-editor"></bdt></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><strong><span data-custom-class="body_text">Our AI Products</span></strong></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">Our AI Products are designed for the following functions:</span><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="question"><span data-custom-class="body_text">Natural language processing</span></bdt></span></li></ul><div><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="question"><span data-custom-class="body_text">Text analysis</span></bdt></span></li></ul><div><span style="font-size: 15px;"><bdt class="forloop-component"></bdt><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><strong><span data-custom-class="body_text">How We Process Your Data Using AI</span></strong></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">All personal information processed using our AI Products is handled in line with our Privacy Notice and our agreement with third parties. This ensures high security and safeguards your personal information throughout the process, giving you peace of mind about your data's safety.</span> <bdt class="block-component"></bdt><bdt class="statement-end-if-in-editor"></bdt></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div id="sociallogins" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>7. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short: </em></strong><em>If you choose to register or log in to our Services using a social media account, we may have access to certain information about you.</em></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Our Services offer you the ability to register and log in using your third-party social media account details (like your Facebook or X logins). Where you choose to do this, we will receive certain profile information about you from your social media provider. The profile information we receive may vary depending on the social media provider concerned, but will often include your name, email address, friends list, and profile picture, as well as other information you choose to make public on such a social media platform.<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We will use the information we receive only for the purposes that are described in this Privacy Notice or that are otherwise made clear to you on the relevant Services. Please note that we do not control, and are not responsible for, other uses of your personal information by your third-party social media provider. We recommend that you review their privacy notice to understand how they collect, use, and share your personal information, and how you can set your privacy preferences on their sites and apps.<span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span><bdt class="block-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></bdt></span></span></span></span></span></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div id="intltransfers" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>8. IS YOUR INFORMATION TRANSFERRED INTERNATIONALLY?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short: </em></strong><em>We may transfer, store, and process your information in countries other than your own.</em></span></span></span></div><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Our servers are located in<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt><bdt class="block-component"></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span> the <span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">United States</bdt></span></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></bdt><bdt class="block-component"></bdt></span></span></span></span></span></span></bdt><bdt class="forloop-component"></bdt></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">. Regardless of your location,</span><span data-custom-class="body_text"> please be aware that your information may be transferred to, stored by, and processed by us in our facilities and in the facilities of the third parties with whom we may share your personal information (see <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span></span><a data-custom-class="link" href="#whoshare"><span style="font-size: 15px;"><span style="color: var(--blue);">WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</span></span></a><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt> above), including facilities in</span></span></span><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span> the <span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question">United States,</bdt></span></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="else-block"></bdt></span></span></span></span></span></span></bdt></span></span></span></span></span></span></span></span></span><bdt class="forloop-component"></bdt></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"> and other countries.</span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">If you are a resident in the European Economic Area (EEA), United Kingdom (UK), or Switzerland, then these countries may not necessarily have data protection laws or other similar laws as comprehensive as those in your country. However, we will take all necessary measures to protect your personal information in accordance with this Privacy Notice and applicable law.<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">European Commission's Standard Contractual Clauses:</span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We have implemented measures to protect your personal information, including by using the European Commission's Standard Contractual Clauses for transfers of personal information between our group companies and between us and our third-party providers. These clauses require all recipients to protect all personal information that they process originating from the EEA or UK in accordance with European data protection laws and regulations.<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span> </span>Our Standard Contractual Clauses can be provided upon request.<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span> </span>We have implemented similar appropriate safeguards with our third-party service providers and partners and further details can be provided upon request.<span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div id="inforetain" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>9. HOW LONG DO WE KEEP YOUR INFORMATION?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short: </em></strong><em>We keep your information for as long as necessary to <bdt class="block-component"></bdt>fulfill<bdt class="statement-end-if-in-editor"></bdt> the purposes outlined in this Privacy Notice unless otherwise required by law.</em></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We will only keep your personal information for as long as it is necessary for the purposes set out in this Privacy Notice, unless a longer retention period is required or permitted by law (such as tax, accounting, or other legal requirements).<bdt class="block-component"></bdt> No purpose in this notice will require us keeping your personal information for longer than <span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span> <bdt class="block-component"></bdt>the period of time in which users have an account with us<bdt class="block-component"></bdt><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="else-block"></bdt></span></span></span>.</span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">When we have no ongoing legitimate business need to process your personal information, we will either delete or <bdt class="block-component"></bdt>anonymize<bdt class="statement-end-if-in-editor"></bdt> such information, or, if this is not possible (for example, because your personal information has been stored in backup archives), then we will securely store your personal information and isolate it from any further processing until deletion is possible.<span style="color: var(--muted-foreground);"><bdt class="block-component"></bdt></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div id="infosafe" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>10. HOW DO WE KEEP YOUR INFORMATION SAFE?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short: </em></strong><em>We aim to protect your personal information through a system of <bdt class="block-component"></bdt>organizational<bdt class="statement-end-if-in-editor"></bdt> and technical security measures.</em></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We have implemented appropriate and reasonable technical and <bdt class="block-component"></bdt>organizational<bdt class="statement-end-if-in-editor"></bdt> security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other <bdt class="block-component"></bdt>unauthorized<bdt class="statement-end-if-in-editor"></bdt> third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Although we will do our best to protect your personal information, transmission of personal information to and from our Services is at your own risk. You should only access the Services within a secure environment.<span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div id="privacyrights" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>11. WHAT ARE YOUR PRIVACY RIGHTS?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short:</em></strong><em> <span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span data-custom-class="body_text"><em><bdt class="block-component"></bdt></em></span></span></span><bdt class="block-component"></bdt>Depending on your state of residence in the US or in <bdt class="else-block"></bdt>some regions, such as <bdt class="block-component"></bdt>the European Economic Area (EEA), United Kingdom (UK), Switzerland, and Canada<bdt class="block-component"></bdt>, you have rights that allow you greater access to and control over your personal information.<span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span data-custom-class="body_text"><em><bdt class="statement-end-if-in-editor"></bdt></em></span></span> </span>You may review, change, or terminate your account at any time, depending on your country, province, or state of residence.</em><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">In some regions (like <bdt class="block-component"></bdt>the EEA, UK, Switzerland, and Canada<bdt class="block-component"></bdt>), you have certain rights under applicable data protection laws. These may include the right (i) to request access and obtain a copy of your personal information, (ii) to request rectification or erasure; (iii) to restrict the processing of your personal information; (iv) if applicable, to data portability; and (v) not to be subject to automated decision-making.<bdt class="block-component"></bdt> If a decision that produces legal or similarly significant effects is made solely by automated means, we will inform you, explain the main factors, and offer a simple way to request human review.<bdt class="statement-end-if-in-editor"></bdt> In certain circumstances, you may also have the right to object to the processing of your personal information. You can make such a request by contacting us by using the contact details provided in the section <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span></span><a data-custom-class="link" href="#contact"><span style="font-size: 15px; color: var(--blue);"><span style="font-size: 15px; color: var(--blue);"><span data-custom-class="body_text">HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</span></span></span></a><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt> below.</span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We will consider and act upon any request in accordance with applicable data protection laws.<bdt class="block-component"></bdt></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"> </span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">If you are located in the EEA or UK and you believe we are unlawfully processing your personal information, you also have the right to complain to your <span style="font-size: 15px;"><span style="color: var(--blue);"><span data-custom-class="body_text"><span style="color: var(--blue);"><span data-custom-class="body_text"><a data-custom-class="link" href="https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm" rel="noopener noreferrer" target="_blank"><span style="font-size: 15px;">Member State data protection authority</span></a></span></span></span></span></span> or </span></span></span><a data-custom-class="link" href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/" rel="noopener noreferrer" target="_blank"><span style="font-size: 15px; color: var(--blue);"><span style="font-size: 15px; color: var(--blue);"><span data-custom-class="body_text">UK data protection authority</span></span></span></a><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">.</span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">If you are located in Switzerland, you may contact the <span style="font-size: 15px;"><span style="color: var(--blue);"><span data-custom-class="body_text"><span style="color: var(--blue);"><span data-custom-class="body_text"><span style="color: var(--blue); font-size: 15px;"><a data-custom-class="link" href="https://www.edoeb.admin.ch/edoeb/en/home.html" rel="noopener noreferrer" target="_blank">Federal Data Protection and Information Commissioner</a></span></span></span></span></span></span>.</span></span></span></div><div style="line-height: 1.5;"><br></div><div id="withdrawconsent" style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><u>Withdrawing your consent:</u></strong> If we are relying on your consent to process your personal information,<bdt class="block-component"></bdt> which may be express and/or implied consent depending on the applicable law,<bdt class="statement-end-if-in-editor"></bdt> you have the right to withdraw your consent at any time. You can withdraw your consent at any time by contacting us by using the contact details provided in the section <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span></span><a data-custom-class="link" href="#contact"><span style="font-size: 15px; color: var(--blue);"><span style="font-size: 15px; color: var(--blue);"><span data-custom-class="body_text">HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</span></span></span></a><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt> below<bdt class="block-component"></bdt> or updating your preferences<bdt class="statement-end-if-in-editor"></bdt>.</span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">However, please note that this will not affect the lawfulness of the processing before its withdrawal nor,<bdt class="block-component"></bdt> when applicable law allows,<bdt class="statement-end-if-in-editor"></bdt> will it affect the processing of your personal information conducted in reliance on lawful processing grounds other than consent.<bdt class="block-component"></bdt></span></span><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><span style="font-size: 15px;"><span data-custom-class="heading_2"><strong><h3>Account Information</h3></strong></span></span><span data-custom-class="body_text"><span style="font-size: 15px;">If you would at any time like to review or change the information in your account or terminate your account, you can:<bdt class="forloop-component"></bdt></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="question">Log in to your account settings and update your user account.</bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="question">Contact us using the contact information provided.</bdt></span></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">Upon your request to terminate your account, we will deactivate or delete your account and information from our active databases. However, we may retain some information in our files to prevent fraud, troubleshoot problems, assist with any investigations, enforce our legal terms and/or comply with applicable legal requirements.</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><u>Cookies and similar technologies:</u></strong> Most Web browsers are set to accept cookies by default. If you prefer, you can usually choose to set your browser to remove cookies and to reject cookies. If you choose to remove cookies or reject cookies, this could affect certain features or services of our Services. <bdt class="block-component"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></span></span></span><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">If you have questions or comments about your privacy rights, you may email us at <bdt class="question noTranslate"><a target="_blank" data-custom-class="link" href="mailto:altersevrony@gmail.com">altersevrony@gmail.com</a></bdt>.</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt></div><div style="line-height: 1.5;"><br></div><div id="DNT" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>12. CONTROLS FOR DO-NOT-TRACK FEATURES</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Most web browsers and some mobile operating systems and mobile applications include a Do-Not-Track (<bdt class="block-component"></bdt>"DNT"<bdt class="statement-end-if-in-editor"></bdt>) feature or setting you can activate to signal your privacy preference not to have data about your online browsing activities monitored and collected. At this stage, no uniform technology standard for <bdt class="block-component"></bdt>recognizing<bdt class="statement-end-if-in-editor"></bdt> and implementing DNT signals has been <bdt class="block-component"></bdt>finalized<bdt class="statement-end-if-in-editor"></bdt>. As such, we do not currently respond to DNT browser signals or any other mechanism that automatically communicates your choice not to be tracked online. If a standard for online tracking is adopted that we must follow in the future, we will inform you about that practice in a revised version of this Privacy Notice.</span></span></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">California law requires us to let you know how we respond to web browser DNT signals. Because there currently is not an industry or legal standard for <bdt class="block-component"></bdt>recognizing<bdt class="statement-end-if-in-editor"></bdt> or <bdt class="block-component"></bdt>honoring<bdt class="statement-end-if-in-editor"></bdt> DNT signals, we do not respond to them at this time.</span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></span></span></div><div style="line-height: 1.5;"><br></div><div id="uslaws" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>13. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong><em>In Short: </em></strong><em>If you are a resident of<bdt class="block-component"></bdt> California, Colorado, Connecticut, Delaware, Florida, Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island, Tennessee, Texas, Utah, or Virginia<bdt class="else-block"></bdt>, you may have the right to request access to and receive details about the personal information we maintain about you and how we have processed it, correct inaccuracies, get a copy of, or delete your personal information. You may also have the right to withdraw your consent to our processing of your personal information. These rights may be limited in some circumstances by applicable law. More information is provided below.</em></span><strong><span data-custom-class="heading_2"><h3>Categories of Personal Information We Collect</h3></span></strong><span data-custom-class="body_text">The table below shows the categories of personal information we have collected in the past twelve (12) months. The table includes illustrative examples of each category and does not reflect the personal information we collect from you. For a comprehensive inventory of all personal information we process, please refer to the section <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span></span><a data-custom-class="link" href="#infocollect"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--blue);"><span data-custom-class="body_text"><span data-custom-class="link">WHAT INFORMATION DO WE COLLECT?</span></span></span></span></a><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span></span></div><div style="line-height: 1.5;"><br></div><table style="width: 100%;"><thead><tr><th style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black; text-align: left;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>Category</strong></span></span></span></th><th style="width: 51.4385%; border-top: 1px solid black; border-right: 1px solid black; text-align: left;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>Examples</strong></span></span></span></th><th style="width: 14.9084%; border-right: 1px solid black; border-top: 1px solid black; text-align: center; text-align: left;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>Collected</strong></span></span></span></th></tr></thead><tbody><tr><td style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">A. Identifiers</span></span></span></div></td><td style="width: 51.4385%; border-top: 1px solid black; border-right: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Contact details, such as real name, alias, postal address, telephone or mobile contact number, unique personal identifier, online identifier, Internet Protocol address, email address, and account name</span></span></span></div></td><td style="width: 14.9084%; text-align: center; vertical-align: middle; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"><bdt class="block-component"><bdt class="forloop-component"></bdt>YES<bdt class="forloop-component"></bdt><bdt class="forloop-component"></bdt><bdt class="block-component"></bdt><bdt class="statement-end-if-in-editor"></bdt><bdt class="statement-end-if-in-editor"></bdt></bdt></bdt></bdt></span><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></div><div style="line-height: 1.5;"><br></div></td></tr></tbody></table><div style="line-height: 1.5;"><bdt class="block-component"></bdt></div><table style="width: 100%;"><tbody><tr><td style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">B. Personal information as defined in the California Customer Records statute</span></span></span></div></td><td style="width: 51.4385%; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Name, contact information, education, employment, employment history, and financial information</span></span></span></div></td><td style="width: 14.9084%; text-align: center; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="forloop-component"><bdt class="block-component"><bdt class="forloop-component"></bdt>YES<bdt class="forloop-component"></bdt><bdt class="forloop-component"></bdt><bdt class="block-component"></bdt><bdt class="statement-end-if-in-editor"></bdt><bdt class="statement-end-if-in-editor"></bdt></bdt></bdt></span></span></span></div><div style="line-height: 1.5;"><br></div></td></tr></tbody></table><div style="line-height: 1.5;"><bdt class="block-component"></bdt></div><table style="width: 100%;"><tbody><tr><td style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>C<bdt class="else-block"></bdt>. Protected classification characteristics under state or federal law</span></span></span></div></td><td style="width: 51.4385%; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Gender, age, date of birth, race and ethnicity, national origin, marital status, and other demographic data</span></span></span></div></td><td style="width: 14.9084%; text-align: center; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><bdt class="forloop-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt>NO</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></div><div style="line-height: 1.5;"><br></div></td></tr><tr><td style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>D<bdt class="else-block"></bdt>. Commercial information</span></span></span></div></td><td style="width: 51.4385%; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Transaction information, purchase history, financial details, and payment information</span></span></span></div></td><td style="width: 14.9084%; text-align: center; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><bdt class="forloop-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt>NO</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></div><div style="line-height: 1.5;"><br></div></td></tr><tr><td style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>E<bdt class="else-block"></bdt>. Biometric information</span></span></span></div></td><td style="width: 51.4385%; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Fingerprints and voiceprints</span></span></span></div></td><td style="width: 14.9084%; text-align: center; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><bdt class="forloop-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt></bdt></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt>NO</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></div><div style="line-height: 1.5;"><br></div></td></tr><tr><td style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>F<bdt class="else-block"></bdt>. Internet or other similar network activity</span></span></span></div></td><td style="width: 51.4385%; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Browsing history, search history, online <bdt class="block-component"></bdt>behavior<bdt class="statement-end-if-in-editor"></bdt>, interest data, and interactions with our and other websites, applications, systems, and advertisements</span></span></span></div></td><td style="width: 14.9084%; text-align: center; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><bdt class="forloop-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt></span></bdt><span data-custom-class="body_text"><bdt class="block-component"></bdt>YES<bdt class="statement-end-if-in-editor"></bdt><bdt class="forloop-component"></span></bdt><span data-custom-class="body_text"><bdt class="block-component"></bdt><bdt class="forloop-component"></bdt><bdt class="block-component"></bdt><bdt class="statement-end-if-in-editor"></bdt><bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></span></bdt></div><div style="line-height: 1.5;"><br></div></td></tr><tr><td style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>G<bdt class="else-block"></bdt>. Geolocation data</span></span></span></div></td><td style="width: 51.4385%; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Device location</span></span></span></div></td><td style="width: 14.9084%; text-align: center; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><bdt class="forloop-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt>NO</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></div><div style="line-height: 1.5;"><br></div></td></tr><tr><td style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>H<bdt class="else-block"></bdt>. Audio, electronic, sensory, or similar information</span></span></span></div></td><td style="width: 51.4385%; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Images and audio, video or call recordings created in connection with our business activities</span></span></span></div></td><td style="width: 14.9084%; text-align: center; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><bdt class="forloop-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt></bdt></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt>NO</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></div><div style="line-height: 1.5;"><br></div></td></tr><tr><td style="width: 33.8274%; border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>I<bdt class="else-block"></bdt>. Professional or employment-related information</span></span></span></div></td><td style="width: 51.4385%; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Business contact details in order to provide you our Services at a business level or job title, work history, and professional qualifications if you apply for a job with us</span></span></span></div></td><td style="width: 14.9084%; text-align: center; border-right: 1px solid black; border-top: 1px solid black;"><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><bdt class="forloop-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt>NO</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></div><div style="line-height: 1.5;"><br></div></td></tr><tr><td style="border-left: 1px solid black; border-right: 1px solid black; border-top: 1px solid black; width: 33.8274%;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>J<bdt class="else-block"></bdt>. Education Information</span></span></span></div></td><td style="border-right: 1px solid black; border-top: 1px solid black; width: 51.4385%;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Student records and directory information</span></span></span></div></td><td style="text-align: center; border-right: 1px solid black; border-top: 1px solid black; width: 14.9084%;"><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><bdt class="forloop-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt>NO</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></div><div style="line-height: 1.5;"><br></div></td></tr><tr><td style="border-width: 1px; border-color: black; border-style: solid; width: 33.8274%;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>K<bdt class="else-block"></bdt>. Inferences drawn from collected personal information</span></span></span></div></td><td style="border-bottom: 1px solid black; border-top: 1px solid black; border-right: 1px solid black; width: 51.4385%;"><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">Inferences drawn from any of the collected personal information listed above to create a profile or summary about, for example, an individual’s preferences and characteristics</span></span></span></div></td><td style="text-align: center; border-right: 1px solid black; border-bottom: 1px solid black; border-top: 1px solid black; width: 14.9084%;"><div style="line-height: 1.5;"><br></div><div data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt>NO<span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div></td></tr><tr><td style="border-left: 1px solid black; border-right: 1px solid black; border-bottom: 1px solid black; line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt>L<bdt class="else-block"></bdt>. Sensitive personal Information</span></td><td style="border-right: 1px solid black; border-bottom: 1px solid black; line-height: 1.5;"><bdt class="block-component"><span data-custom-class="body_text"></span></bdt></td><td style="border-right: 1px solid black; border-bottom: 1px solid black;"><div data-empty="true" style="text-align: center;"><br></div><div data-custom-class="body_text" data-empty="true" style="text-align: center; line-height: 1.5;"><bdt class="block-component"><span data-custom-class="body_text"></bdt>NO</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></div><div data-empty="true" style="text-align: center;"><br></div></td></tr></tbody></table><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">We may also collect other personal information outside of these categories through instances where you interact with us in person, online, or by phone or mail in the context of:</span><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Receiving help through our customer support channels;<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text"><span style="font-size: 15px;">Participation in customer surveys or contests; and<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text"><span style="font-size: 15px;">Facilitation in the delivery of our Services and to respond to your inquiries.</span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span data-custom-class="body_text"></span></bdt><span data-custom-class="body_text">We will use and retain the collected personal information as needed to provide the Services or for:<bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text">Category A - <bdt class="question">As long as the user has an account with us</bdt><bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"><bdt class="block-component"></bdt></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text">Category B - <bdt class="question">As long as the user has an account with us</bdt><bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span data-custom-class="body_text">Category <bdt class="block-component"></bdt>F<bdt class="else-block"></bdt> - <bdt class="question">As long as the user has an account with us</bdt><bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></li></ul><div style="line-height: 1.5;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></li></ul><div style="line-height: 1.5;"><strong><span style="font-size: 15px;"><span data-custom-class="heading_2"><h3>Sources of Personal Information</h3></span></span></strong><span style="font-size: 15px;"><span data-custom-class="body_text">Learn more about the sources of personal information we collect in <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span><span style="color: var(--blue);"><span data-custom-class="body_text"><a data-custom-class="link" href="#infocollect"><span style="color: rgb (0, 58, 250); font-size: 15px;">WHAT INFORMATION DO WE COLLECT?</span></a></span></span><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt>"</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><strong><span data-custom-class="heading_2"><h3>How We Use and Share Personal Information</h3></span></strong></span></span><span data-custom-class="body_text" style="font-size: 15px;"><bdt class="block-component"></bdt>Learn more about how we use your personal information in the section, <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span><a data-custom-class="link" href="#infouse"><span style="color: var(--blue); font-size: 15px;">HOW DO WE PROCESS YOUR INFORMATION?</span></a><span data-custom-class="body_text" style="font-size: 15px;"><bdt class="block-component"></bdt>"</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text" style="font-size: 15px;"></span></bdt></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt><bdt class="block-component"></bdt></span></span></span></span></span></span></span></span></span></span></span></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></bdt></bdt></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><strong>Will your information be shared with anyone else?</strong></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We may disclose your personal information with our service providers pursuant to a written contract between us and each service provider. Learn more about how we disclose personal information to in the section, <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span></span><a data-custom-class="link" href="#whoshare"><span style="font-size: 15px; color: var(--blue);"><span style="font-size: 15px; color: var(--blue);">WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</span></span></a><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We may use your personal information for our own business purposes, such as for undertaking internal research for technological development and demonstration. This is not considered to be <bdt class="block-component"></bdt>"selling"<bdt class="statement-end-if-in-editor"></bdt> of your personal information.<span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span><bdt class="block-component"></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><span data-custom-class="body_text"><span style="font-size: 15px;">We have not sold or shared any personal information to third parties for a business or commercial purpose in the preceding twelve (12) months. </span></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"></span></span></bdt><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text">We have disclosed the following categories of personal information to third parties for a business or commercial purpose in the preceding twelve (12) months:<bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt><bdt class="block-component"></bdt></span></span></span><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="forloop-component"></bdt><bdt class="block-component"></bdt></span></p><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text">Category A. Identifiers<span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px; line-height: 1.5;"><bdt class="forloop-component"><bdt class="block-component"></bdt></li></ul><p style="font-size: 15px; line-height: 1.5;"><bdt class="forloop-component"></bdt></bdt></p><ul><li data-custom-class="body_text">Category B. Personal information as defined in the California Customer Records law</li></ul><p style="font-size: 15px;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></span></span></span><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="forloop-component"></bdt></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text">Category <bdt class="block-component"></bdt>F<bdt class="else-block"></bdt>. Internet or other electronic network activity information<span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><bdt class="forloop-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></span></li></ul><p style="font-size: 15px;"><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></li></ul><div><span style="font-size: 15px;"><bdt class="forloop-component"></bdt></span></span></span></span></span></span></span></span></li></ul><div><bdt class="forloop-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></span></span></li></ul><div><bdt class="forloop-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></span></span></li></ul><div><bdt class="forloop-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></span></span></li></ul><div><bdt class="block-component"><span style="font-size: 15px;"></bdt></span></span></span></span></span></span></span></span></span></span></span></li></ul><div><bdt class="block-component"></span></bdt></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">The categories of third parties to whom we disclosed personal information for a business or commercial purpose can be found under <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="color: var(--blue);"><a data-custom-class="link" href="#whoshare">WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</a></span><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></span></span></span></span></span></span></bdt></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span><span data-custom-class="body_text"><span style="color: var(--foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt></span></span></span></span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><strong><span data-custom-class="heading_2"><h3>Your Rights</h3></span></strong><span data-custom-class="body_text">You have rights under certain US state data protection laws. However, these rights are not absolute, and in certain cases, we may decline your request as permitted by law. These rights include:</span><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to know</strong> whether or not we are processing your personal data<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to access </strong>your personal data<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to correct </strong>inaccuracies in your personal data<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to request</strong> the deletion of your personal data<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to obtain a copy </strong>of the personal data you previously shared with us<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to non-discrimination</strong> for exercising your rights<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><strong>Right to opt out</strong> of the processing of your personal data if it is used for targeted advertising<bdt class="block-component"></bdt> (or sharing as defined under California’s privacy law)<bdt class="statement-end-if-in-editor"></bdt>, the sale of personal data, or profiling in furtherance of decisions that produce legal or similarly significant effects (<bdt class="block-component"></bdt>"profiling"<bdt class="statement-end-if-in-editor"></bdt>)<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">Depending upon the state where you live, you may also have the following rights:</span><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to access the categories of personal data being processed (as permitted by applicable law, including the privacy law in Minnesota)<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to obtain a list of the categories of third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in<bdt class="block-component"></bdt> California, Delaware, and Maryland<bdt class="else-block"></bdt><bdt class="block-component"></bdt>)<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to obtain a list of specific third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in<bdt class="block-component"></bdt> Minnesota and Oregon<bdt class="else-block"></bdt>)</span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5; font-size: 15px;">Right to obtain a list of third parties to which we have sold personal data (as permitted by applicable law, including the privacy law in Connecticut)<bdt class="statement-end-if-in-editor"></bdt></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to review, understand, question, and depending on where you live, correct how personal data has been profiled (as permitted by applicable law, including the privacy law in <bdt class="block-component"></bdt>Connecticut and Minnesota<bdt class="else-block"></bdt>)<bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to limit use and disclosure of sensitive personal data (as permitted by applicable law, including the privacy law in California)</span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"></span></bdt></li></ul><div style="line-height: 1.5;"><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;">Right to opt out of the collection of sensitive data and personal data collected through the operation of a voice or facial recognition feature (as permitted by applicable law, including the privacy law in Florida)</span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"></span></bdt></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="statement-end-if-in-editor"></bdt></span><strong><span style="font-size: 15px;"><span data-custom-class="heading_2"><h3>How to Exercise Your Rights</h3></span></span></strong><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">To exercise these rights, you can contact us <bdt class="block-component"></bdt>by visiting <span style="color: var(--blue);"><bdt class="question noTranslate">mailto:<a target="_blank" data-custom-class="link" href="mailto:altersevrony@gmail.com">altersevrony@gmail.com</a></bdt></span>, <bdt class="else-block"></bdt></span><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt>by emailing us at <bdt class="question noTranslate"><a target="_blank" data-custom-class="link" href="mailto:altersevrony@gmail.com">altersevrony@gmail.com</a></bdt>, <bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt></span><span data-custom-class="body_text"><bdt class="block-component"></bdt>by visiting <span style="color: var(--blue);"><bdt class="question noTranslate"><a target="_blank" data-custom-class="link" href="https://sharthak-sev.github.io">https://sharthak-sev.github.io</a></bdt></span>, <bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"><span data-custom-class="body_text"><bdt class="block-component"></bdt></bdt></span></span></span></span></span></span></span></span></span></span></span></span><span data-custom-class="body_text">or by referring to the contact details at the bottom of this document.</span></span></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">Under certain US state data protection laws, you can designate an <bdt class="block-component"></bdt>authorized<bdt class="statement-end-if-in-editor"></bdt> agent to make a request on your behalf. We may deny a request from an <bdt class="block-component"></bdt>authorized<bdt class="statement-end-if-in-editor"></bdt> agent that does not submit proof that they have been validly <bdt class="block-component"></bdt>authorized<bdt class="statement-end-if-in-editor"></bdt> to act on your behalf in accordance with applicable laws.</span> <br><strong><span data-custom-class="heading_2"><h3>Request Verification</h3></span></strong><span data-custom-class="body_text">Upon receiving your request, we will need to verify your identity to determine you are the same person about whom we have the information in our system. We will only use personal information provided in your request to verify your identity or authority to make the request. However, if we cannot verify your identity from the information already maintained by us, we may request that you provide additional information for the purposes of verifying your identity and for security or fraud-prevention purposes.</span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">If you submit the request through an <bdt class="block-component"></bdt>authorized<bdt class="statement-end-if-in-editor"></bdt> agent, we may need to collect additional information to verify your identity before processing your request and the agent will need to provide a written and signed permission from you to submit such request on your behalf.</span></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt><span style="font-size: 15px;"><span data-custom-class="heading_2"><strong><h3>Appeals</h3></strong></span><span data-custom-class="body_text">Under certain US state data protection laws, if we decline to take action regarding your request, you may appeal our decision by emailing us at <bdt class="block-component"></bdt><bdt class="question noTranslate"><a target="_blank" data-custom-class="link" href="mailto:altersevrony@gmail.com">altersevrony@gmail.com</a></bdt><bdt class="else-block"></bdt>. We will inform you in writing of any action taken or not taken in response to the appeal, including a written explanation of the reasons for the decisions. If your appeal is denied, you may submit a complaint to your state attorney general.</span><bdt class="statement-end-if-in-editor"></bdt></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"><bdt class="block-component"></span></bdt></span></span></span></span></span></span></span></span></span></span><bdt class="block-component"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></bdt><span style="font-size: 15px;"><strong><span data-custom-class="heading_2"><h3>California <bdt class="block-component"></bdt>"Shine The Light"<bdt class="statement-end-if-in-editor"></bdt> Law</h3></span></strong><span data-custom-class="body_text">California Civil Code Section 1798.83, also known as the <bdt class="block-component"></bdt>"Shine The Light"<bdt class="statement-end-if-in-editor"></bdt> law, permits our users who are California residents to request and obtain from us, once a year and free of charge, information about categories of personal information (if any) we disclosed to third parties for direct marketing purposes and the names and addresses of all third parties with which we shared personal information in the immediately preceding calendar year. If you are a California resident and would like to make such a request, please submit your request in writing to us by using the contact details provided in the section <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span><span data-custom-class="body_text"><a data-custom-class="link" href="#contact"><span style="color: var(--blue); font-size: 15px;">HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</span></a></span><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt>"</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></span><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"></span></bdt><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"><bdt class="statement-end-if-in-editor"></bdt></bdt></span></span></span></span></span></span></span></span></span></span></span></bdt></span></span></span></span></span></span></span></span></span></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span id="otherlaws" style="font-size: 15px;"><strong><span data-custom-class="heading_1"><h2>14. DO OTHER REGIONS HAVE SPECIFIC PRIVACY RIGHTS?</h2></span></strong></span><span style="font-size: 15px;"><em><strong><span data-custom-class="body_text">In Short:</span></strong><span data-custom-class="body_text"> You may have additional rights based on the country you reside in.</span></em><bdt class="block-component"></bdt></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"><span data-custom-class="heading_2"></span></bdt><span data-custom-class="heading_2"><h3><strong>Australia</strong><bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt> <strong>and</strong> <bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt><strong>New Zealand</strong></h3></span> <bdt class="statement-end-if-in-editor"><span data-custom-class="heading_2"></span></bdt></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">We collect and process your personal information under the obligations and conditions set by <bdt class="block-component"></bdt>Australia's Privacy Act 1988<bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt> and <bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt>New Zealand's Privacy Act 2020<bdt class="statement-end-if-in-editor"></bdt> (Privacy Act).</span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">This Privacy Notice satisfies the notice requirements defined in<bdt class="block-component"></bdt> both Privacy Acts<bdt class="block-component"></bdt>, in particular: what personal information we collect from you, from which sources, for which purposes, and other recipients of your personal information.</span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">If you do not wish to provide the personal information necessary to <bdt class="block-component"></bdt>fulfill<bdt class="statement-end-if-in-editor"></bdt> their applicable purpose, it may affect our ability to provide our services, in particular:</span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">offer you the products or services that you want</span><bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">respond to or help with your requests</span><bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">manage your account with us</span><bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><bdt class="block-component"></bdt></span></div><ul><li data-custom-class="body_text" style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">confirm your identity and protect your account</span><bdt class="statement-end-if-in-editor"></bdt></span></li></ul><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">At any time, you have the right to request access to or correction of your personal information. You can make such a request by contacting us by using the contact details provided in the section <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt><a data-custom-class="link" href="#request"><span style="color: var(--blue);"><span data-custom-class="link">HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</span></span></a><bdt class="block-component"></bdt>"</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">If you believe we are unlawfully processing your personal information, you have the right to submit a complaint about <bdt class="block-component"></bdt>a breach of the Australian Privacy Principles to the <a data-custom-class="link" href="https://www.oaic.gov.au/privacy/privacy-complaints/lodge-a-privacy-complaint-with-us" rel="noopener noreferrer" target="_blank"><span style="color: var(--blue);"><span data-custom-class="link">Office of the Australian Information Commissioner</span></span></a><bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt> and <bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt>a breach of New Zealand's Privacy Principles to the <a data-custom-class="link" href="https://www.privacy.org.nz/your-rights/making-a-complaint/" rel="noopener noreferrer" target="_blank"><span style="color: var(--blue);"><span data-custom-class="link">Office of New Zealand Privacy Commissioner</span></span></a><bdt class="statement-end-if-in-editor"></bdt>.</span><bdt class="statement-end-if-in-editor"></bdt></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt><span style="font-size: 15px;"><strong><span data-custom-class="heading_2"><h3>Republic of South Africa</h3></span></strong><span data-custom-class="body_text">At any time, you have the right to request access to or correction of your personal information. You can make such a request by contacting us by using the contact details provided in the section <bdt class="block-component"></bdt>"<bdt class="statement-end-if-in-editor"></bdt></span></span><span data-custom-class="link"><a href="#request"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="link">HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</span></span></a></span><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"></bdt>"</span><bdt class="statement-end-if-in-editor"><span data-custom-class="body_text"></span></bdt></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text">If you are unsatisfied with the manner in which we address any complaint with regard to our processing of personal information, you can contact the office of the regulator, the details of which are:</span></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><br></span></div><div style="line-height: 1.5;"><a data-custom-class="link" href="https://inforegulator.org.za/" rel="noopener noreferrer" target="_blank"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text"><span data-custom-class="link">The Information Regulator (South Africa)</span></span></span></a></div><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">General enquiries: </span><a data-custom-class="link" href="mailto:enquiries@inforegulator.org.za" rel="noopener noreferrer" target="_blank"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="link">enquiries@inforegulator.org.za</span></span></a></span></div><div style="line-height: 1.5;"><span data-custom-class="body_text"><span style="font-size: 15px;">Complaints (complete POPIA/PAIA form 5): </span><a data-custom-class="link" href="mailto:PAIAComplaints@inforegulator.org.za" rel="noopener noreferrer" target="_blank"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="link">PAIAComplaints@inforegulator.org.za</span></span></a><span style="font-size: 15px;"> & </span></span><a data-custom-class="link" href="mailto:POPIAComplaints@inforegulator.org.za" rel="noopener noreferrer" target="_blank"><span style="color: var(--blue); font-size: 15px;"><span data-custom-class="body_text"><span data-custom-class="link">POPIAComplaints@inforegulator.org.za</span></span></span></a><span style="font-size: 15px;"><bdt class="statement-end-if-in-editor"></bdt><bdt class="statement-end-if-in-editor"></bdt></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt></div><div style="line-height: 1.5;"><br></div><div id="policyupdates" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>15. DO WE MAKE UPDATES TO THIS NOTICE?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><em><strong>In Short: </strong>Yes, we will update this notice as necessary to stay compliant with relevant laws.</em></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">We may update this Privacy Notice from time to time. The updated version will be indicated by an updated <bdt class="block-component"></bdt>"Revised"<bdt class="statement-end-if-in-editor"></bdt> date at the top of this Privacy Notice. If we make material changes to this Privacy Notice, we may notify you either by prominently posting a notice of such changes or by directly sending you a notification. We encourage you to review this Privacy Notice frequently to be informed of how we are protecting your information.</span></span></span></div><div style="line-height: 1.5;"><br></div><div id="contact" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>16. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">If you have questions or comments about this notice, you may <span style="color: var(--muted-foreground); font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"><bdt class="block-component"></bdt></bdt>email us at <bdt class="question noTranslate"><a target="_blank" data-custom-class="link" href="mailto:altersevrony@gmail.com">altersevrony@gmail.com</a> or </bdt><bdt class="statement-end-if-in-editor"><bdt class="block-component"></bdt></bdt></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text">contact us by post at:</span></span></span></span></span></span></div><div style="line-height: 1.5;"><br></div><div style="line-height: 1.5;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><span style="font-size: 15px;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="question noTranslate">Sharthak Jaiswal</bdt></span></span></span></span></span><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"><bdt class="block-component"></bdt></span></span></span></bdt></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="question">Howrah</bdt><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><bdt class="block-component"></bdt>, <bdt class="question noTranslate">West Bengal</bdt><bdt class="statement-end-if-in-editor"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt><bdt class="block-component"></bdt></span></span></span></bdt></span></div><div style="line-height: 1.5;"><span style="font-size: 15px;"><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="block-component"></bdt></span></span></span><bdt class="question noTranslate">India</bdt><span style="font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"><span style="font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"></bdt></span></span></span></bdt><bdt class="statement-end-if-in-editor"></bdt></span></span></span><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><bdt class="statement-end-if-in-editor"><bdt class="block-component"></bdt></bdt></span></span></span></bdt></span></span></span></span><span data-custom-class="body_text"><span style="font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground);"><bdt class="statement-end-if-in-editor"><span style="color: var(--muted-foreground);"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="block-component"><bdt class="block-component"></bdt></span></span></span></span></span></span><bdt class="block-component"><span style="font-size: 15px;"></span></bdt><span style="font-size: 15px;"><span data-custom-class="body_text"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px;"><span data-custom-class="body_text"><bdt class="statement-end-if-in-editor"><bdt class="block-component"></bdt></span></span></div><div style="line-height: 1.5;"><br></div><div id="request" style="line-height: 1.5;"><span style="color: var(--muted-foreground);"><span style="color: var(--muted-foreground); font-size: 15px;"><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span id="control" style="color: var(--foreground);"><strong><span data-custom-class="heading_1"><h2>17. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</h2></span></strong></span></span></span></span></span><span style="font-size: 15px; color: var(--muted-foreground);"><span style="font-size: 15px; color: var(--muted-foreground);"><span data-custom-class="body_text"><bdt class="block-component"></bdt>Based on the applicable laws of your country<bdt class="block-component"></bdt> or state of residence in the US<bdt class="statement-end-if-in-editor"></bdt>, you may<bdt class="else-block"><bdt class="block-component"> have the right to request access to the personal information we collect from you, details about how we have processed it, correct inaccuracies, or delete your personal information. You may also have the right to <bdt class="block-component"></bdt>withdraw your consent to our processing of your personal information. These rights may be limited in some circumstances by applicable law. To request to review, update, or delete your personal information, please <bdt class="block-component"></span></bdt><span data-custom-class="body_text">visit: <span style="color: var(--blue);"><bdt class="question noTranslate">mailto:<a target="_blank" data-custom-class="link" href="mailto:altersevrony@gmail.com">altersevrony@gmail.com</a></bdt></span><bdt class="else-block"></bdt></span></span><span data-custom-class="body_text">.</span></span></span><div style="display: none;"><a class="privacy123" href="https://app.termly.io/dsar/9631f894-07d1-4260-b456-37498451b6d9"></a></div></div><style>
      ul {
        list-style-type: square;
      }
      ul > li > ul {
        list-style-type: circle;
      }
      ul > li > ul > li > ul {
        list-style-type: square;
      }
      ol li {
        font-family: Arial ;
      }
    </style>
      </div>


          </div>
          <hr style="border: 0; height: 1px; background: var(--border); margin: 32px 0;">
          <div>
            <h2 style="font-size: 1.5rem; margin-top: 0; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--blue);"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
              Optional Telemetry
            </h2>
            <p style="line-height: 1.6; color: var(--muted-foreground);">
              Telemetry is off until you accept it. If accepted, the hosted app loads <strong>PostHog</strong> for product analytics and <strong>Sentry</strong> for crash/error reports. Autocapture is disabled, and events avoid file names, answers, question text, and exact scores.
            </p>
            <ul style="line-height: 1.6; color: var(--muted-foreground); margin-top: 8px; padding-left: 20px;">
              <li><strong>Email Tracking (Cross-device analytics):</strong> If you consent to telemetry <em>and</em> link your Google Drive for Cloud Sync, your Google email address is securely sent to PostHog. This helps us understand how the app is used across different devices.</li>
              <li><strong>Sentry is anonymous:</strong> Error reports sent to Sentry do NOT include your email address.</li>
              <li>Question reports send the question ID and a debug URL only after consent.</li>
              <li>Declining telemetry keeps the practice app usable.</li>
              <li>Your current telemetry choice is <strong>${escapeHtml(consentLabel)}</strong>.</li>
            </ul>
            <button type="button" class="ghost-btn" data-action="reset-telemetry" style="margin-top: 12px;">Reset Telemetry Choice</button>
          </div>

          <div>
            <h2 style="font-size: 1.5rem; margin-top: 0; margin-bottom: 12px;">Remote Assets</h2>
            <p style="line-height: 1.6; color: var(--muted-foreground);">
              Some hosted-page features still use third-party assets: Google Fonts, KaTeX from jsDelivr, Tailwind Play CDN, Desmos calculator, and Ko-fi images.
              Once the core files are cached, local question data remains available, but those online-only assets may not load offline or may be blocked by privacy tools.
            </p>
          </div>
        </div>
      </main>
    `;
  }

  function renderMarketing() {
    return `
      <div class="font-marketing min-h-[80vh] flex flex-col justify-center items-center py-16 px-4 sm:px-6 lg:px-8 bg-background">
        
        <!-- Hero Section -->
        <div class="text-center max-w-4xl mx-auto space-y-8 opacity-0 animate-fade-in-up">
          <div class="inline-flex items-center justify-center p-4 border border-border/60 bg-muted/20 rounded-2xl mb-6 shadow-sm">
            <img src="logo.svg" alt="Sevrony Logo" class="w-14 h-14 object-contain" />
          </div>
          
          <h1 class="text-5xl md:text-6xl font-bold tracking-tighter text-foreground leading-tight" style="margin: 0; padding: 0;">
            Master the SAT, <span class="text-muted-foreground">Locally.</span>
          </h1>
          
          <p class="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mt-6 font-medium" style="margin-bottom: 2.5rem;">
            The authentic Bluebook practice experience. 100% free with cross-device sync. Focus purely on your score.
          </p>
          
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
            <button class="inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 shadow-sm cursor-pointer" type="button" data-action="start-onboarding">
              Get Started Free
            </button>
            <a href="https://github.com/sharthak-sev/sat-qb-exporter" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-12 px-8 shadow-sm cursor-pointer" style="text-decoration: none;">
              View Exporter Extension
            </a>
          </div>
        </div>

        <!-- Features Section -->
        <div class="mt-32 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto text-left">
          
          <!-- Feature 1 -->
          <div class="p-8 rounded-2xl bg-muted/40 text-card-foreground border border-border/50">
            <div class="h-10 w-10 flex items-center justify-center mb-6 text-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <h3 class="text-lg font-bold tracking-tight mb-2 text-foreground" style="margin: 0 0 8px 0;">100% Free</h3>
            <p class="text-muted-foreground text-sm leading-relaxed" style="margin: 0;">No subscriptions. Practice anywhere without distractions.</p>
          </div>

          <!-- Feature 2 -->
          <div class="p-8 rounded-2xl bg-muted/40 text-card-foreground border border-border/50">
            <div class="h-10 w-10 flex items-center justify-center mb-6 text-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h.01"/><path d="M17 7h.01"/><path d="M7 17h.01"/><path d="M17 17h.01"/></svg>
            </div>
            <h3 class="text-lg font-bold tracking-tight mb-2 text-foreground" style="margin: 0 0 8px 0;">Real Question Bank</h3>
            <p class="text-muted-foreground text-sm leading-relaxed" style="margin: 0;">Import official College Board questions and take adaptive tests that accurately simulate exam day.</p>
          </div>

          <!-- Feature 3 -->
          <div class="p-8 rounded-2xl bg-muted/40 text-card-foreground border border-border/50">
            <div class="h-10 w-10 flex items-center justify-center mb-6 text-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            </div>
            <h3 class="text-lg font-bold tracking-tight mb-2 text-foreground" style="margin: 0 0 8px 0;">Deep Review</h3>
            <p class="text-muted-foreground text-sm leading-relaxed" style="margin: 0;">Review every past test, read detailed rationales, and track your performance to improve your score.</p>
          </div>

        </div>
        
        <!-- Footer -->
        <div class="mt-16 text-center">
          <button type="button" data-action="privacy" class="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none p-0 underline decoration-muted/50 hover:decoration-foreground underline-offset-4">
            Privacy Policy
          </button>
        </div>
      </div>
    `;
  }

  function renderOnboarding() {
    return `
      <div class="onboarding-wrapper">
        <div class="onboarding-card opacity-0 animate-fade-in-up">
          
          <div class="onboarding-logo-badge">
            <img src="logo.svg" alt="Sevrony Logo" />
          </div>

          <h1 class="onboarding-title">Get started with Sevrony</h1>
          <p class="onboarding-desc">Choose your target exam to practice ${catalogCountLabel(state.activeCatalog)} official questions and sync your progress across devices.</p>

          ${renderCatalogSelector("onboarding")}

          <button class="onboarding-google-btn" type="button" data-action="sign-in-and-download">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            <span>${window.SevSync?.isLinked() ? `Download ${CATALOG_SHORT_LABELS[state.activeCatalog] || "Question"} Bank` : "Sign in with Google"}</span>
          </button>

          <div class="onboarding-features">
            <div class="onboarding-feature-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>${catalogCountLabel(state.activeCatalog)} official ${catalogLabel(state.activeCatalog)} questions</span>
            </div>
            <div class="onboarding-feature-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Authentic adaptive test engine & scoring</span>
            </div>
            <div class="onboarding-feature-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Automatic cloud backup & device sync</span>
            </div>
          </div>

        </div>

        <details class="onboarding-advanced">
          <summary>Advanced: import your own .sat-test file &#9662;</summary>
          <div class="onboarding-advanced-content">
            
            <!-- Step 1 -->
            <div class="flex gap-3">
              <div class="flex flex-col items-center">
                <div class="onboarding-step-badge">1</div>
                <div class="onboarding-step-line"></div>
              </div>
              <div class="pb-3 flex-1">
                <h3 class="text-sm font-semibold text-foreground" style="margin: 0;">Install the Exporter Extension</h3>
                <ol class="mt-1.5 text-xs text-muted-foreground list-decimal list-inside space-y-1" style="margin: 4px 0 0 0; padding-left: 0;">
                  <li>Download and extract the ZIP file.</li>
                  <li>Open Chrome/Edge &rarr; <strong class="text-foreground">Extensions</strong>.</li>
                  <li>Enable <strong class="text-foreground">Developer mode</strong> (top right).</li>
                  <li>Click <strong class="text-foreground">Load unpacked</strong> and select folder.</li>
                </ol>
                <div class="flex flex-wrap gap-2 mt-2.5">
                  <a href="https://github.com/sharthak-sev/sat-qb-exporter/archive/refs/heads/main.zip" class="onboarding-btn-sm primary" style="text-decoration: none;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    <span>Download ZIP</span>
                  </a>
                  <a href="https://github.com/sharthak-sev/sat-qb-exporter" target="_blank" rel="noopener noreferrer" class="onboarding-btn-sm outline" style="text-decoration: none;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
                    <span>View on GitHub</span>
                  </a>
                </div>
              </div>
            </div>
            
            <!-- Step 2 -->
            <div class="flex gap-3">
              <div class="flex flex-col items-center">
                <div class="onboarding-step-badge">2</div>
                <div class="onboarding-step-line"></div>
              </div>
              <div class="pb-3 flex-1">
                <h3 class="text-sm font-semibold text-foreground" style="margin: 0;">Export your Data</h3>
                <p class="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Log into <a href="https://mypractice.collegeboard.org/questionbank/search" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium" style="text-decoration: none;">mypractice.collegeboard.org</a>, open the extension popup, and click <strong class="text-foreground">Export as Interactive Test</strong>.
                </p>
              </div>
            </div>
            
            <!-- Step 3 -->
            <div class="flex gap-3">
              <div class="flex flex-col items-center">
                <div class="onboarding-step-badge">3</div>
              </div>
              <div class="flex-1">
                <h3 class="text-sm font-semibold text-foreground" style="margin: 0;">Import to Sevrony</h3>
                <div class="drop-zone mt-2 border border-dashed border-border rounded-lg p-5 text-center hover:bg-muted/50 transition-colors cursor-pointer group" data-action="import">
                  <div class="flex justify-center mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                  </div>
                  <p class="text-xs font-medium text-foreground" style="margin: 0;">Click here or drag your <strong class="text-primary">.sat-test</strong> file</p>
                </div>
              </div>
            </div>

          </div>
        </details>

        <div class="onboarding-footer">
          <button type="button" data-action="privacy">Privacy Policy</button>
        </div>

      </div>
    `;
  }

  function renderSyncWidget() {
    if (isDemoMode() || !window.SevSync?.isLinked()) return "";
    const status = SevSync.getStatus();
    
    if (status.tokenValid) sessionBubbleDismissed = false;

    let iconHTML = "";
    let text = "";
    let action = "backup";
    let statusClass = "is-synced";
    if (status.syncing) {
      iconHTML = '<svg class="sync-spinner" style="flex-shrink: 0;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
      text = "Syncing...";
      statusClass = "is-syncing";
    } else if (!status.tokenValid) {
      iconHTML = '<svg class="sync-icon" style="flex-shrink: 0;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 2 20 20"/><path d="M22.61 16.95A6 6 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3"/></svg>';
      text = "Session Expired";
      action = "force-cloud-sync";
      statusClass = "is-expired";
    } else {
      iconHTML = '<svg class="sync-icon" style="flex-shrink: 0;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m9 15 3 3 5-5"/></svg>';
      text = "Synced";
    }

    let bubbleHTML = "";
    if (!status.tokenValid && !sessionBubbleDismissed) {
      bubbleHTML = `
        <div class="session-expired-bubble">
          <div class="session-expired-bubble-arrow"></div>
          <div class="session-expired-bubble-content">
            <div class="session-expired-bubble-title">Session Expired</div>
            <div class="session-expired-bubble-desc">Data is not syncing. Click to renew.</div>
          </div>
          <button type="button" class="session-expired-bubble-close" data-action="dismiss-session-bubble" title="Dismiss" onclick="event.stopPropagation()">×</button>
        </div>
      `;
    }

    return `
      <div class="sync-status-wrapper" style="position: relative; display: inline-flex;">
        <button class="sync-status-container ${statusClass}" type="button" data-action="${action}" data-tour-target="sync" title="${action === "force-cloud-sync" ? "Reconnect cloud sync" : "Cloud Sync Status"}" aria-label="${action === "force-cloud-sync" ? "Reconnect cloud sync" : "Open cloud sync status"}">
          ${iconHTML}
          <span class="nav-label">${text}</span>
        </button>
        ${bubbleHTML}
      </div>
    `;
  }

  function renderSidebar() {
    return `
      <div class="sidebar-overlay" data-action="toggle-sidebar"></div>
      <div class="mobile-header">
        <button class="sidebar-toggle mobile-only" type="button" data-action="toggle-sidebar" aria-label="Toggle sidebar">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
        </button>
        <span class="mobile-brand" style="flex: 1;">Sevrony <small>${APP_VERSION}</small></span>
        <div class="mobile-sync-container mobile-only" style="display: flex; align-items: center;">
          ${renderSyncWidget()}
        </div>
      </div>
      <aside class="sidebar">
        <div class="sidebar-header" style="display: flex; justify-content: space-between; align-items: center;">
          <button class="brand-mark" type="button" data-action="dashboard" aria-label="Open dashboard" style="border:none;background:transparent;padding:0;">
            <img class="brand-icon" src="logo.svg" alt="Sevrony Logo">
            <span class="nav-label">
              <strong>Sevrony <span style="color: var(--ink-muted); font-size: 0.85em; font-weight: normal; margin-left: 4px;">${APP_VERSION}</span></strong>
              <small>Local question bank</small>
            </span>
          </button>
          <button class="sidebar-toggle desktop-only" type="button" data-action="toggle-sidebar" aria-label="Toggle sidebar" style="padding: 8px; border-radius: 8px; color: var(--ink-muted);">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
          </button>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-section">
            <p class="nav-heading">Main Menu</p>
            <button class="nav-item ${state.view === 'dashboard' ? 'active' : ''}" type="button" data-action="dashboard" title="Dashboard">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span class="nav-label">Dashboard</span>
            </button>
            <button class="nav-item ${state.view === 'history' ? 'active' : ''}" type="button" data-action="history" data-tour-target="history-nav" title="Past Tests">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              <span class="nav-label">Past Tests</span>
            </button>
            <button class="nav-item ${state.view === 'mistakes' ? 'active' : ''}" type="button" data-action="retry-mistakes" title="Retry Mistakes">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
              <span class="nav-label">Retry Mistakes</span>
            </button>
            <button class="nav-item ${state.view === 'mistakes-log' ? 'active' : ''}" type="button" data-action="mistakes-log" data-tour-target="mistakes-log-nav" title="Mistakes Log">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <g transform="rotate(-30 12 12)">
                  <ellipse cx="6" cy="12" rx="3" ry="5"/>
                  <line x1="6" y1="7" x2="18" y2="7"/>
                  <line x1="6" y1="17" x2="18" y2="17"/>
                  <path d="M18 7c1.66 0 3 2.24 3 5s-1.34 5-3 5"/>
                  <line x1="10" y1="10" x2="16" y2="10"/>
                  <line x1="12" y1="14" x2="17" y2="14"/>
                </g>
              </svg>
              <span class="nav-label">Mistakes Log</span>
            </button>
            <button class="nav-item ${state.view === 'vocab' || state.view === 'vocab-mastered' ? 'active' : ''}" type="button" data-action="vocab" data-tour-target="vocab-nav" title="Vocabulary">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
              <span class="nav-label">Vocabulary</span>
            </button>
          </div>

          <div class="nav-section mt-auto">
            <p class="nav-heading">Settings</p>
            <button class="nav-item ${state.view === 'backup' ? 'active' : ''}" type="button" data-action="backup" data-tour-target="backup-nav" title="Data & Backups">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              <span class="nav-label">Data & Backups</span>
            </button>
            <button class="nav-item ${state.view === 'privacy' ? 'active' : ''}" type="button" data-action="privacy" title="Privacy">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span class="nav-label">Privacy</span>
            </button>
            <button class="nav-item" type="button" data-action="open-feedback" title="Feedback">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <span class="nav-label">Feedback</span>
            </button>
            <button class="nav-item support-btn" type="button" data-action="open-support" title="Support the project">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
              <span class="nav-label">Support the project</span>
            </button>
          </div>
          
          <div class="sidebar-footer desktop-only">
            ${renderSyncWidget()}
          </div>
        </nav>
      </aside>
    `;
  }

  function showFeedbackModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay feedback-overlay";
    const modal = document.createElement("div");
    modal.className = "feedback-dialog";
    
    // Auto-collect context
    const urlHash = window.location.hash || "#dashboard";
    const userAgent = navigator.userAgent;
    const viewport = `${window.innerWidth}x${window.innerHeight}`;
    const userEmail = (window.SevSync && window.SevSync.getStatus) ? window.SevSync.getStatus()?.email : "";
    
    modal.innerHTML = `
      <div class="feedback-header">
        <div class="feedback-icon-wrapper">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        </div>
        <div class="feedback-title-group">
          <h3>Send Feedback</h3>
          <p>We'd love to hear your thoughts or bug reports.</p>
        </div>
        <button class="close-btn cancel-btn" type="button" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      
      <div class="feedback-body">
        <div class="feedback-form-group">
          <label>Feedback Type</label>
          <div class="feedback-type-selector">
            <label class="fb-radio-card">
              <input type="radio" name="fb-type" value="Bug" checked>
              <div class="fb-radio-content">Bug</div>
            </label>
            <label class="fb-radio-card">
              <input type="radio" name="fb-type" value="Feature">
              <div class="fb-radio-content">Feature</div>
            </label>
            <label class="fb-radio-card">
              <input type="radio" name="fb-type" value="General">
              <div class="fb-radio-content">General</div>
            </label>
          </div>
        </div>

        <div class="feedback-form-group">
          <label>Message</label>
          <textarea id="fb-msg" class="feedback-textarea" rows="4" placeholder="Tell us what you think..."></textarea>
        </div>

        <div class="feedback-form-row">
          ${userEmail ? '' : `
          <div class="feedback-form-group" style="flex:1; min-width: 0;">
            <label>Email <span class="muted">(Optional)</span></label>
            <input type="email" id="fb-email" class="feedback-input" placeholder="For follow-ups">
          </div>
          `}
          <div class="feedback-form-group" style="flex:1; min-width: 0;">
            <label>Screenshot <span class="muted">(Optional)</span></label>
            <div class="file-upload-wrapper">
              <input type="file" id="fb-file" accept="image/*" multiple class="file-upload-input">
              <div class="file-upload-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                <span id="fb-file-name">Attach Image</span>
              </div>
            </div>
          </div>
        </div>
        
        <div id="fb-error" role="alert" style="display: none; color: var(--red); font-size: 0.85em; margin-bottom: 8px;"></div>

        <button id="fb-submit" class="feedback-submit-btn">
          <span class="btn-text">Send Feedback</span>
          <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>

      <div class="feedback-status" style="display:none;">
        <div class="status-icon-wrapper">
          <svg id="fb-status-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </div>
        <h4 id="fb-status-title">Sent successfully!</h4>
        <p id="fb-status-msg" class="muted">Thank you for helping us improve.</p>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.remove("visible");
      modal.classList.remove("visible");
      setTimeout(() => overlay.remove(), 300);
    };

    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      modal.classList.add("visible");
    });

    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    modal.querySelector(".cancel-btn").onclick = close;

    const fileInput = modal.querySelector("#fb-file");
    const fileNameDisplay = modal.querySelector("#fb-file-name");
    fileInput.onchange = (e) => {
      if (e.target.files.length > 5) {
        alert("You can only attach up to 5 images.");
        fileInput.value = "";
        fileNameDisplay.innerText = "Attach Image";
        return;
      }

      if (e.target.files.length > 1) {
        fileNameDisplay.innerText = `${e.target.files.length} images attached`;
      } else if (e.target.files.length === 1) {
        fileNameDisplay.innerText = e.target.files[0].name;
      } else {
        fileNameDisplay.innerText = "Attach Image";
      }
    };

    modal.querySelector("#fb-submit").onclick = async () => {
      const type = modal.querySelector('input[name="fb-type"]:checked').value;
      const msg = modal.querySelector("#fb-msg").value.trim();
      const emailField = modal.querySelector("#fb-email");
      const email = emailField ? emailField.value.trim() : userEmail;
      
      if (!msg) {
        modal.querySelector("#fb-msg").focus();
        modal.querySelector("#fb-msg").style.borderColor = "var(--red)";
        return;
      }
      modal.querySelector("#fb-msg").style.borderColor = "";

      const errorLine = modal.querySelector("#fb-error");
      errorLine.style.display = "none";

      const submitBtn = modal.querySelector("#fb-submit");
      const btnText = submitBtn.querySelector(".btn-text");
      const btnIcon = submitBtn.querySelector(".btn-icon");
      // Captured so a failed send can put the button back exactly as it was.
      // Read from the DOM rather than duplicated here so it cannot drift from
      // the markup above, and re-read on each attempt because a previous
      // failure already restored it.
      const originalIcon = btnIcon.outerHTML;
      btnText.innerText = "Sending...";
      btnIcon.outerHTML = '<svg class="btn-icon" style="animation: spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
      submitBtn.disabled = true;

      // A failed send leaves the form standing with the reason above the button.
      // The old path hid the form and closed the modal on a timer, which threw
      // away whatever had been typed -- worst for exactly the long bug reports
      // worth reading. Nothing is lost now and Send works again immediately.
      const fail = (text) => {
        errorLine.innerText = text;
        errorLine.style.display = "block";
        btnText.innerText = "Send Feedback";
        submitBtn.querySelector(".btn-icon").outerHTML = originalIcon;
        submitBtn.disabled = false;
      };

      const formData = new FormData();
      formData.append("type", type);
      formData.append("message", msg);
      formData.append("email", email);
      formData.append("context", JSON.stringify({ urlHash, userAgent, viewport, version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "unknown" }));
      
      if (fileInput.files.length > 0) {
        for (let i = 0; i < fileInput.files.length; i++) {
          formData.append("file", fileInput.files[i]);
        }
      }

      try {
        const res = await fetch(SevApi.url("/api/feedback"), {
          method: "POST",
          body: formData
        });

        if (!res.ok) {
          const body = await res.text();
          // Only a parsed {"error":"..."} is trusted for display. A proxy or WAF
          // in front of the Worker answers with an HTML page, and pasting that
          // into the modal would be worse than saying nothing -- those fall
          // through to the status line below. The raw body still goes to console.
          let detail = "";
          try { detail = String(JSON.parse(body).error || ""); } catch (e) {}
          console.error("Feedback failed", res.status, detail || body);
          // A 4xx message is written for the person reading it -- "Message is
          // required", the rate-limit wait -- so it goes through as-is. A 5xx is
          // our fault and its text names internals ("DISCORD_WEBHOOK_URL is not
          // configured") that mean nothing to a student, so show the status code
          // they can quote back instead, and say plainly it is not their network.
          fail(res.status >= 500
            ? `Sevrony's server couldn't pass this on (error ${res.status}). This is not your connection — please try again shortly.`
            : detail || `Request rejected (error ${res.status}).`);
          return;
        }

        modal.querySelector(".feedback-body").style.display = "none";
        const statusDiv = modal.querySelector(".feedback-status");
        statusDiv.style.display = "flex";

        setTimeout(close, 2500);
      } catch (err) {
        // Only a genuine transport failure reaches here now, so this is the one
        // place the connection wording is actually true.
        console.error("Feedback error", err);
        fail("Couldn't reach Sevrony. Check your connection and try again.");
      }
    };
  }

  function showSupportModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal-content support-modal panel";
    
    modal.innerHTML = `
      <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:16px;">
        <div>
          <p class="eyebrow" style="margin:0; font-size:12px;">Support this project</p>
          <h2 style="margin:4px 0 0; font-size:1.25rem; display: flex; align-items: center; gap: 8px;">Support the project <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--red);"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg></h2>
        </div>
        <button class="ghost-btn cancel-btn" type="button" style="padding: 4px 8px; border:none; height:32px; min-height:32px;">✕</button>
      </div>
      <div style="text-align: center; margin: 20px 0;">
        <a href="https://ko-fi.com/sevrony" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-bottom: 16px;">
          <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi" style="height: 36px; border-radius: 4px;">
        </a>
        <br>
        <img src="qr.svg" alt="Payment QR Code" style="width: 200px; height: 200px; border-radius: var(--radius-sm); border: 1px solid var(--line);">
      </div>
      <div class="support-code-wrap" style="width: 100%; display:flex; justify-content: center; align-items:center; gap:8px;">
        <span>UPI ID:</span>
        <code title="Copy UPI ID">sharthak-jaiswal@fam</code>
      </div>
      <div style="text-align: center; margin-top: 16px; font-size: 12px; color: var(--muted-foreground);">
        <button type="button" class="ghost-btn" data-action="privacy" style="font-size: 12px; padding: 4px 8px; min-height: auto;">Privacy Policy</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      modal.classList.add("visible");
    });

    const close = () => {
      overlay.classList.remove("visible");
      modal.classList.remove("visible");
      setTimeout(() => overlay.remove(), 250);
    };

    modal.querySelector(".cancel-btn").onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    const privacyBtn = modal.querySelector("[data-action='privacy']");
    if (privacyBtn) {
      privacyBtn.onclick = () => {
        close();
        state.view = "privacy";
        state.notice = null;
        renderHome();
      };
    }
  }

  function renderNotice(notice) {
    if (!notice) return "";
    const isError = notice.type === "error";
    const iconColor = isError ? "var(--red)" : "var(--green)";
    const iconSvg = isError 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    
    return `
      <section class="notice sonner-toast ${notice.type || "info"}">
        <div style="display:flex;align-items:center;gap:12px;flex:1;">
          ${iconSvg}
          <p style="margin:0;font-weight:500;font-size:14px;color:var(--ink);">${escapeHtml(notice.text)}</p>
        </div>
        <button type="button" class="ghost-btn icon-btn" data-action="dismiss-notice" aria-label="Dismiss" style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;padding:0;background:none;border:none;color:var(--ink-muted);cursor:pointer;opacity:0.7;transition:opacity 0.2s;flex-shrink:0;">
          <svg viewBox="0 0 24 24" style="position:absolute;top:0;left:0;width:100%;height:100%;transform:rotate(-90deg);pointer-events:none;">
            <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.2" />
            <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="69.11" stroke-dashoffset="0" style="animation: notice-countdown 5s linear forwards;" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </section>
    `;
  }

  function calculateStreakData(sessions) {
    if (!sessions || !sessions.length) return { current: 0, longest: 0, week: [] };
    const toDateStr = (dateObj) => `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;

    const activeDates = new Set();
    for (const s of sessions) {
       if (!s.completedAt || s.id === "__active_test__") continue;
       const d = new Date(s.completedAt);
       if (!isNaN(d)) activeDates.add(toDateStr(d));
    }

    const today = new Date();
    const todayStr = toDateStr(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toDateStr(yesterday);

    let current = 0;
    if (activeDates.has(todayStr) || activeDates.has(yesterdayStr)) {
       let d = new Date(today);
       if (!activeDates.has(toDateStr(d))) d.setDate(d.getDate() - 1);
       while (activeDates.has(toDateStr(d))) {
          current++;
          d.setDate(d.getDate() - 1);
       }
    }

    const sortedDates = Array.from(activeDates).sort();
    let longest = 0;
    let temp = 0;
    let prev = null;

    for (const dStr of sortedDates) {
       const [y, m, day] = dStr.split('-');
       const d = new Date(y, m-1, day);
       if (!prev) {
          temp = 1;
       } else {
          const diffDays = Math.round((d - prev) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) temp++;
          else if (diffDays > 1) temp = 1;
       }
       if (temp > longest) longest = temp;
       prev = d;
    }

    const week = [];
    const startOfWeek = new Date(today);
    // Fix: start week on Monday
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; 
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    for (let i = 0; i < 7; i++) {
       const d = new Date(startOfWeek);
       d.setDate(d.getDate() + i);
       const dStr = toDateStr(d);
       week.push({ day: ["M","T","W","T","F","S","S"][i], active: activeDates.has(dStr), isToday: dStr === todayStr, isFuture: d > today });
    }

    return { current, longest, week };
  }

  function renderStreakWidget() {
    const data = calculateStreakData(getActiveSessions());
    const today = new Date();
    today.setHours(0,0,0,0);

    const weekDots = data.week.map((w, index) => {
      let isCompleted = w.active;
      let isToday = w.isToday;
      let isFuture = w.isFuture;
      
      let dayLabel = w.day.slice(0,1);

      let boxStyle = `position: relative; display: flex; width: 100%; aspect-ratio: 1/1; max-width: 48px; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid; transition: all 0.2s; margin: 0 auto; box-sizing: border-box;`;
      
      let inactiveIconColor = isFuture ? 'color-mix(in srgb, var(--ink-muted, #64748b) 30%, transparent)' : 'color-mix(in srgb, var(--ink-muted, #64748b) 50%, transparent)';
      let inactiveIcon = `<svg xmlns="http://www.w3.org/2000/svg" style="width: 45%; height: 45%; max-width: 24px; max-height: 24px;" viewBox="0 0 24 24" fill="none" stroke="${inactiveIconColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 3h12l4 6-10 13L2 9Z"/>
        <path d="M2 9h20"/>
        <path d="m12 22-4-13"/>
        <path d="m12 22 4-13"/>
      </svg>`;
      
      let icon = "";
      if (isFuture) {
        boxStyle += `border-color: color-mix(in srgb, var(--line, #e2e8f0) 40%, transparent); background: color-mix(in srgb, var(--panel-alt, #f8fafc) 20%, transparent); opacity: 0.5;`;
        icon = inactiveIcon;
      } else if (isCompleted) {
        boxStyle += `border-color: var(--ink, #0f172a); background: var(--ink, #0f172a);`;
        icon = `<svg xmlns="http://www.w3.org/2000/svg" style="width: 45%; height: 45%; max-width: 24px; max-height: 24px;" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 3h12l4 6-10 13L2 9Z"/>
          <path d="M2 9h20"/>
          <path d="m12 22-4-13"/>
          <path d="m12 22 4-13"/>
        </svg>`;
      } else {
        boxStyle += `border-color: var(--line, #e2e8f0); background: color-mix(in srgb, var(--panel-alt, #f8fafc) 30%, transparent);`;
        icon = inactiveIcon;
      }
      
      if (isToday) {
        if (!isCompleted) {
          boxStyle += `border-color: var(--ink, #0f172a); border-width: 2px;`;
        } else {
          boxStyle += `box-shadow: 0 0 0 2px var(--panel, #fff), 0 0 0 4px var(--ink, #0f172a);`;
        }
      }

      let textColor = isToday && isCompleted ? 'var(--ink, #0f172a)' : (isFuture ? 'color-mix(in srgb, var(--ink-muted) 50%, transparent)' : 'var(--ink-muted, #64748b)');

      return `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; min-width: 0; padding: 0 2px; box-sizing: border-box;">
          <div style="${boxStyle}">
            ${icon}
          </div>
          <span style="font-size: 13px; font-weight: 500; color: ${textColor};">${dayLabel}</span>
        </div>
      `;
    }).join("");

    return `
      <section style="width: 100%; max-width: 768px; margin: 0 auto 24px auto; box-sizing: border-box;">
        <div style="width: 100%; display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--line, #e2e8f0); background: var(--panel, #fff); padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); box-sizing: border-box;">
          
          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 140px;">
              <div style="display: flex; height: 48px; width: 48px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; background: color-mix(in srgb, var(--ink, #0f172a) 8%, transparent);">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="var(--ink, #0f172a)" stroke="var(--ink, #0f172a)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M2 9h20"/><path d="m12 22-4-13"/><path d="m12 22 4-13"/></svg>
              </div>
              <div style="display: flex; flex-direction: column; justify-content: center;">
                <h3 style="font-size: 13px; font-weight: 500; color: var(--ink-muted, #64748b); margin: 0;">Current Streak</h3>
                <div style="display: flex; align-items: baseline; gap: 4px; margin-top: 2px;">
                  <span style="font-size: 26px; font-weight: 700; color: var(--ink, #0f172a); line-height: 1;">${data.current}</span>
                  <span style="font-size: 14px; font-weight: 500; color: var(--ink-muted, #64748b);">days</span>
                </div>
              </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 140px; justify-content: flex-end;">
              <div style="display: flex; flex-direction: column; justify-content: center; align-items: flex-end;">
                <h3 style="font-size: 13px; font-weight: 500; color: var(--ink-muted, #64748b); margin: 0;">Longest Streak</h3>
                <div style="display: flex; align-items: baseline; gap: 4px; margin-top: 2px;">
                  <span style="font-size: 26px; font-weight: 700; color: var(--ink, #0f172a); line-height: 1;">${data.longest}</span>
                  <span style="font-size: 14px; font-weight: 500; color: var(--ink-muted, #64748b);">days</span>
                </div>
              </div>
              <div style="display: flex; height: 48px; width: 48px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; background: color-mix(in srgb, var(--ink, #0f172a) 8%, transparent);">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ink, #0f172a)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
              </div>
            </div>
          </div>
          
          <div style="border-top: 1px solid var(--line, #e2e8f0); padding-top: 20px; display: flex; justify-content: space-between; width: 100%; box-sizing: border-box;">
            ${weekDots}
          </div>
        </div>
      </section>
    `;
  }


  function renderDashboard() {
    const activeQuestions = state.questions;
    const activeResponses = getActiveResponses();
    const activeBanks = getActiveBanks();
    const metrics = buildMetrics(activeQuestions, activeResponses);
    const mathCount = metrics.bank.bySubject.math || 0;
    const rwCount = metrics.bank.bySubject.rw || 0;

    const catalogSelectorHtml = renderCatalogSelector("dashboard");

    if (!activeQuestions.length) {
      return `
        <section class="hero-card empty-state">
          <div style="margin-bottom: 24px; display: flex; justify-content: center;">
            ${catalogSelectorHtml}
          </div>
          <div>
            <p class="eyebrow">Welcome</p>
            <h1>Sign in to start practicing.</h1>
            <p>Download ${catalogCountLabel(state.activeCatalog)} official ${catalogLabel(state.activeCatalog)} practice questions and sync your progress across devices.</p>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;align-items:stretch;max-width:320px;margin:20px auto 0;">
            <button class="primary-btn large" type="button" data-action="sign-in-and-download" style="gap: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              ${window.SevSync?.isLinked() ? "Download Question Bank" : "Sign in with Google"}
            </button>
            <button class="ghost-btn" type="button" data-action="import" style="font-size:13px;">Or import your own .sat-test file</button>
          </div>
        </section>
      `;
    }

    const catalogCount = catalogQuestionCount();
    const totalCount = activeQuestions.length;
    let questionsSubtitle = "";
    if (catalogCount > 0 && catalogCount === totalCount) {
      questionsSubtitle = `${activeBanks.length} bank${activeBanks.length === 1 ? "" : "s"} · ${totalCount.toLocaleString()} ${catalogLabel(state.activeCatalog)} questions`;
    } else if (catalogCount > 0) {
      questionsSubtitle = `${activeBanks.length} bank${activeBanks.length === 1 ? "" : "s"} · ${catalogCount.toLocaleString()} ${catalogLabel(state.activeCatalog)} questions (+${(totalCount - catalogCount).toLocaleString()} imported)`;
    } else if (totalCount > 0) {
      questionsSubtitle = `${activeBanks.length} bank${activeBanks.length === 1 ? "" : "s"} · ${totalCount.toLocaleString()} imported question${totalCount === 1 ? "" : "s"}`;
    } else {
      questionsSubtitle = `0 banks · 0 questions`;
    }

    return `
      <div class="hero-actions" style="display: flex; justify-content: space-between; margin-bottom: 32px; gap: 16px; flex-wrap: wrap; align-items: flex-end;" data-tour-target="dashboard-hero">
        <div>
          <h1 style="font-size: 32px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 4px;">Dashboard</h1>
          <p style="color: var(--ink-muted); font-size: 15px; margin: 0;">${questionsSubtitle}</p>
        </div>
        <div class="top-actions" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
          ${catalogSelectorHtml}
          <button class="primary-btn" type="button" data-action="config" data-tour-target="create-test">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-3px"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Create New Test
          </button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 24px;">
        ${shouldOfferCatalog() ? `
        <section class="panel catalog-upgrade-banner" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-radius: 12px; background: linear-gradient(145deg, var(--card) 0%, color-mix(in srgb, var(--line) 30%, transparent) 100%); border: 1px solid var(--line); box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
          <div style="display: flex; align-items: center; gap: 16px; flex: 1; min-width: 250px;">
            <div style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: color-mix(in srgb, var(--ink) 5%, transparent); color: var(--ink);">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            </div>
            <div>
              <strong style="display: block; font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 2px;">Switch to the Sevrony question bank</strong>
              <span class="muted" style="font-size: 13px;">Same ${catalogCountLabel(state.activeCatalog)} questions, now served from Sevrony. Your answers and progress carry over, and your backups get about 100× smaller.</span>
            </div>
          </div>
          <div class="catalog-upgrade-actions" style="display: flex; gap: 8px; flex-shrink: 0;">
            <button class="ghost-btn" data-action="dismiss-catalog-banner" style="padding: 8px 16px; font-size: 13px; font-weight: 500;">Not now</button>
            <button class="primary-btn" data-action="download-catalog" style="padding: 8px 16px; font-size: 13px; font-weight: 500;">Switch</button>
          </div>
        </section>
        ` : ''}

        ${!isDemoMode() && !window.SevSync?.isLinked() && !localStorage.getItem('sevrony.syncBannerDismissed') && state.banks.length > 0 ? `
        <section class="panel cloud-sync-banner" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-radius: 12px; background: linear-gradient(145deg, var(--card) 0%, color-mix(in srgb, var(--line) 30%, transparent) 100%); border: 1px solid var(--line); box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
          <div style="display: flex; align-items: center; gap: 16px; flex: 1; min-width: 250px;">
            <div style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: color-mix(in srgb, var(--ink) 5%, transparent); color: var(--ink);">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 17 4-4 4 4"/></svg>
            </div>
            <div>
              <strong style="display: block; font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 2px;">Secure Your Progress</strong>
              <span class="muted" style="font-size: 13px;">Enable Google Drive sync to back up data and practice seamlessly across devices.</span>
            </div>
          </div>
          <div class="cloud-sync-actions" style="display: flex; gap: 8px; flex-shrink: 0;">
            <button class="ghost-btn" data-action="dismiss-sync-banner" style="padding: 8px 16px; font-size: 13px; font-weight: 500;">Dismiss</button>
            <button class="primary-btn" data-action="setup-cloud-sync" style="padding: 8px 16px; font-size: 13px; font-weight: 500;">Connect Drive</button>
          </div>
        </section>
        ` : ''}

        ${renderStreakWidget()}

        <section class="metric-grid" data-tour-target="metrics">
          ${renderMetric("Math Bank", mathCount, "Questions imported", "", `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>`)}
          ${renderMetric("RW Bank", rwCount, "Questions imported", "", `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 Z"/></svg>`)}
          ${renderMetric("Accuracy", formatPercent(metrics.overall.accuracy), `${metrics.overall.answered} questions answered`, "", `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`)}
          ${renderMetric("Avg Time", metrics.overall.avgTime ? `${Math.round(metrics.overall.avgTime)}s` : "—", "Per question", "", `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`)}
        </section>

        <div class="dashboard-card-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 24px;">
          <section class="panel">
            <div class="panel-heading" style="margin-bottom: 20px;">
              <h2 style="font-size: 16px; font-weight: 600; letter-spacing: 0;">Skill Level by Domain</h2>
              <p class="muted" style="font-size: 13px; margin-top: 2px;">Your proficiency based on recent performance.</p>
            </div>
            ${renderDomainPerformance(metrics.domains)}
          </section>
          <section class="panel">
            <div class="panel-heading" style="margin-bottom: 20px;">
              <h2 style="font-size: 16px; font-weight: 600; letter-spacing: 0;">Completed Questions</h2>
              <p class="muted" style="font-size: 13px; margin-top: 2px;">Volume by domain and subject.</p>
            </div>
            ${renderVolumeStats(metrics.domains, metrics.subjects)}
          </section>
        </div>

        <div class="dashboard-card-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 24px;">
          <section class="panel">
            <div class="panel-heading" style="margin-bottom: 20px;">
              <h2 style="font-size: 16px; font-weight: 600; letter-spacing: 0;">Average Time by Subject</h2>
              <p class="muted" style="font-size: 13px; margin-top: 2px;">Your speed across different subjects.</p>
            </div>
            ${renderSubjectTiming(metrics.subjects)}
          </section>
          <section class="panel">
            <div class="panel-heading" style="margin-bottom: 20px;">
              <h2 style="font-size: 16px; font-weight: 600; letter-spacing: 0;">Priority Review Areas</h2>
              <p class="muted" style="font-size: 13px; margin-top: 2px;">Topics where you struggle the most.</p>
            </div>
            ${renderWeaknesses(metrics.domains)}
          </section>
        </div>

        <section class="panel support-panel">
          <div class="panel-heading" style="margin-bottom: 12px;">
            <h2 style="font-size: 16px; font-weight: 600; letter-spacing: 0; display: flex; align-items: center; gap: 8px;">
              Support the project
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--red);"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </h2>
          </div>
          <p class="muted" style="font-size: 14px;">If this tool helped your SAT prep, you can support its development!</p>
          <div style="margin-top: 16px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <a href="https://ko-fi.com/sevrony" target="_blank" rel="noopener noreferrer">
              <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi" style="height: 36px; border-radius: 4px;">
            </a>
            <div class="support-code-wrap" style="margin-top: 0; padding: 6px 12px; font-size: 13px;">
              <span>UPI ID:</span>
              <code title="Copy UPI ID">sharthak-jaiswal@fam</code>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderCloudSyncSection() {
    let syncContent = '';
    if (window.SevSync?.isLinked()) {
      const status = SevSync.getStatus();
      const ago = status.lastSynced ? (() => { const d = Math.round((Date.now() - new Date(status.lastSynced).getTime()) / 1000); if (d < 60) return 'just now'; if (d < 3600) return Math.floor(d/60) + ' min ago'; if (d < 86400) return Math.floor(d/3600) + 'h ago'; return Math.floor(d/86400) + 'd ago'; })() : 'never';
      const autoSyncActive = status.tokenValid;
      syncContent = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div class="${autoSyncActive ? 'success-dot' : 'warning-dot'}" style="${!autoSyncActive ? 'background:var(--yellow,#eab308);' : ''}"></div>
          <span>Linked: <strong>${escapeHtml(status.email || '')}</strong></span>
        </div>
        <p class="muted" style="margin-bottom:8px; font-size:13px;">Last synced: ${escapeHtml(ago)}</p>
        ${autoSyncActive
          ? '<p class="muted" style="margin-bottom:16px; font-size:12px; color:var(--green,#22c55e);">✓ Auto-sync active — changes sync across devices automatically</p>'
          : '<p class="muted" style="margin-bottom:16px; font-size:12px; color:var(--yellow,#eab308);">Session expired — tap the sync icon in the sidebar to reconnect</p>'
        }
        <div style="display: flex; gap: 8px;">
          <button class="danger-btn" type="button" data-action="logout">Log Out</button>
        </div>
      `;
    } else {
      syncContent = `<button class="secondary-btn" data-action="link-cloud-sync">
           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; margin-right: 6px;"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
           Link Google Account
         </button>`;
    }

    return `
      <section class="panel" style="margin-top: 32px;">
        <div class="panel-heading">
          <p class="eyebrow">Cloud Sync</p>
          <h2 style="display: flex; align-items: center; gap: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--blue);"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
            Google Drive Sync
          </h2>
        </div>
        <p class="muted" style="margin-bottom:16px;">Sync your data across devices using your Google account. Data is stored privately in your own Google Drive.</p>
        ${syncContent}
      </section>
    `;
  }

  function renderBackupView() {
    const _isDemoMode = isDemoMode();
    return `
      <section class="hero-card compact-hero">
        <div>
          <p class="eyebrow">Data & Backups</p>
          <h1>Manage your local data.</h1>
          <p>Secure your test history or transfer it between devices.</p>
        </div>
      </section>

      ${_isDemoMode ? '' : renderCloudSyncSection()}



      <section class="panel two-column" style="margin-top: 32px;">
        <div class="backup-col-left">
          <div class="panel-heading">
            <p class="eyebrow">Data Security</p>
            <h2>Automatic Backups</h2>
          </div>
          <p class="muted" style="margin-bottom:16px;">Link a backup folder to automatically save your progress after every test.</p>
          ${state.backupHandle 
            ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><div class="success-dot"></div><span>Backup folder linked</span><button class="ghost-btn" data-action="unlink-backup">Unlink</button></div>`
            : `<button class="secondary-btn" data-action="link-backup">Link Backup Folder</button>`}
          ${state.backupMessage ? `<p style="color:var(--${state.backupMessage.type === 'error' ? 'red' : 'bb-blue'}); font-size:13px; margin-top:8px;">${escapeHtml(state.backupMessage.text)}</p>` : ''}
        </div>
        <div class="backup-col-right">
          <div class="panel-heading">
            <p class="eyebrow">Data Portability</p>
            <h2>Manual Transfer</h2>
          </div>
          <p class="muted" style="margin-bottom:16px;">If you can't link a folder, or want to move your progress to another device, you can manually download and restore a backup file.</p>
          <div style="display: flex; gap: 8px;">
            <button class="ghost-btn" data-action="download-backup">Download Backup</button>
            <button class="secondary-btn" data-action="restore-backup">Restore File</button>
          </div>
        </div>
      </section>

      <section class="panel" style="margin-top: 32px; border-color: var(--red-border); background: var(--red-bg);">
        <div class="panel-heading">
          <h2 style="color: var(--red);">Data Controls</h2>
        </div>
        <p style="color: var(--red); opacity: 0.8; margin-bottom: 16px;">Resetting progress wipes your test history but keeps your question banks. Wiping all data deletes everything, including question banks.</p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="danger-btn" type="button" data-action="reset">Reset Progress</button>
          <button class="danger-btn" type="button" data-action="wipe-all">Wipe All Data</button>
        </div>
      </section>
    `;
  }

  function renderTestConfig() {
    const availableDomains = getAvailableDomains(state.config.subject);
    const selectedDomains = new Set(state.config.domainCodes.length ? state.config.domainCodes : availableDomains.map(d => d.code));
    const allSkills = availableDomains.flatMap(d => d.skills);
    const selectedSkills = new Set(state.config.skillCodes?.length ? state.config.skillCodes : allSkills);
    const selectedDifficulties = new Set(state.config.difficulties.length ? state.config.difficulties : ["E", "M", "H"]);
    const availableCount = countFilteredQuestions({
      ...state.config,
      domainCodes: [...selectedDomains],
      skillCodes: [...selectedSkills],
      difficulties: [...selectedDifficulties]
    });

    return `
      <section class="hero-card config-hero">
        <div>
          <p class="eyebrow">Create New Test · ${catalogLabel(state.activeCatalog)}</p>
          <h1>Choose your practice mode.</h1>
          <p>Single-subject uses a per-question count-up timer. Full test runs RW→Break→Math with adaptive Module 2 routing.</p>
        </div>
      </section>

      <form id="configForm" class="config-panel">
        <section class="panel">
          <div class="panel-heading">
            <p class="eyebrow">Subject</p>
            <h2>Practice Mode</h2>
          </div>
          <div class="segmented">
            ${renderRadio("subject", "math", "Math", state.config.subject)}
            ${renderRadio("subject", "rw", "Reading / Writing", state.config.subject)}
            ${renderRadio("subject", "both", "Both — Full Test", state.config.subject)}
          </div>
        </section>

        <section class="panel">
          <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p class="eyebrow">Filters</p>
              <h2>Domains</h2>
            </div>
            ${state.config.subject !== "both" ? `<button type="button" class="ghost-btn" data-action="toggle-advanced-domains" style="font-size: 13px; padding: 4px 8px;">${state.showAdvancedDomains ? "Hide" : "Advanced"}</button>` : ""}
          </div>
          <div class="check-grid">
            ${state.config.subject !== "both" && state.showAdvancedDomains ? `
              <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom: 8px; grid-column: 1 / -1;">
                <button type="button" class="ghost-btn" data-action="select-all-skills" style="font-size:12px; padding:4px 8px;">Select All</button>
                <button type="button" class="ghost-btn" data-action="deselect-all-skills" style="font-size:12px; padding:4px 8px;">Deselect All</button>
                <button type="button" class="ghost-btn" data-action="reset-skills" style="font-size:12px; padding:4px 8px;">Reset</button>
              </div>
            ` : ""}
            ${availableDomains.map(domain => `
              <div style="display:flex; flex-direction:column; gap:4px;">
                <label class="check-card" style="height:auto; min-height:76px; margin-bottom:0;">
                  <input type="checkbox" name="domain" value="${escapeAttr(domain.code)}" ${selectedDomains.has(domain.code) ? "checked" : ""}>
                  <span>${escapeHtml(domain.label)}</span>
                  <small>${escapeHtml(domain.code)}</small>
                </label>
                ${state.config.subject !== "both" && state.showAdvancedDomains && domain.skills && domain.skills.length > 0 ? `
                  <div style="display:flex; flex-direction:column; gap:6px; margin-left:12px; margin-top:4px; border-left:2px solid var(--line); padding-left:12px;">
                    ${domain.skills.map(skill => {
                      const isChecked = selectedSkills.has(skill);
                      const customCount = state.config.customSkillCounts?.[skill] || "";
                      const maxAvailable = countAvailableQuestionsForSkill(skill, state.config);
                      return `
                      <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; align-items:center; justify-content:space-between;">
                          <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--ink); cursor:pointer;">
                            <input type="checkbox" name="skill" value="${escapeAttr(skill)}" ${isChecked ? "checked" : ""} onchange="window.handleSkillCheckboxChange(this)">
                            <span>${escapeHtml(skill)}</span>
                          </label>
                          <button type="button" class="ghost-btn" data-action="toggle-skill-limit" data-skill="${escapeAttr(skill)}" style="font-size: 16px; padding: 2px 6px; line-height: 1; display: ${isChecked ? 'inline-block' : 'none'};" title="Set question limit">${state.showSkillLimits && state.showSkillLimits[skill] ? '\u2212' : '+'}</button>
                        </div>
                        <div id="limit_${escapeAttr(skill)}" style="margin-left: 24px; display:${isChecked && state.showSkillLimits && state.showSkillLimits[skill] ? 'flex' : 'none'}; align-items:center; gap:8px;">
                            <div class="stepper-group">
                              <button type="button" class="stepper-btn" data-action="stepper-dec" data-skill="${escapeAttr(skill)}">−</button>
                              <input type="number" name="skill_count_${escapeAttr(skill)}" value="${customCount}" min="1" max="${maxAvailable}" placeholder="Limit" style="width: 56px; padding: 4px; font-size: 13px; border-radius: 4px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); text-align:center;">
                              <button type="button" class="stepper-btn" data-action="stepper-inc" data-skill="${escapeAttr(skill)}">+</button>
                            </div>
                            <small class="muted" style="font-size: 11px;">Max: ${maxAvailable}</small>
                        </div>
                      </div>
                    `}).join("")}
                  </div>
                ` : ""}
              </div>
            `).join("") || `<p class="muted">Import questions to see domains.</p>`}
</div>
        </section>

        <section class="panel two-column compact">
          <div>
            <div class="panel-heading">
              <p class="eyebrow">Difficulty</p>
              <h2>Question Difficulty</h2>
            </div>
            <div class="difficulty-row">
              ${Object.entries(DIFFICULTIES).map(([code, label]) => `
                <label class="difficulty-pill">
                  <input type="checkbox" name="difficulty" value="${code}" ${selectedDifficulties.has(code) ? "checked" : ""}>
                  <span>${label}</span>
                </label>
              `).join("")}
            </div>
          </div>
          <div>
            <div class="panel-heading">
              <p class="eyebrow">Deduplication</p>
              <h2>History Filter</h2>
            </div>
            <label class="toggle-card">
              <input type="checkbox" name="excludeAnswered" ${state.config.excludeAnswered ? "checked" : ""}>
              <span class="toggle-ui"></span>
              <span>
                <strong>Exclude already answered</strong>
                <small>Uses your local response history.</small>
              </span>
            </label>
            ${state.config.subject !== "both" ? `
            <label class="toggle-card" style="margin-top: 12px;">
              <input type="checkbox" name="immediateFeedback" ${state.config.immediateFeedback ? "checked" : ""}>
              <span class="toggle-ui"></span>
              <span>
                <strong>Immediate Feedback</strong>
                <small>Get results and explanations instantly after each question.</small>
              </span>
            </label>
            ` : ""}
          </div>
        </section>

        ${state.config.subject !== 'both' ? `
        <section class="panel">
          <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p class="eyebrow">Self-Pacing</p>
              <h2>Time Targets</h2>
            </div>
            <div style="display: flex; gap: 8px;">
              ${state.showPacingConfig ? `<button type="button" class="ghost-btn" data-action="reset-pacing" style="font-size: 13px; padding: 4px 8px; color: var(--red);">Reset</button>` : ''}
              <button type="button" class="ghost-btn" data-action="toggle-pacing" style="font-size: 13px; padding: 4px 8px;">${state.showPacingConfig ? 'Hide' : 'Configure'}</button>
            </div>
          </div>
          <p class="muted" style="font-size: 13px;">Set optional seconds-per-question targets. These are warnings only and do not affect scoring.</p>
          ${state.showPacingConfig ? `
            <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 12px;">
              ${availableDomains.filter(d => selectedDomains.has(d.code)).map(domain => {
                const domKey = state.config.subject + ':' + domain.code;
                const domLimit = state.pacingConfig?.domainLimitSeconds?.[domKey] || '';
                return `
                <div style="border: 1px solid var(--line); border-radius: 8px; padding: 12px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="font-size: 14px;">${escapeHtml(domain.label)}</strong>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <label style="font-size: 12px; color: var(--ink-muted);">sec/question:</label>
                      <input type="number" name="pacing_domain_${escapeAttr(domKey)}" value="${domLimit}" min="5" max="3600" placeholder="—" style="width: 64px; padding: 4px; font-size: 13px; border-radius: 4px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); text-align: center;">
                    </div>
                  </div>
                  ${domain.skills && domain.skills.length > 0 && selectedSkills.has(domain.skills[0]) ? `
                    <div style="margin-left: 12px; border-left: 2px solid var(--line); padding-left: 12px;">
                      ${domain.skills.filter(sk => selectedSkills.has(sk)).map(skill => {
                        const skKey = domKey + ':' + skill;
                        const skLimit = state.pacingConfig?.skillLimitSeconds?.[skKey] || '';
                        return `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0;">
                          <span style="font-size: 13px;">${escapeHtml(skill)}</span>
                          <input type="number" name="pacing_skill_${escapeAttr(skKey)}" value="${skLimit}" min="5" max="3600" placeholder="—" style="width: 56px; padding: 4px; font-size: 12px; border-radius: 4px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); text-align: center;">
                        </div>`;
                      }).join('')}
                    </div>
                  ` : ''}
                </div>`;
              }).join('')}
            </div>
          ` : ''}
        </section>
        ` : ''}

        <section class="panel action-panel">
          <label class="limit-field ${state.config.subject === "both" ? "disabled" : ""}">
            <span>Question limit</span>
            <input type="number" name="limit" min="1" max="200" value="${state.config.limit}" ${state.config.subject === "both" ? "disabled" : ""}>
            <small>${state.config.subject === "both" ? "Full test uses SAT module sizes." : "Set how many questions to practice."}</small>
          </label>
          <div class="start-summary">
            <strong>${availableCount}</strong>
            <span>matching questions</span>
          </div>
          <button class="primary-btn large" type="submit" ${availableCount === 0 ? "disabled" : ""}>Start Practice</button>
        </section>
      </form>
    `;
  }

  function renderSessionDashboard(result) {
    const metrics = buildMetrics(state.questions, result.responses);
    const title = (result.session.mode === "full" || result.session.mode === "bluebook") ? "Full Test Complete" : "Practice Complete";

    return `
      <section class="hero-card result-hero">
        <div>
          <p class="eyebrow">Session Overview</p>
          <h1>${title}</h1>
          <p>Metrics scoped to this test session only.</p>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn large" type="button" data-action="review-session" data-session-id="${escapeAttr(result.session.id)}">Review Answers</button>
          <button class="primary-btn large" type="button" data-action="config">New Test</button>
        </div>
      </section>

      ${renderScoreboard(result.session, result.responses)}

      ${(() => {
        if (result.session.mode === "full" || result.session.mode === "bluebook") {
          let mathC = 0, mathW = 0, mathO = 0;
          let rwC = 0, rwW = 0, rwO = 0;
          for (const r of result.responses) {
            if (r.subject === "math") {
              if (r.isCorrect) mathC++; else if (isAnsweredResponse(r)) mathW++; else mathO++;
            } else if (r.subject === "rw") {
              if (r.isCorrect) rwC++; else if (isAnsweredResponse(r)) rwW++; else rwO++;
            }
          }
          return `
            <div class="dashboard-card-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 16px; margin-bottom: 24px;">
              <div class="panel" style="padding: 20px; background: var(--bg);">
                <p class="eyebrow" style="margin-bottom: 8px;">Reading & Writing</p>
                <div style="font-size: 1.1rem; font-weight: 500;">${rwC} correct · ${rwW} wrong · ${rwO} omitted</div>
              </div>
              <div class="panel" style="padding: 20px; background: var(--bg);">
                <p class="eyebrow" style="margin-bottom: 8px;">Math</p>
                <div style="font-size: 1.1rem; font-weight: 500;">${mathC} correct · ${mathW} wrong · ${mathO} omitted</div>
              </div>
            </div>
          `;
        }
        return "";
      })()}

      <section class="metric-grid">
        ${renderMetric("Answered", result.responses.filter(r => isAnsweredResponse(r)).length, "questions")}
        ${renderMetric("Correct", result.session.totalCorrect, "right answers")}
        ${(() => {
          let wrong = 0, omitted = 0;
          for (const r of result.responses) {
            if (!r.isCorrect) {
              if (isAnsweredResponse(r)) wrong++;
              else omitted++;
            }
          }
          return renderMetric("Incorrect", result.responses.length - result.session.totalCorrect, `${wrong} wrong, ${omitted} omitted`);
        })()}
        ${(() => {
          let avgTimeStr = "—";
          let caption = "this session";
          let extraStyle = "";
          if (result.session.averageSeconds) {
            const avg = Math.round(result.session.averageSeconds);
            const optimal = result.session.subject === "rw" ? 71 : result.session.subject === "math" ? 95 : 82;
            avgTimeStr = `${avg}s`;
            if (avg <= optimal) {
              extraStyle = "color: var(--green);";
              caption = `Optimal pacing (≤${optimal}s)`;
            } else {
              extraStyle = "color: var(--red);";
              caption = `Too slow (>${optimal}s)`;
            }
          }
          return renderMetric("Avg Time", avgTimeStr, caption, extraStyle);
        })()}
      </section>

      <section class="panel two-column">
        <div>
          <div class="panel-heading"><p class="eyebrow">Strengths</p><h2>Strong Domains</h2></div>
          ${renderStrengths(metrics.domains)}
        </div>
        <div>
          <div class="panel-heading"><p class="eyebrow">Weaknesses</p><h2>Priority Areas</h2></div>
          ${renderWeaknesses(metrics.domains)}
        </div>
      </section>

      ${result.session.moduleSummaries?.length ? `
        <section class="panel">
          <div class="panel-heading"><p class="eyebrow">Adaptive Routing</p><h2>Module Results</h2></div>
          <div class="module-summary-grid">
            ${result.session.moduleSummaries.map(s => `
              <div class="module-summary-card">
                <strong>${escapeHtml(s.title)}</strong>
                <span>${s.correct}/${s.answered} correct</span>
                <small>${s.route ? `${s.route} route` : "Module 1"}</small>
              </div>
            `).join("")}
          </div>
        </section>
      ` : ""}
    `;
  }

  function renderScoreboard(session, responses = []) {
    let mods = session.moduleSummaries;
    if (session.mode === "bluebook" && (!mods || !mods.length)) {
      mods = [
        { subject: "rw", theta: estimateTheta(responses.filter(r => r.subject === "rw")) },
        { subject: "math", theta: estimateTheta(responses.filter(r => r.subject === "math")) }
      ];
    }
    if ((session.mode !== "full" && session.mode !== "bluebook") || !mods) return "";

    const rwResponses = responses.filter(r => r.subject === "rw");
    const mathResponses = responses.filter(r => r.subject === "math");
    const rwTheta = rwResponses.length ? estimateTheta(rwResponses) : 0;
    const mathTheta = mathResponses.length ? estimateTheta(mathResponses) : 0;

    /* Phase 2: Determine route from Module 2 summaries */
    const rwRoute = mods.find(m => m.subject === "rw" && m.id?.endsWith("2"))?.route || null;
    const mathRoute = mods.find(m => m.subject === "math" && m.id?.endsWith("2"))?.route || null;

    /* Phase 6: Sigmoid theta-to-score with route-aware ceilings */
    const rwScore = thetaToScore(rwTheta, rwRoute);
    const mathScore = thetaToScore(mathTheta, mathRoute);
    const totalScore = rwScore + mathScore;

    const rwCapped = rwRoute === "lower";
    const mathCapped = mathRoute === "lower";

    return `
      <section class="panel scoreboard-panel" style="text-align: center; margin-bottom: 24px; padding: 32px;">
        <p class="eyebrow">Simulated Score</p>
        <h1 style="font-size: 4rem; color: var(--blue); margin: 8px 0;">${totalScore}</h1>
        <div style="display: flex; justify-content: center; gap: 32px; margin-top: 16px;">
          <div>
            <p class="muted" style="margin-bottom: 4px;">Reading & Writing</p>
            <h2 style="font-size: 2rem;">${rwScore}</h2>
            ${rwCapped ? `<small class="muted" style="color:var(--yellow);">Capped — lower route</small>` : ""}
          </div>
          <div>
            <p class="muted" style="margin-bottom: 4px;">Math</p>
            <h2 style="font-size: 2rem;">${mathScore}</h2>
            ${mathCapped ? `<small class="muted" style="color:var(--yellow);">Capped — lower route</small>` : ""}
          </div>
        </div>
        <p class="muted" style="margin-top: 16px; font-size: 13px;">Scores simulated using a 7-band IRT model with route-aware ceilings. Your official score may differ due to proprietary CB equating.</p>
      </section>
    `;
  }

  function renderTestHistory() {
    return `
      <section class="hero-card compact-hero">
        <div>
          <p class="eyebrow">Past Tests</p>
          <h1>Review your practice history.</h1>
          <p>See every answer, the correct response, explanation, and time per question.</p>
        </div>
      </section>
      <section class="panel history-panel">
        ${renderHistoryPanelContent()}
      </section>
    `;
  }

  
  function renderHistoryPanelContent() {
    const activeSessions = getActiveSessions();
    const fullTests = activeSessions.filter(s => s.mode === "full" || s.mode === "bluebook");
    const subjectTests = activeSessions.filter(s => s.mode !== "full" && s.mode !== "bluebook");
    const sessions = state.historyTab === "full" ? fullTests : subjectTests;

    return `
        <div class="history-tabs" role="tablist">
          <button class="${state.historyTab === "full" ? "active" : ""}" type="button" data-action="history-tab" data-tab="full">Full Tests <span>${fullTests.length}</span></button>
          <button class="${state.historyTab === "subject" ? "active" : ""}" type="button" data-action="history-tab" data-tab="subject">Subject Tests <span>${subjectTests.length}</span></button>
        </div>
        ${sessions.length ? `
          <div class="history-list">
            ${state.historyTab === "full" ? `
              <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
                 <button class="primary-btn" type="button" data-action="import-bluebook">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                   Import Bluebook Test
                 </button>
              </div>
            ` : ""}
            ${sessions.map(session => {
              const resps = state.responses.filter(r => r.sessionId === session.id);
              let sCorrect = 0, sWrong = 0, sOmitted = 0;
              for (const r of resps) {
                if (r.isCorrect) sCorrect++;
                else if (isAnsweredResponse(r)) sWrong++;
                else sOmitted++;
              }
              const accuracy = resps.length ? sCorrect / resps.length : 0;
              return `
              <article class="history-card" data-action="view-session-overview" data-session-id="${escapeAttr(session.id)}" style="cursor:pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.transform='none'; this.style.boxShadow='var(--shadow-sm)'">
                <div>
                  <p class="eyebrow">${session.mode === "bluebook" ? "Bluebook Practice Test" : session.mode === "full" ? "Full test" : (session.config?.isRetry || session.subject === "both") ? "Retry Mistakes" : escapeHtml(SUBJECTS[session.subject] || "Subject test")}</p>
                  <h2>${session.mode === "bluebook" ? escapeHtml(session.title || "Bluebook Test") : escapeHtml(formatSessionDate(session.completedAt))}</h2>
                  <small>${resps.length ? resps.filter(r => isAnsweredResponse(r)).length : (session.totalAnswered || 0)} answered${session.totalQuestionsServed ? ` of ${session.totalQuestionsServed}` : ""}</small>
                </div>
                <div class="history-score">
                  <strong>${resps.length ? formatPercent(accuracy) : "—"}</strong>
                  <span>${sCorrect} correct · ${sWrong} wrong · ${sOmitted} omitted</span>
                  <small>${session.averageSeconds ? `${Math.round(session.averageSeconds)}s avg/question` : ""}</small>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <button class="primary-btn" type="button" data-action="review-session" data-session-id="${escapeAttr(session.id)}">Review</button>
                  <button class="ghost-btn" type="button" data-action="retry-session-mistakes" data-session-id="${escapeAttr(session.id)}">Retry Mistakes</button>
                  <button class="ghost-btn" type="button" data-action="delete-session" data-session-id="${escapeAttr(session.id)}" title="Delete this test" style="color:var(--red);border-color:var(--red-border)">✕</button>
                </div>
              </article>
              `;
            }).join("")}
          </div>
        ` : `
          <div class="empty-message" style="display:flex; flex-direction:column; align-items:center; gap:16px; padding:48px 0;">
             <p>No ${state.historyTab === "full" ? "full" : "subject"} tests completed yet.</p>
             ${state.historyTab === "full" ? `
                 <button class="primary-btn large" type="button" data-action="import-bluebook">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                   Import Bluebook Test
                 </button>
             ` : ""}
          </div>
        `}
      `;
  }

function renderTestReview() {
    const session = state.sessions.find(s => s.id === state.reviewSessionId);
    if (!session) {
      return `
        <section class="panel">
          <p class="muted">Session not found.</p>
          <button class="ghost-btn" type="button" data-action="history">Back to Past Tests</button>
        </section>
      `;
    }

    const questionMap = new Map();
    for (const q of state.questions) {
      if (q.id) questionMap.set(q.id, q);
      if (q.externalId) questionMap.set(q.externalId, q);
      if (q.questionId) questionMap.set(q.questionId, q);
    }
    const allResponses = state.responses
      .filter(r => r.sessionId === session.id)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    let mathCorrect = 0, mathWrong = 0, mathOmitted = 0, mathTotal = 0;
    let rwCorrect = 0, rwWrong = 0, rwOmitted = 0, rwTotal = 0;
    for (const r of allResponses) {
      if (r.subject === "math") {
        mathTotal++;
        if (r.isCorrect) mathCorrect++;
        else if (isAnsweredResponse(r)) mathWrong++;
        else mathOmitted++;
      }
      if (r.subject === "rw") {
        rwTotal++;
        if (r.isCorrect) rwCorrect++;
        else if (isAnsweredResponse(r)) rwWrong++;
        else rwOmitted++;
      }
    }
    const totalCorrect = mathCorrect + rwCorrect;
    const totalWrong = mathWrong + rwWrong;
    const totalOmitted = mathOmitted + rwOmitted;

    let filteredResponses = allResponses;
    if (state.reviewFilterSubject && state.reviewFilterSubject !== "both") {
      filteredResponses = filteredResponses.filter(r => r.subject === state.reviewFilterSubject);
    }
    
    if (state.reviewFilterIncorrect && state.reviewFilterSkipped) {
      filteredResponses = filteredResponses.filter(r => !r.isCorrect);
    } else if (state.reviewFilterIncorrect) {
      filteredResponses = filteredResponses.filter(r => !r.isCorrect && isAnsweredResponse(r));
    } else if (state.reviewFilterSkipped) {
      filteredResponses = filteredResponses.filter(r => !isAnsweredResponse(r));
    }

    state.reviewPage = state.reviewPage || 1;
    let pages = [];
    if ((session.mode === "bluebook" || session.mode === "full") && state.reviewFilterSubject !== "both") {
      const moduleMap = new Map();
      const modules = [];
      for (const r of filteredResponses) {
        const title = r.moduleTitle || "Module";
        if (!moduleMap.has(title)) {
          moduleMap.set(title, []);
          modules.push(title);
        }
        moduleMap.get(title).push(r);
      }
      pages = modules.map(t => moduleMap.get(t));
    } else {
      const CHUNK_SIZE = 20;
      for (let i = 0; i < filteredResponses.length; i += CHUNK_SIZE) {
        pages.push(filteredResponses.slice(i, i + CHUNK_SIZE));
      }
    }
    if (pages.length === 0) pages = [[]];

    const totalPages = pages.length;
    if (state.reviewPage > totalPages) state.reviewPage = totalPages;
    const pagedResponses = pages[state.reviewPage - 1] || [];

    let summaryHtml = "";
    if (state.reviewFilterSubject === "both" && mathTotal > 0 && rwTotal > 0) {
      summaryHtml = `<div class="review-summary">
           <p class="review-summary-row"><span class="review-summary-label">Math:</span><span>${mathCorrect} correct · ${mathWrong} wrong · ${mathOmitted} omitted</span></p>
           <p class="review-summary-row"><span class="review-summary-label">R&W:</span><span>${rwCorrect} correct · ${rwWrong} wrong · ${rwOmitted} omitted</span></p>
           <p class="review-summary-row"><span class="review-summary-label">Total:</span><span>${totalCorrect} correct · ${totalWrong} wrong · ${totalOmitted} omitted</span></p>
         </div>`;
    } else if (state.reviewFilterSubject === "math" || (mathTotal > 0 && rwTotal === 0)) {
      summaryHtml = `<p class="review-summary-single">${mathCorrect} correct · ${mathWrong} wrong · ${mathOmitted} omitted · ${mathTotal} questions</p>`;
    } else if (state.reviewFilterSubject === "rw" || (rwTotal > 0 && mathTotal === 0)) {
      summaryHtml = `<p class="review-summary-single">${rwCorrect} correct · ${rwWrong} wrong · ${rwOmitted} omitted · ${rwTotal} questions</p>`;
    } else {
      summaryHtml = `<p class="review-summary-single">${totalCorrect} correct · ${totalWrong} wrong · ${totalOmitted} omitted · ${allResponses.length} questions</p>`;
    }

    return `
      <section class="review-heading panel">
        <div class="review-heading-top">
          <div>
            <p class="eyebrow">${session.mode === "bluebook" ? "Bluebook test review" : session.mode === "full" ? "Full test review" : (session.config?.isRetry || session.subject === "both") ? "Retry Mistakes review" : "Subject test review"}</p>
            <h1>${session.mode === "bluebook" ? escapeHtml(session.title || "Bluebook Test") : escapeHtml(formatSessionDate(session.completedAt))}</h1>
            <div id="review-summary-container">${summaryHtml}</div>
          </div>
        </div>
        <div class="review-filter-bar" style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
          ${(mathTotal > 0 && rwTotal > 0) ? `
            <div class="history-tabs review-subject-tabs" role="tablist" style="margin: 0; min-height: unset; padding-bottom: 0;">
              <button class="${state.reviewFilterSubject === "both" ? "active" : ""}" type="button" data-action="review-subject-filter" data-subject="both" style="padding: 6px 12px; font-size: 13px;">Both Subjects</button>
              <button class="${state.reviewFilterSubject === "rw" ? "active" : ""}" type="button" data-action="review-subject-filter" data-subject="rw" style="padding: 6px 12px; font-size: 13px;">R&W Only</button>
              <button class="${state.reviewFilterSubject === "math" ? "active" : ""}" type="button" data-action="review-subject-filter" data-subject="math" style="padding: 6px 12px; font-size: 13px;">Math Only</button>
            </div>
            <div class="review-filter-divider" style="width: 1px; height: 24px; background: var(--border); margin: 0 4px;"></div>
          ` : ""}
          <label class="wrong-toggle">
            <input type="checkbox" data-action="review-wrong-toggle" data-type="incorrect" ${state.reviewFilterIncorrect ? "checked" : ""}>
            <span class="toggle-ui"></span>
            <strong>Show Wrong</strong>
          </label>
          <label class="wrong-toggle">
            <input type="checkbox" data-action="review-wrong-toggle" data-type="skipped" ${state.reviewFilterSkipped ? "checked" : ""}>
            <span class="toggle-ui"></span>
            <strong>Show Omitted</strong>
          </label>
        </div>
      </section>
      
      <section class="review-list">
        ${pagedResponses.length ? pagedResponses.map((r, i) => renderReviewedQuestion(questionMap.get(r.questionId), r, i, session)).join("") : `
          <article class="panel empty-message">${allResponses.length > 0 ? "No questions match those filters." : "No questions were answered."}</article>
        `}
      </section>
      
      ${totalPages > 1 ? `
        <!-- Pagination Controls (Monochrome Design) -->
        <nav role="navigation" aria-label="pagination" style="display: flex; justify-content: center; padding: 32px 16px 8px;">
          <ul class="ml-pagination">
            <li style="list-style: none;">
              <button type="button" class="ml-pagination-nav-btn" data-action="review-change-page" data-page="${Math.max(1, state.reviewPage - 1)}" ${state.reviewPage === 1 ? 'disabled' : ''} aria-label="Go to previous page">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                <span style="display: none;" class="ml-pg-label">Prev</span>
              </button>
            </li>
            ${(function() {
              var pages = [];
              var cp = state.reviewPage;
              var tp = totalPages;
              if (tp <= 7) {
                for (var i = 1; i <= tp; i++) pages.push(i);
              } else {
                pages.push(1);
                if (cp > 3) pages.push('...');
                var start = Math.max(2, cp - 1);
                var end = Math.min(tp - 1, cp + 1);
                if (cp <= 3) { start = 2; end = 4; }
                if (cp >= tp - 2) { start = tp - 3; end = tp - 1; }
                for (var j = start; j <= end; j++) pages.push(j);
                if (cp < tp - 2) pages.push('...');
                pages.push(tp);
              }
              return pages.map(function(p) {
                if (p === '...') {
                  return '<li style="list-style: none;"><span aria-hidden="true" style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; font-size: 13px; color: var(--ink-muted);">···</span></li>';
                }
                var isActive = p === cp;
                var btnClass = isActive ? 'ml-pagination-btn active' : 'ml-pagination-btn';
                return '<li style="list-style: none;"><button type="button" class="' + btnClass + '" data-action="review-change-page" data-page="' + p + '" aria-label="Go to page ' + p + '" aria-current="' + (isActive ? 'page' : 'false') + '">' + p + '</button></li>';
              }).join('');
            })()}
            <li style="list-style: none;">
              <button type="button" class="ml-pagination-nav-btn" data-action="review-change-page" data-page="${Math.min(totalPages, state.reviewPage + 1)}" ${state.reviewPage === totalPages ? 'disabled' : ''} aria-label="Go to next page">
                <span style="display: none;" class="ml-pg-label">Next</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </li>
          </ul>
        </nav>
        <div style="text-align: center; font-size: 12px; color: var(--ink-muted); padding-bottom: 32px;">Page ${state.reviewPage} of ${totalPages} · ${filteredResponses.length} question${filteredResponses.length !== 1 ? 's' : ''}</div>
      ` : ''}
      
      <button class="primary-btn scroll-top-btn" type="button" data-action="scroll-top" aria-label="Scroll to top">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
      </button>
    `;
  }

  function renderReviewedQuestion(question, response, index, session) {
    const num = (response.sequence ?? index) + 1;
    const isSkipped = !isAnsweredResponse(response);
    const status = isSkipped ? "skipped" : response.isCorrect ? "correct" : "incorrect";
    /* Phase 4: Pretest badge */
    const pretestBadge = response.isPretest ? `<span class="status-pill" style="background:var(--zinc-200);color:var(--zinc-600);font-size:11px;">Unscored (Pretest)</span>` : "";
    
    let timeText = formatDuration(response.timeSpentSeconds || 0);
    if (question && session && session.config && session.config.pacing) {
        const p = session.config.pacing;
        const domKey = `${question.subject}:${question.domainCode}`;
        const skKey = `${question.subject}:${question.domainCode}:${question.skill || ''}`;
        let limit = 0;
        if (p.skillLimitSeconds && p.skillLimitSeconds[skKey]) {
            limit = p.skillLimitSeconds[skKey];
        } else if (p.domainLimitSeconds && p.domainLimitSeconds[domKey]) {
            limit = p.domainLimitSeconds[domKey];
        }
        
        const spent = Math.round(response.timeSpentSeconds || 0);
        if (limit > 0 && spent > limit) {
            timeText = `${formatDuration(spent)}<span style="color:var(--red)">(+${formatDuration(spent - limit)})</span>`;
        }
    }

    if (!question) {
      return `
        <article class="panel review-card" data-status="${status}" data-subject="${escapeHtml(response.subject || "")}">
          <div class="review-card-header">
            <strong>Question ${num}</strong>
            ${pretestBadge}
            ${renderReviewStatus(response)}
          </div>
          <p class="muted">Question data no longer available. Your answer: ${escapeHtml(response.answer || "blank")}.</p>
        </article>
      `;
    }

    return `
      <article class="panel review-card" data-status="${status}" data-subject="${escapeHtml(question.subject || response.subject || "")}">
        <div class="review-card-header">
          <div>
            <span class="question-number">Question ${num}</span>
            <strong>${escapeHtml(question.domain)} · ${escapeHtml(response.moduleTitle || SUBJECTS[question.subject] || "")}</strong>
          </div>
          <div class="review-meta">
            ${pretestBadge}
            <button type="button" class="ghost-btn icon-btn report-btn" data-action="report-question" data-qid="${escapeHtml(question.id)}" title="Report issue with question">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
            </button>
            <span class="time-pill">${timeText}</span>
            ${renderReviewStatus(response)}
          </div>
        </div>
        ${renderQuestionMeta(question)}
        <div class="review-question ${question.stimulus ? "split" : ""}">
          ${question.stimulus ? `<div class="review-stimulus html-content">${sanitizeHtml(question.stimulus)}</div>` : ""}
          <div>
            <div class="html-content prompt">${sanitizeHtml(question.prompt)}</div>
            ${renderReviewedAnswer(question, response)}
          </div>
        </div>
        <details class="explanation-card">
          <summary>
            <strong class="show-text">Show Explanation</strong>
            <strong class="hide-text">Hide Explanation</strong>
          </summary>
          <div class="html-content rationale">${sanitizeHtml(question.rationale || "No explanation included in this export.")}</div>
        </details>
      </article>
    `;
  }

  function renderReviewedAnswer(question, response) {
    if (question.type === "spr" || !question.answerOptions.length) {
      return `
        <div class="review-response-grid">
          <div><span>Your answer</span><strong>${escapeHtml(response.answer || "Not answered")}</strong></div>
          <div class="correct"><span>Correct answer</span><strong>${escapeHtml((question.correctAnswers || []).join(" or ") || "Unavailable")}</strong></div>
        </div>
      `;
    }

    return `
      <div class="choice-list review-choices">
        ${question.answerOptions.map(opt => {
          const selected = response.answer === opt.letter;
          const correct = question.correctAnswers.includes(opt.letter);
          const cls = `${selected ? "selected-answer" : ""} ${correct ? "correct-answer" : ""}`;
          return `
            <div class="choice-button ${cls}">
              <span class="choice-letter">${escapeHtml(opt.letter)}</span>
              <span class="choice-content">${sanitizeHtml(opt.content)}</span>
              ${correct ? `<small class="choice-tag correct">Correct</small>` : selected ? `<small class="choice-tag selected">Your answer</small>` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderReviewStatus(response) {
    if (!isAnsweredResponse(response)) {
      return `<span class="status-pill unanswered">Omitted</span>`;
    }
    return response.isCorrect
      ? `<span class="status-pill correct">Correct</span>`
      : `<span class="status-pill incorrect">Wrong</span>`;
  }

  function getMistakesData() {
    // Collect all question IDs that were ever wrong or skipped in ANY test
    const everWrongIds = new Set();
    const everSkippedIds = new Set();

    const responsesToAnalyze = state.mistakesSessionId
      ? state.responses.filter(r => r.sessionId === state.mistakesSessionId)
      : getActiveResponses();

    for (const r of responsesToAnalyze) {
      const isSkipped = !isAnsweredResponse(r);
      const isWrong = !isSkipped && !r.isCorrect;
      if (isWrong) {
        everWrongIds.add(r.questionId);
      } else if (isSkipped) {
        everSkippedIds.add(r.questionId);
      }
    }

    // A question that was both wrong AND skipped across tests counts as wrong
    for (const id of everWrongIds) {
      everSkippedIds.delete(id);
    }

    const questionMap = new Map();
    for (const q of state.questions) {
      if (q.id) questionMap.set(q.id, q);
      if (q.externalId) questionMap.set(q.externalId, q);
      if (q.questionId) questionMap.set(q.questionId, q);
    }
    const wrongQuestions = [];
    const skippedQuestions = [];

    for (const id of everWrongIds) {
      const q = questionMap.get(id);
      if (q) wrongQuestions.push(q);
    }
    for (const id of everSkippedIds) {
      const q = questionMap.get(id);
      if (q) skippedQuestions.push(q);
    }

    return { wrongQuestions, skippedQuestions };
  }

  function renderMistakesDashboard() {
    const { wrongQuestions, skippedQuestions } = getMistakesData();

    // Group mistakes by subject and domain
    const subjects = {
      math: { label: "Math", wrong: 0, skipped: 0, domains: {} },
      rw: { label: "Reading & Writing", wrong: 0, skipped: 0, domains: {} }
    };

    for (const q of wrongQuestions) {
      const sub = q.subject;
      if (subjects[sub]) {
        subjects[sub].wrong++;
        if (!subjects[sub].domains[q.domain]) {
          subjects[sub].domains[q.domain] = { wrong: 0, skipped: 0, code: q.domainCode, skills: {} };
        }
        subjects[sub].domains[q.domain].wrong++;
        const skKey = q.skill || "Unspecified";
        if (!subjects[sub].domains[q.domain].skills[skKey]) {
          subjects[sub].domains[q.domain].skills[skKey] = { wrong: 0, skipped: 0 };
        }
        subjects[sub].domains[q.domain].skills[skKey].wrong++;
      }
    }

    for (const q of skippedQuestions) {
      const sub = q.subject;
      if (subjects[sub]) {
        subjects[sub].skipped++;
        if (!subjects[sub].domains[q.domain]) {
          subjects[sub].domains[q.domain] = { wrong: 0, skipped: 0, code: q.domainCode, skills: {} };
        }
        subjects[sub].domains[q.domain].skipped++;
        const skKey = q.skill || "Unspecified";
        if (!subjects[sub].domains[q.domain].skills[skKey]) {
          subjects[sub].domains[q.domain].skills[skKey] = { wrong: 0, skipped: 0 };
        }
        subjects[sub].domains[q.domain].skills[skKey].skipped++;
      }
    }

    if (!state.selectedMistakeDomains) {
      const allDomains = new Set();
      for (const sub of Object.values(subjects)) {
        for (const dom of Object.keys(sub.domains)) {
          allDomains.add(dom);
        }
      }
      state.selectedMistakeDomains = allDomains;
    }
    if (!state.selectedMistakeSkills) {
      const allSkills = new Set();
      for (const sub of Object.values(subjects)) {
        for (const [dom, domData] of Object.entries(sub.domains)) {
          for (const sk of Object.keys(domData.skills)) {
            allSkills.add(`${dom}|${sk}`);
          }
        }
      }
      state.selectedMistakeSkills = allSkills;
    }
    if (!state.selectedMistakeTypes) {
      state.selectedMistakeTypes = new Set(["wrong", "skipped"]);
    }

    // Calculate selected count
    let selectedCount = 0;
    if (state.selectedMistakeTypes.has("wrong")) {
      selectedCount += wrongQuestions.filter(q => state.selectedMistakeDomains.has(q.domain) && state.selectedMistakeSkills.has(q.domain + "|" + (q.skill || "Unspecified"))).length;
    }
    if (state.selectedMistakeTypes.has("skipped")) {
      selectedCount += skippedQuestions.filter(q => state.selectedMistakeDomains.has(q.domain) && state.selectedMistakeSkills.has(q.domain + "|" + (q.skill || "Unspecified"))).length;
    }

    return `
      <section class="hero-card compact-hero">
        <div>
          <p class="eyebrow">Retry Mistakes</p>
          <h1>Retry wrong or omitted questions.</h1>
          <p>Review your error areas by subject and domain, select which ones to practice, and launch a targeted retry session.</p>
        </div>
      </section>

      <div class="config-panel">
        <section class="panel">
          <div class="panel-heading">
            <p class="eyebrow">Question Status</p>
            <h2>Filter by Status</h2>
          </div>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <label class="check-card" style="flex: 1; min-width: 150px; min-height:76px; margin: 0;">
              <input type="checkbox" data-action="toggle-mistake-type" data-type="wrong" ${state.selectedMistakeTypes.has("wrong") ? "checked" : ""}>
              <span>Wrong Answers</span>
              <small>${wrongQuestions.length} questions</small>
            </label>
            <label class="check-card" style="flex: 1; min-width: 150px; min-height:76px; margin: 0;">
              <input type="checkbox" data-action="toggle-mistake-type" data-type="skipped" ${state.selectedMistakeTypes.has("skipped") ? "checked" : ""}>
              <span>Omitted Questions</span>
              <small>${skippedQuestions.length} questions</small>
            </label>
          </div>
        </section>

        ${Object.entries(subjects).map(([subKey, sub]) => {
          const domEntries = Object.entries(sub.domains);
          if (domEntries.length === 0) return "";
          
          const totalWrong = sub.wrong;
          const totalSkipped = sub.skipped;

          let totalItems = 0;
          let selectedItems = 0;
          domEntries.forEach(([domName, data]) => {
            totalItems++;
            if (state.selectedMistakeDomains.has(domName)) selectedItems++;
            if (state.showAdvancedMistakeSkills) {
              const skills = Object.keys(data.skills);
              totalItems += skills.length;
              skills.forEach(skill => {
                if (state.selectedMistakeSkills.has(domName + "|" + skill)) selectedItems++;
              });
            }
          });
          
          let buttonsHtml = '';
          if (selectedItems === 0) {
            buttonsHtml = `<button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subKey}" data-value="all" style="font-size:12px; padding:4px 10px; min-height:28px;">Select All</button>`;
          } else if (selectedItems === totalItems) {
            buttonsHtml = `<button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subKey}" data-value="none" style="font-size:12px; padding:4px 10px; min-height:28px;">Deselect All</button>`;
          } else {
            buttonsHtml = `
              <button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subKey}" data-value="all" style="font-size:12px; padding:4px 10px; min-height:28px;">Select All</button>
              <button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subKey}" data-value="none" style="font-size:12px; padding:4px 10px; min-height:28px;">Deselect All</button>
            `;
          }

          return `
            <section class="panel">
              <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <h2>Filter by Domain</h2>
                  <p class="eyebrow" style="margin-top:4px;">Select domains to practice</p>
                </div>
                <button type="button" class="ghost-btn" data-action="toggle-advanced-mistakes" style="font-size: 13px; padding: 4px 8px;">Advanced</button>
              </div>
              <div class="subject-buttons-container" data-subject-container="${subKey}" style="display:flex; gap:8px; margin-bottom:16px;">
                ${buttonsHtml}
              </div>
              <div class="check-grid">
                ${domEntries.map(([domName, data]) => `
                  <div style="display:flex; flex-direction:column; gap:4px;">
                    <label class="check-card" style="height:auto; min-height:76px; margin-bottom: 0;">
                      <input type="checkbox" data-action="toggle-mistake-domain" data-domain="${escapeAttr(domName)}" ${state.selectedMistakeDomains.has(domName) ? "checked" : ""}>
                      <span>${escapeHtml(domName)}</span>
                      <small>${data.wrong} wrong · ${data.skipped} omitted</small>
                    </label>
                    ${state.showAdvancedMistakeSkills && Object.keys(data.skills).length > 0 ? `
                      <div style="display:flex; flex-direction:column; gap:6px; margin-left: 12px; margin-top: 4px; border-left: 2px solid var(--line); padding-left: 12px;">
                        ${Object.entries(data.skills).map(([skillName, skData]) => `
                          <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--ink); cursor:pointer;">
                            <input type="checkbox" data-action="toggle-mistake-skill" data-domain="${escapeAttr(domName)}" data-skill="${escapeAttr(skillName)}" ${state.selectedMistakeSkills.has(domName + "|" + skillName) ? "checked" : ""}>
                            <span>${escapeHtml(skillName)} <span class="muted" style="margin-left:4px;">(${skData.wrong}W / ${skData.skipped}S)</span></span>
                          </label>
                        `).join("")}
                      </div>
                    ` : ""}
                  </div>
                `).join("")}
              </div>
            </section>
          `;
        }).join("")}

        <section class="panel action-panel">
          <button class="ghost-btn large" type="button" data-action="dashboard">Back to Dashboard</button>
          <div class="start-summary" style="text-align: right; margin-right: 16px;">
            <strong>${selectedCount}</strong>
            <span>selected questions</span>
          </div>
          <button class="primary-btn large" type="button" data-action="start-retry-practice" ${selectedCount === 0 ? "disabled" : ""}>Start</button>
        </section>
      </div>
    `;
  }

  function renderMistakesLog() {
    state.mistakesLog = state.mistakesLog || {
      expanded: new Set(),
      showAnswer: new Set(),
      filterSubject: "all",
      filterDomain: "all",
      filterSkill: "all",
      filterTags: new Set(),
      filterType: "all",
      currentPage: 1
    };
    if (!state.mistakesLog.currentPage) state.mistakesLog.currentPage = 1;
    if (!state.mistakesLog.showAnswer) state.mistakesLog.showAnswer = new Set();

    const MISTAKE_TAGS = ["Silly mistake", "Time crunch", "Conceptual error", "Misread question", "Calculation error", "Guessed"];

    const allMistakes = getActiveResponses().filter(r => !r.isCorrect && r.sessionId !== "active_test");
    const questionsMap = new Map();
    for (const q of state.questions) {
      if (q.id) questionsMap.set(q.id, q);
      if (q.externalId) questionsMap.set(q.externalId, q);
      if (q.questionId) questionsMap.set(q.questionId, q);
    }
    let validMistakes = allMistakes.filter(r => questionsMap.has(r.questionId) || (r.externalId && questionsMap.has(r.externalId)));

    validMistakes.sort((a, b) => (b.answeredAt || 0) - (a.answeredAt || 0));

    if (state.mistakesLog.filterSubject !== "all") {
      validMistakes = validMistakes.filter(r => r.subject === state.mistakesLog.filterSubject);
    }
    if (state.mistakesLog.filterDomain !== "all") {
      validMistakes = validMistakes.filter(r => r.domainCode === state.mistakesLog.filterDomain);
    }
    if (state.mistakesLog.filterSkill && state.mistakesLog.filterSkill !== "all") {
      validMistakes = validMistakes.filter(r => r.skillCode === state.mistakesLog.filterSkill);
    }
    if (state.mistakesLog.filterTags.size > 0) {
      validMistakes = validMistakes.filter(r => {
        if (!r.tags || r.tags.length === 0) return false;
        return r.tags.some(t => state.mistakesLog.filterTags.has(t));
      });
    }

    if (state.mistakesLog.filterType === "incorrect") {
      validMistakes = validMistakes.filter(r => r.isAnswered !== false);
    } else if (state.mistakesLog.filterType === "omitted") {
      validMistakes = validMistakes.filter(r => r.isAnswered === false);
    }

    const subjects = ["all", ...new Set(allMistakes.map(r => r.subject))];
    const domains = state.mistakesLog.filterSubject === "all"
      ? ["all", ...new Set(allMistakes.map(r => r.domainCode))]
      : ["all", ...new Set(allMistakes.filter(r => r.subject === state.mistakesLog.filterSubject).map(r => r.domainCode))];
      
    let baseForSkills = allMistakes;
    if (state.mistakesLog.filterSubject !== "all") baseForSkills = baseForSkills.filter(r => r.subject === state.mistakesLog.filterSubject);
    if (state.mistakesLog.filterDomain !== "all") baseForSkills = baseForSkills.filter(r => r.domainCode === state.mistakesLog.filterDomain);
    const skills = ["all", ...new Set(baseForSkills.map(r => r.skillCode).filter(Boolean))];

    let allUsedTags = new Set(MISTAKE_TAGS);
    allMistakes.forEach(r => {
       if(r.tags) r.tags.forEach(t => allUsedTags.add(t));
    });

    // Group mistakes by question ID
    const grouped = new Map();
    for (const r of validMistakes) {
      const qid = r.questionId;
      if (!grouped.has(qid)) {
        grouped.set(qid, { questionId: qid, attempts: [], mostRecentDate: 0 });
      }
      const group = grouped.get(qid);
      group.attempts.push(r);
      const d = r.answeredAt ? new Date(r.answeredAt).getTime() : 0;
      if (d > group.mostRecentDate) group.mostRecentDate = d;
    }
    // Sort groups by most recent miss date
    const groupedList = [...grouped.values()].sort((a, b) => b.mostRecentDate - a.mostRecentDate);

    // Pagination logic
    const ITEMS_PER_PAGE = 20;
    const totalPages = Math.ceil(groupedList.length / ITEMS_PER_PAGE);
    if (state.mistakesLog.currentPage > totalPages && totalPages > 0) state.mistakesLog.currentPage = totalPages;
    if (state.mistakesLog.currentPage < 1) state.mistakesLog.currentPage = 1;
    const pagedList = groupedList.slice((state.mistakesLog.currentPage - 1) * ITEMS_PER_PAGE, state.mistakesLog.currentPage * ITEMS_PER_PAGE);

    // Calculate analytics on ALL mistakes so filters don't affect the overall breakdown
    const tagCounts = {};
    let totalTagged = 0;
    allMistakes.forEach(r => {
      if (r.tags && r.tags.length > 0) {
        r.tags.forEach(t => {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
          totalTagged++;
        });
      }
    });

    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const topTags = sortedTags.slice(0, 4); // show top 4 tags

    const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

    let barsHtml = '';
    if (topTags.length === 0) {
       barsHtml = `<div style="font-size: 14px; color: var(--ink-muted);">No tagged mistakes yet. Expand a mistake to add tags.</div>`;
    } else {
       barsHtml = topTags.map(([tag, count], idx) => {
         const pct = Math.round((count / (totalTagged || 1)) * 100);
         const color = colors[idx % colors.length];
         return `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-size: 12px; font-weight: 600; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(tag)}</span>
                    <span style="font-size: 12px; font-weight: 700; color: var(--ink);">${pct}%</span>
                </div>
                <div style="width: 100%; background: var(--line-light); border-radius: 999px; height: 8px;">
                    <div style="width: ${pct}%; background: ${color}; height: 8px; border-radius: 999px;"></div>
                </div>
            </div>
         `;
       }).join('');
    }

    let insightHtml = `You haven't tagged enough mistakes yet. Add tags to get insights.`;
    if (sortedTags.length > 0) {
      const topTag = sortedTags[0][0];
      if (topTag === "Conceptual error") {
        insightHtml = `Most of your errors are conceptual. Focus on reviewing core principles before taking another practice test.`;
      } else if (topTag === "Time crunch") {
        insightHtml = `Time management seems to be your biggest hurdle. Try pacing yourself and skipping difficult questions.`;
      } else if (topTag === "Silly mistake") {
        insightHtml = `You're making silly mistakes. Double-check your work and read the questions carefully!`;
      } else {
        insightHtml = `Your most common mistake is <strong>${escapeHtml(topTag)}</strong>. Focus on improving in this area.`;
      }
    }

    return `
      <div id="mistakes-log-container">
        <div class="opacity-0 animate-fade-in-up" style="max-width: var(--max-content-width, 1200px); margin: 0 auto; padding-bottom: 48px; padding-top: 24px;">
          <!-- Header Section -->
        <div style="margin-bottom: 24px; padding: 0 16px;">
            <h2 style="font-size: 28px; font-weight: 700; color: var(--ink); margin-bottom: 8px;">Mistakes Log</h2>
            <p style="font-size: 16px; color: var(--ink-muted); max-width: 42rem;">Review and analyze your incorrect answers to identify patterns and improve your performance.</p>
        </div>
        
        <!-- Analytics Dashboard -->
        <div class="card-shadow" style="background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-bottom: 32px; margin-left: 16px; margin-right: 16px;">
            <h3 style="font-weight: 600; font-size: 20px; color: var(--ink); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                Mistake Analysis
            </h3>
            <div style="display: flex; gap: 2rem; align-items: center; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 250px;">
                    ${barsHtml}
                </div>
                <div style="flex: 1; padding: 16px; background: var(--surface-main); border: 1px dashed var(--line); border-radius: 8px;">
                    <p style="font-size: 14px; font-weight: 500; margin-bottom: 8px; color: var(--ink);">💡 Insight:</p>
                    <p style="font-size: 14px; color: var(--ink-muted);">${insightHtml}</p>
                </div>
            </div>
        </div>

        <!-- Filter Section -->
        <div class="card-shadow" style="border-radius: 12px; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; background: var(--panel); padding: 16px; margin-bottom: 32px; margin-left: 16px; margin-right: 16px; border: 1px solid var(--line);">
            <div style="display: flex; align-items: center; gap: 8px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ink-muted);"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <span style="font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink);">Filters</span>
            </div>
            <div style="width: 1px; height: 24px; background: var(--line);"></div>
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
              <select class="styled-select" data-action="ml-change-subject" style="border-radius: 8px; padding: 6px 12px; height: auto;">
                <option value="all">All Subjects</option>
                ${subjects.filter(s => s !== "all").map(s => `<option value="${s}" ${state.mistakesLog.filterSubject === s ? 'selected' : ''}>${SUBJECTS[s] || s}</option>`).join("")}
              </select>
              ${state.mistakesLog.filterSubject !== "all" ? `
              <select class="styled-select" data-action="ml-change-domain" style="border-radius: 8px; padding: 6px 12px; height: auto;">
                <option value="all">All Domains</option>
                ${domains.filter(d => d !== "all").map(d => {
                  const fallback = DOMAIN_FALLBACKS[state.mistakesLog.filterSubject]?.find(f => f.code === d);
                  const label = fallback ? fallback.label : d;
                  return `<option value="${d}" ${state.mistakesLog.filterDomain === d ? 'selected' : ''}>${label}</option>`;
                }).join("")}
              </select>
              ` : ''}
              ${state.mistakesLog.filterSubject !== "all" && state.mistakesLog.filterDomain !== "all" ? `
              <select class="styled-select" data-action="ml-change-skill" style="border-radius: 8px; padding: 6px 12px; height: auto;">
                <option value="all">All Sub-domains</option>
                ${skills.filter(s => s !== "all").map(s => {
                  const label = baseForSkills.find(r => r.skillCode === s)?.skill || s;
                  return `<option value="${s}" ${state.mistakesLog.filterSkill === s ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                }).join("")}
              </select>
              ` : ''}
              <select class="styled-select" data-action="ml-change-type" style="border-radius: 8px; padding: 6px 12px; height: auto;">
                <option value="all" ${state.mistakesLog.filterType === 'all' || !state.mistakesLog.filterType ? 'selected' : ''}>Mix (All)</option>
                <option value="incorrect" ${state.mistakesLog.filterType === 'incorrect' ? 'selected' : ''}>Incorrect Only</option>
                <option value="omitted" ${state.mistakesLog.filterType === 'omitted' ? 'selected' : ''}>Omitted Only</option>
              </select>
            </div>
            
            <div style="width: 1px; height: 24px; background: var(--line);"></div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${Array.from(allUsedTags).map(tag => `
                  <button type="button" data-action="ml-filter-tag" data-tag="${tag}" class="tag-badge ${state.mistakesLog.filterTags.has(tag) ? 'active' : ''}">
                    ${escapeHtml(tag)}
                    ${!MISTAKE_TAGS.includes(tag) ? `<span data-action="ml-delete-custom-tag" data-tag="${tag}" style="margin-left: 6px; opacity: 0.6;">&times;</span>` : ''}
                  </button>
                `).join("")}
            </div>
        </div>

        <!-- Bento Grid Layout for Cards (1 column) -->
        <div style="display: grid; grid-template-columns: 1fr; gap: 24px; padding: 0 16px;">
            ${groupedList.length === 0 ? `
              <div style="padding: 3rem 0; text-align: center; border: 1px dashed var(--line); border-radius: 12px;">
                <p style="color: var(--ink-muted);">No mistakes found matching your filters.</p>
              </div>
            ` : pagedList.map(group => {
              const r = group.attempts[0];
              const q = questionsMap.get(r.questionId);
              const isExpanded = state.mistakesLog.expanded.has(r.id);
              const dateStr = group.mostRecentDate ? new Date(group.mostRecentDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "Unknown date";
              
              const allTags = new Set();
              group.attempts.forEach(att => att.tags && att.tags.forEach(t => allTags.add(t)));
              const unionTags = [...allTags];

              const titleTextParts = [];
              if (state.mistakesLog.filterSubject === "all") titleTextParts.push(SUBJECTS[r.subject] || r.subject);
              if (state.mistakesLog.filterDomain === "all") titleTextParts.push(r.domain);
              if (state.mistakesLog.filterSkill === "all" && q.skill) titleTextParts.push(q.skill);
              let titleText = titleTextParts.join(" • ");
              if (!titleText) titleText = "Question " + (q.number || q.id.slice(0, 5));

              const getDiffColor = (diff) => {
                const d = diff ? diff.toLowerCase() : "";
                if (d.startsWith("h")) return "#ef4444";
                if (d.startsWith("m")) return "#f59e0b";
                return "#10b981";
              };
              
              const diffBg = q.difficulty?.toLowerCase().startsWith("h") ? "#fef2f2" : (q.difficulty?.toLowerCase().startsWith("m") ? "#fffbeb" : "#ecfdf5");
              const diffColor = getDiffColor(q.difficulty);
              
              const borderColor = diffColor;

              return `
              <!-- Card -->
              <div class="card-shadow ml-card-item ${isExpanded ? 'ml-expanded-card' : ''}" id="card-${r.id}" style="border-radius: 12px; background: var(--panel); border: 1px solid var(--line); overflow: hidden; display: flex; flex-direction: column; position: relative; transition: all 0.3s ease;">
                  <div style="width: 4px; height: 100%; position: absolute; left: 0; top: 0; background: ${borderColor};"></div>
                  
                  <!-- Clickable collapsed area -->
                  <div data-action="ml-toggle-card" data-id="${r.id}" style="padding: 16px 20px; padding-left: 24px; flex: 1; cursor: pointer;">
                      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                          <div style="display: flex; flex-direction: column; gap: 4px;">
                              <span style="font-size: 10px; font-weight: 700; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.05em;">${titleText}</span>
                              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                  <span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: var(--surface-main); color: var(--ink-muted); font-family: monospace;">
                                      ID: ${q.id}
                                  </span>
                                  ${q.difficulty && q.difficulty !== "Unspecified" ? `<span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: ${diffBg}; color: ${diffColor};">${DIFFICULTIES[q.difficulty] || q.difficulty}</span>` : ''}
                                  <span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; background: var(--line-light); color: var(--ink-secondary); display: flex; align-items: center; gap: 4px;">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
                                      Missed ${group.attempts.length} time${group.attempts.length > 1 ? 's' : ''}
                                  </span>
                                  ${r.isMastered ? `<span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #dcfce7; color: #166534;">Mastered</span>` : ''}
                              </div>
                          </div>
                      </div>
                      
                      <div style="margin-bottom: 12px;">
                          <div style="font-size: 14px; color: var(--ink); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 12px;">
                              ${!isExpanded ? sanitizeHtml(q.prompt.replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<img[^>]*>/gi, '')) : ''}
                          </div>
                          
                          ${!isExpanded ? `
                          <div style="padding: 8px 12px; border-radius: 6px; background: #fef2f2; border: 1px solid #fecaca; display: flex; align-items: center; gap: 10px;">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                              <div>
                                  <span style="font-size: 10px; font-weight: 600; color: var(--ink-muted); display: block; margin-bottom: 2px;">Your Answer:</span>
                                  <span style="font-size: 14px; color: var(--ink); font-weight: 500;">${escapeHtml(r.answer) || "Omitted"}</span>
                              </div>
                          </div>
                          ` : ''}
                      </div>

                      ${(!isExpanded && (r.notes || unionTags.length > 0)) ? `
                      <div style="background: var(--surface-main); border-radius: 8px; padding: 12px; border: 1px dashed var(--line);">
                          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                              <span style="font-size: 11px; font-weight: 600; color: var(--ink-muted); display: flex; align-items: center; gap: 6px;">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> 
                                  Personal Note
                              </span>
                          </div>
                          ${r.notes ? `<p style="font-size: 13px; color: var(--ink); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 0;">${escapeHtml(r.notes)}</p>` : ''}
                          <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
                              ${unionTags.map(t => `<span style="padding: 2px 8px; background: var(--surface-hover); border: 1px solid var(--line); border-radius: 999px; font-size: 10px; font-weight: 600; color: var(--ink-main);">${t}</span>`).join("")}
                          </div>
                      </div>
                      ` : ''}
                  </div>

                  <!-- Expanded Details -->
                  ${isExpanded ? `
                  <div style="padding: 24px; border-top: 1px solid var(--line); background: var(--panel);">
                      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px;">
                          <button type="button" class="${r.isMastered ? 'primary-btn' : 'ghost-btn'}" data-action="ml-toggle-mastered" data-id="${r.id}" style="border: 1px solid var(--line); border-radius: 8px; font-weight: 500; font-size: 13px; padding: 6px 12px; color: ${r.isMastered ? 'var(--panel)' : 'var(--ink)'}; background: ${r.isMastered ? 'var(--ink)' : 'transparent'};">
                              ${r.isMastered ? 'Mastered ✓' : 'Mark Mastered'}
                          </button>
                          <button type="button" class="primary-btn" data-action="ml-retry-question" data-qid="${q.id}" style="border-radius: 8px; font-weight: 600; font-size: 13px; padding: 6px 16px; background: var(--ink); color: var(--panel);">
                              Retry Question
                          </button>
                      </div>
                      <div class="question-content" style="margin-bottom: 24px; margin-top: 0;">
                        ${q.stimulus ? sanitizeHtml(q.stimulus) + '<br><br>' : ''}
                        ${sanitizeHtml(q.prompt)}
                      </div>
                      ${renderAnswerArea(q, r.answer, r, { hideAnswer: false, isMistakesLog: true })}
                      
                      <!-- Explanation Box -->
                      <div style="margin-top: 24px; padding: 20px; background: var(--surface-main); border: 1px solid var(--line); border-radius: 8px;">
                          <h4 style="font-size: 15px; font-weight: 600; color: var(--ink); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="m4 6 8-4 8 4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/><path d="M18 5v17"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/></svg>
                              Explanation
                          </h4>
                          <div class="html-content rationale" style="font-size: 14px; color: var(--ink); line-height: 1.6; margin-top: 12px;">
                              ${sanitizeHtml(q.rationale || "No explanation included in this export.")}
                          </div>
                      </div>

                      ${renderQuestionMeta(q, { hideSkillDomain: true })}
                      
                      <!-- Attempt History -->
                      <div style="margin-top: 24px; border-top: 1px solid var(--line); padding-top: 16px;">
                        <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--ink-muted);">Attempt History</h4>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                          ${group.attempts.map(attempt => {
                            const date = attempt.answeredAt ? new Date(attempt.answeredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
                            const status = attempt.isAnswered === false ? 'Omitted' : 'Incorrect';
                            const answerText = attempt.answer ? `Answered: ${escapeHtml(attempt.answer)}` : '';
                            const time = attempt.timeSpentSeconds ? `${attempt.timeSpentSeconds}s` : '—';
                            const mode = attempt.mode === 'full' ? 'Full Test' : attempt.mode === 'custom' ? 'Custom' : attempt.mode || '—';
                            return `<div style="display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; color: var(--ink-muted); padding: 6px 12px; background: var(--surface-main); border-radius: 6px; align-items: baseline;">
                              <span style="white-space: nowrap; font-weight: 500;">${date}</span>
                              <span style="white-space: nowrap;">${mode}</span>
                              <span style="white-space: nowrap; font-weight: 600; color: ${status === 'Omitted' ? 'var(--ink-secondary)' : '#ef4444'}">${status}</span>
                              <span style="flex: 1 1 100px; word-break: break-word;">${answerText}</span>
                              <span style="margin-left: auto; white-space: nowrap;">${time}</span>
                            </div>`;
                          }).join('')}
                        </div>
                      </div>

                      <!-- Notes Section -->
                      <div class="ml-notes-section" style="margin-top: 32px; padding-top: 24px; border-top: 1px dashed var(--line);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                          <h4 style="font-size: 16px; font-weight: 600; margin: 0;">Personal Notes & Tags</h4>
                        </div>
                        
                        <div class="ml-note-empty-state" data-id="${r.id}" style="display: ${!(r.notes || (r.tags && r.tags.length > 0)) ? 'flex' : 'none'}; justify-content: center; padding: 16px 0;">
                          <button type="button" class="primary-btn" data-action="ml-edit-notes-toggle" data-id="${r.id}" style="border-radius: 8px; background-color: transparent; color: var(--ink); border: 2px dashed var(--line); width: 100%; height: 56px; font-weight: 600; transition: background-color 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.backgroundColor='var(--surface-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                            Add Note
                          </button>
                        </div>

                        <div class="ml-note-view-area" data-id="${r.id}" style="display: ${(r.notes || (r.tags && r.tags.length > 0)) ? 'block' : 'none'}; margin-bottom: 16px;">
                          <div style="border-radius: 8px; border: 1px solid var(--line); background-color: var(--surface-main); color: var(--ink); overflow: hidden;">
                            <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
                              ${(r.tags && r.tags.length > 0) ? `
                                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                  ${r.tags.map(t => `
                                    <span style="display: inline-flex; align-items: center; border-radius: 9999px; border: 1px solid transparent; padding: 4px 12px; font-size: 12px; font-weight: 600; background-color: var(--ink); color: var(--panel);">
                                      ${t}
                                    </span>
                                  `).join("")}
                                </div>
                              ` : ''}
                              ${r.notes ? `
                                <div style="font-size: 14px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; font-weight: 400;">${escapeHtml(r.notes).replace(/\\n/g, '<br>')}</div>
                              ` : ''}
                            </div>
                            <!-- Note Actions exactly at the bottom -->
                            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--line); background-color: var(--panel);">
                              <button type="button" class="ghost-btn" data-action="ml-delete-notes" data-id="${r.id}" style="color: var(--ink);" onmouseover="this.style.backgroundColor='var(--surface-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                                Delete Note
                              </button>
                              <button type="button" class="primary-btn" data-action="ml-edit-notes-toggle" data-id="${r.id}" style="background-color: var(--ink); color: var(--panel);">
                                Edit Note
                              </button>
                            </div>
                          </div>
                        </div>

                        <div class="ml-note-edit-area" data-id="${r.id}" style="display: none;">
                          <div style="margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 8px;">
                            ${Array.from(allUsedTags).map(tag => `
                              <button type="button" data-action="ml-toggle-tag" data-id="${r.id}" data-tag="${tag}" class="tag-badge ${(r.tags || []).includes(tag) ? 'active' : ''}">
                                ${escapeHtml(tag)}
                                ${!MISTAKE_TAGS.includes(tag) ? `<span data-action="ml-delete-custom-tag" data-tag="${tag}" style="margin-left: 6px; opacity: 0.6;">&times;</span>` : ''}
                              </button>
                            `).join("")}
                            <button type="button" data-action="ml-add-custom-tag" data-id="${r.id}" class="tag-badge" style="border-style: dashed; background: transparent;">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M5 12h14"/><path d="M12 5v14"/></svg> Add Tag
                            </button>
                          </div>
                          <textarea class="ml-note-input" data-action="ml-note-input" data-id="${r.id}" data-original="${escapeHtml(r.notes || "")}" placeholder="Why did you get this wrong? What will you do differently next time?" style="width: 100%; min-height: 100px; padding: 16px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); font-family: inherit; font-size: 14px; resize: vertical; margin-bottom: 16px;">${r.notes || ""}</textarea>
                          <div style="display: flex; justify-content: flex-end; align-items: center; gap: 16px;">
                            <span class="ml-error-msg" id="ml-error-${r.id}" style="color: #ef4444; font-size: 13px; display: none;">Please select at least one tag.</span>
                            <button type="button" class="primary-btn" data-action="ml-save-notes" data-id="${r.id}">Save Note</button>
                          </div>
                        </div>
                      </div>
                  </div>
                  ` : ''}
              </div>
              `;
            }).join("")}
        </div>

        ${totalPages > 1 ? `
        <!-- Pagination Controls (Monochrome Design) -->
        <nav role="navigation" aria-label="pagination" style="display: flex; justify-content: center; padding: 32px 16px 8px;">
          <ul class="ml-pagination">
            <li style="list-style: none;">
              <button type="button" class="ml-pagination-nav-btn" data-action="ml-change-page" data-page="${Math.max(1, state.mistakesLog.currentPage - 1)}" ${state.mistakesLog.currentPage === 1 ? 'disabled' : ''} aria-label="Go to previous page">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                <span style="display: none;" class="ml-pg-label">Prev</span>
              </button>
            </li>
            ${(function() {
              var pages = [];
              var cp = state.mistakesLog.currentPage;
              var tp = totalPages;
              if (tp <= 7) {
                for (var i = 1; i <= tp; i++) pages.push(i);
              } else {
                pages.push(1);
                if (cp > 3) pages.push('...');
                var start = Math.max(2, cp - 1);
                var end = Math.min(tp - 1, cp + 1);
                if (cp <= 3) { start = 2; end = 4; }
                if (cp >= tp - 2) { start = tp - 3; end = tp - 1; }
                for (var j = start; j <= end; j++) pages.push(j);
                if (cp < tp - 2) pages.push('...');
                pages.push(tp);
              }
              return pages.map(function(p) {
                if (p === '...') {
                  return '<li style="list-style: none;"><span aria-hidden="true" style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; font-size: 13px; color: var(--ink-muted);">···</span></li>';
                }
                var isActive = p === cp;
                var btnClass = isActive ? 'ml-pagination-btn active' : 'ml-pagination-btn';
                return '<li style="list-style: none;"><button type="button" class="' + btnClass + '" data-action="ml-change-page" data-page="' + p + '" aria-label="Go to page ' + p + '" aria-current="' + (isActive ? 'page' : 'false') + '">' + p + '</button></li>';
              }).join('');
            })()}
            <li style="list-style: none;">
              <button type="button" class="ml-pagination-nav-btn" data-action="ml-change-page" data-page="${Math.min(totalPages, state.mistakesLog.currentPage + 1)}" ${state.mistakesLog.currentPage === totalPages ? 'disabled' : ''} aria-label="Go to next page">
                <span style="display: none;" class="ml-pg-label">Next</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </li>
          </ul>
        </nav>
        <div style="text-align: center; font-size: 12px; color: var(--ink-muted); padding-bottom: 8px;">Page ${state.mistakesLog.currentPage} of ${totalPages} · ${groupedList.length} question${groupedList.length !== 1 ? 's' : ''}</div>
        ` : (groupedList.length > 0 ? `<div style="text-align: center; font-size: 12px; color: var(--ink-muted); padding: 16px 0;">${groupedList.length} question${groupedList.length !== 1 ? 's' : ''}</div>` : '')}
        </div>
        <button class="primary-btn scroll-top-btn" type="button" data-action="scroll-top" aria-label="Scroll to top">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
        </button>
      </div>
    `;
  }


  /* ---- Dashboard Sub-Components ---- */

  function renderMetric(label, value, caption, valueStyle = "") {
    return `
      <article class="metric-card">
        <span>${escapeHtml(label)}</span>
        <strong${valueStyle ? ` style="${valueStyle}"` : ""}>${escapeHtml(String(value))}</strong>
        <small>${escapeHtml(caption)}</small>
      </article>
    `;
  }

  function renderDomainPerformance(domains) {
    if (!domains.length) return `<p class="muted">Answer some questions to see skill levels.</p>`;
    return `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        ${domains.map(d => {
          const color = d.subject === 'math' ? 'var(--blue)' : 'var(--amber)';
          return `
          <div>
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
              <span style="font-size: 14px; font-weight: 500; color: var(--ink);">${escapeHtml(d.label)}</span>
              <span style="font-size: 13px; font-weight: 600; color: var(--ink-muted);">${Math.round(d.accuracy * 100)}% Accuracy</span>
            </div>
            ${d.repeatMissQuestions > 0 ? `
              <div style="font-size: 12px; color: var(--red); margin-top: 4px; margin-bottom: 4px;">
                ⚠ ${d.repeatMissQuestions} repeat-miss question${d.repeatMissQuestions > 1 ? 's' : ''} · ${d.totalMissedAttempts} missed attempts
              </div>
            ` : ''}
            <div style="height: 10px; background: var(--line); border-radius: 5px; overflow: hidden; display: flex;">
              <div style="width: ${d.accuracy * 100}%; background: ${color}; border-radius: 5px; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);"></div>
            </div>
          </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderVolumeStats(domains, subjects) {
    if (!domains.length) return `<p class="muted">No completed questions yet.</p>`;
    const maxVal = Math.max(...domains.map(x => x.answered), 1);
    
    const mathAnswered = domains.filter(d => d.subject === 'math').reduce((a, b) => a + b.answered, 0);
    const rwAnswered = domains.filter(d => d.subject === 'rw').reduce((a, b) => a + b.answered, 0);
    const totalAnswered = mathAnswered + rwAnswered;
    const mathPercent = totalAnswered > 0 ? (mathAnswered / totalAnswered) * 100 : 0;
    const pieGradient = totalAnswered > 0
      ? `conic-gradient(var(--blue) ${mathPercent}%, var(--amber) 0)`
      : `var(--line)`;
    const legendOpacity = totalAnswered > 0 ? '1' : '0.45';
    
    return `
      <div style="display: flex; align-items: center; justify-content: center; gap: 32px; margin-bottom: 32px; margin-top: 8px;">
        <div style="position: relative; width: 120px; height: 120px; border-radius: 50%; background: ${pieGradient};">
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; background: var(--panel); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-direction: column;">
            <span style="font-size: 18px; font-weight: 700; color: var(--ink);">${totalAnswered}</span>
            <span style="font-size: 11px; color: var(--ink-muted);">Total</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px; opacity: ${legendOpacity};">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 12px; height: 12px; border-radius: 3px; background: var(--blue);"></div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1;">${mathAnswered} Math</span>
              <span style="font-size: 11px; color: var(--ink-muted);">${Math.round(mathPercent)}%</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 12px; height: 12px; border-radius: 3px; background: var(--amber);"></div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1;">${rwAnswered} R/W</span>
              <span style="font-size: 11px; color: var(--ink-muted);">${Math.round(100 - mathPercent)}%</span>
            </div>
          </div>
        </div>
      </div>
      
      <div style="display: flex; align-items: flex-end; justify-content: space-around; height: 160px; gap: 8px; border-top: 1px solid var(--line); padding-top: 24px; position: relative;" class="volume-bar-chart">
        ${domains.map(d => {
          const height = (d.answered / maxVal) * 100;
          const color = d.subject === 'math' ? 'var(--blue)' : 'var(--amber)';
          const abbrMap = {
            "Advanced Math": "Adv",
            "Algebra": "Alg",
            "Geometry and Trigonometry": "Geo",
            "Problem-Solving and Data Analysis": "Data",
            "Craft and Structure": "Craft",
            "Expression of Ideas": "Expr",
            "Information and Ideas": "Info",
            "Standard English Conventions": "Conv"
          };
          const shortName = abbrMap[d.label] || d.label.substring(0, 4);
          return `
            <div class="volume-bar-group" style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; flex: 1; min-width: 0; position: relative; cursor: pointer;">
              <span style="font-size: 11px; font-weight: 600; color: var(--ink); margin-bottom: 6px;">${d.answered}</span>
              <div style="width: 100%; max-width: 32px; height: ${height}%; background: ${color}; border-radius: 4px 4px 0 0; opacity: 0.85; transition: height 1s ease-out, opacity 0.2s;"></div>
              <span style="font-size: 10px; color: var(--ink-muted); text-align: center; margin-top: 6px;">${escapeHtml(shortName)}</span>
              
              <div class="volume-bar-tooltip" style="position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); background: var(--ink); color: var(--panel); padding: 6px 10px; border-radius: 6px; font-size: 12px; white-space: nowrap; z-index: 10; opacity: 0; pointer-events: none; transition: opacity 0.2s; box-shadow: var(--shadow-md);">
                ${escapeHtml(d.label)}
                <div style="position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: var(--ink);"></div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderSubjectTiming(subjects) {
    return `<div class="domain-list">${Object.entries(SUBJECTS).map(([sub, label]) => {
      const s = subjects[sub] || { answered: 0, avgTime: 0 };
      const target = sub === "math" ? "90s target" : "~71s target";
      return `
        <article class="timing-row">
          <div><strong>${label}</strong><small>${s.answered} answered · ${target}</small></div>
          <b>${s.avgTime ? `${Math.round(s.avgTime)}s` : "—"}</b>
        </article>
      `;
    }).join("")}</div>`;
  }

  function renderWeaknesses(domains) {
    const weak = domains.filter(d => d.answered >= 2 && d.incorrect >= d.correct).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
    if (!weak.length) return `<p class="muted">No weak domains detected yet.</p>`;
    return `<div class="callout-list">${weak.map(d => `
      <article class="callout-card warn"><strong>${escapeHtml(d.label)}</strong><span>${d.correct}/${d.answered} correct</span></article>
    `).join("")}</div>`;
  }

  function renderStrengths(domains) {
    const strong = domains.filter(d => d.answered >= 2 && d.accuracy >= 0.75).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);
    if (!strong.length) return `<p class="muted">No strong domains identified yet.</p>`;
    return `<div class="callout-list">${strong.map(d => `
      <article class="callout-card good"><strong>${escapeHtml(d.label)}</strong><span>${formatPercent(d.accuracy)} accuracy</span></article>
    `).join("")}</div>`;
  }

  function renderRadio(name, value, label, selected) {
    return `<label><input type="radio" name="${name}" value="${value}" ${selected === value ? "checked" : ""}><span>${escapeHtml(label)}</span></label>`;
  }

  /* ===========================================================
     HOME EVENT BINDING
     =========================================================== */

  function updateMistakesSummary() {
    const { wrongQuestions, skippedQuestions } = getMistakesData();
    let selectedCount = 0;
    if (state.selectedMistakeTypes.has("wrong")) {
      selectedCount += wrongQuestions.filter(q => state.selectedMistakeDomains.has(q.domain) && state.selectedMistakeSkills.has(q.domain + "|" + (q.skill || "Unspecified"))).length;
    }
    if (state.selectedMistakeTypes.has("skipped")) {
      selectedCount += skippedQuestions.filter(q => state.selectedMistakeDomains.has(q.domain) && state.selectedMistakeSkills.has(q.domain + "|" + (q.skill || "Unspecified"))).length;
    }
    
    const countEl = document.querySelector('.start-summary strong');
    if (countEl) countEl.textContent = selectedCount;
    
    const btnEl = document.querySelector('button[data-action="start-retry-practice"]');
    if (btnEl) {
      if (selectedCount === 0) {
        btnEl.setAttribute("disabled", "true");
      } else {
        btnEl.removeAttribute("disabled");
      }
    }
    
    const domainCheckboxes = document.querySelectorAll('input[data-action="toggle-mistake-domain"]');
    for (const cb of domainCheckboxes) {
      cb.checked = state.selectedMistakeDomains.has(cb.dataset.domain);
    }
    const skillCheckboxes = document.querySelectorAll('input[data-action="toggle-mistake-skill"]');
    for (const cb of skillCheckboxes) {
      cb.checked = state.selectedMistakeSkills.has(cb.dataset.domain + "|" + cb.dataset.skill);
    }

    const subjectContainers = document.querySelectorAll('.subject-buttons-container');
    for (const container of subjectContainers) {
      const subjectKey = container.dataset.subjectContainer;
      const panel = container.closest('.panel');
      if (panel) {
        const checkboxes = panel.querySelectorAll('input[type="checkbox"][data-action="toggle-mistake-domain"], input[type="checkbox"][data-action="toggle-mistake-skill"]');
        if (checkboxes.length > 0) {
          const total = checkboxes.length;
          const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
          let html = '';
          if (checked === 0) {
            html = `<button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subjectKey}" data-value="all" style="font-size:12px; padding:4px 10px; min-height:28px;">Select All</button>`;
          } else if (checked === total) {
            html = `<button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subjectKey}" data-value="none" style="font-size:12px; padding:4px 10px; min-height:28px;">Deselect All</button>`;
          } else {
            html = `
              <button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subjectKey}" data-value="all" style="font-size:12px; padding:4px 10px; min-height:28px;">Select All</button>
              <button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subjectKey}" data-value="none" style="font-size:12px; padding:4px 10px; min-height:28px;">Deselect All</button>
            `;
          }
          if (container.innerHTML.trim() !== html.trim()) {
            container.innerHTML = html;
            const newBtns = container.querySelectorAll('button');
            for (const btn of newBtns) {
              btn.addEventListener("click", handleHomeAction);
            }
          }
        }
      }
    }
  }

  function bindHomeEvents() {
    applyAllVisibleHighlights();
    for (const btn of app.querySelectorAll("[data-action]")) {
      if (btn.tagName === "SELECT" || btn.tagName === "INPUT") {
        btn.addEventListener("change", handleHomeAction);
      } else if (btn.tagName === "TEXTAREA") {
        btn.addEventListener("input", handleHomeAction);
      } else {
        btn.addEventListener("click", handleHomeAction);
      }
    }

    function syncConfigUI(form) {
      const newCount = countFilteredQuestions(state.config);
      // Update matching question count
      const countEl = form.querySelector('.start-summary strong');
      if (countEl) countEl.textContent = newCount;
      // Sync limit input: when custom skill counts are active, show computed total and disable
      const limitInput = form.querySelector('input[name="limit"]');
      const limitLabel = limitInput ? limitInput.closest('.limit-field') : null;
      const limitCaption = limitLabel ? limitLabel.querySelector('small') : null;
      if (limitInput) {
        if (state.config.hasCustomCounts) {
          limitInput.value = state.config.limit;
          limitInput.disabled = true;
          if (limitCaption) limitCaption.textContent = "Driven by skill limits above.";
        } else {
          limitInput.disabled = (state.config.subject === "both");
          if (limitCaption) limitCaption.textContent = state.config.subject === "both" ? "Full test uses SAT module sizes." : "Set how many questions to practice.";
        }
      }
      // Grey out start button when 0 questions match
      const startBtn = form.querySelector('button[type="submit"]');
      if (startBtn) startBtn.disabled = (newCount === 0);
    }

    const form = app.querySelector("#configForm");
    if (form) {
      form.addEventListener("submit", e => { e.preventDefault(); startPractice(readConfigFromForm(form)); });
      form.addEventListener("change", e => {
        // Bug fix #1: Deselecting a domain cascades to its sub-skills
        if (e.target.name === "domain" && !e.target.checked && state.showAdvancedDomains) {
          const domainCode = e.target.value;
          const availableDomains = getAvailableDomains(state.config.subject || "math");
          const domain = availableDomains.find(d => d.code === domainCode);
          if (domain && domain.skills) {
            const domainContainer = e.target.closest('div');
            if (domainContainer) {
              domainContainer.querySelectorAll('input[name="skill"]').forEach(cb => {
                if (cb.checked) {
                  cb.checked = false;
                  window.handleSkillCheckboxChange(cb);
                }
              });
            }
          }
        }
        // Bug fix #1b: Re-selecting a domain selects all its sub-skills
        if (e.target.name === "domain" && e.target.checked && state.showAdvancedDomains) {
          const domainContainer = e.target.closest('div');
          if (domainContainer) {
            domainContainer.querySelectorAll('input[name="skill"]').forEach(cb => {
              if (!cb.checked) {
                cb.checked = true;
                window.handleSkillCheckboxChange(cb);
              }
            });
          }
        }
        // Checking a skill auto-selects its parent domain if unchecked
        if (e.target.name === "skill" && e.target.checked && state.showAdvancedDomains) {
          // Walk up to the outer domain container div that holds both the check-card and the skills
          const outerDiv = e.target.closest('.check-grid > div');
          if (outerDiv) {
            const domainCb = outerDiv.querySelector('input[name="domain"]');
            if (domainCb && !domainCb.checked) {
              domainCb.checked = true;
            }
          }
        }
        state.config = readConfigFromForm(form);
        if (e.target.name === "subject") {
          const availableDomains = getAvailableDomains(state.config.subject);
          state.config.domainCodes = availableDomains.map(d => d.code);
          state.config.skillCodes = availableDomains.flatMap(d => d.skills);
          renderHome();
        } else {
          syncConfigUI(form);
        }
      });
      // Bug fix #6: Also listen for 'input' event on number fields for real-time updates
      form.addEventListener("input", e => {
        if (e.target.type === "number") {
          state.config = readConfigFromForm(form);
          syncConfigUI(form);
        }
      });
    }
    window.updateSelectAllButtons();
  }

  let isSyncingLinkedAccount = false;
  async function syncLinkedAccount({ returningUser = false, hideBusy = false } = {}) {
    if (isSyncingLinkedAccount) return;
    if (isDemoMode()) {
      showNotice("Cloud sync is disabled in Demo Mode. Exit demo to use your own account.", "info");
      renderHome();
      return;
    }
    if (!requirePrivacyConsent()) return;
    if (!window.SevSync) {
      showNotice("Cloud sync is unavailable. Check your connection and try again.", "error");
      renderHome();
      return;
    }

    isSyncingLinkedAccount = true;
    let email = SevSync.getStatus()?.email || "";
    try {
      if (!SevSync.isLinked()) {
        if (!hideBusy) setBusy("Connecting Google Drive", "Choose the Google account that already has your Sevrony sync data.", "sync");
        await nextPaint();
        email = await SevSync.link();
        if (email && window.posthog?.identify) window.posthog.identify(email);
      } else if (!SevSync.getStatus().tokenValid) {
        if (!hideBusy) setBusy("Reconnecting Google Drive", "Renewing session...", "sync");
        await nextPaint();
      }

      if (!hideBusy) setBusy("Syncing cloud data", "Restoring questions, sessions, Bluebook imports, and dashboard metrics from Google Drive.", "sync");
      const result = await SevSync.sync(true);
      if (!result.ok && result.reason !== "already_syncing") throw new Error(result.reason || "sync_failed");

      await refreshLocalData();
      ensureConfigDefaults();
      if (!hideBusy) clearBusy(false);

      if (returningUser && !hasRestorablePracticeData()) {
        state.view = "onboarding";
        showNotice("No synced practice data was found for this account. Import a .sat-test file or choose another account.", "error");
        renderHome();
        isSyncingLinkedAccount = false;
        return;
      }

      if (returningUser) {
        state.view = hasActiveVocabSession() ? "vocab" : "dashboard";
        localStorage.setItem(TUTORIAL_DONE_KEY, "true"); // Skip tutorial
      }
      showNotice(email ? `Synced with ${email}.` : "Synced successfully.", "success");
      renderHome();
      if (!returningUser) maybeStartTutorial();
    } catch (err) {
      clearBusy(false);
      console.error(err);
      state.view = returningUser ? "onboarding" : state.view;
      showNotice("Cloud sync failed. Please try again.", "error");
      renderHome();
    } finally {
      isSyncingLinkedAccount = false;
    }
  }

  /**
   * Unified onboarding flow: sign in with Google → sync Drive data (if any) →
   * auto-download the question catalog from the server. Works the same way for
   * brand-new and returning users — returning users get their Drive data loaded
   * alongside the fresh server questions; new users just get the questions.
   */
  async function signInAndSetup() {
    if (isSyncingLinkedAccount) return;
    if (isDemoMode()) {
      showNotice("Cloud sync is disabled in Demo Mode. Exit demo to use your own account.", "info");
      renderHome();
      return;
    }
    if (!requirePrivacyConsent()) return;
    if (!window.SevSync) {
      // Sync module unavailable — fall back to a plain catalog download
      downloadCatalog();
      return;
    }

    isSyncingLinkedAccount = true;
    let signedIn = false;
    try {
      if (!SevSync.isLinked()) {
        setBusy("Signing in", "Choose your Google account.", "sync");
        await nextPaint();
        const email = await SevSync.link();
        if (email && window.posthog?.identify) window.posthog.identify(email);
      } else if (!SevSync.getStatus().tokenValid) {
        setBusy("Reconnecting", "Renewing your session...", "sync");
        await nextPaint();
      }

      setBusy("Syncing your data", "Checking for existing practice data.", "sync");
      const result = await SevSync.sync(true);
      // A failed sync is not fatal — the user can still get questions from the
      // server.  Log it but don't throw.
      if (!result.ok && result.reason !== "already_syncing") {
        console.warn("Drive sync during sign-in returned:", result.reason);
      }

      await refreshLocalData();
      ensureConfigDefaults();
      clearBusy(false);

      const email = SevSync.getStatus()?.email || "";
      if (hasRestorablePracticeData()) {
        showNotice(email ? `Welcome back, synced with ${email}.` : "Synced successfully.", "success");
      } else if (email) {
        showNotice(`Signed in as ${email}.`, "success");
      }
      localStorage.setItem(TUTORIAL_DONE_KEY, "true");
      signedIn = true;
    } catch (err) {
      clearBusy(false);
      console.error("Sign-in flow error:", err);
      showNotice("Couldn't complete sign-in. Please try again.", "error");
      renderHome();
    } finally {
      isSyncingLinkedAccount = false;
    }

    // After a successful sign-in, download the catalog automatically.
    // downloadCatalog() handles the "already current" case gracefully.
    if (signedIn) {
      await downloadCatalog();
    }
  }

  function shouldAutoStartTutorial() {
    return state.view === "dashboard"
      && state.questions.length > 0
      && !state.activeTest
      && !state.busy
      && !state.tutorial.active
      && localStorage.getItem(TUTORIAL_DONE_KEY) !== "true";
  }

  function maybeStartTutorial() {
    if (!shouldAutoStartTutorial()) return;
    window.setTimeout(() => {
      if (shouldAutoStartTutorial()) startTutorial();
    }, 50);
  }

  function startTutorial({ force = false } = {}) {
    if (state.tutorial.active) return;
    if (!force && !shouldAutoStartTutorial()) return;
    if (force && state.questions.length === 0) {
      showNotice("Import or sync practice data first, then the tutorial can walk you through the dashboard.", "info");
      renderHome();
      return;
    }

    state.tutorial.active = true;
    state.tutorial.step = 0;
    state.tutorial.previousFocus = document.activeElement;
    renderTutorialStep();
  }

  function findTourTarget(step) {
    return document.querySelector(step.selector) || document.querySelector("[data-tour-target='dashboard-hero']") || app;
  }

  function updateTutorialPosition() {
    if (!state.tutorial.active) return;
    const overlay = document.querySelector(".tour-overlay");
    const spotlight = overlay?.querySelector(".tour-spotlight");
    const card = overlay?.querySelector(".tour-card");
    if (!overlay || !spotlight || !card) return;

    const step = TUTORIAL_STEPS[state.tutorial.step];
    const target = findTourTarget(step);
    const rect = target.getBoundingClientRect();
    const pad = 8;
    const top = Math.max(8, rect.top - pad);
    const left = Math.max(8, rect.left - pad);
    const width = Math.min(window.innerWidth - left - 8, rect.width + pad * 2);
    const height = Math.min(window.innerHeight - top - 8, rect.height + pad * 2);

    spotlight.style.top = `${top}px`;
    spotlight.style.left = `${left}px`;
    spotlight.style.width = `${width}px`;
    spotlight.style.height = `${height}px`;

    const cardWidth = Math.min(380, window.innerWidth - 32);
    const estimatedCardHeight = 240;
    const cardLeft = clamp(rect.left, 16, window.innerWidth - cardWidth - 16);
    let cardTop = rect.bottom + 18;
    if (cardTop + estimatedCardHeight > window.innerHeight) {
      cardTop = Math.max(16, rect.top - estimatedCardHeight - 18);
    }
    card.style.width = `${cardWidth}px`;
    card.style.left = `${cardLeft}px`;
    card.style.top = `${cardTop}px`;
  }

  function renderTutorialStep() {
    const step = TUTORIAL_STEPS[state.tutorial.step];
    
    if (window.innerWidth <= 768) {
      if (step.selector.includes('-nav') || step.selector.includes('sync')) {
        app.classList.remove("sidebar-collapsed");
      } else {
        app.classList.add("sidebar-collapsed");
      }
    }

    const target = findTourTarget(step);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });

    let overlay = document.querySelector(".tour-overlay");
    const isInitial = !overlay;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "tour-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Sevrony tutorial");
      overlay.innerHTML = `<div class="tour-spotlight" aria-hidden="true"></div><div class="tour-card" tabindex="-1"></div>`;
      overlay.addEventListener("click", event => {
        const action = event.target.closest("[data-tour-action]")?.dataset.tourAction;
        if (!action) return;
        if (action === "skip") endTutorial(true);
        if (action === "back") moveTutorial(-1);
        if (action === "next") moveTutorial(1);
        if (action === "done") endTutorial(true);
      });
      overlay.addEventListener("keydown", event => handleTutorialKey(event));
      overlay.addEventListener("wheel", e => e.preventDefault(), { passive: false });
      overlay.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
      document.body.appendChild(overlay);
      window.addEventListener("resize", updateTutorialPosition);
      window.addEventListener("scroll", updateTutorialPosition, true);
    }

    if (isInitial) {
      const spotlight = overlay.querySelector(".tour-spotlight");
      if (spotlight) spotlight.style.transition = "none";
    }

    const isFirst = state.tutorial.step === 0;
    const isLast = state.tutorial.step === TUTORIAL_STEPS.length - 1;
    overlay.querySelector(".tour-card").innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <p class="tour-progress" style="background: var(--ink); color: var(--panel); padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; margin: 0; text-transform: uppercase;">Step ${state.tutorial.step + 1} of ${TUTORIAL_STEPS.length}</p>
        <button type="button" class="icon-btn" data-tour-action="skip" style="color: var(--ink-muted); padding: 4px; border: none; background: transparent; cursor: pointer; border-radius: 50%; display: flex;" aria-label="Close tutorial">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 6px; color: var(--ink); letter-spacing: -0.02em;">${escapeHtml(step.title)}</h2>
      <p style="font-size: 14px; color: var(--ink-muted); line-height: 1.5; margin: 0 0 20px;">${escapeHtml(step.body)}</p>
      <div class="tour-actions" style="display: flex; justify-content: flex-end; gap: 8px;">
        ${!isFirst ? `<button class="secondary-btn" type="button" data-tour-action="back" style="padding: 8px 16px; border-radius: 999px;">Back</button>` : ''}
        <button class="primary-btn" type="button" data-tour-action="${isLast ? "done" : "next"}" style="padding: 8px 16px; border-radius: 999px;">${isLast ? "Finish" : "Next"}</button>
      </div>
    `;
    requestAnimationFrame(() => {
      updateTutorialPosition();
      
      if (isInitial) {
        void overlay.offsetWidth;
        const spotlight = overlay.querySelector(".tour-spotlight");
        if (spotlight) spotlight.style.transition = "";
      }

      overlay.querySelector(isLast ? "[data-tour-action='done']" : "[data-tour-action='next']")?.focus();
      
      if (window.innerWidth <= 768) {
        setTimeout(updateTutorialPosition, 350);
      }
    });
  }

  function moveTutorial(direction) {
    state.tutorial.step = clamp(state.tutorial.step + direction, 0, TUTORIAL_STEPS.length - 1);
    renderTutorialStep();
  }

  function handleTutorialKey(event) {
    if (!state.tutorial.active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      endTutorial(true);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (state.tutorial.step === TUTORIAL_STEPS.length - 1) endTutorial(true);
      else moveTutorial(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTutorial(-1);
    }
  }

  function endTutorial(markDone) {
    const overlay = document.querySelector(".tour-overlay");
    if (overlay) overlay.remove();
    window.removeEventListener("resize", updateTutorialPosition);
    window.removeEventListener("scroll", updateTutorialPosition, true);
    state.tutorial.active = false;
    state.tutorial.step = 0;
    if (markDone) localStorage.setItem(TUTORIAL_DONE_KEY, "true");
    if (state.tutorial.previousFocus?.focus) state.tutorial.previousFocus.focus();
    state.tutorial.previousFocus = null;
  }

  async function handleHomeAction(event) {
    event.stopPropagation();
    const action = event.currentTarget.dataset.action;

    if (action === "switch-catalog") {
      const targetCatalog = event.currentTarget.dataset.catalog || event.currentTarget.value;
      if (targetCatalog) {
        await switchCatalog(targetCatalog);
      }
      return;
    }

    if (action === "view-session-overview") {
      const sessionId = event.currentTarget.dataset.sessionId;
      const session = state.sessions.find(s => s.id === sessionId);
      if (session) {
        const sessionResponses = state.responses.filter(r => r.sessionId === sessionId);
        state.lastResult = { session, responses: sessionResponses };
        sessionStorage.setItem('lastResultSessionId', session.id);
        state.view = "results";
        state.notice = null;
        renderHome();
      }
      return;
    }

    if (action === "dismiss-ios-warning") {
      localStorage.setItem('sevrony.iosWarningDismissed', 'true');
      renderHome();
      return;
    }

    if (action === "report-question") {
      const qid = event.currentTarget.dataset.qid;
      if (isTelemetryAccepted()) {
        await sendQuestionReport(qid);
        return;
      }
      const debugUrl = makeDebugUrl(qid);
      showConfirmModal(
        "Sending a report loads Sentry and sends this question ID plus a local debug URL. If you prefer to keep telemetry off, cancel and use the debug URL manually.",
        "Accept & Send",
        async () => {
          setTelemetryConsent(TELEMETRY_ACCEPTED);
          await sendQuestionReport(qid);
        },
        {
          cancelText: "Keep Local",
          onCancel: () => showManualReportFallback(debugUrl)
        }
      );
      return;
    }

    if (action === "toggle-pacing") {
      state.showPacingConfig = !state.showPacingConfig;
      renderHome();
      return;
    }

    if (action === "reset-pacing") {
      state.pacingConfig = null;
      renderHome();
      return;
    }

    if (action === "toggle-sidebar") {
      app.classList.toggle("sidebar-collapsed");
      localStorage.setItem("sidebarCollapsed", app.classList.contains("sidebar-collapsed"));
      return;
    }

    if (action === "scroll-top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (action === "start-onboarding") { state.view = "onboarding"; renderHome(); return; }
    if (action === "returning-sign-in" || action === "sign-in-and-download") { await signInAndSetup(); return; }
    if (action === "import-bluebook") { if (requirePrivacyConsent()) fileInput.click(); return; }
    if (action === "privacy-back") {
      if (state.questions.length === 0) {
        window.history.back();
      } else {
        window.location.hash = "dashboard";
      }
      return;
    }
    if (action === "dashboard") { state.view = "dashboard"; state.notice = null; renderHome(); }
    if (action === "vocab") { state.view = "vocab"; state.notice = null; renderHome(); }
    if (action === "backup") { state.view = "backup"; state.notice = null; renderHome(); }
    if (action === "privacy") { state.view = "privacy"; state.notice = null; renderHome(); }
    if (action === "reset-telemetry") {
      resetTelemetryConsent();
      showNotice("Telemetry preference reset. Choose again in the banner below.", "info");
      renderHome();
    }
    if (action === "open-support") {
      showSupportModal();
    }
    if (action === "open-feedback") {
      showFeedbackModal();
    }
    if (action === "config") { state.view = "config"; state.notice = null; ensureConfigDefaults(); renderHome(); }
    if (action === "history") {
      const activeSessions = getActiveSessions();
      const fullTests = activeSessions.filter(s => s.mode === "full" || s.mode === "bluebook");
      const subjectTests = activeSessions.filter(s => s.mode !== "full" && s.mode !== "bluebook");
      if (fullTests.length === 0 && subjectTests.length > 0) {
        state.historyTab = "subject";
      } else {
        state.historyTab = "full";
      }
      state.view = "history";
      state.notice = null;
      renderHome();
    }
    if (action === "history-tab") {
      const newTab = event.currentTarget.dataset.tab || "full";
      if (state.historyTab === newTab) return;
      state.historyTab = newTab;
      
      const panel = document.querySelector('.history-panel');
      if (panel) {
        panel.innerHTML = renderHistoryPanelContent();
        bindHomeEvents();
      } else {
        renderHome();
      }
      return;
    }
    if (action === "retry-session-mistakes") {
      const sessionId = event.currentTarget.dataset.sessionId;
      state.mistakesSessionId = sessionId;
      const { wrongQuestions, skippedQuestions } = getMistakesData();
      const allMistakes = [...wrongQuestions, ...skippedQuestions];
      if (allMistakes.length === 0) {
        showNotice("No mistakes or omitted questions in this test!", "info");
        state.mistakesSessionId = null;
        renderHome();
        return;
      }
      state.selectedMistakeDomains = new Set(allMistakes.map(q => q.domain));
      state.selectedMistakeTypes = new Set(["wrong", "skipped"]);
      state.view = "mistakes";
      state.notice = null;
      renderHome();
    }
    if (action === "mistakes-log") {
      state.view = "mistakes-log";
      state.notice = null;
      renderHome();
    }
    if (action === "ml-change-subject") {
      const newVal = event.currentTarget.value || event.target.value;
      if (state.mistakesLog.filterSubject !== newVal) {
        state.mistakesLog.filterSubject = newVal;
        state.mistakesLog.filterDomain = "all";
        state.mistakesLog.filterSkill = "all";
        state.mistakesLog.currentPage = 1;
        updateMistakesLogUI();
      }
    }
    if (action === "ml-change-domain") {
      state.mistakesLog.filterDomain = event.currentTarget.value || event.target.value;
      state.mistakesLog.filterSkill = "all";
      state.mistakesLog.currentPage = 1;
      updateMistakesLogUI();
    }
    if (action === "ml-change-skill") {
      state.mistakesLog.filterSkill = event.currentTarget.value || event.target.value;
      state.mistakesLog.currentPage = 1;
      updateMistakesLogUI();
    }
    if (action === "ml-change-type") {
      state.mistakesLog.filterType = event.currentTarget.value || event.target.value;
      state.mistakesLog.currentPage = 1;
      updateMistakesLogUI();
    }
    if (action === "ml-change-page") {
      const newPage = parseInt(event.currentTarget.dataset.page, 10);
      if (newPage && newPage !== state.mistakesLog.currentPage) {
        state.mistakesLog.currentPage = newPage;
        updateMistakesLogUI();
        const container = document.getElementById("mistakes-log-container");
        if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    if (action === "ml-filter-tag") {
      const tag = event.currentTarget.dataset.tag || event.target.dataset.tag;
      if (state.mistakesLog.filterTags.has(tag)) state.mistakesLog.filterTags.delete(tag);
      else state.mistakesLog.filterTags.add(tag);
      state.mistakesLog.currentPage = 1;
      updateMistakesLogUI();
    }
    if (action === "ml-toggle-mastered") {
      const id = event.currentTarget.dataset.id;
      const response = state.responses.find(x => x.id === id);
      if (response) {
        response.isMastered = !response.isMastered;
        DB.put("responses", response).then(() => {
          updateMistakesLogUI();
          if (window.SevSync?.isLinked()) window.SevSync.sync();
        }).catch(console.error);
      }
    }
    if (action === "ml-retry-question") {
      const qid = event.currentTarget.dataset.qid;
      const q = state.questions.find(x => x.id === qid || x.externalId === qid || x.questionId === qid);
      if (q) {
        startCustomPractice({ subject: q.subject || "both", limit: 1, isRetry: true }, [q]);
      }
    }
    if (action === "ml-toggle-card") {
      const id = event.currentTarget.closest("[data-id]").dataset.id;
      const wasExpanded = state.mistakesLog.expanded.has(id);
      if (wasExpanded) {
        state.mistakesLog.expanded.delete(id);
      } else {
        state.mistakesLog.expanded.add(id);
      }
      state.mistakesLog.justToggled = id;
      updateMistakesLogUI();
      state.mistakesLog.justToggled = null;
      if (!wasExpanded) {
        setTimeout(() => {
          const card = document.querySelector(`.shadcn-accordion-trigger[data-id="${id}"]`);
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }
    }
    if (action === "ml-toggle-answer") {
      const id = event.currentTarget.closest("[data-id]").dataset.id;
      if (state.mistakesLog.showAnswer.has(id)) {
        state.mistakesLog.showAnswer.delete(id);
      } else {
        state.mistakesLog.showAnswer.add(id);
      }
      updateMistakesLogUI();
    }
    if (action === "ml-edit-notes-toggle") {
      const target = event.currentTarget || event.target;
      const id = target.dataset.id;
      const emptyState = document.querySelector(`.ml-note-empty-state[data-id="${id}"]`);
      const viewArea = document.querySelector(`.ml-note-view-area[data-id="${id}"]`);
      const editArea = document.querySelector(`.ml-note-edit-area[data-id="${id}"]`);
      if (emptyState) emptyState.style.display = 'none';
      if (viewArea) viewArea.style.display = 'none';
      if (editArea) {
        editArea.style.display = 'block';
        const textarea = editArea.querySelector('textarea');
        if (textarea) textarea.focus();
      }
    }
    if (action === "ml-toggle-tag") {
      const target = event.currentTarget || event.target;
      const id = target.dataset.id;
      const tag = target.dataset.tag;
      const r = state.responses.find(res => res.id === id);
      if (r) {
        r.tags = r.tags || [];
        if (r.tags.includes(tag)) {
          r.tags = r.tags.filter(t => t !== tag);
        } else {
          r.tags.push(tag);
        }
        r.updatedAt = Date.now();
        DB.put("responses", r).catch(console.error);
        if (window.SevSync?.isLinked()) window.SevSync.sync();
        target.classList.toggle("active");
      }
    }
    if (action === "ml-add-custom-tag") {
      const target = event.currentTarget || event.target;
      const id = target.dataset.id;
      const r = state.responses.find(res => res.id === id);
      if (r) {
        showPromptModal("Enter a custom tag", "Add Tag", "Max 20 chars", (tag) => {
          if (tag && tag.trim().length > 0) {
            const cleanTag = tag.trim();
            r.tags = r.tags || [];
            if (!r.tags.includes(cleanTag)) {
              r.tags.push(cleanTag);
              r.updatedAt = Date.now();
              DB.put("responses", r).catch(console.error);
              if (window.SevSync?.isLinked()) window.SevSync.sync();
            }
            
            const container = target.parentElement;
            let tagBtn = Array.from(container.querySelectorAll("button.tag-badge")).find(b => b.dataset.tag === cleanTag);
            if (!tagBtn) {
              tagBtn = document.createElement("button");
              tagBtn.type = "button";
              tagBtn.dataset.action = "ml-toggle-tag";
              tagBtn.dataset.id = id;
              tagBtn.dataset.tag = cleanTag;
              tagBtn.className = "tag-badge";
              tagBtn.textContent = cleanTag + " ";
              const closeSpan = document.createElement("span");
              closeSpan.dataset.action = "ml-delete-custom-tag";
              closeSpan.dataset.tag = cleanTag;
              closeSpan.style.marginLeft = "6px";
              closeSpan.style.opacity = "0.6";
              closeSpan.textContent = "×";
              tagBtn.appendChild(closeSpan);
              tagBtn.addEventListener("click", handleHomeAction);
              closeSpan.addEventListener("click", handleHomeAction);
              container.insertBefore(tagBtn, target);
            }
            tagBtn.classList.add("active");
          }
        });
      }
    }
    if (action === "ml-delete-custom-tag") {
      const tag = event.currentTarget.dataset.tag || event.target.dataset.tag;
      showConfirmModal(`Are you sure you want to completely delete the custom tag "${escapeHtml(tag)}"? It will be removed from all mistakes.`, "Delete Tag", async () => {
        const toUpdate = state.responses.filter(r => r.tags && r.tags.includes(tag));
        for (const r of toUpdate) {
          r.tags = r.tags.filter(t => t !== tag);
          r.updatedAt = Date.now();
        }
        if (state.mistakesLog.filterTags.has(tag)) state.mistakesLog.filterTags.delete(tag);
        if (toUpdate.length > 0) {
          await DB.putMany("responses", toUpdate);
          if (window.SevSync?.isLinked()) window.SevSync.sync();
        }
        updateMistakesLogUI();
      });
      return;
    }
    if (action === "ml-delete-notes") {
      const target = event.currentTarget || event.target;
      const id = target.dataset.id;
      const r = state.responses.find(res => res.id === id);
      if (r) {
        showConfirmModal("Are you sure you want to delete this note and its tags?", "Delete Note", () => {
          r.notes = "";
          r.tags = [];
          r.updatedAt = Date.now();
          const textarea = document.querySelector(`textarea.ml-note-input[data-id="${id}"]`);
          if (textarea) textarea.value = "";
          DB.put("responses", r).then(() => {
            updateMistakesLogUI();
            if (window.SevSync?.isLinked()) window.SevSync.sync();
          }).catch(console.error);
        });
      }
    }
    if (action === "ml-save-notes") {
      const target = event.currentTarget || event.target;
      const id = target.dataset.id;
      const r = state.responses.find(res => res.id === id);
      if (r) {
        const textarea = document.querySelector(`textarea.ml-note-input[data-id="${id}"]`);
        const errorMsg = document.getElementById(`ml-error-${id}`);
        
        if (textarea) {
          const currentNotes = r.notes || "";
          
          if (!r.tags || r.tags.length === 0) {
            if (textarea.value.trim() !== "") {
              if (errorMsg) {
                errorMsg.style.display = "block";
                setTimeout(() => errorMsg.style.display = "none", 3000);
              }
              return;
            } else {
              if (currentNotes === "") {
                updateMistakesLogUI();
                return;
              }
              r.notes = "";
              r.tags = [];
              r.updatedAt = Date.now();
              textarea.value = "";
              DB.put("responses", r).then(() => {
                updateMistakesLogUI();
                if (window.SevSync?.isLinked()) window.SevSync.sync();
              }).catch(console.error);
              return;
            }
          }
          
          if (errorMsg) errorMsg.style.display = "none";
          
          const newNotes = textarea.value.trim() === "" ? "" : textarea.value;
          if (currentNotes === newNotes) {
            updateMistakesLogUI();
            return;
          }
          
          r.notes = newNotes;
          r.updatedAt = Date.now();
          DB.put("responses", r).then(() => {
            updateMistakesLogUI();
            if (window.SevSync?.isLinked()) window.SevSync.sync();
          }).catch(console.error);
        }
      }
    }
    if (action === "retry-mistakes") {
      state.mistakesSessionId = null;
      const { wrongQuestions, skippedQuestions } = getMistakesData();
      const allMistakes = [...wrongQuestions, ...skippedQuestions];
      if (allMistakes.length === 0) {
        showNotice("No mistakes or omitted questions found to practice!", "info");
        renderHome();
        return;
      }
      state.selectedMistakeDomains = new Set(allMistakes.map(q => q.domain));
      state.selectedMistakeTypes = new Set(["wrong", "skipped"]);
      state.view = "mistakes";
      state.notice = null;
      renderHome();
    }
    if (action === "toggle-mistake-domain") {
      const domainName = event.currentTarget.dataset.domain;
      if (event.currentTarget.checked) {
        state.selectedMistakeDomains.add(domainName);
      } else {
        state.selectedMistakeDomains.delete(domainName);
      }
      updateMistakesSummary();
    }
    if (action === "toggle-mistake-skill") {
      const skillName = event.currentTarget.dataset.skill;
      const domainName = event.currentTarget.dataset.domain;
      const compKey = domainName + "|" + skillName;
      if (event.currentTarget.checked) {
        state.selectedMistakeSkills.add(compKey);
      } else {
        state.selectedMistakeSkills.delete(compKey);
      }
      updateMistakesSummary();
    }
    if (action === "toggle-mistake-type") {
      const type = event.currentTarget.dataset.type;
      if (event.currentTarget.checked) {
        state.selectedMistakeTypes.add(type);
      } else {
        state.selectedMistakeTypes.delete(type);
      }
      updateMistakesSummary();
    }
    if (action === "toggle-mistake-subject") {
      const subjectKey = event.currentTarget.dataset.subject;
      const selectValue = event.currentTarget.dataset.value;
      const { wrongQuestions, skippedQuestions } = getMistakesData();
      const subjectDomains = new Set();
      const subjectSkills = new Set();
      for (const q of [...wrongQuestions, ...skippedQuestions]) {
        if (q.subject === subjectKey) {
          subjectDomains.add(q.domain);
          subjectSkills.add(`${q.domain}|${q.skill || "Unspecified"}`);
        }
      }
      if (selectValue === "all") {
        for (const dom of subjectDomains) {
          state.selectedMistakeDomains.add(dom);
        }
        for (const sk of subjectSkills) {
          state.selectedMistakeSkills.add(sk);
        }
      } else {
        for (const dom of subjectDomains) {
          state.selectedMistakeDomains.delete(dom);
        }
        for (const sk of subjectSkills) {
          state.selectedMistakeSkills.delete(sk);
        }
      }
      updateMistakesSummary();
    }
    if (action === "start-retry-practice") {
      const { wrongQuestions, skippedQuestions } = getMistakesData();
      const questionsToPractice = [];
      if (state.selectedMistakeTypes.has("wrong")) {
        for (const q of wrongQuestions) {
          if (state.selectedMistakeDomains.has(q.domain) && state.selectedMistakeSkills.has(q.domain + "|" + (q.skill || "Unspecified"))) {
            questionsToPractice.push(q);
          }
        }
      }
      if (state.selectedMistakeTypes.has("skipped")) {
        for (const q of skippedQuestions) {
          if (state.selectedMistakeDomains.has(q.domain) && state.selectedMistakeSkills.has(q.domain + "|" + (q.skill || "Unspecified"))) {
            questionsToPractice.push(q);
          }
        }
      }
      if (questionsToPractice.length === 0) {
        showNotice("No questions selected to practice!", "error");
        renderHome();
        return;
      }
      captureTelemetry("Started Retry Practice", { count: questionsToPractice.length });
      startCustomPractice({ subject: "both", limit: questionsToPractice.length, isRetry: true, retrySessionId: state.mistakesSessionId || null }, questionsToPractice);
    }
    if (action === "review-session") {
      state.reviewSessionId = event.currentTarget.dataset.sessionId || null;
      state.reviewFilterIncorrect = false;
      state.reviewFilterSkipped = false;
      state.reviewFilterSubject = "both";
      state.reviewPage = 1;
      state.view = "review";
      app.innerHTML = `<div class="shadcn-spinner-container"><div class="shadcn-loader"></div></div>`;
      setTimeout(() => renderHome(), 10);
    }
    if (action === "review-subject-filter") {
      state.reviewFilterSubject = event.currentTarget.dataset.subject || "both";
      state.reviewPage = 1;
      renderHome();
    }
    if (action === "review-wrong-toggle") {
      const type = event.currentTarget.dataset.type;
      if (type === "incorrect") state.reviewFilterIncorrect = event.currentTarget.checked;
      if (type === "skipped") state.reviewFilterSkipped = event.currentTarget.checked;
      state.reviewPage = 1;
      renderHome();
    }
    if (action === "review-change-page") {
      const page = parseInt(event.currentTarget.dataset.page, 10);
      if (!isNaN(page) && page !== state.reviewPage) {
        state.reviewPage = page;
        renderHome();
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      }
    }
    if (action === "import") { fileInput.click(); }
    if (action === "download-catalog") { downloadCatalog(); return; }
    if (action === "retry-catalog") { downloadCatalog({ force: true }); return; }
    if (action === "dismiss-notice") { state.notice = null; dismissNoticeUI(); }
    if (action === "toggle-advanced-domains") {
      state.showAdvancedDomains = !state.showAdvancedDomains;
      renderHome();
      return;
    }
    if (action === "select-all-skills") {
      document.querySelectorAll('input[name="skill"]').forEach(cb => {
         if (!cb.checked) {
             cb.checked = true;
             window.handleSkillCheckboxChange(cb);
         }
      });
      // Also check all domains since all their subdomains are now selected
      document.querySelectorAll('input[name="domain"]').forEach(cb => {
         cb.checked = true;
      });
      const form = document.getElementById("configForm");
      if (form) form.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (action === "deselect-all-skills") {
      document.querySelectorAll('input[name="skill"]').forEach(cb => {
         if (cb.checked) {
             cb.checked = false;
             window.handleSkillCheckboxChange(cb);
         }
      });
      // Also uncheck all domains since all their subdomains are now deselected
      document.querySelectorAll('input[name="domain"]').forEach(cb => {
         cb.checked = false;
      });
      const form = document.getElementById("configForm");
      if (form) form.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (action === "reset-skills") {
      document.querySelectorAll('input[name="skill"]').forEach(cb => {
         if (!cb.checked) {
             cb.checked = true;
             window.handleSkillCheckboxChange(cb);
         }
      });
      document.querySelectorAll('input[name^="skill_count_"]').forEach(inp => inp.value = "");
      // Also re-check all domains
      document.querySelectorAll('input[name="domain"]').forEach(cb => {
         cb.checked = true;
      });
      state.showSkillLimits = {};
      document.querySelectorAll('[id^="limit_"]').forEach(div => div.style.display = "none");
      // Reset all toggle icons back to '+'
      document.querySelectorAll('[data-action="toggle-skill-limit"]').forEach(btn => {
         btn.textContent = '+';
      });
      // Reset question limit to default 20
      const form = document.getElementById("configForm");
      if (form) {
        const limitInput = form.querySelector('input[name="limit"]');
        if (limitInput) {
          limitInput.value = 20;
          limitInput.disabled = false;
        }
        const limitCaption = form.querySelector('.limit-field small');
        if (limitCaption) limitCaption.textContent = "Set how many questions to practice.";
      }
      window.updateSelectAllButtons();
      if (form) form.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (action === "toggle-skill-limit") {
      const skill = event.currentTarget.dataset.skill;
      if (!state.showSkillLimits) state.showSkillLimits = {};
      state.showSkillLimits[skill] = !state.showSkillLimits[skill];
      // Bug fix #4: Toggle the button icon between + and −
      event.currentTarget.textContent = state.showSkillLimits[skill] ? '\u2212' : '+';
      const container = event.currentTarget.closest('div').parentElement;
      const limitDiv = container.querySelector('[id^="limit_"]');
      if (limitDiv) {
         limitDiv.style.display = state.showSkillLimits[skill] ? "flex" : "none";
      }
      return;
    }
    // Bug fix #2: Stepper increment/decrement buttons on subdomain limit inputs
    if (action === "stepper-inc" || action === "stepper-dec") {
      const container = event.currentTarget.closest('.stepper-group');
      const input = container ? container.querySelector('input[type="number"]') : null;
      if (input) {
        const max = parseInt(input.max, 10) || 200;
        const min = parseInt(input.min, 10) || 1;
        let val = parseInt(input.value, 10) || 0;
        if (action === "stepper-inc") val = Math.min(val + 1, max);
        else val = Math.max(val - 1, min);
        input.value = val;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }
    if (action === "toggle-advanced-mistakes") {
      state.showAdvancedMistakeSkills = !state.showAdvancedMistakeSkills;
      renderHome();
      return;
    }
    if (action === "wipe-all") {
      showConfirmModal("Are you sure you want to wipe ALL your data, including imported question banks? This cannot be undone.", "Wipe All Data", async () => {
        await DB.clearAll();
        state.lastResult = null;
        sessionStorage.removeItem('lastResultSessionId');
        localStorage.removeItem(TUTORIAL_DONE_KEY);
        localStorage.removeItem('sat_vocab_state');
        
        // Unlink Google account and clear auth state
        if (window.SevSync?.isLinked()) {
            try { await window.SevSync.unlink(); } catch (_) {}
        }

        state.view = "dashboard";
        await refreshLocalData();
        showNotice("All data wiped successfully.", "info");
        // Replace current history entry so back button can't return to stale state
        window.history.replaceState({view: "onboarding"}, "", window.location.pathname);
        renderHome(true);
      });
    }

    if (action === "reset") {
      showConfirmModal("Are you sure you want to wipe all your test progress and history?", "Reset Progress", async () => {
        await DB.clear("sessions");
        await DB.clear("responses");

        const banks = await DB.getAll("questionBanks");
        const bluebookBankIds = banks.filter(b => b.isBluebook).map(b => b.id);
        
        if (bluebookBankIds.length > 0) {
           for (const id of bluebookBankIds) {
               await DB.remove("questionBanks", id);
           }
           const allQuestions = await DB.getAll("questions");
           const questionsToDelete = allQuestions.filter(q => bluebookBankIds.includes(q.bankId));
           for (const q of questionsToDelete) {
               await DB.remove("questions", q.id);
           }
        }

        state.lastResult = null;
        sessionStorage.removeItem('lastResultSessionId');
        
        if (window.SevSync?.isLinked()) {
            // Run sync in the background without blocking the UI
            window.SevSync.sync(true, { forcePush: true, silent: true }).catch(console.error);
        }

        state.view = "dashboard";
        await refreshLocalData();
        showNotice("Progress reset successfully.", "info");
        renderHome();
      });
    }

    if (action === "reset-vocab") {
      showConfirmModal("Are you sure you want to reset all vocabulary progress? This will un-master all words.", "Reset Vocab", async () => {
        const words = await DB.getAll("vocabWords");
        const resetWords = words.map(w => ({
          ...w,
          status: "New",
          interval: 0,
          easeFactor: 2.5,
          nextReviewDate: 0,
          updatedAt: Date.now()
        }));
        await DB.putMany("vocabWords", resetWords);
        
        localStorage.removeItem("sat_vocab_state");
        if (window.Vocab && window.Vocab.reloadState) {
            window.Vocab.reloadState();
        }

        if (window.SevSync?.isLinked()) {
            window.SevSync.sync(true, { forcePush: true }).catch(console.error);
        }

        showNotice("Vocab progress reset successfully.", "info");
        renderHome(true, true);
      });
    }

    if (action === "logout") {
      showConfirmModal("Are you sure you want to log out?", "Log Out", async () => {
        await SevSync.unlink();
        if (window.posthog?.reset) window.posthog.reset();
        await DB.clearAll();
        state.lastResult = null;
        sessionStorage.removeItem('lastResultSessionId');
        localStorage.removeItem(TUTORIAL_DONE_KEY);
        localStorage.removeItem('sat_vocab_state');
        state.view = "dashboard";
        await refreshLocalData();
        showNotice("Logged out successfully.", "info");
        // Replace current history entry so back button can't return to stale state
        window.history.replaceState({view: "onboarding"}, "", window.location.pathname);
        renderHome(true);
      });
    }
    if (action === "delete-session") {
      const sessionId = event.currentTarget.dataset.sessionId;
      if (!sessionId) return;
      const btn = event.currentTarget;
      showConfirmModal("Delete this test and all its responses?", "Delete Test", () => {
        const card = btn.closest('.history-card');
        if (card) {
          card.style.transition = "all 0.15s ease";
          card.style.opacity = "0";
          card.style.transform = "scale(0.95)";
          setTimeout(async () => {
            await finishDelete();
          }, 150);
        } else {
          finishDelete();
        }

        async function finishDelete() {
          await tombstoneSessionPackage(sessionId);
          await refreshLocalData();
          if (state.reviewSessionId === sessionId) state.reviewSessionId = null;
          if (state.lastResult?.session?.id === sessionId) {
            state.lastResult = null;
            sessionStorage.removeItem('lastResultSessionId');
          }
          showNotice("Test deleted.", "info");
          renderHome();
          syncBackup(false);
          if (window.SevSync?.isLinked()) SevSync.sync();
        }
      });
    }
    
    if (action === "link-backup") { await linkBackupFolder(); renderHome(); }
    if (action === "unlink-backup") { await unlinkBackupFolder(); renderHome(); }
    if (action === "force-backup") { await syncBackup(true); }
    if (action === "download-backup") { await downloadManualBackup(); }
    if (action === "restore-backup") { await restoreBackup(); }

    // ── Cloud Sync Actions ──
    if (action === "link-cloud-sync") {
      state.backupMessage = null;
      await syncLinkedAccount();
    }
    if (action === "force-cloud-sync") {
      state.backupMessage = null;
      await syncLinkedAccount({ hideBusy: true });
    }
    if (action === "dismiss-session-bubble") {
      sessionBubbleDismissed = true;
      const wrappers = document.querySelectorAll('.sync-status-wrapper');
      for (const wrapper of wrappers) {
        wrapper.outerHTML = renderSyncWidget();
      }
      const newWrappers = document.querySelectorAll('.sync-status-wrapper');
      for (const newWrapper of newWrappers) {
        for (const btn of newWrapper.querySelectorAll("[data-action]")) {
          btn.addEventListener("click", handleHomeAction);
        }
      }
      return;
    }
    if (action === "setup-cloud-sync") {
      state.view = "backup";
      renderHome();
    }
    if (action === "dismiss-sync-banner") {
      localStorage.setItem('sevrony.syncBannerDismissed', 'true');
      renderHome();
    }
    if (action === "dismiss-catalog-banner") {
      localStorage.setItem('sevrony.catalogBannerDismissed', 'true');
      renderHome();
    }
  }

  function makeDebugUrl(qid) {
    return `${window.location.origin}${window.location.pathname}?debug=${encodeURIComponent(qid)}`;
  }

  async function sendQuestionReport(qid) {
    const debugUrl = makeDebugUrl(qid);
    await enableTelemetry();
    if (typeof Sentry !== "undefined") {
      Sentry.captureMessage(`Flagged question ${qid}`, {
        level: "warning",
        tags: { question_id: qid },
        extra: { debug_url: debugUrl },
        fingerprint: ["user-flagged", qid]
      });
      showNotice("Question flagged for review. Thank you!", "info");
      renderHome();
      return;
    }
    await showManualReportFallback(debugUrl);
  }

  async function showManualReportFallback(debugUrl) {
    const copied = await copyText(debugUrl);
    showNotice(copied
      ? "Telemetry blocked. Debug URL copied! Opening GitHub Issues to report..."
      : `Telemetry blocked. Please report this URL on GitHub: ${debugUrl}`,
      "info");
    const issueUrl = `https://github.com/sharthak-sev/Sevrony/issues/new?title=Question%20Report&body=Debug%20URL:%20${encodeURIComponent(debugUrl)}%0A%0A**Describe%20the%20issue:**%0A`;
    window.open(issueUrl, "_blank");
    renderHome();
  }

  /* ===========================================================
     SYSTEM FEATURES: BACKUP
     =========================================================== */

  async function linkBackupFolder() {
    state.backupMessage = null;
    if (!window.showDirectoryPicker) {
      showBackupMsg("Your browser does not support the File System API. Please use Chrome or Edge.", "error");
      return;
    }
    if (location.protocol === "file:") {
      showBackupMsg("File System API does not work on 'file://'. You must run the app using a local server.", "error");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      state.backupHandle = handle;
      await DB.put("appConfig", { key: "backupHandle", handle });
      showBackupMsg("Backup folder linked successfully.", "success");
      await syncBackup(true);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        showBackupMsg("Failed to link folder: " + err.message, "error");
      }
    }
  }

  async function unlinkBackupFolder() {
    state.backupHandle = null;
    await DB.remove("appConfig", "backupHandle");
    showBackupMsg("Backup folder unlinked.", "success");
  }

  let backupDebounce = null;
  async function syncBackup(requireGesture = false) {
    if (!state.backupHandle) return;
    if (!requireGesture) {
      if (backupDebounce) clearTimeout(backupDebounce);
      backupDebounce = setTimeout(() => doSyncBackup(false), 3000);
      return;
    }
    return doSyncBackup(true);
  }

  async function doSyncBackup(requireGesture) {
    try {
      if ((await state.backupHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        if (!requireGesture) return;
        if ((await state.backupHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
      }
      
      const fileHandle = await state.backupHandle.getFileHandle("sat-app-backup.json", { create: true });
      const writable = await fileHandle.createWritable();
      
      const payload = buildPortablePayload();
      
      await writable.write(JSON.stringify(payload));
      await writable.close();
      if (requireGesture) showBackupMsg("Backup saved successfully.", "success");
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        if (requireGesture) showBackupMsg("Failed to save backup.", "error");
      }
    }
  }

  async function downloadManualBackup() {
    state.backupMessage = null;
    try {
      const payload = buildPortablePayload();
      
      const text = JSON.stringify(payload);
      
      if (window.showSaveFilePicker && location.protocol !== "file:") {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: `sat-app-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
            types: [{ description: 'Backup JSON', accept: { 'application/json': ['.json'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(text);
          await writable.close();
          showBackupMsg("Backup downloaded.", "success");
          renderHome();
          return;
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error(err);
            showBackupMsg("Failed to download backup.", "error");
            renderHome();
          }
          return;
        }
      }

      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sat-app-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      showBackupMsg("Failed to create backup.", "error");
      renderHome();
    }
  }

  async function restoreBackup() {
    if (!requirePrivacyConsent()) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);

        const banksData = payload.questionBanks || payload.banks;

        if (!banksData || !payload.questions) throw new Error("Invalid backup format");
        
        showConfirmModal("Restore backup? This will overwrite your current progress.", "Restore", async () => {
          try {
            setBusy("Restoring backup", "Rebuilding your local question bank, sessions, and dashboard metrics.", "import");
            await nextPaint();
            const now = Date.now();
            const stamp = record => ({ ...record, updatedAt: now });

            const sessionsData = (payload.sessions || []).filter(record => !isDeletedRecord(record)).map(stamp);
            const embeddedResponses = sessionsData.flatMap(session => (session.responses || []).map(response => ({
              ...response,
              sessionId: response.sessionId || session.id,
              updatedAt: now
            })));
            const responseData = dedupeResponses([...(payload.responses || []).map(stamp), ...embeddedResponses]);
            
            const filteredBanks = banksData.filter(record => !isDeletedRecord(record)).map(stamp);
            // A backup written before v6 has no `catalog` on its questions, and
            // an unset index key would leave them out of the read that loads
            // them. Everything in a backup is the user's own import -- catalog
            // questions are excluded from the payload -- so the sentinel applies
            // to all of them.
            const filteredQuestions = payload.questions
              .filter(record => !isDeletedRecord(record))
              .map(record => ({ ...stamp(record), catalog: record.catalog || LOCAL_CATALOG }));
            const studyStatesData = (payload.questionStudyState || []).map(stamp);

            await DB.clearAll();
            
            const totalRecords = filteredBanks.length + filteredQuestions.length + sessionsData.length + responseData.length + studyStatesData.length;
            let baseWritten = 0;
            const trackProgress = (storeSize) => (percentComplete) => {
              const currentWritten = baseWritten + Math.round(storeSize * percentComplete / 100);
              if (percentComplete === 100) {
                 baseWritten += storeSize;
              }
              setBusy("Restoring backup", "Rebuilding your local question bank, sessions, and dashboard metrics.", "import",
                Math.min(99, Math.round((currentWritten / totalRecords) * 100)));
            };

            if (filteredBanks.length) await putManyChunked("questionBanks", filteredBanks, 300, trackProgress(filteredBanks.length));
            if (filteredQuestions.length) await putManyChunked("questions", filteredQuestions, 300, trackProgress(filteredQuestions.length));
            if (sessionsData.length) await putManyChunked("sessions", sessionsData, 300, trackProgress(sessionsData.length));
            if (responseData.length) await putManyChunked("responses", responseData, 300, trackProgress(responseData.length));
            if (studyStatesData.length) await putManyChunked("questionStudyState", studyStatesData, 300, trackProgress(studyStatesData.length));

            await refreshLocalData();
            clearBusy(false);
            showBackupMsg("Backup restored successfully.", "success");
            renderHome();
            maybeStartTutorial();
            if (window.SevSync?.isLinked()) SevSync.sync(true, { forcePush: true });
            // Backups carry the catalog *bank* record but not its questions, so
            // a restore has to pull them back down. No-op for a user who never
            // adopted the catalog.
            resumeCatalogIfNeeded();
          } catch (err) {
            clearBusy(false);
            console.error(err);
            showBackupMsg("Failed to restore backup.", "error");
            renderHome();
          }
        }, { loadingText: "Restoring..." });
      } catch (err) {
        console.error(err);
        showBackupMsg("Failed to restore backup.", "error");
        renderHome();
      }
    };
    input.click();
  }

  /* ===========================================================
     FILE IMPORT
     =========================================================== */

  async function handleFileImport(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (!requirePrivacyConsent()) return;
    setBusy("Importing practice data", `Preparing ${files.length} file${files.length === 1 ? "" : "s"} for your dashboard.`, "import");
    await nextPaint();
    
    let successCount = 0;
    let errorMessages = [];
    let hasBluebook = false;
    let hasBank = false;
    
    for (const [index, file] of files.entries()) {
      try {
        setBusy("Importing practice data", `Reading file (${index + 1} of ${files.length}).`, "import");
        await nextPaint();
        const payload = JSON.parse(await file.text());
        if (payload.testId && payload.sections && payload.scores) {
          setBusy("Importing Bluebook test", `Normalizing Bluebook practice test.`, "import", 0);
          await nextPaint();
          const result = normalizeBluebookImportPayload(payload, "Bluebook Import");
          await DB.put("questionBanks", result.bank);
          await putManyChunked("questions", result.questions, 300, (p) => {
            setBusy("Importing Bluebook test", `Saving questions to local database...`, "import", p);
          });
          await DB.put("sessions", result.session);
          hasBluebook = true;
          successCount++;
        } else {
          setBusy("Importing question bank", `Normalizing practice questions.`, "import", 0);
          await nextPaint();
          const result = normalizeImportPayload(payload, "Custom Import");
          await DB.put("questionBanks", result.bank);
          await putManyChunked("questions", result.questions, 300, (p) => {
            setBusy("Importing question bank", `Saving questions to local database...`, "import", p);
          });
          hasBank = true;
          successCount++;
        }
      } catch (err) {
        errorMessages.push(`File ${index + 1}: ${err.message || String(err)}`);
      }
    }
    
    if (successCount > 0) {
      setBusy("Updating dashboard", "Refreshing metrics and local history.", "import");
      await refreshLocalData();
      ensureConfigDefaults();
      
      if (hasBluebook && !hasBank) {
        state.view = "history";
        state.historyTab = "full";
      } else if (hasBank) {
        state.view = "dashboard";
      }
      
      let noticeMsg = `Successfully imported ${successCount} file(s).`;
      if (errorMessages.length > 0) {
        noticeMsg += ` Some failed: ${errorMessages.join(", ")}`;
      }
      showNotice(noticeMsg, errorMessages.length > 0 ? "error" : "success");
      captureTelemetry("Imported Files", { count: successCount });
    } else if (errorMessages.length > 0) {
      showNotice(`Failed to import files: ${errorMessages.join(", ")}`, "error");
    }
    
    clearBusy(false);
    renderHome();
    maybeStartTutorial();
    syncBackup(false);
    if (window.SevSync?.isLinked()) SevSync.sync();
  }

  /* ===========================================================
     SHARED QUESTION CATALOG
     -----------------------------------------------------------
     Each exam's question bank lives in D1 under its own `catalog` namespace and
     is served by the worker. Locally each one looks like any other imported
     bank, except its records are re-downloadable, so they are excluded from
     exports and from the Drive sync blob.

     Only the active catalog is resident in `state.questions` (see
     refreshLocalData()), so the rest of the app reads `state.questions` and
     `state.responses` directly and gets the active exam by construction.
     =========================================================== */

  /**
   * Sentinel catalog for questions the user brought themselves -- hand-imported
   * .sat-test files and Bluebook exports. They stay resident whichever exam is
   * selected, since they belong to no catalog.
   *
   * A sentinel rather than an absent field on purpose: IndexedDB leaves a record
   * out of an index entirely when its key path is undefined, so unstamped
   * questions would be invisible to the `catalog` index that loads them.
   */
  // Marketing copy only -- the real count comes from /api/catalog/meta. Kept
  // approximate per exam so it stays true as each bank grows.
  function catalogLabel(catalog) {
    return CATALOG_LABELS[catalog] || String(catalog || "").toUpperCase();
  }

  function catalogBankLabel(catalog) {
    return `Sevrony ${CATALOG_SHORT_LABELS[catalog] || catalogLabel(catalog)} Question Bank`;
  }

  function catalogCountLabel(catalog) {
    return CATALOG_QUESTION_COUNT_LABELS[catalog] || "2,500+";
  }

  function catalogBankId(catalog) {
    return SevApi.CATALOG_BANK_PREFIX + catalog;
  }

  /**
   * The exam picker.
   *
   * Offers high-touch UI variants:
   * - "onboarding": 3-way interactive cards with grade level targets and question counts
   * - "dashboard" / default: sleek, minimal segmented pill control for dashboard top bar
   */
  function renderCatalogSelector(variant) {
    if (variant === "onboarding") {
      return `
        <div class="qb-onboarding-picker" role="radiogroup" aria-label="Select practice exam">
          ${CATALOGS.map(cat => {
            const isSelected = state.activeCatalog === cat;
            const meta = CATALOG_DETAILS[cat] || { shortLabel: cat.toUpperCase(), countLabel: "2,500+", gradeLevel: "" };
            return `
              <button type="button" 
                      class="qb-onboarding-option ${isSelected ? "active" : ""}" 
                      data-action="switch-catalog" 
                      data-catalog="${cat}" 
                      role="radio" 
                      aria-checked="${isSelected}"
                      title="Practice ${escapeAttr(catalogLabel(cat))}">
                <div class="qb-onboarding-option-header">
                  <span class="qb-onboarding-name">${escapeHtml(meta.shortLabel)}</span>
                  ${isSelected ? `<span class="qb-onboarding-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>` : ""}
                </div>
                <div class="qb-onboarding-meta">
                  <span class="qb-onboarding-grade">${escapeHtml(meta.gradeLevel)}</span>
                  <span class="qb-onboarding-count">${escapeHtml(meta.countLabel)} Qs</span>
                </div>
              </button>
            `;
          }).join("")}
        </div>
      `;
    }

    // Default: ultra-clean segmented pill control for Dashboard
    return `
      <div class="qb-segmented-control" role="tablist" aria-label="Choose question bank">
        ${CATALOGS.map(cat => {
          const isSelected = state.activeCatalog === cat;
          const meta = CATALOG_DETAILS[cat] || { shortLabel: cat.toUpperCase(), countLabel: "2,500+" };
          return `
            <button type="button"
                    class="qb-segment-btn ${isSelected ? "active" : ""}"
                    data-action="switch-catalog"
                    data-catalog="${cat}"
                    role="tab"
                    aria-selected="${isSelected}"
                    title="${escapeAttr(catalogLabel(cat))} · ${meta.countLabel} questions">
              <span class="qb-segment-label">${escapeHtml(meta.shortLabel)}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  /**
   * The selected exam, validated. A hand-edited or stale localStorage value would
   * otherwise send the client to /api/catalog/meta/<junk> and load nothing.
   */
  function readActiveCatalog() {
    try {
      const stored = localStorage.getItem("sevrony.activeCatalog");
      if (CATALOGS.includes(stored)) return stored;
    } catch (e) {
      /* storage can be disabled outright */
    }
    return DEFAULT_CATALOG;
  }

  /** Sessions predate the picker; anything unstamped was recorded against SAT. */
  function sessionCatalog(session) {
    return session?.catalog || DEFAULT_CATALOG;
  }

  /**
   * Whether a question came from a served catalog rather than from the user.
   *
   * Only the active catalog is ever resident, so this doubles as "belongs to the
   * selected exam" for anything reading `state.questions`.
   */
  function isCatalogQuestion(record) {
    return typeof record?.bankId === "string" && record.bankId.startsWith(SevApi.CATALOG_BANK_PREFIX);
  }

  /** Sessions belonging to the active exam. */
  function getActiveSessions() {
    return state.sessions.filter(s => sessionCatalog(s) === state.activeCatalog);
  }

  /**
   * Banks whose questions are actually resident.
   *
   * `state.banks` holds every bank ever imported, including the catalog banks of
   * exams that are not selected. Pairing that count with an active-only question
   * count reads as "3 banks · 2,982 questions" once all three exams have been
   * downloaded, which is wrong twice over.
   */
  function getActiveBanks() {
    return state.banks.filter(bank => {
      const id = String(bank?.id || "");
      if (!id.startsWith(SevApi.CATALOG_BANK_PREFIX)) return true;
      return id.slice(SevApi.CATALOG_BANK_PREFIX.length) === state.activeCatalog;
    });
  }

  /**
   * Responses belonging to the active exam.
   *
   * Scoped by the owning session rather than by whether the question is resident:
   * a user who has answered PSAT 10 questions still has that history when SAT is
   * selected, and it must not leak into SAT's metrics either way.
   */
  function getActiveResponses() {
    return state.responses.filter(r => state.activeSessionIds.has(r.sessionId));
  }

  /**
   * Switch the resident exam.
   *
   * Reloads local data before rendering, because the active catalog decides which
   * questions and history are in memory at all.
   */
  async function switchCatalog(catalog) {
    if (!CATALOGS.includes(catalog) || catalog === state.activeCatalog) return;
    if (state.catalogBusy) {
      showNotice("Hold on — a question bank is still downloading.", "error");
      return;
    }

    state.activeCatalog = catalog;
    try {
      localStorage.setItem("sevrony.activeCatalog", catalog);
    } catch (e) {
      /* storage can be disabled outright; the switch still applies this session */
    }

    // A test in progress belongs to the exam it was started under, so leaving it
    // resident would serve questions that are no longer loaded.
    state.reviewSessionId = null;
    state.mistakesSessionId = null;
    state.lastResult = null;

    setBusy("Switching question bank", `Loading your ${catalogLabel(catalog)} library.`, "import");
    try {
      await refreshLocalData();
      ensureConfigDefaults();
      captureTelemetry("Switched Catalog", { catalog });
    } finally {
      clearBusy(false);
    }

    renderHome();
    await resumeCatalogIfNeeded();
  }


  /** How many of the active exam's catalog questions are held locally. */
  function catalogQuestionCount() {
    return state.questions.reduce((n, q) => n + (isCatalogQuestion(q) ? 1 : 0), 0);
  }

  /**
   * Whether to offer the switch on the dashboard.
   */
  function shouldOfferCatalog() {
    if (isDemoMode() || !window.SevApi) return false;
    if (localStorage.getItem("sevrony.catalogBannerDismissed")) return false;
    return catalogQuestionCount() === 0;
  }

  /** One page of catalog payloads -> normalized records in IndexedDB. */
  async function storeCatalogPage(rawQuestions, { version, bankId, catalog }) {
    const records = [];
    for (let i = 0; i < rawQuestions.length; i++) {
      const record = normalizeQuestion(rawQuestions[i], bankId, i);
      if (!record) continue;
      // normalizeQuestion() ends with `raw: question.raw || question`. Catalog
      // payloads have no `raw`, so it would attach the whole question to itself
      // and double what IndexedDB holds (~20 MB becomes ~41 MB). Every field the
      // app reads out of `raw` also exists as a top-level field in the catalog
      // payload -- tools/verify_catalog.js proves that for all 2982 questions --
      // so drop it rather than carrying a redundant copy.
      delete record.raw;
      record.catalogVersion = version;
      // Indexed, and how refreshLocalData() finds this exam's questions again.
      record.catalog = catalog;
      records.push(record);
    }
    await putManyChunked("questions", records, 300);
    return records.length;
  }

  async function upsertCatalogBank(catalog, version, count) {
    const bankId = catalogBankId(catalog);
    const existing = await DB.get("questionBanks", bankId);
    await DB.put("questionBanks", {
      ...(existing || {}),
      id: bankId,
      catalog,
      filename: catalogBankLabel(catalog),
      displayTitle: catalogBankLabel(catalog),
      isCatalog: true,
      catalogVersion: version,
      importedAt: existing?.importedAt || new Date().toISOString(),
      updatedAt: Date.now(),
      deletedAt: null,
      questionCount: count
    });
  }

  /**
   * Retire banks that the catalog download emptied.
   *
   * Existing users imported the same College Board export under a random bank id.
   * Because a question's primary key is its College Board external id, the
   * catalog download rewrites those exact records in place under the catalog's
   * bank id -- progress and responses key off the question id, so nothing is
   * lost. What it leaves behind is an old bank record owning nothing.
   *
   * Only genuinely empty banks are tombstoned, so a bank holding questions the
   * catalog does not have survives untouched.
   *
   * Counts come from `state.questions`, which refreshLocalData() has already
   * loaded -- the questions store has no bankId index, and re-reading it here
   * would mean a second full scan. Catalog banks are skipped by their own flag
   * rather than by counting: only the active exam's questions are resident, so
   * another exam's bank would look empty and be soft-deleted.
   */
  async function retireEmptiedBanks() {
    const allQuestions = await DB.getAll("questions");
    const counts = new Map();
    for (const q of allQuestions) {
      if (isDeletedRecord(q)) continue;
      counts.set(q.bankId, (counts.get(q.bankId) || 0) + 1);
    }

    const now = Date.now();
    const retired = [];
    for (const bank of state.banks) {
      if (bank.isCatalog || bank.isBluebook || isDeletedRecord(bank)) continue;
      if ((counts.get(bank.id) || 0) === 0) {
        await DB.put("questionBanks", { ...bank, deletedAt: now, updatedAt: now });
        retired.push(bank.id);
      }
    }
    return retired;
  }

  function catalogProgressDetail({ phase, downloaded, total, pct }) {
    if (phase === "meta") return "Probing the quantum multiverse...";
    if (phase === "ticket") return "Verifying atmospheric integrity...";
    if (phase === "done") return "Achieving 1600 equilibrium...";
    return getCosmicPhrase(pct);
  }

  /**
   * Download (or resume, or verify) one exam's catalog and fold it into local state.
   *
   * The catalog is captured up front rather than read from state as it goes: a
   * download takes a while, and the user can pick a different exam mid-flight.
   *
   * @returns {Promise<boolean>} whether local data now holds the catalog
   */
  async function downloadCatalog({ force = false, silent = false, catalog = state.activeCatalog } = {}) {
    if (!window.SevApi) {
      showNotice("The catalog client failed to load. Please refresh the page.", "error");
      return false;
    }
    if (!requirePrivacyConsent()) return false;
    if (state.catalogBusy) return false;
    state.catalogBusy = true;

    if (!silent) setBusy("Getting your question bank", "Contacting Sevrony...", "import", 0);
    try {
      const shouldForce = force || (catalogQuestionCount() === 0);
      const result = await SevApi.ensureCatalog(catalog, {
        force: shouldForce,
        store: storeCatalogPage,
        onProgress: progress => {
          if (silent) return;
          setBusy("Getting your question bank", catalogProgressDetail(progress), "import", progress.pct);
        }
      });

      if (result.status === "current") {
        // Nothing to store, but the view still has to move -- see the note below.
        // catalogBusy and clearBusy() are both handled in `finally`.
        if (state.view === "onboarding") state.view = "dashboard";
        return true;
      }

      if (!silent) setBusy("Updating dashboard", "Refreshing metrics and local history.", "import");
      await upsertCatalogBank(catalog, result.version, result.count);
      await refreshLocalData();

      const retired = await retireEmptiedBanks();
      if (retired.length) await refreshLocalData();

      ensureConfigDefaults();
      captureTelemetry("Downloaded Catalog", { catalog, count: result.count, version: result.version, retiredBanks: retired.length });

      // renderHome() forces the onboarding view while there are no questions
      // (see the guard at the top of it) but nothing moves off it once questions
      // arrive -- the import path sets the view itself, and so must this.
      // Without it a first-time download finishes, announces itself, and leaves
      // the user staring at the setup screen they just completed.
      //
      // Guarded on the current view rather than set unconditionally: a resume
      // triggered at boot, or the Switch button on the dashboard banner, must not
      // yank someone out of whatever they were looking at. An existing user can
      // also reach onboarding deliberately to import another file, and finishing
      // a download there should still land them on the dashboard.
      if (state.view === "onboarding") state.view = "dashboard";

      if (!silent) {
        const freed = retired.length
          ? " Your old imported bank has been retired — backups will be much smaller from now on."
          : "";
        showNotice(`Your question bank is ready — ${result.count.toLocaleString()} questions.${freed}`, "success");
      }
      return true;
    } catch (err) {
      if (err?.name === "AbortError") return false;
      const message = err?.message || String(err);
      if (!silent) showNotice(`Couldn't finish downloading the question bank: ${message}`, "error");
      console.warn("Catalog download failed:", err);
      return false;
    } finally {
      state.catalogBusy = false;
      if (!silent) {
        clearBusy(false);
        renderHome();
      }
      syncBackup(false);
      if (window.SevSync?.isLinked()) SevSync.sync();
    }
  }

  /**
   * Boot and catalog-switch hook. A restore brings back the catalog *bank* record
   * but not its questions (they are excluded from backups), so re-fetch them. Also
   * finishes a download that was interrupted mid-way.
   */
  async function resumeCatalogIfNeeded() {
    if (!window.SevApi || isDemoMode()) return;
    if (!DB.hasConsent?.()) return;
    try {
      const cursor = await SevApi.catalog.getState(state.activeCatalog);
      const hasBankRecord = state.banks.some(b =>
        (b.id === catalogBankId(state.activeCatalog) || b.id === "sevrony-catalog" || b.catalog === state.activeCatalog) && !isDeletedRecord(b)
      );
      const localCount = catalogQuestionCount();

      const interrupted = cursor && !cursor.complete;
      const restoredWithoutQuestions = (hasBankRecord || (cursor && cursor.complete)) && localCount === 0;
      if (!interrupted && !restoredWithoutQuestions) return;

      await downloadCatalog({ force: restoredWithoutQuestions });
    } catch (err) {
      console.warn("Could not resume the catalog download:", err);
    }
  }

  function normalizeImportPayload(payload, filename) {
    const rawQuestions = Array.isArray(payload?.questions)
      ? payload.questions
      : Object.values(payload?.subjects || {}).flatMap(v => Array.isArray(v?.questions) ? v.questions : []);
    if (!rawQuestions.length) throw new Error("No recognizable questions in that file.");
    const importedAt = new Date().toISOString();
    const bankId = payload.id || uid("bank");
    const questions = rawQuestions.map((q, i) => normalizeQuestion(q, bankId, i)).filter(Boolean);
    if (!questions.length) throw new Error("No valid questions found.");
    return {
      bank: { id: bankId, filename, importedAt, updatedAt: Date.now(), exportedAt: payload.exportedAt || null, source: payload.source || null, formatVersion: payload.formatVersion || null, questionCount: questions.length },
      questions
    };
  }

  function normalizeBluebookImportPayload(payload, filename) {
    const importedAt = new Date().toISOString();
    const bankId = payload.testId || uid("bank");
    const sessionDate = payload.asmtSubmissionStartTime || importedAt;
    
    const bank = { 
      id: bankId, 
      filename, 
      importedAt, 
      updatedAt: Date.now(),
      isBluebook: true,
      displayTitle: payload.displayTitle || "Bluebook Practice Test",
      exportedAt: sessionDate, 
      questionCount: 0 
    };

    const questions = [];
    const responses = [];
    
    const sortedSections = [...(payload.sections || [])].sort((a, b) => {
      const aSub = normalizeSubject(a.sectionName);
      const bSub = normalizeSubject(b.sectionName);
      if (aSub === "rw" && bSub !== "rw") return -1;
      if (bSub === "rw" && aSub !== "rw") return 1;
      return 0;
    });

    let sequenceCounter = 0;
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalAnswered = 0;

    for (const section of sortedSections) {
      for (const q of (section.questions || [])) {
        sequenceCounter++;
        
        const subject = normalizeSubject(section.sectionName);
        const externalId = q.questionId || q.vaultId || `${bankId}:${sequenceCounter}`;
        const id = String(externalId);
        
        const answerOptions = normalizeAnswerOptions(Object.entries(q.choices || {}).map(([key, content], i) => {
          const isLetter = /^[A-Z]$/i.test(key);
          return {
            id: isLetter ? "" : key,
            letter: isLetter ? key.toUpperCase() : String.fromCharCode(65 + i),
            content
          };
        }));
        const type = answerOptions.length ? "mcq" : "spr";
        const correctAnswers = normalizeCorrectAnswers(q.correctAnswer, answerOptions, type);
        
        const domainLabel = q.domains?.primaryLabel || q.domains?.primary || "Unknown domain";
        const domainCode = q.domains?.primary || "";
        
        const question = {
          id, externalId,
          questionId: id,
          bankId, importedAt, updatedAt: Date.now(), subject,
          // Bluebook exports are the user's own data, not a served catalog.
          catalog: LOCAL_CATALOG,
          test: SUBJECTS[subject] || "",
          domainCode, domain: domainLabel,
          skillCode: "", skill: "",
          difficultyCode: (() => {
            const rawD = String(q.difficultyCode || q.difficultyLevel || q.difficulty_level || q.metadata?.difficultyLevel || q.metadata?.difficulty_level || q.metadata?.DIFFICULTY_LEVEL || q.metadata?.DIFFICULTY || q.metadata?.difficulty || q.detail?.difficulty || q.questionDifficulty || q.question_difficulty || q.difficulty || "");
            if (rawD.length > 0) {
              const first = rawD.charAt(0).toUpperCase();
              if (["E", "M", "H"].includes(first)) return first;
              if (rawD === "1") return "E";
              if (rawD === "2") return "M";
              if (rawD === "3") return "H";
            }
            return "";
          })(),
          difficulty: (() => {
            const rawD = String(q.difficultyCode || q.difficultyLevel || q.difficulty_level || q.metadata?.difficultyLevel || q.metadata?.difficulty_level || q.metadata?.DIFFICULTY_LEVEL || q.metadata?.DIFFICULTY || q.metadata?.difficulty || q.detail?.difficulty || q.questionDifficulty || q.question_difficulty || q.difficulty || "");
            let dCode = "";
            if (rawD.length > 0) {
              const first = rawD.charAt(0).toUpperCase();
              if (["E", "M", "H"].includes(first)) dCode = first;
              else if (rawD === "1") dCode = "E";
              else if (rawD === "2") dCode = "M";
              else if (rawD === "3") dCode = "H";
            }
            return (q.difficulty && q.difficulty !== "Unspecified" ? q.difficulty : null) || DIFFICULTIES[dCode] || (rawD ? rawD : "Unspecified");
          })(),
          scoreBand: q.scoreBand || q.score_band_range_cd || q.metadata?.score_band_range_cd || q.metadata?.SCORE_BAND_RANGE_CD || null, type,
          stimulus: sanitizeHtml(q.passage || ""),
          prompt: sanitizeHtml(q.prompt || ""),
          answerOptions, correctAnswers,
          rationale: sanitizeHtml(q.explanation || ""),
          raw: q
        };
        questions.push(question);
        
        const userAnswer = q.userAnswer || "";
        let isAnswered = true;
        let finalAnswer = userAnswer;
        
        if (!finalAnswer || finalAnswer.toLowerCase() === "omitted" || finalAnswer === "") {
          isAnswered = false;
          finalAnswer = "";
        } else if (type === "mcq") {
          const letterMatch = /^[A-Z]$/i.test(finalAnswer) ? finalAnswer.toUpperCase() : findLetterByOptionId(answerOptions, finalAnswer);
          if (letterMatch) {
            finalAnswer = letterMatch;
          }
        }
        const isCorrect = q.isCorrect === true || String(q.isCorrect).toLowerCase() === "true" || (finalAnswer ? scoreAnswer(question, finalAnswer).isCorrect : false);
        
        if (isAnswered) {
          totalAnswered++;
          if (isCorrect) totalCorrect++;
        }

        responses.push({
          id: uid("resp"),
          sessionId: bankId,
          questionId: id,
          subject,
          domainCode,
          domain: domainLabel,
          answer: finalAnswer,
          isCorrect,
          isAnswered,
          sequence: sequenceCounter - 1,
          answeredAt: sessionDate,
          updatedAt: Date.now()
        });
      }
    }
    
    bank.questionCount = questions.length;
    totalIncorrect = questions.length - totalCorrect;

    const session = {
      id: bankId,
      mode: "bluebook",
      title: payload.displayTitle || "Bluebook Practice Test",
      completedAt: sessionDate,
      updatedAt: Date.now(),
      totalAnswered,
      totalCorrect,
      totalIncorrect,
      totalQuestionsServed: questions.length,
      averageSeconds: 0,
      responses: responses
    };

    return { bank, questions, session };
  }

  function normalizeQuestion(question, bankId, index) {
    const raw = question.raw || {};
    const metadata = raw.metadata || question.metadata || {};
    const detail = raw.detail || question.detail || {};
    const answerOptions = normalizeAnswerOptions(question.answerOptions || detail.answerOptions || []);
    const subject = normalizeSubject(question.subject || question.test || metadata.test || metadata.pPcc || metadata.primary_class_cd);
    const externalId = question.externalId || question.externalid || detail.externalid || detail.external_id || metadata.external_id || question.id;
    const id = String(question.id || externalId || `${bankId}:${index}`);
    const type = question.type || detail.type || (answerOptions.length ? "mcq" : "spr");
    const rawCorrect = question.correctAnswers || question.correct_answer || detail.correct_answer || detail.keys || question.keys || [];
    const correctAnswers = normalizeCorrectAnswers(rawCorrect, answerOptions, type);
    const domainCode = question.domainCode || metadata.primary_class_cd || "";
    const domain = question.domain || metadata.primary_class_cd_desc || findDomainLabel(subject, domainCode) || "Unknown domain";
    const difficultyCode = question.difficultyCode || metadata.difficulty || "";

    return {
      id, externalId: String(externalId || id),
      questionId: question.questionId || metadata.questionId || "",
      bankId, importedAt: new Date().toISOString(), updatedAt: Date.now(), subject,
      // Indexed. Defaults to the sentinel because this is the import path;
      // storeCatalogPage() overwrites it with the real catalog name.
      catalog: LOCAL_CATALOG,
      test: question.assessment || question.test || SUBJECTS[subject] || "",
      domainCode, domain,
      skillCode: question.skillCode || metadata.skill_cd || "",
      skill: question.skill || metadata.skill_desc || metadata.skill_cd || "",
      difficultyCode,
      difficulty: question.difficulty || DIFFICULTIES[difficultyCode] || difficultyCode || "Unspecified",
      scoreBand: question.scoreBand || metadata.score_band_range_cd || null,
      type,
      stimulus: sanitizeHtml(question.stimulus || detail.stimulus || detail.passage || detail.scenario || ""),
      prompt: sanitizeHtml(question.prompt || question.stem || detail.stem || detail.body || detail.prompt || ""),
      answerOptions, correctAnswers,
      rationale: sanitizeHtml(question.rationale || detail.rationale || ""),
      raw: question.raw || question
    };
  }

  function normalizeAnswerOptions(options) {
    if (!Array.isArray(options)) return [];
    return options.map((opt, i) => ({
      id: opt.id || "",
      letter: opt.letter || letterAt(i),
      content: sanitizeHtml(opt.content || "")
    }));
  }

  function normalizeCorrectAnswers(values, answerOptions, type) {
    const raw = Array.isArray(values) ? values : [values];
    const normalized = [];
    for (const val of raw) {
      const text = stripHtml(String(val || "")).trim();
      if (!text) continue;
      if (type === "mcq") {
        const letter = /^[A-Z]$/i.test(text) ? text.toUpperCase() : findLetterByOptionId(answerOptions, text);
        if (letter) normalized.push(letter);
      } else {
        normalized.push(text);
      }
    }
    return [...new Set(normalized)];
  }

  function findLetterByOptionId(options, id) {
    return options.find(o => o.id === id)?.letter || "";
  }

  function normalizeSubject(value) {
    const t = String(value || "").toLowerCase();
    if (t.includes("reading") || t.includes("writing") || t.includes("rw") || ["ini", "cas", "eoi", "sec"].includes(t)) return "rw";
    return "math";
  }

  /* ===========================================================
     TEST START
     =========================================================== */

  function ensureConfigDefaults() {
    if (!state.questions.length) return;
    const subs = new Set(state.questions.map(q => q.subject));
    if (!subs.has(state.config.subject) && state.config.subject !== "both") {
      state.config.subject = subs.has("math") ? "math" : [...subs][0] || "math";
    }
    const domains = getAvailableDomains(state.config.subject);
    const valid = new Set(domains.map(d => d.code));
    state.config.domainCodes = state.config.domainCodes.filter(c => valid.has(c));
    if (!state.config.domainCodes.length) state.config.domainCodes = domains.map(d => d.code);

    const allSkills = domains.flatMap(d => d.skills);
    const validSkills = new Set(allSkills);
    if (!state.config.skillCodes) state.config.skillCodes = [];
    state.config.skillCodes = state.config.skillCodes.filter(s => validSkills.has(s));
    if (!state.config.skillCodes.length) state.config.skillCodes = [...allSkills];
  }

  function readConfigFromForm(form) {
    const data = new FormData(form);
    const subject = data.get("subject") || "math";
    const domains = data.getAll("domain");
    const skills = data.getAll("skill");
    const difficulties = data.getAll("difficulty");
    const availableDomains = getAvailableDomains(subject);
    
    const customSkillCounts = {};
    let hasCustomCounts = false;
    let customTotal = 0;
    for (const skill of skills) {
      const countStr = data.get("skill_count_" + skill);
      if (countStr && countStr.trim() !== "") {
        const count = parseInt(countStr, 10);
        if (!isNaN(count) && count > 0) {
          customSkillCounts[skill] = count;
          hasCustomCounts = true;
          customTotal += count;
        }
      }
    }
    let finalLimit = clamp(parseInt(data.get("limit"), 10) || 20, 1, 200);
    if (hasCustomCounts) {
      finalLimit = customTotal;
    }
    
    const pacingConfig = { domainLimitSeconds: {}, skillLimitSeconds: {} };
    for (const [key, val] of data.entries()) {
      if (key.startsWith('pacing_domain_') && val) {
        const domKey = key.replace('pacing_domain_', '');
        const seconds = parseInt(val, 10);
        if (seconds >= 5 && seconds <= 3600) pacingConfig.domainLimitSeconds[domKey] = seconds;
      }
      if (key.startsWith('pacing_skill_') && val) {
        const skKey = key.replace('pacing_skill_', '');
        const seconds = parseInt(val, 10);
        if (seconds >= 5 && seconds <= 3600) pacingConfig.skillLimitSeconds[skKey] = seconds;
      }
    }
    state.pacingConfig = pacingConfig;

    return {
      subject,
      pacing: pacingConfig,
      // Domain checkboxes are always rendered: empty = user explicitly unchecked all
      domainCodes: domains,
      // Skill checkboxes only exist when advanced mode is on; fall back to all when hidden
      skillCodes: skills.length ? skills : (state.showAdvancedDomains ? [] : availableDomains.flatMap(d => d.skills)),
      customSkillCounts,
      hasCustomCounts,
      difficulties: difficulties.length ? difficulties : ["E", "M", "H"],
      excludeAnswered: data.get("excludeAnswered") === "on",
      immediateFeedback: data.get("immediateFeedback") === "on",
      limit: finalLimit
    };
  }

  function startPractice(config) {
    state.config = config;
    if (!state.questions.length) { showNotice("Import a .sat-test file first.", "error"); renderHome(); return; }
    captureTelemetry("Started Practice", { mode: config.subject === "both" ? "full" : "custom", subject: config.subject });
    if (config.subject === "both") { startFullTest(config); return; }
    startCustomPractice(config);
  }

  function startCustomPractice(config, forcedQuestions = null) {
    let questions;
    if (forcedQuestions) {
      questions = shuffle(forcedQuestions);
    } else {
      const pool = shuffle(getFilteredQuestions(config));
      if (config.hasCustomCounts) {
        questions = [];
        const counts = { ...config.customSkillCounts };
        for (const q of pool) {
          const skill = q.skill || "Unspecified";
          if (counts[skill] > 0) {
            questions.push(q);
            counts[skill]--;
          }
        }
      } else {
        questions = pool.slice(0, Math.min(config.limit, pool.length));
      }
    }
    if (!questions.length) { showNotice("No questions match those filters.", "error"); renderHome(); return; }

    const activeTest = {
      id: uid("session"), mode: "custom", config, questions,
      catalog: state.activeCatalog,
      startedAt: new Date().toISOString(),
      currentIndex: 0, currentAnswer: "",
      currentQuestionStartedAt: Date.now(),
      responses: [], notice: null
    };
    if (!config.immediateFeedback) {
      activeTest.answersByQuestionId = {};
      activeTest.elapsedSecondsByQuestionId = {};
      activeTest.visitedQuestionIds = [questions[0].id];
      activeTest.activeQuestionStartedAt = Date.now();
    }
    state.activeTest = activeTest;
    state.eliminatedChoices = {};
    persistActiveTest();
    renderActiveTest();
  }

  function startFullTest(config) {
    const rwPool = getFilteredQuestions({ ...config, subject: "rw" });
    const mathPool = getFilteredQuestions({ ...config, subject: "math" });
    if (!rwPool.length || !mathPool.length) {
      showNotice("Full test needs both RW and Math questions.", "error"); renderHome(); return;
    }

    const usedIds = new Set();
    /* Phase 7: Module 1 uses calibrated E/M/H mix instead of config defaults */
    let rwModule1 = pickModuleQuestions("rw", ["E", "M", "H"], FULL_TEST.rw.size, usedIds, config);
    /* Phase 5: Order questions easiest→hardest within domain groups */
    rwModule1 = orderModuleQuestions(rwModule1);
    /* Phase 4: Mark 2 pretest (unscored) questions */
    markPretestQuestions(rwModule1);

    state.activeTest = {
      id: uid("session"), mode: "full", config,
      catalog: state.activeCatalog,
      startedAt: new Date().toISOString(),
      phase: "module",
      currentModule: makeModule("rw1", "rw", 1, "Reading and Writing — Module 1", FULL_TEST.rw.seconds, rwModule1, null),
      currentQuestionIndex: 0, answers: {}, marked: {},
      timeByQuestion: {}, completedResponses: [], moduleSummaries: [],
      usedIds: [...usedIds], breakUsed: false,
      moduleEndsAt: Date.now() + FULL_TEST.rw.seconds * 1000,
      lastQuestionEnteredAt: Date.now(), notice: null
    };
    state.eliminatedChoices = {};
    enterFullscreen();
    persistActiveTest();
    renderActiveTest();
  }

  /* ===========================================================
     TEST RENDERING
     =========================================================== */

  function renderActiveTest() {
    if (!state.activeTest) { renderHome(); return; }

    routeTransition("activeTest", () => {
      app.className = "test-shell";
      const test = state.activeTest;
      if (test.phase === "break") {
        app.innerHTML = renderBreakScreen();
      } else if (test.phase === "module-review") {
        app.innerHTML = renderModuleCheckScreen();
      } else if (test.phase === "transition") {
        app.innerHTML = renderTransitionScreen();
      } else {
        app.innerHTML = renderQuestionScreen();
      }

      // Overlays
      const pd = document.getElementById("persistent-desmos");
      if (pd) pd.style.display = state.showDesmos ? "flex" : "none";
      if (state.showRefSheet) app.insertAdjacentHTML("beforeend", renderRefSheetOverlay());
      if (state.showShortcuts) app.insertAdjacentHTML("beforeend", renderShortcutsOverlay());

      bindTestEvents();
      startTicker();
      updateLiveTimers();
      fitQuestionContent();
      applyAllVisibleHighlights();
    });
  }

  function fitQuestionContent() {
    const pane = app.querySelector(".question-pane");
    if (!pane || pane.scrollHeight <= pane.clientHeight) return;
    pane.classList.add("compact-content");
    if (pane.scrollHeight > pane.clientHeight) pane.classList.add("tight-content");
  }

  function renderQuestionMeta(question, options = {}) {
    let idLabel, idValue;
    if (question.questionId && question.questionId !== question.id) {
      idLabel = 'Student Question Bank ID';
      idValue = question.questionId;
    } else if (question.externalId) {
      idLabel = 'Imported question ID';
      idValue = question.externalId;
    } else {
      idLabel = 'Question ID';
      idValue = 'Unavailable';
    }
    
    const skillText = question.skill 
      ? `${escapeHtml(question.skill)}${question.skillCode ? ` (${escapeHtml(question.skillCode)})` : ''}`
      : 'Skill unavailable in this import';
    
    return `
      <div class="question-meta" style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.8em; color: var(--ink-muted); padding: 8px 0; border-top: 1px solid var(--line); margin-top: 8px;">
        <span><strong>${escapeHtml(idLabel)}:</strong> ${escapeHtml(String(idValue))}</span>
        ${options.hideSkillDomain ? '' : `<span><strong>Skill:</strong> ${skillText}</span>
        <span><strong>Domain:</strong> ${escapeHtml(question.domain || 'Unknown')}</span>`}
      </div>
    `;
  }

  function renderQuestionScreen() {
    const test = state.activeTest;
    const ctx = getCurrentContext();
    const question = ctx.question;
    const answer = getCurrentAnswer();
    const isFull = test.mode === "full";
    const response = (test.mode === "custom" && test.config.immediateFeedback) ? test.responses[test.currentIndex] : null;
    const fitColumns = shouldUseAnswerColumns(question);
    const answeredCount = isFull
      ? ctx.module.questions.filter(q => hasAnswer(test.answers[q.id])).length
      : test.responses.length + (hasAnswer(test.currentAnswer) ? 1 : 0);
    const totalCount = isFull ? ctx.module.questions.length : test.questions.length;
    const isMath = question.subject === "math";

    return `
      <header class="bb-topbar">
        <div class="bb-title">
          <strong>${escapeHtml(isFull ? ctx.module.title : `${SUBJECTS[question.subject]} Practice`)}</strong>
          <span>${isFull ? `${answeredCount}/${totalCount} answered` : "Custom practice"}</span>
        </div>
        <div class="bb-tools">
          ${isFull ? `<button class="bb-tool-btn ${test.marked?.[question.id] ? "active" : ""}" type="button" data-test-action="toggle-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5v16l7-5 7 5V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z"/></svg>
            ${test.marked?.[question.id] ? "Bookmarked" : "Bookmark"}
          </button>` : ""}

          <button class="bb-tool-btn" type="button" data-test-action="show-shortcuts">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM9 9h6M9 13h6M9 17h6"/></svg>
            Shortcuts
          </button>

          ${isMath ? `
            <button class="bb-tool-btn" type="button" data-test-action="show-desmos">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 9h20"/></svg>
              Calculator
            </button>
            <button class="bb-tool-btn" type="button" data-test-action="show-refsheet">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Reference
            </button>
          ` : ""}
        </div>
        <div class="bb-right-section">
          <div class="bb-timer" id="liveTimer">${escapeHtml(getTimerText())}</div>
          ${!isFull ? `<button class="bb-end-btn" type="button" data-test-action="end-custom">End Test</button>` : ""}
        </div>
      </header>

      ${test.notice ? `<section class="test-notice">${escapeHtml(test.notice)}</section>` : ""}

      <main class="bb-layout">
        <section class="bb-workspace ${question.stimulus ? "split" : "single"}">
          ${question.stimulus ? `
            <article class="passage-pane">
              <div class="pane-label">Passage</div>
              <div class="html-content">${sanitizeHtml(question.stimulus)}</div>
            </article>
          ` : ""}
          <article class="question-pane">
            <div class="question-header-row">
              <div>
                <span class="question-number">Question ${ctx.index + 1}</span>
                <small>${escapeHtml(question.domain)}${question.skill ? ` · ${escapeHtml(question.skill)}` : ""} · ${escapeHtml(question.difficulty || "")}</small>
              </div>
              ${question.subject === 'rw' && getQuestionHighlights(question.id).length > 0 ? `
                <button class="ghost-btn" type="button" data-test-action="clear-highlights" style="font-size: 12px; padding: 4px 8px; margin-left: auto;">
                  Clear Highlights
                </button>
              ` : ''}
            </div>
${(() => {
  if (test.mode !== 'custom' || !test.config.pacing) return '';
  const pacing = test.config.pacing;
  const q = question;
  const skKey = `${q.subject}:${q.domainCode}:${q.skill || ''}`;
  const domKey = `${q.subject}:${q.domainCode}`;
  const targetSeconds = pacing.skillLimitSeconds?.[skKey] || pacing.domainLimitSeconds?.[domKey];
  if (!targetSeconds) return '';
  
  // Calculate elapsed for this question
  let elapsed = 0;
  if (test.answersByQuestionId) {
    elapsed = (test.elapsedSecondsByQuestionId?.[q.id] || 0);
    if (test.questions[test.currentIndex]?.id === q.id) {
      elapsed += (Date.now() - (test.activeQuestionStartedAt || Date.now())) / 1000;
    }
  } else {
    elapsed = (Date.now() - (test.currentQuestionStartedAt || Date.now())) / 1000;
  }
  elapsed = Math.round(elapsed);
  
  const isOver = elapsed >= targetSeconds;
  const overSeconds = elapsed - targetSeconds;
  const overMin = Math.floor(overSeconds / 60);
  const overSec = overSeconds % 60;
  
  if (isOver) {
    return `<div class="pacing-indicator over" role="status" aria-live="polite" style="color: var(--red); font-weight: 600; font-size: 13px; margin-top: 4px;">Over target +${overMin > 0 ? overMin + ':' + String(overSec).padStart(2, '0') : overSec + 's'}</div>`;
  }
  return `<div class="pacing-indicator" style="font-size: 13px; color: var(--ink-muted); margin-top: 4px;">${elapsed}s / ${targetSeconds}s</div>`;
})()}
            ${renderQuestionMeta(question)}
            <div class="question-content-layout ${fitColumns ? "fit-columns" : ""}">
              <div class="html-content prompt">${sanitizeHtml(question.prompt)}</div>
              ${renderAnswerArea(question, answer, response)}
              ${response ? renderImmediateExplanation(question, response) : ""}
            </div>
          </article>
        </section>
      </main>

      <footer class="bb-footer">
        <button class="ghost-btn" type="button" data-test-action="${isFull ? "previous" : (test.mode === "custom" && !test.config.immediateFeedback ? "back-custom" : "noop")}" ${(!isFull && (test.mode !== "custom" || test.config.immediateFeedback)) || ctx.index === 0 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m7-7-7 7 7 7"/></svg>
          Back
        </button>
        <div class="bb-question-nav">
          ${ctx.list.map((q, i) => {
            const isCustomNonFB = test.mode === "custom" && !test.config.immediateFeedback;
            const canJump = isFull || (isCustomNonFB && test.visitedQuestionIds?.includes(q.id));
            const jumpAction = isFull ? "jump-question" : (isCustomNonFB && canJump ? "jump-custom-question" : "noop");
            return `
            <button class="bb-nav-dot ${i === ctx.index ? "current" : ""} ${isQuestionAnswered(q) ? "answered" : ""} ${test.marked?.[q.id] ? "marked" : ""}"
              type="button" data-test-action="${jumpAction}" data-index="${i}" ${!canJump ? "disabled" : ""}>${i + 1}</button>
          `}).join("")}
        </div>
        <div class="footer-center">${escapeHtml(question.questionId ? `ID ${question.questionId}` : question.externalId)}</div>
        ${renderForwardButton(ctx)}
      </footer>
    `;
  }

  function renderAnswerArea(question, answer, response, options = {}) {
    const { hideAnswer = false, isMistakesLog = false } = options;
    const isSubmitted = !!response && !hideAnswer;
    
    if (question.type === "spr" || !question.answerOptions.length) {
      if (hideAnswer && isMistakesLog) {
        return "";
      }
      return `
        <div class="spr-card ${isSubmitted ? (response.isCorrect ? "correct" : "incorrect") : ""}">
          <label for="sprAnswer">Enter your answer</label>
          <input id="sprAnswer" type="text" inputmode="decimal" autocomplete="off" value="${hideAnswer ? "" : escapeAttr(answer)}" data-answer-input ${isSubmitted ? "disabled" : ""}>
          <div id="sprFormatError" style="display: none; color: var(--red); font-size: 0.85em; margin-top: 4px;">Invalid format. Use integer (12), decimal (0.75), or fraction (3/4).</div>
          <small>Student-produced response. Valid formats: 12, 0.75, 3/4. No signs (+/-) or spaces.</small>
          ${(isSubmitted && !response.isCorrect && question.correctAnswers && question.correctAnswers.length > 0) ? `
            <div style="margin-top: 8px; color: var(--green); font-weight: 500; font-size: 0.9em;">
              Correct Answer: ${escapeHtml(question.correctAnswers.join(' or '))}
            </div>
          ` : ""}
        </div>
      `;
    }

    const elim = state.eliminatedChoices[question.id] || {};
    return `
      <div class="choice-list ${isSubmitted ? "submitted" : ""}">
        ${question.answerOptions.map(opt => {
          let statusClass = "";
          if (isSubmitted) {
            const isCorrectAnswer = (question.correctAnswers || []).includes(opt.letter);
            const isUserAnswer = answer === opt.letter;
            if (isCorrectAnswer) statusClass = "correct-choice";
            else if (isUserAnswer) statusClass = "incorrect-choice";
          }
          const isSelected = !hideAnswer && answer === opt.letter;
          const isEliminated = !hideAnswer && elim[opt.letter];
          return `
          <div class="choice-row ${isEliminated ? "eliminated" : ""} ${statusClass}">
            <button class="choice-button ${isSelected ? "selected" : ""} ${isEliminated ? "eliminated" : ""}"
              type="button" data-test-action="${isSubmitted || hideAnswer ? "noop" : "select-option"}" data-value="${escapeAttr(opt.letter)}" ${isSubmitted ? "disabled" : ""}>
              <span class="choice-letter">${escapeHtml(opt.letter)}</span>
              <span class="choice-content">${sanitizeHtml(opt.content)}</span>
            </button>
            ${(!isSubmitted && !hideAnswer) ? `
            <button class="choice-elim-btn ${elim[opt.letter] ? "active" : ""}" type="button"
              data-test-action="eliminate-option" data-value="${escapeAttr(opt.letter)}"
              title="${elim[opt.letter] ? "Undo cross-out" : "Cross out"}" aria-label="Eliminate option ${escapeAttr(opt.letter)}">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
            ` : ""}
          </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderImmediateExplanation(question, response) {
    return `
      <details class="explanation-card" style="margin-top: 24px; animation: slide-up-fade 0.2s ease-out forwards;">
        <summary>
          <strong class="show-text">Show Explanation</strong>
          <strong class="hide-text">Hide Explanation</strong>
        </summary>
        <div class="html-content rationale" style="margin-top: 12px;">${sanitizeHtml(question.rationale || "No explanation included in this export.")}</div>
      </details>
    `;
  }

  function shouldUseAnswerColumns(question) {
    return question.subject === "math" && !question.stimulus && question.answerOptions.length > 0;
  }

  function renderForwardButton(ctx) {
    const test = state.activeTest;
    const isLast = ctx.index === ctx.list.length - 1;
    const arrowIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>`;
    const checkIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
    
    if (test.mode === "custom") {
      if (test.config.immediateFeedback && !test.responses[test.currentIndex]) {
        return `<button class="primary-btn" type="button" data-test-action="next-custom">Submit ${checkIcon}</button>`;
      }
      return `<button class="primary-btn" type="button" data-test-action="next-custom">${isLast ? "Finish " + checkIcon : "Next " + arrowIcon}</button>`;
    }
    if (isLast) {
      return `<button class="primary-btn" type="button" data-test-action="check-module">Review ${arrowIcon}</button>`;
    }
    return `<button class="primary-btn" type="button" data-test-action="next">Next ${arrowIcon}</button>`;
  }

  function renderModuleCheckScreen() {
    const test = state.activeTest;
    const module = test.currentModule;
    const answered = module.questions.filter(q => hasAnswer(test.answers[q.id])).length;
    const unanswered = module.questions.length - answered;
    const marked = module.questions.filter(q => test.marked[q.id]).length;

    return `
      <header class="bb-topbar">
        <div class="bb-title"><strong>${escapeHtml(module.title)}</strong><span>Check your work</span></div>
        <div class="bb-timer" id="liveTimer">${escapeHtml(getTimerText())}</div>
        <div></div>
      </header>
      <main class="module-check-screen">
        <section class="module-check-card">
          <p class="eyebrow">Before You Submit</p>
          <h1>Check your work</h1>
          <p>Review your answers before submitting. Click any question number to return to it. You may leave questions unanswered.</p>
          <div class="module-check-stats">
            <div><strong>${answered}</strong><span>Answered</span></div>
            <div><strong>${unanswered}</strong><span>Unanswered</span></div>
            <div><strong>${marked}</strong><span>Bookmarked</span></div>
          </div>
          <div class="module-review-legend">
            <span class="answered"></span> Answered
            <span class="unanswered"></span> Unanswered
            <span class="flagged"></span> Bookmarked
          </div>
          <div class="module-review-grid">
            ${module.questions.map((q, i) => `
              <button type="button"
                class="${hasAnswer(test.answers[q.id]) ? "answered" : ""} ${test.marked[q.id] ? "marked" : ""}"
                data-test-action="jump-question" data-index="${i}">${i + 1}</button>
            `).join("")}
          </div>
          <div class="module-check-actions">
            <button class="ghost-btn" type="button" data-test-action="return-module">Return to Questions</button>
            <button class="primary-btn large" type="button" data-test-action="submit-module">Submit Module</button>
          </div>
        </section>
      </main>
    `;
  }

  function renderTransitionScreen() {
    const test = state.activeTest;
    const next = test.transitionTarget;
    return `
      <header class="bb-topbar">
        <div class="bb-title"><strong>Section Transition</strong><span></span></div>
        <div></div><div></div>
      </header>
      <main class="transition-screen">
        <section class="transition-card">
          <p class="eyebrow">Up Next</p>
          <h1>${escapeHtml(next?.title || "Next Section")}</h1>
          <p>${escapeHtml(next?.description || "Get ready for the next module.")}</p>
          <p>You will have <strong>${next?.minutes || 0} minutes</strong> for this module.</p>
          <button class="primary-btn large" type="button" data-test-action="begin-next-module">Begin</button>
        </section>
      </main>
    `;
  }

  function renderBreakScreen() {
    return `
      <main class="break-screen">
        <section class="break-card">
          <p class="eyebrow">Scheduled Break</p>
          <h1>Take a 10-minute break.</h1>
          <div class="break-timer" id="liveTimer">${escapeHtml(getTimerText())}</div>
          <p>This break is available once per full test. Resume when you're ready.</p>
          <button class="primary-btn large" type="button" data-test-action="resume-break">Resume Early</button>
        </section>
      </main>
    `;
  }

  /* ---- Overlay Renders ---- */

  function renderRefSheetOverlay() {
    return `
      <div class="overlay-backdrop" data-test-action="close-overlay">
        <div class="overlay-panel" onclick="event.stopPropagation()">
          <div class="overlay-header">
            <strong>SAT Math Reference Sheet</strong>
            <button class="overlay-close" type="button" data-test-action="close-refsheet">✕</button>
          </div>
          <div class="overlay-body">
            <div class="ref-sheet">
              ${REFERENCE_FORMULAS.map(section => `
                <div class="ref-section">
                  <h3>${escapeHtml(section.section)}</h3>
                  <div class="ref-formulas">
                    ${section.formulas.map(f => `
                      <div class="ref-formula">
                        <span style="min-width:160px;color:var(--ink-secondary)">${escapeHtml(f.label)}</span>
                        <span class="katex-formula" data-tex="${escapeAttr(f.tex)}"></span>
                      </div>
                    `).join("")}
                  </div>
                </div>
              `).join("")}
              <p class="muted" style="margin-top:8px;font-size:13px">The number of degrees of arc in a circle is 360. The number of radians of arc in a circle is 2π. The sum of the measures in degrees of the angles of a triangle is 180.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderShortcutsOverlay() {
    return `
      <div class="overlay-backdrop" data-test-action="close-overlay">
        <div class="overlay-panel" onclick="event.stopPropagation()">
          <div class="overlay-header">
            <strong>Keyboard Shortcuts</strong>
            <button class="overlay-close" type="button" data-test-action="close-shortcuts">✕</button>
          </div>
          <div class="overlay-body">
            <div class="ref-sheet">
              <div class="ref-section">
                <div class="ref-formulas">
                  ${KEYBOARD_SHORTCUTS.map(s => `
                    <div class="ref-formula" style="justify-content: space-between;">
                      <span style="color:var(--ink-secondary)">${escapeHtml(s.action)}</span>
                      <strong style="background: var(--paper); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--line); font-size: 12px; white-space: nowrap;">${escapeHtml(s.shortcut)}</strong>
                    </div>
                  `).join("")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ===========================================================
     TEST EVENT HANDLING
     =========================================================== */



  function handleSprBeforeInput(e) {
    if (e.inputType === "insertText" && e.data) {
      const char = e.data;
      const currentVal = e.target.value;
      const selStart = e.target.selectionStart;
      
      const isValidChar = /[0-9\.\/\-]/.test(char);
      const isTooManyDec = char === '.' && currentVal.includes('.');
      const isTooManySlash = char === '/' && currentVal.includes('/');
      const isDecWithSlash = char === '.' && currentVal.includes('/');
      const isSlashWithDec = char === '/' && currentVal.includes('.');
      const isInvalidMinus = char === '-' && (currentVal.includes('-') || selStart > 0);
      
      if (!isValidChar || isTooManyDec || isTooManySlash || isDecWithSlash || isSlashWithDec || isInvalidMinus) {
        e.preventDefault();
        const err = document.getElementById("sprFormatError");
        if (err) err.style.display = "block";
      }
    }
  }

  function handleSprPaste(e) {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData("text");
    const target = e.target;
    
    const start = target.selectionStart;
    const end = target.selectionEnd;
    
    const newVal = target.value.slice(0, start) + paste + target.value.slice(end);
    const spr = sprSanitize(newVal);
    
    target.value = spr.sanitized;
    if (paste !== spr.sanitized) {
      const err = document.getElementById("sprFormatError");
      if (err) err.style.display = "block";
    }
    target.dispatchEvent(new Event('input'));
  }

  function bindTestEvents() {
    for (const el of app.querySelectorAll("[data-test-action]")) {
      el.addEventListener("click", handleTestAction);
    }
    const answerInput = app.querySelector("[data-answer-input]");
    if (answerInput) {
      const isSpr = answerInput.id === "sprAnswer";
      if (isSpr) {
        answerInput.addEventListener("beforeinput", handleSprBeforeInput);
        answerInput.addEventListener("paste", handleSprPaste);
      }
      answerInput.addEventListener("input", e => {
        if (isSpr && e.isTrusted) {
          const err = document.getElementById("sprFormatError");
          if (err) err.style.display = "none";
        }
        setCurrentAnswer(e.target.value, false);
      });
      answerInput.focus();
    }

    // Render KaTeX formulas in reference sheet
    for (const el of app.querySelectorAll(".katex-formula[data-tex]")) {
      try {
        if (window.katex) window.katex.render(el.dataset.tex, el, { throwOnError: false, displayMode: false });
      } catch (e) { el.textContent = el.dataset.tex; }
    }

    // Text highlighting for R/W passages and prompts
    const passagePane = app.querySelector('.passage-pane .html-content');
    const promptPane = app.querySelector('.question-pane .html-content.prompt');
    const highlightSurfaces = [[passagePane, 'stimulus'], [promptPane, 'prompt']];
    for (const [el, surface] of highlightSurfaces) {
      if (!el) continue;
      el.addEventListener('mouseup', () => handleTextSelection(surface));
      el.addEventListener('touchend', () => setTimeout(() => handleTextSelection(surface), 50));
    }
  }

  function handleTestAction(event) {
    if (!state.activeTest) return;
    const action = event.currentTarget.dataset.testAction;
    if (action === "noop") return;

    if (action === "select-option") {
      const val = event.currentTarget.dataset.value;
      const question = getCurrentContext().question;
      const elim = state.eliminatedChoices[question.id] || {};
      if (elim[val]) return; // Can't select an eliminated choice
      const currentAnswer = getCurrentAnswer();
      if (currentAnswer === val) {
        setCurrentAnswer("", true);
      } else {
        setCurrentAnswer(val, true);
      }
    }

    if (action === "eliminate-option") {
      const val = event.currentTarget.dataset.value;
      const question = getCurrentContext().question;
      const elim = state.eliminatedChoices[question.id] || {};
      if (elim[val]) {
        delete elim[val];
      } else {
        elim[val] = true;
        // If the eliminated choice was selected, clear the selection
        const currentAnswer = getCurrentAnswer();
        if (currentAnswer === val) setCurrentAnswer("", false);
      }
      state.eliminatedChoices[question.id] = elim;
      renderActiveTest();
    }

    if (action === "next-custom") submitCustomAnswer();
    if (action === "back-custom") navigateCustomQuestion(state.activeTest.currentIndex - 1);
    if (action === "jump-custom-question") navigateCustomQuestion(parseInt(event.currentTarget.dataset.index, 10));
    if (action === "end-custom") {
      showConfirmModal("Are you sure you want to end this test early? Unanswered questions will be marked as skipped.", "End Test", () => endCustomTest());
    }
    if (action === "previous") navigateQuestion(-1);
    if (action === "next") navigateQuestion(1);
    if (action === "check-module") openModuleCheckScreen();
    if (action === "jump-question") jumpQuestion(parseInt(event.currentTarget.dataset.index, 10));
    if (action === "toggle-mark") toggleCurrentMark();
    if (action === "submit-module") completeFullModule("submitted");
    if (action === "return-module") returnToCurrentModule();
    if (action === "resume-break") resumeFromBreak();
    if (action === "begin-next-module") beginQueuedModule();



    if (action === "show-desmos") { state.showDesmos = true; renderActiveTest(); }
    if (action === "close-desmos" || action === "close-overlay") {
      state.showDesmos = false; state.showRefSheet = false; state.showShortcuts = false; renderActiveTest();
    }
    if (action === "show-refsheet") { state.showRefSheet = true; renderActiveTest(); }
    if (action === "close-refsheet") { state.showRefSheet = false; renderActiveTest(); }
    if (action === "show-shortcuts") { state.showShortcuts = true; renderActiveTest(); }
    if (action === "close-shortcuts") { state.showShortcuts = false; renderActiveTest(); }
    if (action === "show-rationale") { state.showRationale = true; renderActiveTest(); }
    if (action === "clear-highlights") {
      const ctx = getCurrentContext();
      if (ctx) { clearQuestionHighlights(ctx.question.id); renderActiveTest(); }
    }
  }

  function updateMistakesLogUI() {
    const container = document.getElementById("mistakes-log-container");
    if (container) {
      const textareas = container.querySelectorAll('textarea.ml-note-input');
      textareas.forEach(ta => {
        const id = ta.dataset.id;
        const r = state.responses.find(res => res.id === id);
        if (r && ta.value !== (r.notes || "")) {
           r.notes = ta.value;
           r.updatedAt = Date.now();
        }
      });
      container.outerHTML = renderMistakesLog();
      bindHomeEvents();
    }
  }

  function setCurrentAnswer(value, shouldRender) {
    const test = state.activeTest;
    const question = getCurrentContext().question;

    // Check if choice is in eliminator mode
    if (shouldRender) {
      const elim = state.eliminatedChoices[question.id] || {};
      const choiceBtn = app.querySelector(`.choice-button[data-value="${value}"]`);
      if (choiceBtn?.dataset.eliminatorMode === "true") {
        elim[value] = true;
        state.eliminatedChoices[question.id] = elim;
        renderActiveTest();
        return;
      }
    }

    if (test.mode === "custom" && !test.config.immediateFeedback && test.answersByQuestionId) {
      test.answersByQuestionId[question.id] = value;
      test.currentAnswer = value;
    } else if (test.mode === "custom") {
      test.currentAnswer = value;
    } else {
      test.answers[question.id] = value;
    }
    test.notice = null;
    if (shouldRender) renderActiveTest();
    persistActiveTest();
  }

  function submitCustomAnswer() {
    const test = state.activeTest;
    if (!test) return;
    const question = test.questions[test.currentIndex];
    const answer = test.currentAnswer;

    if (test.config.immediateFeedback && !test.responses[test.currentIndex]) {
      if (!hasAnswer(answer)) {
        test.notice = "Please select or type an answer before checking.";
        renderActiveTest();
        return;
      }
      const elapsed = (Date.now() - test.currentQuestionStartedAt) / 1000;
      const response = makeResponse(question, answer, elapsed, test, true);
      test.responses[test.currentIndex] = response;
      test.notice = null;
      persistActiveTest();
      renderActiveTest();
      return;
    }

    if (!test.config.immediateFeedback) {
      if (test.currentIndex >= test.questions.length - 1) {
        finishNonFeedbackCustomTest();
        return;
      }
      navigateCustomQuestion(test.currentIndex + 1);
      return;
    }
    
    if (test.currentIndex >= test.questions.length - 1) {
      finishActiveTest(test.responses.filter(Boolean));
      return;
    }

    test.currentIndex += 1;
    test.currentAnswer = "";
    test.currentQuestionStartedAt = Date.now();
    test.activeQuestionStartedAt = Date.now();
    test.notice = null;
    state.showRationale = false;
    persistActiveTest();
    renderActiveTest();
  }

  function freezeCustomQuestionTime() {
    const test = state.activeTest;
    if (!test || test.mode !== "custom" || test.config.immediateFeedback) return;
    const curId = test.questions[test.currentIndex].id;
    const elapsedNow = (Date.now() - test.activeQuestionStartedAt) / 1000;
    test.elapsedSecondsByQuestionId[curId] = (test.elapsedSecondsByQuestionId[curId] || 0) + elapsedNow;
  }

  function navigateCustomQuestion(newIndex) {
    const test = state.activeTest;
    if (!test || test.mode !== "custom" || test.config.immediateFeedback) return;
    
    freezeCustomQuestionTime();
    
    test.currentIndex = newIndex;
    const newQuestion = test.questions[newIndex];
    
    if (!test.visitedQuestionIds.includes(newQuestion.id)) {
      test.visitedQuestionIds.push(newQuestion.id);
    }
    
    test.currentAnswer = test.answersByQuestionId[newQuestion.id] || "";
    test.activeQuestionStartedAt = Date.now();
    test.notice = null;
    state.showRationale = false;
    
    persistActiveTest();
    renderActiveTest();
  }

  function finishNonFeedbackCustomTest() {
    const test = state.activeTest;
    if (!test || test.mode !== "custom" || test.config.immediateFeedback) return;
    
    freezeCustomQuestionTime();
    
    const responses = [];
    for (const q of test.questions) {
      const ans = test.answersByQuestionId[q.id];
      const elapsed = test.elapsedSecondsByQuestionId[q.id] || 0;
      const response = makeResponse(q, ans, elapsed, test, true);
      if (response) responses.push(response);
    }
    
    finishActiveTest(responses);
  }

  function endCustomTest() {
    const test = state.activeTest;
    if (!test.config.immediateFeedback) {
      finishNonFeedbackCustomTest();
      return;
    }
    const question = test.questions[test.currentIndex];
    if (!test.responses[test.currentIndex]) {
      if (hasAnswer(test.currentAnswer)) {
        const elapsed = (Date.now() - test.currentQuestionStartedAt) / 1000;
        const response = makeResponse(question, test.currentAnswer, elapsed, test, true);
        if (response) test.responses[test.currentIndex] = response;
      }
    }
    const finalResponses = [];
    for (let i = 0; i < test.questions.length; i++) {
      if (test.responses[i]) {
        finalResponses.push(test.responses[i]);
      } else {
        const elapsed = (i === test.currentIndex) ? (Date.now() - test.currentQuestionStartedAt) / 1000 : 0;
        const response = makeResponse(test.questions[i], "", elapsed, test, true);
        if (response) finalResponses.push(response);
      }
    }
    finishActiveTest(finalResponses);
  }

  function navigateQuestion(delta) {
    const test = state.activeTest;
    if (test.mode !== "full") return;
    captureFullQuestionTime();
    test.currentQuestionIndex = clamp(test.currentQuestionIndex + delta, 0, test.currentModule.questions.length - 1);
    test.lastQuestionEnteredAt = Date.now();
    persistActiveTest();
    renderActiveTest();
  }

  function jumpQuestion(index) {
    const test = state.activeTest;
    if (test.mode !== "full" || isNaN(index)) return;
    captureFullQuestionTime();
    test.phase = "module";
    test.currentQuestionIndex = clamp(index, 0, test.currentModule.questions.length - 1);
    test.lastQuestionEnteredAt = Date.now();
    persistActiveTest();
    renderActiveTest();
  }

  function openModuleCheckScreen() {
    const test = state.activeTest;
    if (!test || test.mode !== "full") return;
    captureFullQuestionTime();
    test.phase = "module-review";
    renderActiveTest();
  }

  function returnToCurrentModule() {
    const test = state.activeTest;
    if (!test || test.mode !== "full") return;
    test.phase = "module";
    test.lastQuestionEnteredAt = Date.now();
    renderActiveTest();
  }

  function toggleCurrentMark() {
    const test = state.activeTest;
    const question = getCurrentContext().question;
    test.marked[question.id] = !test.marked[question.id];
    persistActiveTest();
    renderActiveTest();
  }

  function completeFullModule(reason) {
    const test = state.activeTest;
    if (!test || test.mode !== "full" || state.transitionLocked) return;
    state.transitionLocked = true;
    stopTicker();
    captureFullQuestionTime();

    const module = test.currentModule;
    const responses = module.questions
      .map(q => makeResponse(q, test.answers[q.id], test.timeByQuestion[q.id] || 0, test, true))
      .filter(Boolean);
    const summary = summarizeModule(module, responses, reason);
    test.completedResponses.push(...responses);
    test.moduleSummaries.push(summary);

    if (module.id === "rw1") {
      const route = summary.theta >= 0.0 ? "upper" : "lower";
      const usedIds = new Set(test.usedIds);
      let questions = pickModuleQuestions("rw", routeDifficulties(route), FULL_TEST.rw.size, usedIds, test.config);
      questions = orderModuleQuestions(questions); /* Phase 5 */
      markPretestQuestions(questions); /* Phase 4 */
      test.usedIds = [...usedIds];
      showTransition(makeModule("rw2", "rw", 2, "Reading and Writing — Module 2", FULL_TEST.rw.seconds, questions, route),
        `${route === "upper" ? "Upper" : "Lower"} difficulty route based on Module 1 performance.`, Math.round(FULL_TEST.rw.seconds / 60));
      return;
    }

    if (module.id === "rw2") { beginBreak(); return; }

    if (module.id === "math1") {
      const route = summary.theta >= 0.0 ? "upper" : "lower";
      const usedIds = new Set(test.usedIds);
      let questions = pickModuleQuestions("math", routeDifficulties(route), FULL_TEST.math.size, usedIds, test.config);
      questions = orderModuleQuestions(questions); /* Phase 5 */
      markPretestQuestions(questions); /* Phase 4 */
      test.usedIds = [...usedIds];
      showTransition(makeModule("math2", "math", 2, "Math — Module 2", FULL_TEST.math.seconds, questions, route),
        `${route === "upper" ? "Upper" : "Lower"} difficulty route based on Module 1 performance.`, Math.round(FULL_TEST.math.seconds / 60));
      return;
    }

    finishActiveTest(test.completedResponses);
  }

  function showTransition(nextModule, description, minutes) {
    const test = state.activeTest;
    test.phase = "transition";
    test.transitionTarget = { title: nextModule.title, description, minutes };
    test.queuedModule = nextModule;
    state.transitionLocked = false;
    renderActiveTest();
  }

  function beginQueuedModule() {
    const test = state.activeTest;
    if (!test || !test.queuedModule) return;
    beginFullModule(test.queuedModule);
    test.queuedModule = null;
    test.transitionTarget = null;
  }

  function beginFullModule(module) {
    const test = state.activeTest;
    test.phase = "module";
    test.currentModule = module;
    test.currentQuestionIndex = 0;
    test.moduleEndsAt = Date.now() + module.seconds * 1000;
    test.lastQuestionEnteredAt = Date.now();
    test.notice = null;
    state.transitionLocked = false;
    state.eliminatedChoices = {};
    persistActiveTest();
    renderActiveTest();
  }

  function beginBreak() {
    const test = state.activeTest;
    test.phase = "break";
    test.breakUsed = true;
    test.breakEndsAt = Date.now() + FULL_TEST.breakSeconds * 1000;
    state.transitionLocked = false;
    persistActiveTest();
    renderActiveTest();
  }

  function resumeFromBreak() {
    const test = state.activeTest;
    if (!test || test.phase !== "break" || state.transitionLocked) return;
    state.transitionLocked = true;
    stopTicker();
    const usedIds = new Set(test.usedIds);
    /* Phase 7: Module 1 uses calibrated E/M/H mix */
    let questions = pickModuleQuestions("math", ["E", "M", "H"], FULL_TEST.math.size, usedIds, test.config);
    questions = orderModuleQuestions(questions); /* Phase 5 */
    markPretestQuestions(questions); /* Phase 4 */
    test.usedIds = [...usedIds];
    showTransition(makeModule("math1", "math", 1, "Math — Module 1", FULL_TEST.math.seconds, questions, null),
      "Get ready for the Math section.", Math.round(FULL_TEST.math.seconds / 60));
  }

  function captureFullQuestionTime() {
    const test = state.activeTest;
    if (!test || test.mode !== "full" || test.phase !== "module") return;
    const question = test.currentModule.questions[test.currentQuestionIndex];
    if (!question) return;
    const elapsed = Math.max(0, (Date.now() - test.lastQuestionEnteredAt) / 1000);
    test.timeByQuestion[question.id] = (test.timeByQuestion[question.id] || 0) + elapsed;
  }

  async function finishActiveTest(responses) {
    stopTicker();
    const test = state.activeTest;
    const completedAt = new Date().toISOString();
    const session = buildSession(test, responses, completedAt);
    const persistedResponses = responses.map((r, i) => ({
      ...r, id: `${session.id}:${i}:${r.questionId}`, sessionId: session.id, sequence: i, answeredAt: completedAt, updatedAt: Date.now()
    }));

    // Consolidate responses directly into the session object for atomic transactions
    session.responses = persistedResponses;
    await DB.put("sessions", session);
    clearActiveTestPersistence();
    
    captureTelemetry("Completed Practice", { mode: test.mode });

    state.activeTest = null;
    state.lastResult = { session, responses: persistedResponses };
    sessionStorage.setItem('lastResultSessionId', session.id);
    state.view = "results";
    state.notice = null;
    state.transitionLocked = false;
    state.eliminatedChoices = {};
    exitFullscreen();
    await refreshLocalData();
    renderHome();
    syncBackup(false);
    if (window.SevSync?.isLinked()) SevSync.sync();
  }

  function buildSession(test, responses, completedAt) {
    const answered = responses.filter(isAnsweredResponse);
    const totalCorrect = answered.filter(r => r.isCorrect).length;
    const totalAnswered = answered.length;
    const totalSeconds = answered.reduce((s, r) => s + r.timeSpentSeconds, 0);
    return {
      id: test.id, mode: test.mode, subject: test.config.subject,
      // The exam the test was started under, not the one selected now -- the two
      // differ if the user switched banks with a test in progress.
      catalog: sessionCatalog(test),
      startedAt: test.startedAt, completedAt, updatedAt: Date.now(),
      totalAnswered, totalCorrect, totalIncorrect: responses.length - totalCorrect,
      totalQuestionsServed: responses.length,
      averageSeconds: totalAnswered ? totalSeconds / totalAnswered : 0, totalSeconds,
      config: test.config, moduleSummaries: test.moduleSummaries || []
    };
  }

  function makeResponse(question, answer, timeSpentSeconds, test, includeUnanswered = false) {
    const score = scoreAnswer(question, answer);
    if (!score.wasAnswered && !includeUnanswered) return null;
    return {
      mode: test.mode,
      moduleId: test.mode === "full" ? test.currentModule?.id || null : null,
      moduleTitle: test.mode === "full" ? test.currentModule?.title || null : null,
      questionId: question.id, externalId: question.externalId,
      displayQuestionId: question.questionId,
      subject: question.subject, domainCode: question.domainCode, domain: question.domain,
      skillCode: question.skillCode, skill: question.skill,
      difficultyCode: question.difficultyCode, difficulty: question.difficulty,
      scoreBand: question.scoreBand || null, /* Phase 1: thread 7-band difficulty */
      isPretest: question._isPretest || false, /* Phase 4: pretest flag */
      answer: String(answer || "").trim(),
      correctAnswers: question.correctAnswers || [],
      isAnswered: score.wasAnswered, isCorrect: score.isCorrect,
      timeSpentSeconds: Math.max(0, Math.round(timeSpentSeconds))
    };
  }



  /* Phase 1: Get IRT difficulty parameter from 7-band score_band or fallback to E/M/H */
  function getDifficultyParam(response) {
    const band = response.scoreBand;
    if (band != null && band >= 1 && band <= 7) {
      return SCORE_BAND_DIFFICULTY[band];
    }
    return { E: -1.5, M: 0.0, H: 1.5 }[response.difficultyCode || "M"] ?? 0;
  }

  function estimateTheta(responses) {
    const items = [];
    let score = 0;
    
    for (const r of responses) {
      /* Phase 4: Exclude pretest items from scoring */
      if (r.isPretest) continue;
      let b = getDifficultyParam(r); /* Phase 1: 7-band difficulty */
      let u = r.isCorrect ? 1 : 0;
      items.push({ b, u });
      score += u;
    }
    
    if (items.length === 0) return 0;
    if (score === 0) return -3.0; // All incorrect
    if (score === items.length) return 3.0; // All correct
    
    let theta = 0.0;
    const a = 1.5; // Discrimination parameter to match SAT normal ogive
    for (let iter = 0; iter < 10; iter++) {
      let f = 0;
      let df = 0;
      for (const item of items) {
        const p = 1 / (1 + Math.exp(-a * (theta - item.b)));
        f += (item.u - p);
        df -= a * p * (1 - p);
      }
      if (Math.abs(df) < 1e-9) break;
      const dTheta = f / df;
      theta -= dTheta;
      if (Math.abs(dTheta) < 1e-4) break;
    }
    return Math.max(-3.0, Math.min(3.0, theta));
  }

  /* Phase 2/6: Linear theta-to-score with route-aware ceiling.
     IRT theta→scaled score is a linear transform by design.
     The "S-curve" in real SAT scoring arises from raw→scaled conversion,
     not from theta→scaled. Route ceiling is the key improvement here. */
  function thetaToScore(theta, route) {
    const ceiling = route === "lower" ? LOWER_ROUTE_CEILING : 800;
    const raw = 500 + (theta * 100);
    const clamped = Math.max(200, Math.min(ceiling, raw));
    return Math.round(clamped / 10) * 10;
  }

  function summarizeModule(module, responses, reason) {
    const answered = responses.filter(isAnsweredResponse);
    /* Phase 4: Only count non-pretest responses for accuracy */
    const scoredResponses = responses.filter(r => !r.isPretest);
    const scoredAnswered = scoredResponses.filter(isAnsweredResponse);
    const correct = scoredAnswered.filter(r => r.isCorrect).length;
    const theta = estimateTheta(responses); /* estimateTheta already skips pretest internally */
    return {
      id: module.id, title: module.title, subject: module.subject, route: module.route,
      reason, answered: answered.length, correct, incorrect: scoredResponses.length - correct,
      accuracy: scoredResponses.length ? correct / scoredResponses.length : 0,
      theta
    };
  }

  /* ===========================================================
     KEYBOARD NAVIGATION
     =========================================================== */

  function toggleElimination(val) {
    const test = state.activeTest;
    const ctx = getCurrentContext();
    if (!test || !ctx || !ctx.question) return;
    const qid = ctx.question.id;
    const elim = state.eliminatedChoices[qid] || {};
    
    if (elim[val]) {
      delete elim[val];
    } else {
      elim[val] = true;
      const existing = state.responses.find(r => r.sessionId === test.id && r.questionId === qid);
      if (existing && existing.answer === val) {
        setCurrentAnswer(null, true);
      }
    }
    state.eliminatedChoices[qid] = elim;
    renderActiveTest();
  }

  function handleKeyboard(e) {
    if (!state.activeTest) return;

    const key = e.key.toLowerCase();
    const isCtrl = e.ctrlKey || e.metaKey;
    const isAlt = e.altKey;
    const isShift = e.shiftKey;

    // --- Global Overlays ---
    if (e.key === "F1") {
      e.preventDefault();
      state.showShortcuts = !state.showShortcuts;
      renderActiveTest();
      return;
    }
    if (e.key === "Escape") {
      if (state.showDesmos || state.showRefSheet || state.showShortcuts) {
        state.showDesmos = false;
        state.showRefSheet = false;
        state.showShortcuts = false;
        renderActiveTest();
      }
      return;
    }
    if ((isAlt && key === "c" && !isCtrl) || (isCtrl && isAlt && key === "c")) {
      e.preventDefault();
      state.showDesmos = !state.showDesmos;
      renderActiveTest();
      return;
    }
    if (isCtrl && isAlt && key === "r") {
      e.preventDefault();
      state.showRefSheet = !state.showRefSheet;
      renderActiveTest();
      return;
    }
    if ((isCtrl && isAlt && key === "t") || (isAlt && key === "t" && !isCtrl)) {
      e.preventDefault();
      state.hideTimer = !state.hideTimer;
      updateLiveTimers();
      return;
    }

    // --- Block other actions if an overlay is open ---
    if (state.showDesmos || state.showRefSheet || state.showShortcuts) return;

    const test = state.activeTest;
    const ctx = getCurrentContext();
    if (!ctx?.question) return;

    const isInputFocused = (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");

    // --- Navigation ---
    if (isCtrl && isAlt && key === "x") {
      e.preventDefault();
      if (test.mode === "custom") submitCustomAnswer();
      else if (ctx.index < ctx.list.length - 1) navigateQuestion(1);
      else openModuleCheckScreen();
      return;
    }
    if (isCtrl && isAlt && key === "b" && test.mode === "full" && ctx.index > 0) {
      e.preventDefault();
      navigateQuestion(-1);
      return;
    }

    if (!isInputFocused) {
      if (key === "arrowright" || key === "enter") {
        e.preventDefault();
        if (test.mode === "custom") submitCustomAnswer();
        else if (ctx.index < ctx.list.length - 1) navigateQuestion(1);
        else openModuleCheckScreen();
        return;
      }
      if (key === "arrowleft" && test.mode === "full" && ctx.index > 0) {
        e.preventDefault();
        navigateQuestion(-1);
        return;
      }
    }

    // --- Mark for Review ---
    if ((key === "m" && !isCtrl && !isAlt && !isInputFocused) || (isAlt && key === "p" && !isCtrl) || (isCtrl && isAlt && key === "v")) {
      if (test.mode === "full") {
        e.preventDefault();
        toggleCurrentMark();
      }
      return;
    }

    // --- Select/Eliminate Options ---
    const letters = ["A", "B", "C", "D"];
    
    // A/B/C/D direct selection
    if (!isInputFocused && /^[a-d]$/.test(key) && !isCtrl && !isAlt && !isShift && ctx.question.answerOptions.length) {
      e.preventDefault();
      const letter = key.toUpperCase();
      if (ctx.question.answerOptions.some(o => o.letter === letter)) {
        const currentAnswer = getCurrentAnswer();
        if (currentAnswer === letter) setCurrentAnswer("", true);
        else setCurrentAnswer(letter, true);
      }
      return;
    }

    // Ctrl+Shift+1/2/3/4 (Select)
    if (isCtrl && isShift && /^[1-4]$/.test(key) && ctx.question.answerOptions.length) {
      e.preventDefault();
      const letter = letters[parseInt(key) - 1];
      if (ctx.question.answerOptions.some(o => o.letter === letter)) {
        const currentAnswer = getCurrentAnswer();
        if (currentAnswer === letter) setCurrentAnswer("", true);
        else setCurrentAnswer(letter, true);
      }
      return;
    }

    // Ctrl+Alt+1/2/3/4 (Eliminate)
    if (isCtrl && isAlt && /^[1-4]$/.test(key) && ctx.question.answerOptions.length) {
      e.preventDefault();
      const letter = letters[parseInt(key) - 1];
      if (ctx.question.answerOptions.some(o => o.letter === letter)) toggleElimination(letter);
      return;
    }
  }

  /* ===========================================================
     TIMER
     =========================================================== */

  function startTicker() {
    stopTicker();
    state.ticker = setInterval(() => { updateLiveTimers(); handleTimerExpiry(); }, 500);
  }

  function stopTicker() {
    if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
  }

  function updateLiveTimers() {
    const timer = app.querySelector("#liveTimer");
    if (timer) timer.textContent = getTimerText();

    // Update pacing indicator
    const pacingEl = document.querySelector('.pacing-indicator');
    if (pacingEl && state.activeTest?.config?.pacing) {
      const test = state.activeTest;
      const question = getCurrentContext()?.question;
      if (question) {
        const pacing = test.config.pacing;
        const skKey = `${question.subject}:${question.domainCode}:${question.skill || ''}`;
        const domKey = `${question.subject}:${question.domainCode}`;
        const targetSeconds = pacing.skillLimitSeconds?.[skKey] || pacing.domainLimitSeconds?.[domKey];
        if (targetSeconds) {
          let elapsed = 0;
          if (test.answersByQuestionId) {
            elapsed = (test.elapsedSecondsByQuestionId?.[question.id] || 0);
            if (test.questions[test.currentIndex]?.id === question.id) {
              elapsed += (Date.now() - (test.activeQuestionStartedAt || Date.now())) / 1000;
            }
          } else {
            elapsed = (Date.now() - (test.currentQuestionStartedAt || Date.now())) / 1000;
          }
          elapsed = Math.round(elapsed);
          const isOver = elapsed >= targetSeconds;
          const overSeconds = elapsed - targetSeconds;
          const overMin = Math.floor(overSeconds / 60);
          const overSec = overSeconds % 60;
          
          if (isOver) {
            pacingEl.className = 'pacing-indicator over';
            pacingEl.style.color = 'var(--red)';
            pacingEl.style.fontWeight = '600';
            pacingEl.textContent = `Over target +${overMin > 0 ? overMin + ':' + String(overSec).padStart(2, '0') : overSec + 's'}`;
          } else {
            pacingEl.className = 'pacing-indicator';
            pacingEl.style.color = 'var(--ink-muted)';
            pacingEl.style.fontWeight = '';
            pacingEl.textContent = `${elapsed}s / ${targetSeconds}s`;
          }
        }
      }
    }
  }

  function handleTimerExpiry() {
    const test = state.activeTest;
    if (!test || state.transitionLocked) return;
    if (test.mode === "full" && (test.phase === "module" || test.phase === "module-review") && Date.now() >= test.moduleEndsAt) {
      completeFullModule("time expired");
    }
    if (test.mode === "full" && test.phase === "break" && Date.now() >= test.breakEndsAt) {
      resumeFromBreak();
    }
  }

  function getTimerText() {
    const test = state.activeTest;
    if (!test) return "00:00";
    if (state.hideTimer) return "Hidden";
    if (test.mode === "custom") {
      if (test.config.immediateFeedback) {
        if (test.responses[test.currentIndex]) {
          return formatTimer(test.responses[test.currentIndex].timeSpentSeconds);
        }
        return formatTimer(Math.floor((Date.now() - test.currentQuestionStartedAt) / 1000));
      } else {
        const curId = test.questions[test.currentIndex].id;
        const previouslyElapsed = test.elapsedSecondsByQuestionId?.[curId] || 0;
        const currentSessionElapsed = Math.floor((Date.now() - (test.activeQuestionStartedAt || test.currentQuestionStartedAt)) / 1000);
        return formatTimer(previouslyElapsed + currentSessionElapsed);
      }
    }
    if (test.phase === "break") return formatTimer(Math.max(0, Math.ceil((test.breakEndsAt - Date.now()) / 1000)));
    if (test.phase === "transition") return "—";
    return formatTimer(Math.max(0, Math.ceil((test.moduleEndsAt - Date.now()) / 1000)));
  }

  function getCurrentContext() {
    const test = state.activeTest;
    if (!test) return null;
    if (test.mode === "custom") {
      return { list: test.questions, question: test.questions[test.currentIndex], index: test.currentIndex, module: null };
    }
    return { list: test.currentModule.questions, question: test.currentModule.questions[test.currentQuestionIndex], index: test.currentQuestionIndex, module: test.currentModule };
  }

  function getCurrentAnswer() {
    const test = state.activeTest;
    if (!test) return "";
    const context = getCurrentContext();
    if (!context || !context.question) return "";
    const question = context.question;
    if (test.mode === "custom" && !test.config.immediateFeedback && test.answersByQuestionId) {
      return test.answersByQuestionId[question.id] || "";
    }
    return test.mode === "custom" ? test.currentAnswer : test.answers[question.id] || "";
  }

  function isQuestionAnswered(question) {
    const test = state.activeTest;
    if (test.mode === "custom") {
      if (!test.config.immediateFeedback && test.answersByQuestionId) {
        return hasAnswer(test.answersByQuestionId[question.id]);
      }
      const cur = test.questions[test.currentIndex];
      return test.responses.some(r => r.questionId === question.id) || (cur?.id === question.id && hasAnswer(test.currentAnswer));
    }
    return hasAnswer(test.answers[question.id]);
  }

  /* ===========================================================
     PERSISTENCE — Save/restore active test to IndexedDB
     =========================================================== */

  let _persistTimeout = null;

  async function persistActiveTest() {
    if (!state.activeTest) {
      if (_persistTimeout) {
        clearTimeout(_persistTimeout);
        _persistTimeout = null;
      }
      try {
        await DB.put("sessions", { id: "__active_test__", type: "cleared" });
      } catch (_) {}
      return;
    }
    
    if (_persistTimeout) clearTimeout(_persistTimeout);
    _persistTimeout = setTimeout(async () => {
      try {
        const activeTest = state.activeTest;
        if (!activeTest) return;
        const snapshot = { ...activeTest, _persistedAt: Date.now() };
        if (snapshot.mode === "custom") {
          if (!snapshot.config.immediateFeedback && snapshot.activeQuestionStartedAt) {
            snapshot._elapsedBeforePersist = Date.now() - snapshot.activeQuestionStartedAt;
          } else {
            snapshot._elapsedBeforePersist = Date.now() - (snapshot.currentQuestionStartedAt || Date.now());
          }
        }
        await DB.put("sessions", { id: "__active_test__", snapshot, type: "active" });
      } catch (_) { /* ignore */ }
    }, 400);
  }

  async function restoreActiveTest() {
    try {
      const all = await DB.getAll("sessions");
      const active = all.find(s => s.id === "__active_test__" && s.type === "active");
      if (active?.snapshot) {
        const snap = active.snapshot;
        // Restore usedIds as Set
        if (Array.isArray(snap.usedIds)) snap.usedIds = snap.usedIds;
        state.activeTest = snap;
        // Recalculate timing references
        if (snap.mode === "custom") {
          if (!snap.config.immediateFeedback && snap.activeQuestionStartedAt) {
            state.activeTest.activeQuestionStartedAt = Date.now() - (snap._elapsedBeforePersist || 0);
          } else {
            state.activeTest.currentQuestionStartedAt = Date.now() - (snap._elapsedBeforePersist || 0);
          }
        }
      }
    } catch (_) { /* ignore */ }
  }

  async function clearActiveTestPersistence() {
    try {
      // We can't delete a single record easily with put, so we overwrite with empty
      await DB.put("sessions", { id: "__active_test__", type: "cleared" });
    } catch (_) { /* ignore */ }
  }

  /* ===========================================================
     QUESTION SELECTION
     =========================================================== */

  function makeModule(id, subject, number, title, seconds, questions, route) {
    return { id, subject, number, title, seconds, questions, route };
  }

  function pickModuleQuestions(subject, difficulties, count, usedIds, config) {
    const preferred = getFilteredQuestions({ ...config, subject, difficulties, excludeAnswered: config.excludeAnswered })
      .filter(q => !usedIds.has(q.id));
    const fallback = getFilteredQuestions({ ...config, subject, difficulties: config.difficulties, excludeAnswered: config.excludeAnswered })
      .filter(q => !usedIds.has(q.id) && !preferred.some(p => p.id === q.id));
    const emergency = getFilteredQuestions({ ...config, subject, difficulties: ["E", "M", "H"], excludeAnswered: false })
      .filter(q => !usedIds.has(q.id) && !preferred.some(p => p.id === q.id) && !fallback.some(f => f.id === q.id));

    const pool = [...preferred, ...fallback, ...emergency];
    /* Phase 3: Try domain-balanced pick first, fall back to difficulty-balanced */
    const blueprint = MODULE_BLUEPRINT[subject];
    const selected = blueprint
      ? blueprintPick(pool, blueprint, difficulties, count)
      : balancedPick(pool, difficulties, count);
    for (const q of selected) usedIds.add(q.id);
    return selected;
  }

  /* Phase 3: Domain-blueprint-aware question selection */
  function blueprintPick(questions, blueprint, difficulties, count) {
    const unique = dedupeBy(questions, q => q.id);
    const selected = [];
    const usedInPick = new Set();
    const diffOrder = { E: 0, M: 1, H: 2 };
    const allowedDiffs = new Set(difficulties.length ? difficulties : ["E", "M", "H"]);

    // First pass: fill domain quotas
    for (const [domainCode, quota] of Object.entries(blueprint)) {
      const candidates = shuffle(
        unique.filter(q => (q.domainCode || "") === domainCode && !usedInPick.has(q.id))
      ).sort((a, b) => {
        // Prefer questions matching the allowed difficulties
        const aMatch = allowedDiffs.has(a.difficultyCode) ? 0 : 1;
        const bMatch = allowedDiffs.has(b.difficultyCode) ? 0 : 1;
        return aMatch - bMatch;
      });
      let filled = 0;
      for (const q of candidates) {
        if (filled >= quota) break;
        if (!usedInPick.has(q.id)) {
          selected.push(q);
          usedInPick.add(q.id);
          filled++;
        }
      }
    }

    // Second pass: fill remaining seats from any domain, respecting difficulty
    if (selected.length < count) {
      const remaining = shuffle(
        unique.filter(q => !usedInPick.has(q.id))
      ).sort((a, b) => {
        const aMatch = allowedDiffs.has(a.difficultyCode) ? 0 : 1;
        const bMatch = allowedDiffs.has(b.difficultyCode) ? 0 : 1;
        return aMatch - bMatch;
      });
      for (const q of remaining) {
        if (selected.length >= count) break;
        selected.push(q);
        usedInPick.add(q.id);
      }
    }

    return selected.slice(0, count);
  }

  function balancedPick(questions, difficulties, count) {
    const unique = dedupeBy(questions, q => q.id);
    const order = difficulties.length ? difficulties : ["E", "M", "H"];
    const selected = [];
    const buckets = new Map();
    for (const d of ["E", "M", "H", ""]) buckets.set(d, shuffle(unique.filter(q => (q.difficultyCode || "") === d)));

    while (selected.length < count && unique.length > selected.length) {
      let added = false;
      for (const d of order) {
        const bucket = buckets.get(d) || [];
        const next = bucket.shift();
        if (next && !selected.some(q => q.id === next.id)) {
          selected.push(next); added = true;
          if (selected.length >= count) break;
        }
      }
      if (!added) {
        const remaining = unique.filter(q => !selected.some(s => s.id === q.id));
        if (!remaining.length) break;
        selected.push(shuffle(remaining)[0]);
      }
    }
    return selected;
  }

  function routeDifficulties(route) {
    return route === "upper" ? ["M", "H"] : ["E", "M"];
  }

  /* Phase 4: Mark 2 random questions per module as pretest (unscored) */
  function markPretestQuestions(questions) {
    const pretestCount = Math.min(2, questions.length);
    const indices = new Set();
    while (indices.size < pretestCount) {
      indices.add(Math.floor(Math.random() * questions.length));
    }
    for (let i = 0; i < questions.length; i++) {
      questions[i]._isPretest = indices.has(i);
    }
  }

  /* Phase 5: Order questions easiest→hardest within domain groups */
  function orderModuleQuestions(questions) {
    const diffOrder = { E: 0, M: 1, H: 2 };
    const domainGroups = {};
    for (const q of questions) {
      const key = q.domainCode || "ZZZ";
      (domainGroups[key] ||= []).push(q);
    }
    for (const group of Object.values(domainGroups)) {
      group.sort((a, b) => (diffOrder[a.difficultyCode] ?? 1) - (diffOrder[b.difficultyCode] ?? 1));
    }
    return Object.values(domainGroups).flat();
  }

  function getFilteredQuestions(config) {
    const subjects = config.subject === "both" ? ["math", "rw"] : [config.subject];
    const availableDomains = getAvailableDomains(config.subject);
    // If config explicitly provides an empty array, it means "nothing selected" — return 0 questions
    const explicitEmptyDomains = Array.isArray(config.domainCodes) && config.domainCodes.length === 0;
    const explicitEmptySkills = Array.isArray(config.skillCodes) && config.skillCodes.length === 0;
    if (explicitEmptyDomains || explicitEmptySkills) return [];
    const domainCodes = new Set(config.domainCodes?.length ? config.domainCodes : availableDomains.map(d => d.code));
    const skillCodes = new Set(config.skillCodes?.length ? config.skillCodes : availableDomains.flatMap(d => d.skills));
    const difficulties = new Set(config.difficulties?.length ? config.difficulties : ["E", "M", "H"]);
    const answered = config.excludeAnswered ? new Set(state.responses.filter(isAnsweredResponse).map(r => r.questionId)) : new Set();

    return state.questions.filter(q => {
      if (!subjects.includes(q.subject)) return false;
      if (domainCodes.size && !domainCodes.has(q.domainCode)) return false;
      if (skillCodes.size && !skillCodes.has(q.skill || "Unspecified")) return false;
      if (difficulties.size && !difficulties.has(q.difficultyCode) && q.difficultyCode) return false;
      return !answered.has(q.id);
    });
  }

  function countFilteredQuestions(config) { return getFilteredQuestions(config).length; }

  function countAvailableQuestionsForSkill(skill, config) {
    const subjects = config.subject === "both" ? ["math", "rw"] : [config.subject];
    const difficulties = new Set(config.difficulties?.length ? config.difficulties : ["E", "M", "H"]);
    const answered = config.excludeAnswered ? new Set(state.responses.filter(isAnsweredResponse).map(r => r.questionId)) : new Set();
    return state.questions.filter(q => {
      if (!subjects.includes(q.subject)) return false;
      if ((q.skill || "Unspecified") !== skill) return false;
      if (difficulties.size && !difficulties.has(q.difficultyCode) && q.difficultyCode) return false;
      return !answered.has(q.id);
    }).length;
  }


  function getAvailableDomains(subject) {
    const subjects = subject === "both" ? ["math", "rw"] : [subject];
    const seen = new Map();
    for (const q of state.questions) {
      if (!subjects.includes(q.subject)) continue;
      const key = `${q.subject}:${q.domainCode}`;
      if (!seen.has(key)) {
        seen.set(key, { subject: q.subject, code: q.domainCode, label: q.domain || findDomainLabel(q.subject, q.domainCode) || q.domainCode, skills: new Set() });
      }
      seen.get(key).skills.add(q.skill || "Unspecified");
    }
    if (!seen.size) {
      for (const s of subjects) for (const d of DOMAIN_FALLBACKS[s] || []) seen.set(`${s}:${d.code}`, { subject: s, code: d.code, label: d.label, skills: new Set() });
    }
    const result = [...seen.values()].sort((a, b) => String(a.subject).localeCompare(String(b.subject)) || String(a.label).localeCompare(String(b.label)));
    result.forEach(r => {
      r.skills = [...r.skills].sort((a, b) => {
        if (a === "Unspecified") return 1;
        if (b === "Unspecified") return -1;
        return String(a).localeCompare(String(b));
      });
    });
    return result;
  }

  /* ===========================================================
     METRICS
     =========================================================== */

  function buildMetrics(questions, responses) {
    const answeredResponses = responses.filter(isAnsweredResponse);
    const bank = { bySubject: questions.reduce((a, q) => { a[q.subject] = (a[q.subject] || 0) + 1; return a; }, {}) };
    const subjects = {};
    const domainMap = new Map();
    let totalTime = 0, correct = 0, timedAnswered = 0;

    for (const q of questions) {
      const key = `${q.subject}:${q.domainCode}`;
      if (!domainMap.has(key)) domainMap.set(key, { subject: q.subject, code: q.domainCode, label: q.domain || findDomainLabel(q.subject, q.domainCode) || "Unknown", answered: 0, correct: 0, incorrect: 0, totalTime: 0, accuracy: 0, skillLevel: 1 });
    }

    for (const r of answeredResponses) {
      const sub = subjects[r.subject] || { answered: 0, correct: 0, incorrect: 0, totalTime: 0, timedAnswered: 0, avgTime: 0 };
      sub.answered++; sub.correct += r.isCorrect ? 1 : 0; sub.incorrect += r.isCorrect ? 0 : 1;
      
      const t = r.timeSpentSeconds || 0;
      if (t > 0) {
        sub.totalTime += t;
        sub.timedAnswered = (sub.timedAnswered || 0) + 1;
        totalTime += t;
        timedAnswered++;
      }
      sub.avgTime = sub.timedAnswered ? sub.totalTime / sub.timedAnswered : 0;
      subjects[r.subject] = sub;

      const key = `${r.subject}:${r.domainCode}`;
      const domain = domainMap.get(key) || { subject: r.subject, code: r.domainCode, label: r.domain || findDomainLabel(r.subject, r.domainCode) || "Unknown", answered: 0, correct: 0, incorrect: 0, totalTime: 0, accuracy: 0, skillLevel: 1 };
      domain.answered++; domain.correct += r.isCorrect ? 1 : 0; domain.incorrect += r.isCorrect ? 0 : 1;
      domain.totalTime += t; domain.accuracy = domain.answered ? domain.correct / domain.answered : 0;
      domain.skillLevel = estimateSkillLevel(domain);
      domainMap.set(key, domain);

      correct += r.isCorrect ? 1 : 0;
    }

    // Count repeat misses per domain
    const mistakesByDomain = new Map();
    for (const r of responses.filter(r2 => !r2.isCorrect)) {
      const key = `${r.subject}:${r.domainCode}`;
      if (!mistakesByDomain.has(key)) mistakesByDomain.set(key, { questionIds: new Set(), totalMisses: 0 });
      const dm = mistakesByDomain.get(key);
      dm.questionIds.add(r.questionId);
      dm.totalMisses++;
    }
    // Attach to domain objects
    for (const [key, dm] of mistakesByDomain) {
      const domain = domainMap.get(key);
      if (domain) {
        const repeatCount = [...dm.questionIds].filter(qid => {
          const misses = responses.filter(r2 => r2.questionId === qid && !r2.isCorrect);
          return misses.length >= 2;
        }).length;
        domain.repeatMissQuestions = repeatCount;
        domain.totalMissedAttempts = dm.totalMisses;
      }
    }

    const answered = answeredResponses.length;
    return {
      bank, overall: { answered, correct, incorrect: answered - correct, accuracy: answered ? correct / answered : 0, avgTime: timedAnswered ? totalTime / timedAnswered : 0 },
      subjects, domains: [...domainMap.values()].sort((a, b) => String(a.subject).localeCompare(String(b.subject)) || String(a.label).localeCompare(String(b.label)))
    };
  }

  function estimateSkillLevel(domain) {
    if (!domain.answered) return 1;
    return clamp(Math.round(domain.accuracy * 5 + Math.min(1, domain.answered / 20) * 2), 1, 7);
  }

  /* ===========================================================
     HTML SANITIZATION & MODAL
     =========================================================== */
  function showPromptModal(message, confirmText, placeholder, onConfirm, options = {}) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal-content confirm-modal";
    
    const title = options.title || "Confirm Action";
    modal.innerHTML = `
      <div class="shadcn-dialog-header">
        <h2 class="shadcn-dialog-title">${escapeHtml(title)}</h2>
        <p class="shadcn-dialog-description">${escapeHtml(message)}</p>
      </div>
      <input type="text" class="shadcn-input prompt-input" placeholder="${escapeHtml(placeholder)}" maxlength="20" />
      <div class="shadcn-dialog-footer">
        <button class="shadcn-button shadcn-button-outline cancel-btn">${escapeHtml(options.cancelText || "Cancel")}</button>
        <button class="shadcn-button shadcn-button-primary confirm-btn">${escapeHtml(confirmText)}</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const input = modal.querySelector(".prompt-input");

    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      modal.classList.add("visible");
      input.focus();
    });

    const close = () => {
      overlay.classList.remove("visible");
      modal.classList.remove("visible");
      setTimeout(() => overlay.remove(), 250);
    };

    modal.querySelector(".cancel-btn").onclick = function() {
      if (this.disabled) return;
      this.disabled = true;
      close();
      if (typeof options.onCancel === "function") options.onCancel();
    };
    
    const submit = function() {
      if (modal.querySelector(".confirm-btn").disabled) return;
      modal.querySelector(".confirm-btn").disabled = true;
      const val = input.value;
      close();
      onConfirm(val);
    };

    modal.querySelector(".confirm-btn").onclick = submit;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      if (e.key === "Escape") modal.querySelector(".cancel-btn").click();
    });
  }

  function showConfirmModal(message, confirmText, onConfirm, options = {}) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal-content confirm-modal";
    
    const title = options.title || "Confirm Action";
    modal.innerHTML = `
      <div class="shadcn-dialog-header">
        <h2 class="shadcn-dialog-title">${escapeHtml(title)}</h2>
        <p class="shadcn-dialog-description">${escapeHtml(message)}</p>
      </div>
      <div class="shadcn-dialog-footer">
        <button class="shadcn-button shadcn-button-outline cancel-btn">${escapeHtml(options.cancelText || "Cancel")}</button>
        <button class="shadcn-button shadcn-button-primary confirm-btn">${escapeHtml(confirmText)}</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      modal.classList.add("visible");
    });

    const close = () => {
      overlay.classList.remove("visible");
      modal.classList.remove("visible");
      setTimeout(() => overlay.remove(), 250);
    };

    modal.querySelector(".cancel-btn").onclick = function() {
      if (this.disabled) return;
      this.disabled = true;
      close();
      if (typeof options.onCancel === "function") options.onCancel();
    };
    modal.querySelector(".confirm-btn").onclick = function() {
      if (this.disabled) return;
      this.disabled = true;
      if (options.processingText) this.textContent = options.processingText;
      close();
      onConfirm();
    };
  }
  window.showConfirmModal = showConfirmModal;
  const _sanitizeCache = new Map();

  function sanitizeHtml(value) {
    if (!value) return "";
    const strVal = String(value);
    if (_sanitizeCache.has(strVal)) return _sanitizeCache.get(strVal);

    const tpl = document.createElement("template");
    tpl.innerHTML = strVal;

    // Convert inline style formatting to semantic tags
    for (const el of tpl.content.querySelectorAll("[style]")) {
      if (el.closest("svg")) continue;
      const style = el.getAttribute("style") || "";
      if (/text-decoration\s*:\s*[^;]*underline/i.test(style)) wrapChildrenWith(el, "u");
      if (/font-weight\s*:\s*(?:bold|[7-9]00)/i.test(style)) wrapChildrenWith(el, "strong");
      if (/font-style\s*:\s*italic/i.test(style)) wrapChildrenWith(el, "em");
      if (/text-decoration\s*:\s*[^;]*line-through/i.test(style)) wrapChildrenWith(el, "s");
    }

    // Basic XSS prevention: strip dangerous tags, event handlers, and javascript: URLs
    const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'meta', 'base', 'form', 'applet', 'link'];
    for (const el of tpl.content.querySelectorAll("*")) {
      const tagName = (el.tagName || "").toLowerCase();
      if (DANGEROUS_TAGS.includes(tagName)) {
        el.remove();
        continue;
      }
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const val = String(attr.value || "");
        if (name.startsWith("on") || /javascript:/i.test(val)) {
          el.removeAttribute(attr.name);
          continue;
        }
        if ((name === "src" || name === "href") && !sanitizeUrlAttribute(el, attr.name, val)) {
          el.removeAttribute(attr.name);
        }
      }
      
      if (tagName === "a") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    }

    removeAccessibilityDescriptions(tpl.content);
    normalizeMathMarkup(tpl.content);
    fixGraphColors(tpl.content);
    namespaceSVGs(tpl.content);
    
    // Wrap tables in a responsive container to avoid vertical scrollbar clipping
    for (const table of tpl.content.querySelectorAll("table")) {
      const responsiveWrapper = document.createElement("div");
      responsiveWrapper.className = "table-responsive";
      table.parentNode.insertBefore(responsiveWrapper, table);
      responsiveWrapper.appendChild(table);
    }
    
    const wrapper = document.createElement("div");
    wrapper.appendChild(tpl.content);
    renderMath(wrapper);
    
    const result = wrapper.innerHTML;
    if (_sanitizeCache.size > 2000) _sanitizeCache.clear();
    _sanitizeCache.set(strVal, result);
    return result;
  }

  function fixGraphColors(root) {
    for (const el of root.querySelectorAll("svg *")) {
      const stroke = el.getAttribute("stroke");
      if (stroke && (stroke.toLowerCase() === "black" || stroke === "#000000" || stroke === "#000")) {
        el.setAttribute("stroke", "currentColor");
      }
      const fill = el.getAttribute("fill");
      if (fill && (fill.toLowerCase() === "black" || fill === "#000000" || fill === "#000")) {
        el.setAttribute("fill", "currentColor");
      }
      if (fill && (fill.toLowerCase() === "white" || fill.toLowerCase() === "#ffffff" || fill.toLowerCase() === "#fff")) {
        el.setAttribute("fill", "var(--panel)");
      }
      const style = el.getAttribute("style");
      if (style) {
        let newStyle = style.replace(/fill:\s*(white|#ffffff|#fff)\b/ig, "fill: var(--panel)")
                            .replace(/fill:\s*(black|#000000|#000)\b/ig, "fill: currentColor")
                            .replace(/stroke:\s*(black|#000000|#000)\b/ig, "stroke: currentColor");
        if (newStyle !== style) {
          el.setAttribute("style", newStyle);
        }
      }
    }
  }

  function namespaceSVGs(root) {
    for (const svg of root.querySelectorAll("svg")) {
      const prefix = "svg-" + Math.random().toString(36).substr(2, 6) + "-";
      
      const elementsWithId = svg.querySelectorAll("[id]");
      const idMap = new Map();
      
      for (const el of elementsWithId) {
        const oldId = el.getAttribute("id");
        if (oldId) {
          const newId = prefix + oldId;
          idMap.set(oldId, newId);
          el.setAttribute("id", newId);
        }
      }
      
      for (const el of svg.querySelectorAll("*")) {
        for (const attr of [...el.attributes]) {
          const val = attr.value;
          if (val.includes("url(#")) {
            let newVal = val;
            for (const [oldId, newId] of idMap.entries()) {
              newVal = newVal.replace(`url(#${oldId})`, `url(#${newId})`)
                             .replace(`url("#${oldId}")`, `url("#${newId}")`)
                             .replace(`url('#${oldId}')`, `url('#${newId}')`);
            }
            if (newVal !== val) el.setAttribute(attr.name, newVal);
          }
          if ((attr.name === "href" || attr.name === "xlink:href") && val.startsWith("#")) {
            const oldId = val.substring(1);
            if (idMap.has(oldId)) el.setAttribute(attr.name, "#" + idMap.get(oldId));
          }
        }
      }
      
      for (const style of svg.querySelectorAll("style")) {
        let cssText = style.textContent;
        for (const [oldId, newId] of idMap.entries()) {
          cssText = cssText.split(`url(#${oldId})`).join(`url(#${newId})`)
                           .split(`url("#${oldId}")`).join(`url("#${newId}")`)
                           .split(`url('#${oldId}')`).join(`url('#${newId}')`);
        }
        const classes = new Set();
        const classRegex = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
        let match;
        while ((match = classRegex.exec(cssText)) !== null) {
          classes.add(match[1]);
        }
        for (const c of classes) {
          const re = new RegExp(`\\.${c}(?=[^a-zA-Z0-9_-]|$)`, "g");
          cssText = cssText.replace(re, `.${prefix}${c}`);
          for (const el of svg.querySelectorAll(`.${c}`)) {
            el.classList.remove(c);
            el.classList.add(`${prefix}${c}`);
          }
        }
        style.textContent = cssText;
      }
    }
  }

  /** Wrap all children of an element with a new tag (e.g. <u>, <strong>) */
  function wrapChildrenWith(el, tagName) {
    // Don't double-wrap if the element itself is already that tag
    if ((el.localName || el.tagName || "").toLowerCase() === tagName) return;
    // Don't wrap if a direct child wrapper already exists
    if (el.children.length === 1 && (el.children[0].localName || "").toLowerCase() === tagName) return;
    const wrapper = document.createElement(tagName);
    while (el.firstChild) wrapper.appendChild(el.firstChild);
    el.appendChild(wrapper);
  }

  function sanitizeUrlAttribute(el, attrName, value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return false;
    if (attrName.toLowerCase() === "href" && trimmed.startsWith("#")) {
      el.setAttribute(attrName, trimmed);
      return true;
    }
    if (attrName.toLowerCase() === "src" && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(trimmed)) {
      return true;
    }
    try {
      const url = new URL(trimmed, COLLEGE_BOARD_BASE_URL);
      if (url.protocol !== "https:" && url.protocol !== "http:") return false;
      el.setAttribute(attrName, url.href);
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeAccessibilityDescriptions(root) {
    const selectors = [
      "[class*='sr-only' i]", "[class*='screen-reader' i]", "[class*='visually-hidden' i]",
      "[class*='offscreen' i]", "[class*='accessib' i]", "[class*='a11y' i]",
      "[data-testid*='accessib' i]",
      "[style*='position: absolute'][style*='clip']",
      "[style*='position:absolute'][style*='clip']",
    ];
    for (const el of root.querySelectorAll(selectors.join(","))) {
      if (/^_+$/.test(el.textContent.trim())) {
        continue;
      }
      el.remove();
    }
  }

  function isLikelyGraphicDescription(text) {
    if (!text) return false;
    return /(?:the\s+(?:line|graph|curve|figure|scatterplot|bar\s*graph|circle|parabola|equation|point)|passes\s+through|approximate\s+points?|slants|horizontal\s+axis|vertical\s+axis|data\s+for\s+the\s+\d+\s+categories|x-axis|y-axis|coordinate\s+plane|origin\s+at|plotted\s+(?:on|in|at)|labeled\s+from|number\s+line|grid\s+lines?|tick\s+marks?)/i.test(text);
  }

  function normalizeMathMarkup(root) {
    for (const fenced of [...root.querySelectorAll("mfenced")]) {
      const row = document.createElementNS("http://www.w3.org/1998/Math/MathML", "mrow");
      const openAttr = fenced.getAttribute("open");
      const closeAttr = fenced.getAttribute("close");
      const sepsAttr = fenced.getAttribute("separators");
      
      const open = openAttr !== null ? openAttr : "(";
      const close = closeAttr !== null ? closeAttr : ")";
      const seps = sepsAttr !== null ? sepsAttr : "";
      
      const children = [...fenced.children];
      if (open) row.append(makeMathOp(open));
      children.forEach((child, i) => {
        if (i > 0 && seps.length > 0) {
           const sep = seps[Math.min(i - 1, seps.length - 1)] || "";
           if (sep.trim() !== "") row.append(makeMathOp(sep));
        }
        row.append(child);
      });
      if (close) row.append(makeMathOp(close));
      fenced.replaceWith(row);
    }
  }

  function makeMathOp(value) {
    const op = document.createElementNS("http://www.w3.org/1998/Math/MathML", "mo");
    op.textContent = value;
    return op;
  }

  /** Convert a MathML DOM element to a LaTeX string */
  function mathmlToLatex(node) {
    const SPECIAL_CHARS = {
      "\u2212": "-", "\u00D7": "\\times ", "\u00F7": "\\div ", "\u2264": "\\leq ",
      "\u2265": "\\geq ", "\u2260": "\\neq ", "\u03C0": "\\pi ", "\u221E": "\\infty ",
      "\u2248": "\\approx ", "\u00B7": "\\cdot ", "\u00B1": "\\pm ", "\u2219": "\\cdot ",
      "\u2026": "\\ldots ", "\u22C5": "\\cdot ", "\u2061": "", "\u2062": "\\, ",
      "\u2063": "\\, ", "\u2064": ""
    };

    function convert(el) {
      if (el.nodeType === Node.TEXT_NODE) {
        return el.textContent;
      }
      if (el.nodeType !== Node.ELEMENT_NODE) return "";

      const tag = el.localName || el.tagName?.toLowerCase() || "";
      const children = [...el.childNodes];

      function convertChildren() {
        return children.map(c => convert(c)).join("");
      }

      switch (tag) {
        case "math":
        case "mrow":
        case "mstyle":
        case "mpadded":
        case "mphantom":
        case "menclose":
          return convertChildren();

        case "mn":
        case "mi": {
          const text = el.textContent || "";
          // Map special chars that might appear in mi
          if (text.length === 1 && SPECIAL_CHARS[text]) return SPECIAL_CHARS[text];
          return text.replace(/\\/g, "\\\\").replace(/%/g, "\\%");
        }

        case "mo": {
          const rawText = el.textContent || "";
          const text = rawText.trim();
          if (text === "" && rawText.length > 0) return "\\; ";
          if (SPECIAL_CHARS[text]) return SPECIAL_CHARS[text];
          // Map some common operator names
          if (text === "(" || text === ")" || text === "[" || text === "]" ||
              text === "{" || text === "}" || text === "|" ||
              text === "+" || text === "-" || text === "=" ||
              text === "<" || text === ">" || text === "," ||
              text === "." || text === "!" || text === ":" ||
              text === ";") return text;
          if (text === "\u2223" || text === "\u2225") return "\\mid ";
          return text.replace(/\\/g, "\\\\").replace(/%/g, "\\%");
        }

        case "mtext": {
          const text = el.textContent || "";
          if (!text.trim()) return "\\; ";
          return "\\text{" + text.replace(/\\/g, "\\\\").replace(/%/g, "\\%") + "}";
        }

        case "mspace":
          return "\\; ";

        case "msup": {
          const parts = [...el.children];
          if (parts.length < 2) return convertChildren();
          return "{" + convert(parts[0]) + "}^{" + convert(parts[1]) + "}";
        }

        case "msub": {
          const parts = [...el.children];
          if (parts.length < 2) return convertChildren();
          return "{" + convert(parts[0]) + "}_{" + convert(parts[1]) + "}";
        }

        case "msubsup": {
          const parts = [...el.children];
          if (parts.length < 3) return convertChildren();
          return "{" + convert(parts[0]) + "}_{" + convert(parts[1]) + "}^{" + convert(parts[2]) + "}";
        }

        case "mfrac": {
          const parts = [...el.children];
          if (parts.length < 2) return convertChildren();
          return "\\frac{" + convert(parts[0]) + "}{" + convert(parts[1]) + "}";
        }

        case "msqrt":
          return "\\sqrt{" + convertChildren() + "}";

        case "mroot": {
          const parts = [...el.children];
          if (parts.length < 2) return "\\sqrt{" + convertChildren() + "}";
          return "\\sqrt[" + convert(parts[1]) + "]{" + convert(parts[0]) + "}";
        }

        case "mover": {
          const parts = [...el.children];
          if (parts.length < 2) return convertChildren();
          const over = (parts[1].textContent || "").trim();
          const base = convert(parts[0]);
          if (over === "\u00AF" || over === "\u0305" || over === "\u2015" || over === "\u203E") return "\\overline{" + base + "}";
          if (over === "^" || over === "\u0302") return "\\hat{" + base + "}";
          if (over === "~" || over === "\u0303") return "\\tilde{" + base + "}";
          if (over === "\u2192") return "\\overrightarrow{" + base + "}";
          if (over === "\u02D9" || over === ".") return "\\dot{" + base + "}";
          return "\\overset{" + convert(parts[1]) + "}{" + base + "}";
        }

        case "munder": {
          const parts = [...el.children];
          if (parts.length < 2) return convertChildren();
          const under = (parts[1].textContent || "").trim();
          const base = convert(parts[0]);
          if (under === "\u00AF" || under === "_") return "\\underline{" + base + "}";
          return "\\underset{" + convert(parts[1]) + "}{" + base + "}";
        }

        case "munderover": {
          const parts = [...el.children];
          if (parts.length < 3) return convertChildren();
          return "\\underset{" + convert(parts[1]) + "}{\\overset{" + convert(parts[2]) + "}{" + convert(parts[0]) + "}}";
        }

        case "mfenced": {
          const openAttr = el.getAttribute("open");
          const closeAttr = el.getAttribute("close");
          const sepsAttr = el.getAttribute("separators");
          const open = openAttr !== null ? openAttr : "(";
          const close = closeAttr !== null ? closeAttr : ")";
          const seps = sepsAttr !== null ? sepsAttr : ",";
          const parts = [...el.children];
          let result = open;

          let useSeps = sepsAttr !== null;
          if (!useSeps) {
            const allMrow = parts.length > 1 && parts.every(p => (p.localName || p.tagName?.toLowerCase()) === "mrow");
            if (allMrow) useSeps = true;
          }

          parts.forEach((child, i) => {
            if (i > 0 && useSeps && seps.length > 0) {
              const sep = seps[Math.min(i - 1, seps.length - 1)] || "";
              if (sep.trim()) result += sep;
            }
            result += convert(child);
          });
          result += close;
          return result;
        }

        case "mtable": {
          const rows = [...el.children].filter(c => (c.localName || c.tagName?.toLowerCase()) === "mtr");
          const body = rows.map(row => {
            const cells = [...row.children].filter(c => (c.localName || c.tagName?.toLowerCase()) === "mtd");
            return cells.map(cell => convert(cell)).join(" & ");
          }).join(" \\\\ ");
          return "\\begin{array}{}" + body + "\\end{array}";
        }

        case "mtr": {
          const cells = [...el.children].filter(c => (c.localName || c.tagName?.toLowerCase()) === "mtd");
          return cells.map(cell => convert(cell)).join(" & ");
        }

        case "mtd":
          return convertChildren();

        case "mmultiscripts":
        case "mprescripts":
        case "none":
          return convertChildren();

        default:
          return convertChildren();
      }
    }

    return convert(node);
  }

  /** Post-render: try to render MathML via KaTeX if available */
  function renderMath(container) {
    if (!window.renderMathInElement && !window.katex) return;
    try {
      if (window.renderMathInElement) {
        window.renderMathInElement(container, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
          ],
          throwOnError: false
        });
      }
    } catch (_) { /* ignore */ }

    // Convert native MathML elements to KaTeX
    if (window.katex) {
      for (const mathEl of [...container.querySelectorAll("math")]) {
        try {
          let latex = mathmlToLatex(mathEl);
          if (!latex) continue;
          latex = latex.replace(/([(\[{|])\s*,\s*/g, "$1").replace(/\s*,\s*([)\]}|])/g, "$1");
          const span = document.createElement("span");
          katex.render(latex, span, { throwOnError: false, displayMode: mathEl.getAttribute("display") === "block" });
          mathEl.replaceWith(span);
        } catch (_) { /* leave native math element */ }
      }
    }
  }

  /* ===========================================================
     UTILITIES
     =========================================================== */

  let noticeTimer = null;
  function showNotice(text, type) { 
    state.notice = { text, type }; 
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      if (state.notice && state.notice.text === text) {
        state.notice = null;
        dismissNoticeUI();
      }
    }, 5000);
  }

  function dismissNoticeUI() {
    const noticeEl = document.querySelector('.notice');
    if (noticeEl) {
      noticeEl.style.transition = 'all 0.3s ease';
      noticeEl.style.opacity = '0';
      noticeEl.style.transform = 'translateY(-10px)';
      setTimeout(() => {
         if (noticeEl.parentNode) noticeEl.parentNode.removeChild(noticeEl);
      }, 300);
    }
  }

  function showBackupMsg(text, type = "success") {
    state.backupMessage = { text, type };
    showNotice(text, type);
    renderHome();
  }
  async function copyText(text) {
    try {
      if (!navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      return false;
    }
  }
  function findDomainLabel(subject, code) { return (DOMAIN_FALLBACKS[subject] || []).find(d => d.code === code)?.label || ""; }
  function isAnsweredResponse(r) { return r?.isAnswered !== false && hasAnswer(r?.answer); }
  function formatPercent(v) { return `${Math.round((v || 0) * 100)}%`; }

  function formatTimer(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds || 0));
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  function formatSessionDate(value) {
    if (!value) return "Completed test";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function shuffle(values) {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function dedupeBy(values, keyFn) {
    const seen = new Set();
    return values.filter(v => { const k = keyFn(v); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function uid(prefix) {
    return crypto.randomUUID ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
  }

  function letterAt(i) { return String.fromCharCode(65 + i); }

  function isRelativeUrl(v) { return Boolean(v) && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(v); }

  function stripHtml(v) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(v || "");
    return tpl.content.textContent || "";
  }

  function stripHtmlToText(html) {
    if (!html) return "";
    var s = String(html);
    
    let prev;
    do {
      prev = s;
      // Remove SVG elements entirely (inline icons/graphs)
      s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
    } while (s !== prev);

    do {
      prev = s;
      // Remove style blocks
      s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    } while (s !== prev);

    do {
      prev = s;
      // Remove all HTML tags
      s = s.replace(/<[^>]+>/gm, '');
    } while (s !== prev);

    // Decode common HTML entities safely in one pass to avoid double-unescaping
    const entities = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'" };
    s = s.replace(/&(?:nbsp|amp|lt|gt|quot|#039);/gi, m => entities[m.toLowerCase()] || m);
    // Clean up LaTeX: \text{content} → content
    s = s.replace(/\\text\{([^}]*)\}/g, '$1');
    // \textbf{content} → content
    s = s.replace(/\\textbf\{([^}]*)\}/g, '$1');
    // \textit{content} → content
    s = s.replace(/\\textit\{([^}]*)\}/g, '$1');
    // \frac{a}{b} → a/b
    s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2');
    // \sqrt{x} → √x
    s = s.replace(/\\sqrt\{([^}]*)\}/g, '√$1');
    // \left, \right, \cdot, \times, \div, \pm, \leq, \geq, \neq
    s = s.replace(/\\left/g, '').replace(/\\right/g, '');
    s = s.replace(/\\cdot/g, '·').replace(/\\times/g, '×').replace(/\\div/g, '÷');
    s = s.replace(/\\pm/g, '±').replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\neq/g, '≠');
    s = s.replace(/\\pi/g, 'π').replace(/\\infty/g, '∞');
    // Remove remaining \command sequences (e.g. \overline, \mathbb, etc.)
    s = s.replace(/\\[a-zA-Z]+/g, '');
    // Remove leftover braces from LaTeX
    s = s.replace(/[{}]/g, '');
    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function escapeHtml(v) {
    return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttr(v) { return escapeHtml(v); }
})();
