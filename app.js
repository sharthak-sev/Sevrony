(function () {
  "use strict";

  const APP_VERSION = "v2.1.1";
  const DB = window.SatPracticeDB;
  const app = document.querySelector("#app");
  const fileInput = document.querySelector("#fileInput");
  const TELEMETRY_CONSENT_KEY = "sevrony.telemetryConsent";
  const TELEMETRY_ACCEPTED = "accepted";
  const TELEMETRY_DECLINED = "declined";
  const POSTHOG_TOKEN = "phc_sChR2EdGVdwA9yins4d7MeNqiHUqEiicXcTtM3DZ7cPn";
  const POSTHOG_API_HOST = "https://us.i.posthog.com";
  const SENTRY_LOADER_URL = "https://js.sentry-cdn.com/610da841a6875eae790cbc1fd6ea96b1.min.js";
  const COLLEGE_BOARD_BASE_URL = "https://mypractice.collegeboard.org/";
  const TUTORIAL_DONE_KEY = "sevrony.tutorial.v1.done";
  const TUTORIAL_STEPS = [
    {
      selector: "[data-tour-target='dashboard-hero']",
      title: "Your dashboard",
      body: "This is the command center for imported questions, accuracy, timing, and weak areas."
    },
    {
      selector: "[data-tour-target='create-test']",
      title: "Start practice",
      body: "Create adaptive drills or full sections from your imported SAT question bank."
    },
    {
      selector: "[data-tour-target='metrics']",
      title: "Track what changed",
      body: "These cards update from completed sessions and deduped responses, so deleted tests no longer linger."
    },
    {
      selector: "[data-tour-target='history-nav']",
      title: "Review past work",
      body: "Past Tests keeps full tests, Bluebook imports, reviews, retries, and deletion controls in one place."
    },
    {
      selector: "[data-tour-target='sync'], [data-tour-target='backup-nav']",
      title: "Sync and backups",
      body: "Use Data & Backups to link Google Drive sync, restore data, or reconnect when the indicator turns orange."
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
    backupHandle: null,
    backupMessage: null,
    view: "dashboard",
    historyTab: "full",
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
    busy: null,
    tutorial: {
      active: false,
      step: 0,
      previousFocus: null
    },
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
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    window.addEventListener("popstate", (e) => {
      if (e.state) {
        state.view = e.state.view || "dashboard";
        state.reviewSessionId = e.state.reviewSessionId || null;
        state.historyTab = e.state.historyTab || "full";
        state.viewSubject = e.state.viewSubject || null;
        lastPushedStateStr = JSON.stringify(e.state);
        if (!state.activeTest) renderHome(true);
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

    initPersistentDesmos();
    initTelemetryConsent();
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
    await restoreActiveTest();
    ensureConfigDefaults();

    // Cloud sync: register for background sync updates from other devices
    if (window.SevSync) {
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
    if (window.SevSync?.isLinked()) {
      SevSync.sync(false, { silent: true }).then(result => {
        if (result.ok && result.localChanged) refreshLocalData().then(() => renderHome());
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

      const fullTests = state.sessions.filter(s => s.mode === "full" || s.mode === "bluebook");
      const subjectTests = state.sessions.filter(s => s.mode !== "full" && s.mode !== "bluebook");
      if (fullTests.length === 0 && subjectTests.length > 0) {
        state.historyTab = "subject";
      }

      if (window.location.hash) {
        const hashView = window.location.hash.slice(1);
        if (["dashboard", "history", "config", "mistakes", "mistakes-log", "results", "review", "marketing", "privacy"].includes(hashView)) {
           state.view = hashView;
        }
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
      renderHome(false, true);
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
      renderActiveTest();
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
      return value === TELEMETRY_ACCEPTED || value === TELEMETRY_DECLINED ? value : null;
    } catch (_) {
      return null;
    }
  }

  function isTelemetryAccepted() {
    return state.telemetryConsent === TELEMETRY_ACCEPTED;
  }

  function setTelemetryConsent(value) {
    if (value !== TELEMETRY_ACCEPTED && value !== TELEMETRY_DECLINED) return;
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
    if (state.telemetryConsent) return;

    const banner = document.createElement("section");
    banner.className = "telemetry-banner";
    banner.setAttribute("aria-label", "Telemetry consent");
    banner.innerHTML = `
      <div>
        <strong>Privacy choice</strong>
        <p>Sevrony stores study data locally. With your consent, the hosted app loads PostHog and Sentry for usage stats and issue reports.</p>
      </div>
      <div class="telemetry-actions">
        <button type="button" class="ghost-btn" data-telemetry-action="details">Details</button>
        <button type="button" class="ghost-btn" data-telemetry-action="decline">Decline</button>
        <button type="button" class="primary-btn" data-telemetry-action="accept">Accept</button>
      </div>
    `;
    banner.querySelector("[data-telemetry-action='accept']").addEventListener("click", () => {
      setTelemetryConsent(TELEMETRY_ACCEPTED);
      captureTelemetry("Telemetry Consent Accepted");
    });
    banner.querySelector("[data-telemetry-action='decline']").addEventListener("click", () => {
      setTelemetryConsent(TELEMETRY_DECLINED);
    });
    banner.querySelector("[data-telemetry-action='details']").addEventListener("click", () => {
      state.view = "privacy";
      state.notice = null;
      renderHome();
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
        person_profiles: "identified_only",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        disable_session_recording: true,
        disable_surveys: true,
        enable_heatmaps: false,
        mask_all_text: true,
        mask_all_element_attributes: true,
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
      questions: state.questions.filter(record => !isDeletedRecord(record)),
      sessions: state.sessions.filter(record => !isDeletedRecord(record)),
      responses: dedupeResponses(state.responses)
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

  async function refreshLocalData() {
    const [banks, questions, sessions, oldResponses] = await Promise.all([
      DB.getAll("questionBanks"),
      DB.getAll("questions"),
      DB.getAll("sessions"),
      DB.getAll("responses")
    ]);

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

    const backupConf = await DB.get("appConfig", "backupHandle");
    state.backupHandle = backupConf ? backupConf.handle : null;
  }

  /* ===========================================================
     RENDERING — HOME VIEWS
     =========================================================== */

  let _currentRoute = null;

  function setBusy(title, detail, variant = "sync", progress = null) {
    state.busy = { title, detail, variant, progress };
    renderHome(true, true);
  }

  function clearBusy(shouldRender = true) {
    state.busy = null;
    if (shouldRender) renderHome(true, true);
  }

  function renderBusyView(busy) {
    const title = escapeHtml(busy?.title || "Working");
    const detail = escapeHtml(busy?.detail || "Please wait while Sevrony updates your local data.");
    const variant = busy?.variant || "restore";
    const label = variant === "restore"
      ? "Restoring local data"
      : variant === "import"
        ? "Importing files"
        : "Syncing account";

    let visualElement = "";
    if (variant === "import" || variant === "restore") {
      const isIndet = busy?.progress == null;
      const progressWidth = isIndet ? "" : `style="width: ${busy.progress}%"`;
      const fillClass = isIndet ? "shadcn-progress-fill indeterminate" : "shadcn-progress-fill";
      
      visualElement = `
        <div class="shadcn-progress-container">
          <div class="shadcn-progress-label"><span>${title}</span><span class="muted">${isIndet ? "Processing..." : busy.progress + "%"}</span></div>
          <div class="shadcn-progress-bg"><div class="${fillClass}" ${progressWidth}></div></div>
        </div>
      `;
    } else {
      visualElement = `
        <div class="shadcn-spinner-container">
          <svg class="shadcn-loader" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <p class="muted">Establishing secure connection...</p>
        </div>
      `;
    }

    return `
      <main class="busy-shell" aria-busy="true" aria-live="polite">
        <section class="busy-card" role="status" aria-label="${escapeAttr(label)}">
          <div class="busy-card-header">
            <div>
              <p class="eyebrow">Sevrony is updating</p>
              <h1>${title}</h1>
              <p>${detail}</p>
            </div>
          </div>
          ${visualElement}
        </section>
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
    if (!isIosSafariWarningNeeded()) return "";
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

    if (state.busy) {
      app.className = "";
      app.innerHTML = renderBusyView(state.busy);
      return;
    }

    if (state.questions.length === 0 && ["dashboard", "history", "config", "mistakes", "mistakes-log", "results", "review", "marketing"].includes(state.view)) {
      state.view = "onboarding";
    }

    if (!skipPush) pushHistoryState(replace);

    if (state.view === "onboarding" || state.view === "backup") {
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
        ${renderSidebar()}
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
            ${state.view === "backup" ? renderBackupView() : ""}
          </main>
        </div>
      `;
      bindHomeEvents();
    });
  }

  function renderPrivacy() {
    const consentLabel = state.telemetryConsent === TELEMETRY_ACCEPTED
      ? "Accepted"
      : state.telemetryConsent === TELEMETRY_DECLINED
        ? "Declined"
        : "Not chosen";
    return `
      <main class="page-container" style="max-width: 800px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px; display: flex; align-items: center; gap: 16px;">
          <button type="button" data-action="dashboard" class="ghost-btn icon-btn" style="padding: 8px; border-radius: 50%;" aria-label="Go back">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div>
            <h1 style="font-size: 2.5rem; margin-bottom: 8px; margin-top: 0;">Privacy Policy</h1>
            <p class="eyebrow" style="margin: 0; color: var(--muted-foreground);">Last updated: June 2026</p>
          </div>
        </div>
        
        <div class="panel" style="padding: 32px; display: flex; flex-direction: column; gap: 24px;">
          <div>
            <h2 style="font-size: 1.5rem; margin-top: 0; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--green);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Local Study Data
            </h2>
            <p style="line-height: 1.6; color: var(--muted-foreground);">
              Sevrony stores imported question banks, answers, timings, backups, and test history in your browser using IndexedDB.
              The app has no backend database for your study data. Manual and automatic backups are files you create or folders you choose.
            </p>
          </div>

          <div>
            <h2 style="font-size: 1.5rem; margin-top: 0; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--blue);"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
              Cloud Sync (Optional)
            </h2>
            <p style="line-height: 1.6; color: var(--muted-foreground);">
              If you enable cloud sync, Sevrony authenticates with Google to read and write a sync file in your own Google Drive's application data folder.
              This folder is private to Sevrony and not visible in your regular Drive. Your study data goes directly from your browser to your Google Drive — it does not pass through any Sevrony server.
              You can unlink your account at any time in Data & Backups, or revoke access from <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style="color: var(--blue);">Google's app permissions page</a>.
            </p>
          </div>

          <div>
            <h2 style="font-size: 1.5rem; margin-top: 0; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--blue);"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
              Optional Telemetry
            </h2>
            <p style="line-height: 1.6; color: var(--muted-foreground);">
              Telemetry is off until you accept it. If accepted, the hosted app loads <strong>PostHog</strong> for product analytics and <strong>Sentry</strong> for crash/error reports. Autocapture and session recording are disabled, and events avoid file names, answers, question text, and exact scores.
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
            The authentic Bluebook practice experience. Zero accounts, zero costs. Focus purely on your score.
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
      <div class="font-marketing min-h-[80vh] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
        <div class="w-full max-w-3xl border border-border bg-card text-card-foreground rounded-xl shadow-sm opacity-0 animate-fade-in-up">
          
          <!-- Header (Returning User) -->
          <div class="flex flex-col items-center justify-center space-y-4 p-8 border-b border-border text-center bg-muted/20" style="background: rgba(0,0,0,0.02);">
            <h2 class="text-xl font-bold text-foreground" style="margin: 0;">Returning User?</h2>
            <p class="text-sm text-muted-foreground" style="margin: 0; max-width: 400px;">Login to Google Drive to restore your existing practice data, sessions, and dashboard metrics.</p>
            <div class="flex items-center gap-3 mt-4" style="margin-top: 16px;">
              <button class="primary-btn" type="button" data-action="returning-sign-in">Sign in and restore</button>
            </div>
          </div>
          
          <div class="relative flex justify-center" style="margin-top: -14px;">
            <span class="bg-card px-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest border border-border shadow-sm" style="border-radius: 20px; background: var(--paper); padding: 4px 16px;">OR</span>
          </div>

          <!-- Content (New User) -->
          <div class="p-8 pt-6 space-y-8">
            <div class="text-center mb-8">
              <h2 class="text-2xl font-bold tracking-tight text-foreground" style="margin: 0;">New User Setup</h2>
              <p class="text-sm text-muted-foreground mt-2" style="margin: 8px 0 0 0;">Import your practice questions to begin.</p>
            </div>
            
            <!-- Step 1 -->
            <div class="flex gap-4">
              <div class="flex flex-col items-center">
                <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm z-10 shrink-0">1</div>
                <div class="w-px h-full bg-border mt-2"></div>
              </div>
              <div class="pb-8 flex-1">
                <h3 class="text-lg font-semibold text-foreground" style="margin: 0;">Install the Exporter Extension</h3>
                <ol class="mt-2 text-sm text-muted-foreground list-decimal list-inside space-y-1" style="margin: 8px 0 0 0; padding-left: 0;">
                  <li>Download and extract the ZIP file below.</li>
                  <li>Open Chrome (or Edge) and go to <strong class="text-foreground">Extensions</strong>.</li>
                  <li>Enable <strong class="text-foreground">Developer mode</strong> (top right).</li>
                  <li>Click <strong class="text-foreground">Load unpacked</strong> and select the extracted folder.</li>
                </ol>
                <div class="flex flex-wrap gap-3 mt-4">
                  <a href="https://github.com/sharthak-sev/sat-qb-exporter/archive/refs/heads/main.zip" class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 shadow-sm cursor-pointer" style="text-decoration: none;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    Download ZIP
                  </a>
                  <a href="https://github.com/sharthak-sev/sat-qb-exporter" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 cursor-pointer shadow-sm" style="text-decoration: none;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
                    View on GitHub
                  </a>
                </div>
              </div>
            </div>
            
            <!-- Step 2 -->
            <div class="flex gap-4">
              <div class="flex flex-col items-center">
                <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm z-10 shrink-0">2</div>
                <div class="w-px h-full bg-border mt-2"></div>
              </div>
              <div class="pb-8 flex-1">
                <h3 class="text-lg font-semibold text-foreground" style="margin: 0;">Export your Data</h3>
                <p class="mt-2 text-sm text-muted-foreground leading-relaxed" style="margin: 8px 0 0 0;">
                  Log into <a href="https://mypractice.collegeboard.org/questionbank/search" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium" style="text-decoration: none;">mypractice.collegeboard.org</a>. Once authenticated, open the extension popup, choose your desired filters, and click <strong class="text-foreground">Export as Interactive Test</strong>.
                </p>
              </div>
            </div>
            
            <!-- Step 3 -->
            <div class="flex gap-4">
              <div class="flex flex-col items-center">
                <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm z-10 shrink-0">3</div>
              </div>
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-foreground" style="margin: 0;">Import to Sevrony</h3>
                <div class="drop-zone mt-4 border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer group" data-action="import" style="margin-top: 16px;">
                  <div class="flex justify-center mb-3 text-muted-foreground group-hover:text-primary transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                  </div>
                  <p class="text-sm font-medium text-foreground" style="margin: 0;">Click here or drag your <strong class="text-primary">.sat-test</strong> file</p>
                  <p class="text-xs text-muted-foreground mt-1" style="margin: 4px 0 0 0;">to begin your practice</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  function renderSyncWidget() {
    if (!window.SevSync?.isLinked()) return "";
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
            <button class="nav-item ${state.view === 'mistakes-log' ? 'active' : ''}" type="button" data-action="mistakes-log" title="Mistakes Log">
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
    return `
      <section class="notice ${notice.type || "info"}">
        <p>${escapeHtml(notice.text)}</p>
        <button type="button" data-action="dismiss-notice" aria-label="Dismiss" style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; padding: 0;">
          <svg viewBox="0 0 24 24" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; transform: rotate(-90deg);">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity="0.2" />
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="62.83" stroke-dashoffset="0" style="animation: notice-countdown 5s linear forwards;" />
          </svg>
          <span style="position: relative; z-index: 1; font-size: 12px;">✕</span>
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
    const data = calculateStreakData(state.sessions);
    const today = new Date();
    today.setHours(0,0,0,0);

    const weekDots = data.week.map((w, index) => {
      let isCompleted = w.active;
      let isToday = w.isToday;
      let isFuture = w.isFuture;
      
      let dayLabel = w.day.slice(0,1);

      let boxStyle = `position: relative; display: flex; width: 100%; aspect-ratio: 1/1; max-width: 48px; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid; transition: all 0.2s; margin: 0 auto; box-sizing: border-box;`;
      
      let icon = "";
      if (isFuture) {
        boxStyle += `border-color: color-mix(in srgb, var(--line, #e2e8f0) 40%, transparent); background: color-mix(in srgb, var(--panel-alt, #f8fafc) 20%, transparent); opacity: 0.5;`;
      } else if (isCompleted) {
        boxStyle += `border-color: var(--ink, #0f172a); background: var(--ink, #0f172a);`;
        icon = `<svg xmlns="http://www.w3.org/2000/svg" style="width: 45%; height: 45%; max-width: 24px; max-height: 24px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
      } else {
        boxStyle += `border-color: var(--line, #e2e8f0); background: color-mix(in srgb, var(--panel-alt, #f8fafc) 30%, transparent);`;
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
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ink, #0f172a)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
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
    const metrics = buildMetrics(state.questions, state.responses);
    const mathCount = metrics.bank.bySubject.math || 0;
    const rwCount = metrics.bank.bySubject.rw || 0;

    if (!state.questions.length) {
      return `
        <section class="hero-card empty-state">
          <div>
            <p class="eyebrow">Welcome</p>
            <h1>Import a question bank to begin practicing.</h1>
            <p>Everything runs locally — no accounts, servers, or costs. Your data stays in this browser's IndexedDB.</p>
          </div>
          <button class="primary-btn large" type="button" data-action="import">Import .sat-test File</button>
        </section>
      `;
    }

    return `
      <div class="hero-actions" style="display: flex; justify-content: space-between; margin-bottom: 32px; gap: 16px;" data-tour-target="dashboard-hero">
        <div>
          <h1 style="font-size: 32px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 4px;">Dashboard</h1>
          <p style="color: var(--ink-muted); font-size: 15px; margin: 0;">${state.banks.length} imported bank${state.banks.length === 1 ? "" : "s"} · ${state.questions.length} total questions</p>
        </div>
        <div class="top-actions" style="display:flex;gap:12px;flex-wrap:wrap;">
          <button class="ghost-btn" type="button" data-action="retry-mistakes" style="background:var(--paper); border-color:var(--line); padding: 8px 16px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-3px"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
            Retry Mistakes
          </button>
          <button class="primary-btn" type="button" data-action="config" data-tour-target="create-test" style="padding: 8px 16px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-3px"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Create New Test
          </button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 24px;">
        ${!window.SevSync?.isLinked() && !localStorage.getItem('sevrony.syncBannerDismissed') && state.banks.length > 0 ? `
        <section class="panel cloud-sync-banner" style="display: flex; align-items: center; gap: 16px; padding: 16px 24px; border-color: var(--blue); border-left: 4px solid var(--blue); background: color-mix(in srgb, var(--blue) 5%, var(--card));">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
          <div style="flex: 1;">
            <strong style="display: block; margin-bottom: 2px;">Your data isn't backed up to the cloud</strong>
            <span class="muted" style="font-size: 13px;">Enable cloud sync to access your data across devices.</span>
          </div>
          <div class="cloud-sync-actions" style="display: flex; gap: 8px; flex-shrink: 0;">
            <button class="secondary-btn" data-action="setup-cloud-sync" style="padding: 6px 16px; font-size: 13px;">Set Up</button>
            <button class="ghost-btn" data-action="dismiss-sync-banner" style="padding: 6px 12px; font-size: 13px;">Dismiss</button>
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

  function renderBackupView() {
    return `
      <section class="hero-card compact-hero">
        <div>
          <p class="eyebrow">Data & Backups</p>
          <h1>Manage your local data.</h1>
          <p>Secure your test history or transfer it between devices.</p>
        </div>
      </section>

      <section class="panel" style="margin-top: 32px;">
        <div class="panel-heading">
          <p class="eyebrow">Cloud Sync</p>
          <h2 style="display: flex; align-items: center; gap: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--blue);"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
            Google Drive Sync
          </h2>
        </div>
        <p class="muted" style="margin-bottom:16px;">Sync your data across devices using your Google account. Data is stored privately in your own Google Drive.</p>
         ${window.SevSync?.isLinked()
          ? (() => {
              const status = SevSync.getStatus();
              const ago = status.lastSynced ? (() => { const d = Math.round((Date.now() - new Date(status.lastSynced).getTime()) / 1000); if (d < 60) return 'just now'; if (d < 3600) return Math.floor(d/60) + ' min ago'; if (d < 86400) return Math.floor(d/3600) + 'h ago'; return Math.floor(d/86400) + 'd ago'; })() : 'never';
              const autoSyncActive = status.tokenValid;
              return `
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                  <div class="${autoSyncActive ? 'success-dot' : 'warning-dot'}" style="${!autoSyncActive ? 'background:var(--yellow,#eab308);' : ''}"></div>
                  <span>Linked: <strong>${escapeHtml(status.email || '')}</strong></span>
                </div>
                <p class="muted" style="margin-bottom:8px; font-size:13px;">Last synced: ${escapeHtml(ago)}</p>
                ${autoSyncActive
                  ? '<p class="muted" style="margin-bottom:16px; font-size:12px; color:var(--green,#22c55e);">✓ Auto-sync active — changes sync across devices automatically</p>'
                  : '<p class="muted" style="margin-bottom:16px; font-size:12px; color:var(--yellow,#eab308);">Session expired — tap Sync Now to reconnect</p>'
                }
                <div style="display: flex; gap: 8px;">
                  <button class="secondary-btn" data-action="force-cloud-sync">Sync Now</button>
                  <button class="ghost-btn" data-action="unlink-cloud-sync">Unlink Account</button>
                </div>
              `;
            })()
          : `<button class="secondary-btn" data-action="link-cloud-sync">
               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; margin-right: 6px;"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
               Link Google Account
             </button>`
        }
      </section>

      ${window.SevSync?.isLinked() ? `
      <section class="panel" style="margin-top: 32px; border-color: var(--red-border); background: var(--red-bg);">
        <div class="panel-heading">
          <p class="eyebrow" style="color: var(--red);">Account</p>
          <h2 style="color: var(--red);">Log Out</h2>
        </div>
        <p style="color: var(--red); opacity: 0.8; margin-bottom: 16px;">Your data will remain safe in the cloud.</p>
        <button class="danger-btn" type="button" data-action="logout">Log Out</button>
      </section>
      ` : ''}

      <section class="panel two-column" style="margin-top: 32px;">
        <div class="backup-col-left">
          <div class="panel-heading">
            <p class="eyebrow">Data Security</p>
            <h2>Automatic Backups</h2>
          </div>
          <p class="muted" style="margin-bottom:16px;">Link a backup folder to automatically save your progress after every test.</p>
          ${state.backupHandle 
            ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><div class="success-dot"></div><span>Backup folder linked</span><button class="ghost-btn" data-action="unlink-backup">Unlink</button></div>
               <button class="ghost-btn" data-action="force-backup">Sync Now</button>`
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
          <p class="eyebrow" style="color: var(--red);">Danger Zone</p>
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
    const selectedDifficulties = new Set(state.config.difficulties.length ? state.config.difficulties : ["E", "M", "H"]);
    const availableCount = countFilteredQuestions({
      ...state.config,
      domainCodes: [...selectedDomains],
      difficulties: [...selectedDifficulties]
    });

    return `
      <section class="hero-card config-hero">
        <div>
          <p class="eyebrow">Create New Test</p>
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
          <div class="panel-heading">
            <p class="eyebrow">Filters</p>
            <h2>Domains</h2>
          </div>
          <div class="check-grid">
            ${availableDomains.map(domain => `
              <label class="check-card">
                <input type="checkbox" name="domain" value="${escapeAttr(domain.code)}" ${selectedDomains.has(domain.code) ? "checked" : ""}>
                <span>${escapeHtml(domain.label)}</span>
                <small>${escapeHtml(domain.code)}</small>
              </label>
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
          <button class="primary-btn large" type="submit">Start Practice</button>
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

    let rwThetaSum = 0, mathThetaSum = 0, rwMods = 0, mathMods = 0;
    for (const s of mods) {
      if (s.subject === "rw") { rwThetaSum += s.theta; rwMods++; }
      if (s.subject === "math") { mathThetaSum += s.theta; mathMods++; }
    }
    const rwTheta = rwMods ? (rwThetaSum / rwMods) : 0;
    const mathTheta = mathMods ? (mathThetaSum / mathMods) : 0;

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
    const fullTests = state.sessions.filter(s => s.mode === "full" || s.mode === "bluebook");
    const subjectTests = state.sessions.filter(s => s.mode !== "full" && s.mode !== "bluebook");
    const sessions = state.historyTab === "full" ? fullTests : subjectTests;

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
    const fullTests = state.sessions.filter(s => s.mode === "full" || s.mode === "bluebook");
    const subjectTests = state.sessions.filter(s => s.mode !== "full" && s.mode !== "bluebook");
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

    const questionMap = new Map(state.questions.map(q => [q.id, q]));
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

    if (!state.reviewFilterSubject) state.reviewFilterSubject = "both";
    const responses = state.reviewFilterSubject === "both" 
      ? allResponses 
      : allResponses.filter(r => r.subject === state.reviewFilterSubject);

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
            ${summaryHtml}
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
      <section class="review-list ${state.reviewFilterIncorrect ? 'filter-incorrect' : ''} ${state.reviewFilterSkipped ? 'filter-skipped' : ''}">
        ${responses.length ? responses.map((r, i) => renderReviewedQuestion(questionMap.get(r.questionId), r, i)).join("") : `
          <article class="panel empty-message">${allResponses.length === 0 ? "No questions were answered." : "All questions were answered correctly!"}</article>
        `}
        <article class="panel empty-message css-empty-message" style="display: none;">No questions match those filters.</article>
      </section>
      
      <button class="primary-btn scroll-top-btn" type="button" data-action="scroll-top" aria-label="Scroll to top">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
      </button>
    `;
  }

  function renderReviewedQuestion(question, response, index) {
    const num = (response.sequence ?? index) + 1;
    const isSkipped = !isAnsweredResponse(response);
    const status = isSkipped ? "skipped" : response.isCorrect ? "correct" : "incorrect";
    /* Phase 4: Pretest badge */
    const pretestBadge = response.isPretest ? `<span class="status-pill" style="background:var(--zinc-200);color:var(--zinc-600);font-size:11px;">Unscored (Pretest)</span>` : "";
    if (!question) {
      return `
        <article class="panel review-card" data-status="${status}">
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
      <article class="panel review-card" data-status="${status}">
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
            <span class="time-pill">${formatDuration(response.timeSpentSeconds || 0)}</span>
            ${renderReviewStatus(response)}
          </div>
        </div>
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
      : state.responses;

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

    const questionMap = new Map(state.questions.map(q => [q.id, q]));
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
          subjects[sub].domains[q.domain] = { wrong: 0, skipped: 0, code: q.domainCode };
        }
        subjects[sub].domains[q.domain].wrong++;
      }
    }

    for (const q of skippedQuestions) {
      const sub = q.subject;
      if (subjects[sub]) {
        subjects[sub].skipped++;
        if (!subjects[sub].domains[q.domain]) {
          subjects[sub].domains[q.domain] = { wrong: 0, skipped: 0, code: q.domainCode };
        }
        subjects[sub].domains[q.domain].skipped++;
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
    if (!state.selectedMistakeTypes) {
      state.selectedMistakeTypes = new Set(["wrong", "skipped"]);
    }

    // Calculate selected count
    let selectedCount = 0;
    if (state.selectedMistakeTypes.has("wrong")) {
      selectedCount += wrongQuestions.filter(q => state.selectedMistakeDomains.has(q.domain)).length;
    }
    if (state.selectedMistakeTypes.has("skipped")) {
      selectedCount += skippedQuestions.filter(q => state.selectedMistakeDomains.has(q.domain)).length;
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

          return `
            <section class="panel">
              <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div>
                  <p class="eyebrow">${escapeHtml(sub.label)}</p>
                  <h2>${totalWrong + totalSkipped} total errors (${totalWrong} wrong · ${totalSkipped} omitted)</h2>
                </div>
                <div style="display:flex; gap:8px;">
                  <button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subKey}" data-value="all" style="font-size:12px; padding:4px 10px; min-height:28px;">Select All</button>
                  <button class="ghost-btn" type="button" data-action="toggle-mistake-subject" data-subject="${subKey}" data-value="none" style="font-size:12px; padding:4px 10px; min-height:28px;">Clear</button>
                </div>
              </div>
              <div class="check-grid">
                ${domEntries.map(([domName, data]) => `
                  <label class="check-card" style="height:auto; min-height:92px;">
                    <input type="checkbox" data-action="toggle-mistake-domain" data-domain="${escapeAttr(domName)}" ${state.selectedMistakeDomains.has(domName) ? "checked" : ""}>
                    <span>${escapeHtml(domName)}</span>
                    <small>${data.wrong} wrong · ${data.skipped} omitted</small>
                  </label>
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
          <button class="primary-btn large" type="button" data-action="start-retry-practice" ${selectedCount === 0 ? "disabled" : ""}>Start Retry</button>
        </section>
      </div>
    `;
  }

  function renderMistakesLog() {
    state.mistakesLog = state.mistakesLog || {
      expanded: new Set(),
      filterSubject: "all",
      filterDomain: "all",
      filterTags: new Set(),
      filterType: "all"
    };

    const MISTAKE_TAGS = ["Silly mistake", "Time crunch", "Conceptual error", "Misread question", "Calculation error", "Guessed"];

    const allMistakes = state.responses.filter(r => !r.isCorrect && r.sessionId !== "active_test");
    const questionsMap = new Map(state.questions.map(q => [q.id, q]));
    let validMistakes = allMistakes.filter(r => questionsMap.has(r.questionId));

    validMistakes.sort((a, b) => (b.answeredAt || 0) - (a.answeredAt || 0));

    if (state.mistakesLog.filterSubject !== "all") {
      validMistakes = validMistakes.filter(r => r.subject === state.mistakesLog.filterSubject);
    }
    if (state.mistakesLog.filterDomain !== "all") {
      validMistakes = validMistakes.filter(r => r.domainCode === state.mistakesLog.filterDomain);
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
    
    let allUsedTags = new Set(MISTAKE_TAGS);
    allMistakes.forEach(r => {
       if(r.tags) r.tags.forEach(t => allUsedTags.add(t));
    });

    return `
      <div id="mistakes-log-container">
        <div class="shadcn-card" style="margin-bottom: 24px;">
          <div class="shadcn-card-header">
            <div class="shadcn-card-title" style="font-size: 1.5rem;">Mistakes Log</div>
            <div class="shadcn-card-description">Review your past mistakes, add personal notes, and tag them to identify patterns.</div>
          </div>
          <div class="shadcn-card-content">
            <div class="shadcn-filters-row" style="margin-bottom: 16px;">
              <select class="styled-select" data-action="ml-change-subject">
                <option value="all">All Subjects</option>
                ${subjects.filter(s => s !== "all").map(s => `<option value="${s}" ${state.mistakesLog.filterSubject === s ? 'selected' : ''}>${SUBJECTS[s] || s}</option>`).join("")}
              </select>
              <select class="styled-select" data-action="ml-change-domain">
                <option value="all">All Domains</option>
                ${domains.filter(d => d !== "all").map(d => {
                  const fallback = DOMAIN_FALLBACKS[state.mistakesLog.filterSubject]?.find(f => f.code === d);
                  const label = fallback ? fallback.label : d;
                  return `<option value="${d}" ${state.mistakesLog.filterDomain === d ? 'selected' : ''}>${label}</option>`;
                }).join("")}
              </select>
              <select class="styled-select" data-action="ml-change-type">
                <option value="all" ${state.mistakesLog.filterType === 'all' || !state.mistakesLog.filterType ? 'selected' : ''}>Mix (All)</option>
                <option value="incorrect" ${state.mistakesLog.filterType === 'incorrect' ? 'selected' : ''}>Incorrect Only</option>
                <option value="omitted" ${state.mistakesLog.filterType === 'omitted' ? 'selected' : ''}>Omitted Only</option>
              </select>
            </div>
            <div class="shadcn-filters-row">
              ${Array.from(allUsedTags).map(tag => `
                <button type="button" data-action="ml-filter-tag" data-tag="${tag}" class="tag-badge ${state.mistakesLog.filterTags.has(tag) ? 'active' : ''}">
                  ${tag}
                </button>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="shadcn-card">
        <div class="shadcn-card-content" style="padding-top: 1.5rem;">
          <div class="shadcn-accordion">
            ${validMistakes.length === 0 ? `
              <div class="empty-state" style="padding: 2rem 0; text-align: center;">
                <p class="shadcn-card-description">No mistakes found matching your filters.</p>
              </div>
            ` : validMistakes.map(r => {
              const q = questionsMap.get(r.questionId);
              const isExpanded = state.mistakesLog.expanded.has(r.id);
              const dateStr = r.answeredAt ? new Date(r.answeredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "Unknown date";
              
              const titleTextParts = [];
              if (state.mistakesLog.filterSubject === "all") titleTextParts.push(SUBJECTS[r.subject] || r.subject);
              if (state.mistakesLog.filterDomain === "all") titleTextParts.push(r.domain);
              let titleText = titleTextParts.join(" • ");
              if (!titleText) titleText = "Question " + (q.number || q.id.slice(0, 5));

              const headerHtml = `
                <button type="button" class="shadcn-accordion-trigger" data-action="ml-toggle-card" data-id="${r.id}" aria-expanded="${isExpanded}">
                  <span style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left;">
                    <span style="font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      ${titleText}
                      ${(() => {
                        if (!q.difficulty || q.difficulty === "Unspecified") return "";
                        let bg = "var(--surface-2)"; let color = "inherit"; let border = "1px solid var(--line)";
                        const dLow = q.difficulty.toLowerCase();
                        if (dLow === "easy") { bg = "var(--green)"; color = "#fff"; border = "none"; }
                        else if (dLow === "medium") { bg = "var(--amber)"; color = "#fff"; border = "none"; }
                        else if (dLow === "hard") { bg = "var(--red)"; color = "#fff"; border = "none"; }
                        return `<span class="tag-badge" style="font-size:0.75em; padding:2px 6px; font-weight: normal; text-transform: capitalize; background: ${bg}; color: ${color}; border: ${border};">${q.difficulty}</span>`;
                      })()}
                      ${r.isAnswered === false ? `<span class="tag-badge" style="font-size:0.75em; padding:2px 6px; font-weight: normal; background: var(--ink-secondary); color: #fff; border: none;">Omitted</span>` : ""}
                    </span>
                    <span style="font-size: 0.8em; color: var(--ink-muted); font-weight: 400;">${dateStr}</span>
                    ${(!isExpanded && r.tags && r.tags.length > 0) ? `
                      <span style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;">
                        ${r.tags.map(t => `<span class="tag-badge" style="font-size:0.75em; padding:2px 6px;">${t}</span>`).join("")}
                      </span>
                    ` : ""}
                    ${(!isExpanded && r.notes) ? `
                      <span style="margin-top: 8px; font-size: 0.85em; color: var(--ink-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
                        <strong style="color: var(--ink);">Note:</strong> ${escapeHtml(r.notes)}
                      </span>
                    ` : ""}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>
                </button>
              `;

              let expandedHtml = "";
              if (isExpanded) {
                expandedHtml = `
                  <div class="shadcn-accordion-content" ${state.mistakesLog.justToggled !== r.id ? 'style="animation: none;"' : ''}>
                    <div class="shadcn-accordion-content-inner">
                      <div class="question-content" style="margin-bottom: 16px; margin-top: 0;">
                        ${q.stimulus ? sanitizeHtml(q.stimulus) + '<br><br>' : ''}
                        ${sanitizeHtml(q.prompt)}
                      </div>
                      ${renderAnswerArea(q, r.answer, r)}
                      ${renderImmediateExplanation(q, r)}
                      
                      <div class="ml-notes-section" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--line);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                          <h4 style="font-size: 0.9em; font-weight: 600; margin: 0;">Personal Notes & Tags</h4>
                        </div>
                        <div class="ml-note-empty-state" data-id="${r.id}" style="display: ${!(r.notes || (r.tags && r.tags.length > 0)) ? 'flex' : 'none'}; justify-content: center; padding: 12px 0;">
                          <button type="button" class="primary-btn" data-action="ml-edit-notes-toggle" data-id="${r.id}" style="border-radius: 6px; background-color: transparent; color: var(--ink); border: 1px dashed var(--line); width: 100%; height: 48px; transition: background-color 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.backgroundColor='color-mix(in srgb, var(--line) 30%, transparent)'" onmouseout="this.style.backgroundColor='transparent'">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                            Add Note
                          </button>
                        </div>

                        <div class="ml-note-view-area" data-id="${r.id}" style="display: ${(r.notes || (r.tags && r.tags.length > 0)) ? 'block' : 'none'}; margin-bottom: 16px;">
                          <div style="border-radius: 8px; border: 1px solid var(--line); background-color: var(--paper); color: var(--ink); box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); overflow: hidden;">
                            <div style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                              
                              ${(r.tags && r.tags.length > 0) ? `
                                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                  ${r.tags.map(t => `
                                    <span style="display: inline-flex; align-items: center; border-radius: 9999px; border: 1px solid transparent; padding: 2px 10px; font-size: 0.75rem; font-weight: 600; background-color: var(--ink); color: var(--paper);">
                                      ${t}
                                    </span>
                                  `).join("")}
                                </div>
                              ` : ''}

                              ${r.notes ? `
                                <div style="font-size: 0.875rem; line-height: 1.5; color: var(--ink); white-space: pre-wrap; font-weight: 400;">${escapeHtml(r.notes).replace(/\n/g, '<br>')}</div>
                              ` : ''}
                            </div>
                            
                            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 16px 24px; border-top: 1px solid var(--line); background-color: color-mix(in srgb, var(--line) 30%, transparent);">
                              <button type="button" class="ghost-btn" data-action="ml-delete-notes" data-id="${r.id}" style="height: 36px; padding: 0 16px; font-size: 0.875rem; font-weight: 500; border-radius: 6px; color: var(--ink); transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--line)'" onmouseout="this.style.backgroundColor='transparent'">
                                Delete
                              </button>
                              <button type="button" class="primary-btn" data-action="ml-edit-notes-toggle" data-id="${r.id}" style="height: 36px; padding: 0 16px; font-size: 0.875rem; font-weight: 500; border-radius: 6px; background-color: var(--ink); color: var(--paper);">
                                Edit Note
                              </button>
                            </div>
                          </div>
                        </div>

                        <div class="ml-note-edit-area" data-id="${r.id}" style="display: none;">
                          <div class="shadcn-filters-row" style="margin-bottom: 12px;">
                            ${Array.from(allUsedTags).map(tag => `
                              <button type="button" data-action="ml-toggle-tag" data-id="${r.id}" data-tag="${tag}" class="tag-badge ${(r.tags || []).includes(tag) ? 'active' : ''}">
                                ${tag}
                              </button>
                            `).join("")}
                            <button type="button" data-action="ml-add-custom-tag" data-id="${r.id}" class="tag-badge" style="border-style: dashed; background: transparent;">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M5 12h14"/><path d="M12 5v14"/></svg> Add Tag
                            </button>
                          </div>
                          <textarea class="ml-note-input" data-action="ml-note-input" data-id="${r.id}" data-original="${escapeHtml(r.notes || "")}" placeholder="Why did you get this wrong? What will you do differently next time?" style="width: 100%; min-height: 80px; padding: 12px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--ink); font-family: inherit; resize: vertical; margin-bottom: 12px; transition: opacity 0.2s, background 0.2s;">${r.notes || ""}</textarea>
                          <div style="display: flex; justify-content: flex-end; align-items: center; gap: 12px;">
                            <span class="ml-error-msg" id="ml-error-${r.id}" style="color: var(--red); font-size: 0.85em; display: none;">Please select at least one tag.</span>
                            <button type="button" class="primary-btn" data-action="ml-save-notes" data-id="${r.id}">Save Note</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              }

              return `<div class="shadcn-accordion-item ${isExpanded ? 'expanded' : ''}">${headerHtml}${expandedHtml}</div>`;
            }).join("")}
          </div>
        </div>
      </div>
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
      selectedCount += wrongQuestions.filter(q => state.selectedMistakeDomains.has(q.domain)).length;
    }
    if (state.selectedMistakeTypes.has("skipped")) {
      selectedCount += skippedQuestions.filter(q => state.selectedMistakeDomains.has(q.domain)).length;
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
  }

  function bindHomeEvents() {
    for (const btn of app.querySelectorAll("[data-action]")) {
      if (btn.tagName === "SELECT" || btn.tagName === "INPUT") {
        btn.addEventListener("change", handleHomeAction);
      } else if (btn.tagName === "TEXTAREA") {
        btn.addEventListener("input", handleHomeAction);
      } else {
        btn.addEventListener("click", handleHomeAction);
      }
    }
    const form = app.querySelector("#configForm");
    if (form) {
      form.addEventListener("submit", e => { e.preventDefault(); startPractice(readConfigFromForm(form)); });
      form.addEventListener("change", e => {
        state.config = readConfigFromForm(form);
        if (e.target.name === "subject") {
          state.config.domainCodes = getAvailableDomains(state.config.subject).map(d => d.code);
          renderHome();
        } else {
          const newCount = countFilteredQuestions(state.config);
          const countEl = form.querySelector('.start-summary strong');
          if (countEl) countEl.textContent = newCount;
        }
      });
    }
  }

  let isSyncingLinkedAccount = false;
  async function syncLinkedAccount({ returningUser = false, hideBusy = false } = {}) {
    if (isSyncingLinkedAccount) return;
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
      if (!result.ok) throw new Error(result.reason || "sync_failed");

      await refreshLocalData();
      ensureConfigDefaults();
      if (!hideBusy) clearBusy(false);

      if (returningUser && state.questions.length === 0 && state.sessions.length === 0) {
        state.view = "onboarding";
        showNotice("No synced practice data was found for this account. Import a .sat-test file or choose another account.", "error");
        renderHome();
        isSyncingLinkedAccount = false;
        return;
      }

      if (returningUser) {
        state.view = "dashboard";
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
    }, 350);
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
    const target = findTourTarget(step);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });

    let overlay = document.querySelector(".tour-overlay");
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
      document.body.appendChild(overlay);
      window.addEventListener("resize", updateTutorialPosition);
      window.addEventListener("scroll", updateTutorialPosition, true);
    }

    const isFirst = state.tutorial.step === 0;
    const isLast = state.tutorial.step === TUTORIAL_STEPS.length - 1;
    overlay.querySelector(".tour-card").innerHTML = `
      <p class="tour-progress">Step ${state.tutorial.step + 1} of ${TUTORIAL_STEPS.length}</p>
      <h2>${escapeHtml(step.title)}</h2>
      <p>${escapeHtml(step.body)}</p>
      <div class="tour-actions">
        <button class="ghost-btn" type="button" data-tour-action="skip">Skip</button>
        <div>
          <button class="ghost-btn" type="button" data-tour-action="back" ${isFirst ? "disabled" : ""}>Back</button>
          <button class="primary-btn" type="button" data-tour-action="${isLast ? "done" : "next"}">${isLast ? "Done" : "Next"}</button>
        </div>
      </div>
    `;
    requestAnimationFrame(() => {
      updateTutorialPosition();
      overlay.querySelector(isLast ? "[data-tour-action='done']" : "[data-tour-action='next']")?.focus();
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
    if (action === "returning-sign-in") { await syncLinkedAccount({ returningUser: true }); return; }
    if (action === "import-bluebook") { fileInput.click(); return; }
    if (action === "dashboard") { state.view = "dashboard"; state.notice = null; renderHome(); }
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
    if (action === "config") { state.view = "config"; state.notice = null; ensureConfigDefaults(); renderHome(); }
    if (action === "history") {
      const fullTests = state.sessions.filter(s => s.mode === "full" || s.mode === "bluebook");
      const subjectTests = state.sessions.filter(s => s.mode !== "full" && s.mode !== "bluebook");
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
        updateMistakesLogUI();
      }
    }
    if (action === "ml-change-domain") {
      state.mistakesLog.filterDomain = event.currentTarget.value || event.target.value;
      updateMistakesLogUI();
    }
    if (action === "ml-change-type") {
      state.mistakesLog.filterType = event.currentTarget.value || event.target.value;
      updateMistakesLogUI();
    }
    if (action === "ml-filter-tag") {
      const tag = event.currentTarget.dataset.tag || event.target.dataset.tag;
      if (state.mistakesLog.filterTags.has(tag)) state.mistakesLog.filterTags.delete(tag);
      else state.mistakesLog.filterTags.add(tag);
      updateMistakesLogUI();
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
        target.classList.toggle("active");
      }
    }
    if (action === "ml-add-custom-tag") {
      const target = event.currentTarget || event.target;
      const id = target.dataset.id;
      const r = state.responses.find(res => res.id === id);
      if (r) {
        const tag = prompt("Enter a custom tag (max 20 chars):");
        if (tag && tag.trim().length > 0) {
          r.tags = r.tags || [];
          if (!r.tags.includes(tag.trim())) r.tags.push(tag.trim());
          
          const textarea = document.querySelector(`textarea.ml-note-input[data-id="${id}"]`);
          if (textarea && !textarea.disabled) {
            r.notes = textarea.value;
          }
          
          r.updatedAt = Date.now();
          DB.put("responses", r).catch(console.error);
          updateMistakesLogUI();
        }
      }
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
          if (!r.tags || r.tags.length === 0) {
            if (textarea.value.trim() !== "") {
              if (errorMsg) {
                errorMsg.style.display = "block";
                setTimeout(() => errorMsg.style.display = "none", 3000);
              }
              return;
            } else {
              r.notes = "";
              r.tags = [];
              r.updatedAt = Date.now();
              textarea.value = "";
              DB.put("responses", r).then(() => {
                updateMistakesLogUI();
              }).catch(console.error);
              return;
            }
          }
          
          if (errorMsg) errorMsg.style.display = "none";
          
          r.notes = textarea.value.trim() === "" ? "" : textarea.value;
          r.updatedAt = Date.now();
          DB.put("responses", r).then(() => {
            updateMistakesLogUI();
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
      for (const q of [...wrongQuestions, ...skippedQuestions]) {
        if (q.subject === subjectKey) {
          subjectDomains.add(q.domain);
        }
      }
      if (selectValue === "all") {
        for (const dom of subjectDomains) {
          state.selectedMistakeDomains.add(dom);
        }
      } else {
        for (const dom of subjectDomains) {
          state.selectedMistakeDomains.delete(dom);
        }
      }
      updateMistakesSummary();
    }
    if (action === "start-retry-practice") {
      const { wrongQuestions, skippedQuestions } = getMistakesData();
      const questionsToPractice = [];
      if (state.selectedMistakeTypes.has("wrong")) {
        for (const q of wrongQuestions) {
          if (state.selectedMistakeDomains.has(q.domain)) {
            questionsToPractice.push(q);
          }
        }
      }
      if (state.selectedMistakeTypes.has("skipped")) {
        for (const q of skippedQuestions) {
          if (state.selectedMistakeDomains.has(q.domain)) {
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
      state.view = "review";
      renderHome();
    }
    if (action === "review-subject-filter") {
      state.reviewFilterSubject = event.currentTarget.dataset.subject || "both";
      renderHome();
    }
    if (action === "review-wrong-toggle") {
      const type = event.currentTarget.dataset.type;
      if (type === "incorrect") state.reviewFilterIncorrect = event.currentTarget.checked;
      if (type === "skipped") state.reviewFilterSkipped = event.currentTarget.checked;
      
      const list = app.querySelector(".review-list");
      if (list) {
        list.classList.toggle("filter-incorrect", state.reviewFilterIncorrect);
        list.classList.toggle("filter-skipped", state.reviewFilterSkipped);
        
        const emptyMsg = list.querySelector(".css-empty-message");
        if (emptyMsg) {
          const inc = state.reviewFilterIncorrect;
          const skp = state.reviewFilterSkipped;
          let hasVisible = false;
          if (inc && skp) hasVisible = !!list.querySelector('.review-card[data-status="incorrect"], .review-card[data-status="skipped"]');
          else if (inc) hasVisible = !!list.querySelector('.review-card[data-status="incorrect"]');
          else if (skp) hasVisible = !!list.querySelector('.review-card[data-status="skipped"]');
          else hasVisible = !!list.querySelector('.review-card');
          emptyMsg.style.display = hasVisible ? "none" : "block";
        }
      }
    }
    if (action === "import") { fileInput.click(); }
    if (action === "dismiss-notice") { state.notice = null; dismissNoticeUI(); }
    if (action === "wipe-all") {
      showConfirmModal("Are you sure you want to wipe ALL your data, including imported question banks? This cannot be undone.", "Wipe All Data", async () => {
        await DB.clearAll();
        state.lastResult = null;
        sessionStorage.removeItem('lastResultSessionId');
        
        if (window.SevSync?.isLinked()) {
            window.SevSync.sync(true, { forcePush: true, silent: true }).catch(console.error);
        }

        state.view = "dashboard";
        await refreshLocalData();
        showNotice("All data wiped successfully.", "info");
        renderHome();
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

    if (action === "logout") {
      showConfirmModal("Are you sure you want to log out?", "Log Out", async () => {
        await SevSync.unlink();
        if (window.posthog?.reset) window.posthog.reset();
        await DB.clearAll();
        state.lastResult = null;
        sessionStorage.removeItem('lastResultSessionId');
        state.view = "dashboard";
        await refreshLocalData();
        showNotice("Logged out successfully.", "info");
        renderHome();
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
    if (action === "unlink-cloud-sync") {
      state.backupMessage = null;
      await SevSync.unlink();
      if (window.posthog?.reset) window.posthog.reset();
      showNotice("Account unlinked. Local data preserved.", "success");
      renderHome();
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
            const filteredQuestions = payload.questions.filter(record => !isDeletedRecord(record)).map(stamp);

            await DB.clearAll();
            
            const totalRecords = filteredBanks.length + filteredQuestions.length + sessionsData.length + responseData.length;
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

            await refreshLocalData();
            clearBusy(false);
            showBackupMsg("Backup restored successfully.", "success");
            renderHome();
            maybeStartTutorial();
            if (window.SevSync?.isLinked()) SevSync.sync(true, { forcePush: true });
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
        
        const answerOptions = normalizeAnswerOptions(Object.entries(q.choices || {}).map(([letter, content]) => ({ letter, content })));
        const type = answerOptions.length ? "mcq" : "spr";
        const correctAnswers = normalizeCorrectAnswers(q.correctAnswer, answerOptions, type);
        
        const domainLabel = q.domains?.primaryLabel || q.domains?.primary || "Unknown domain";
        const domainCode = q.domains?.primary || "";
        
        const question = {
          id, externalId,
          questionId: id,
          bankId, importedAt, updatedAt: Date.now(), subject,
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
        }
        
        const isCorrect = q.isCorrect === true;
        
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
    const id = String(externalId || `${bankId}:${index}`);
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
  }

  function readConfigFromForm(form) {
    const data = new FormData(form);
    const subject = data.get("subject") || "math";
    const domains = data.getAll("domain");
    const difficulties = data.getAll("difficulty");
    return {
      subject,
      domainCodes: domains.length ? domains : getAvailableDomains(subject).map(d => d.code),
      difficulties: difficulties.length ? difficulties : ["E", "M", "H"],
      excludeAnswered: data.get("excludeAnswered") === "on",
      immediateFeedback: data.get("immediateFeedback") === "on",
      limit: clamp(parseInt(data.get("limit"), 10) || 20, 1, 200)
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
      questions = pool.slice(0, Math.min(config.limit, pool.length));
    }
    if (!questions.length) { showNotice("No questions match those filters.", "error"); renderHome(); return; }

    state.activeTest = {
      id: uid("session"), mode: "custom", config, questions,
      startedAt: new Date().toISOString(),
      currentIndex: 0, currentAnswer: "",
      currentQuestionStartedAt: Date.now(),
      responses: [], notice: null
    };
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
    });
  }

  function fitQuestionContent() {
    const pane = app.querySelector(".question-pane");
    if (!pane || pane.scrollHeight <= pane.clientHeight) return;
    pane.classList.add("compact-content");
    if (pane.scrollHeight > pane.clientHeight) pane.classList.add("tight-content");
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
                <small>${escapeHtml(question.domain)} · ${escapeHtml(question.difficulty || "")}</small>
              </div>
            </div>
            <div class="question-content-layout ${fitColumns ? "fit-columns" : ""}">
              <div class="html-content prompt">${sanitizeHtml(question.prompt)}</div>
              ${renderAnswerArea(question, answer, response)}
              ${response ? renderImmediateExplanation(question, response) : ""}
            </div>
          </article>
        </section>
      </main>

      <footer class="bb-footer">
        <button class="ghost-btn" type="button" data-test-action="${isFull ? "previous" : "noop"}" ${!isFull || ctx.index === 0 ? "disabled" : ""}>Back</button>
        <div class="bb-question-nav">
          ${ctx.list.map((q, i) => `
            <button class="bb-nav-dot ${i === ctx.index ? "current" : ""} ${isQuestionAnswered(q) ? "answered" : ""} ${test.marked?.[q.id] ? "marked" : ""}"
              type="button" data-test-action="${isFull ? "jump-question" : "noop"}" data-index="${i}" ${!isFull ? "disabled" : ""}>${i + 1}</button>
          `).join("")}
        </div>
        <div class="footer-center">${escapeHtml(question.questionId ? `ID ${question.questionId}` : question.externalId)}</div>
        ${renderForwardButton(ctx)}
      </footer>
    `;
  }

  function renderAnswerArea(question, answer, response) {
    const isSubmitted = !!response;
    if (question.type === "spr" || !question.answerOptions.length) {
      return `
        <div class="spr-card ${isSubmitted ? (response.isCorrect ? "correct" : "incorrect") : ""}">
          <label for="sprAnswer">Enter your answer</label>
          <input id="sprAnswer" type="text" inputmode="decimal" autocomplete="off" value="${escapeAttr(answer)}" data-answer-input ${isSubmitted ? "disabled" : ""}>
          <small>Student-produced response — scored by exact match.</small>
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
          return `
          <div class="choice-row ${elim[opt.letter] ? "eliminated" : ""} ${statusClass}">
            <button class="choice-button ${answer === opt.letter ? "selected" : ""} ${elim[opt.letter] ? "eliminated" : ""}"
              type="button" data-test-action="${isSubmitted ? "noop" : "select-option"}" data-value="${escapeAttr(opt.letter)}" ${isSubmitted ? "disabled" : ""}>
              <span class="choice-letter">${escapeHtml(opt.letter)}</span>
              <span class="choice-content">${sanitizeHtml(opt.content)}</span>
            </button>
            ${!isSubmitted ? `
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
    if (test.mode === "custom") {
      if (test.config.immediateFeedback && !test.responses[test.currentIndex]) {
        return `<button class="primary-btn" type="button" data-test-action="next-custom">Submit</button>`;
      }
      return `<button class="primary-btn" type="button" data-test-action="next-custom">${isLast ? "Finish" : "Next"}</button>`;
    }
    if (isLast) {
      return `<button class="primary-btn" type="button" data-test-action="check-module">Review</button>`;
    }
    return `<button class="primary-btn" type="button" data-test-action="next">Next</button>`;
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

  function bindTestEvents() {
    for (const el of app.querySelectorAll("[data-test-action]")) {
      el.addEventListener("click", handleTestAction);
    }
    const answerInput = app.querySelector("[data-answer-input]");
    if (answerInput) {
      answerInput.addEventListener("input", e => setCurrentAnswer(e.target.value, false));
      answerInput.focus();
    }

    // Render KaTeX formulas in reference sheet
    for (const el of app.querySelectorAll(".katex-formula[data-tex]")) {
      try {
        if (window.katex) window.katex.render(el.dataset.tex, el, { throwOnError: false, displayMode: false });
      } catch (e) { el.textContent = el.dataset.tex; }
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
      setCurrentAnswer(val, true);
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

    if (test.mode === "custom") {
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
      const elapsed = (Date.now() - test.currentQuestionStartedAt) / 1000;
      const response = makeResponse(question, answer, elapsed, test, true);
      test.responses[test.currentIndex] = response;
    }
    
    if (test.currentIndex >= test.questions.length - 1) {
      finishActiveTest(test.responses.filter(Boolean));
      return;
    }

    test.currentIndex += 1;
    test.currentAnswer = "";
    test.currentQuestionStartedAt = Date.now();
    test.notice = null;
    state.showRationale = false;
    persistActiveTest();
    renderActiveTest();
  }

  function endCustomTest() {
    const test = state.activeTest;
    const question = test.questions[test.currentIndex];
    if (!test.config.immediateFeedback || !test.responses[test.currentIndex]) {
      if (hasAnswer(test.currentAnswer)) {
        const elapsed = (Date.now() - test.currentQuestionStartedAt) / 1000;
        const response = makeResponse(question, test.currentAnswer, elapsed, test);
        if (response) test.responses[test.currentIndex] = response;
      }
    }
    finishActiveTest(test.responses.filter(Boolean));
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

  function scoreAnswer(question, answer) {
    if (!hasAnswer(answer)) return { wasAnswered: false, isCorrect: false };
    const expected = question.correctAnswers || [];
    if (!expected.length) return { wasAnswered: true, isCorrect: false };
    if (question.type === "mcq" && question.answerOptions.length) {
      return { wasAnswered: true, isCorrect: expected.map(normalizeAnswerToken).includes(normalizeAnswerToken(answer)) };
    }
    return { wasAnswered: true, isCorrect: expected.map(normalizeFreeResponse).includes(normalizeFreeResponse(answer)) };
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
    for (let iter = 0; iter < 10; iter++) {
      let f = 0;
      let df = 0;
      for (const item of items) {
        const p = 1 / (1 + Math.exp(-(theta - item.b)));
        f += (item.u - p);
        df -= p * (1 - p);
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
      if (ctx.question.answerOptions.some(o => o.letter === letter)) setCurrentAnswer(letter, true);
      return;
    }

    // Ctrl+Shift+1/2/3/4 (Select)
    if (isCtrl && isShift && /^[1-4]$/.test(key) && ctx.question.answerOptions.length) {
      e.preventDefault();
      const letter = letters[parseInt(key) - 1];
      if (ctx.question.answerOptions.some(o => o.letter === letter)) setCurrentAnswer(letter, true);
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
      if (test.config.immediateFeedback && test.responses[test.currentIndex]) {
        return formatTimer(test.responses[test.currentIndex].timeSpentSeconds);
      }
      return formatTimer(Math.floor((Date.now() - test.currentQuestionStartedAt) / 1000));
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
    return test.mode === "custom" ? test.currentAnswer : test.answers[question.id] || "";
  }

  function isQuestionAnswered(question) {
    const test = state.activeTest;
    if (test.mode === "custom") {
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
          snapshot._elapsedBeforePersist = Date.now() - (snapshot.currentQuestionStartedAt || Date.now());
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
          state.activeTest.currentQuestionStartedAt = Date.now() - (snap._elapsedBeforePersist || 0);
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
    const domainCodes = new Set(config.domainCodes?.length ? config.domainCodes : getAvailableDomains(config.subject).map(d => d.code));
    const difficulties = new Set(config.difficulties?.length ? config.difficulties : ["E", "M", "H"]);
    const answered = config.excludeAnswered ? new Set(state.responses.filter(isAnsweredResponse).map(r => r.questionId)) : new Set();

    return state.questions.filter(q => {
      if (!subjects.includes(q.subject)) return false;
      if (domainCodes.size && !domainCodes.has(q.domainCode)) return false;
      if (difficulties.size && !difficulties.has(q.difficultyCode) && q.difficultyCode) return false;
      return !answered.has(q.id);
    });
  }

  function countFilteredQuestions(config) { return getFilteredQuestions(config).length; }

  function getAvailableDomains(subject) {
    const subjects = subject === "both" ? ["math", "rw"] : [subject];
    const seen = new Map();
    for (const q of state.questions) {
      if (!subjects.includes(q.subject)) continue;
      const key = `${q.subject}:${q.domainCode}`;
      if (!seen.has(key)) seen.set(key, { subject: q.subject, code: q.domainCode, label: q.domain || findDomainLabel(q.subject, q.domainCode) || q.domainCode });
    }
    if (!seen.size) {
      for (const s of subjects) for (const d of DOMAIN_FALLBACKS[s] || []) seen.set(`${s}:${d.code}`, { subject: s, code: d.code, label: d.label });
    }
    return [...seen.values()].sort((a, b) => String(a.subject).localeCompare(String(b.subject)) || String(a.label).localeCompare(String(b.label)));
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

    const answered = answeredResponses.length;
    return {
      bank, overall: { answered, correct, incorrect: questions.length - correct, accuracy: questions.length ? correct / questions.length : 0, avgTime: timedAnswered ? totalTime / timedAnswered : 0 },
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

  function showConfirmModal(message, confirmText, onConfirm, options = {}) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal-content confirm-modal";
    
    modal.innerHTML = `
      <p class="modal-message">${escapeHtml(message)}</p>
      <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
        <button class="ghost-btn cancel-btn">${escapeHtml(options.cancelText || "Cancel")}</button>
        <button class="danger-btn confirm-btn">${escapeHtml(confirmText)}</button>
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
      this.textContent = "Deleting...";
      close();
      onConfirm();
    };
  }
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
          return text.replace(/%/g, "\\%");
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
          return text.replace(/%/g, "\\%");
        }

        case "mtext": {
          const text = el.textContent || "";
          if (!text.trim()) return "\\; ";
          return "\\text{" + text.replace(/%/g, "\\%") + "}";
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
  function hasAnswer(value) { return String(value || "").trim().length > 0; }
  function isAnsweredResponse(r) { return r?.isAnswered !== false && hasAnswer(r?.answer); }
  function normalizeAnswerToken(v) { return String(v || "").trim().toUpperCase(); }
  function normalizeFreeResponse(v) { return String(v || "").trim().replace(/\s+/g, "").toLowerCase(); }
  function formatPercent(v) { return `${Math.round((v || 0) * 100)}%`; }

  function formatTimer(totalSeconds) {
    const s = Math.max(0, totalSeconds);
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
    return crypto.randomUUID ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function letterAt(i) { return String.fromCharCode(65 + i); }

  function isRelativeUrl(v) { return Boolean(v) && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(v); }

  function stripHtml(v) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(v || "");
    return tpl.content.textContent || "";
  }

  function escapeHtml(v) {
    return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttr(v) { return escapeHtml(v); }
})();
