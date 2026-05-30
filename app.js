(function () {
  "use strict";

  const DB = window.SatPracticeDB;
  const app = document.querySelector("#app");
  const fileInput = document.querySelector("#fileInput");

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
    { action: "Navigate Exam Regions (Forward)", shortcut: "F6" },
    { action: "Navigate Exam Regions (back)", shortcut: "Shift + F6" },
    { action: "Zoom In", shortcut: "Control + Plus (+)" },
    { action: "Zoom Out", shortcut: "Control + Minus (-)" },
    { action: "Zoom back to 100%", shortcut: "Control + 0" },
    { action: "Back", shortcut: "Control + Alt +B" },
    { action: "Next", shortcut: "Control + Alt + X" },
    { action: "Open/Cose Question Menu", shortcut: "Control + Alt + G" },
    { action: "Help", shortcut: "Control + Alt + H" },
    { action: "Open/Close Directions", shortcut: "Control + Alt + Shift + D" },
    { action: "Open/Close Line Reader", shortcut: "Control + L" },
    { action: "Hide/Show Timer or Close 5-Minute Message", shortcut: "Control + Alt + T" },
    { action: "Pause Timer (with certain accommodations only)", shortcut: "Control + Alt + P" },
    { action: "Mark for Review", shortcut: "Control + Alt + V" },
    { action: "Highlights & Notes", shortcut: "Control + H" },
    { action: "Open/Close Calculator", shortcut: "Control + Alt + C" },
    { action: "Open/Close Reference Sheet", shortcut: "Control + Alt + R" },
    { action: "Select/Deselect Option A", shortcut: "Control + Shift + 1" },
    { action: "Select/Deselect Option B", shortcut: "Control + Shift + 2" },
    { action: "Select/Deselect Option C", shortcut: "Control + Shift + 3" },
    { action: "Select/Deselect Option D", shortcut: "Control + Shift + 4" },
    { action: "Select/Deselect Option E", shortcut: "Control + Shift + 5" },
    { action: "Option Eliminator Mode", shortcut: "Control + Alt + O" },
    { action: "Eliminate Option A", shortcut: "Control + Alt + 1" },
    { action: "Eliminate Option B", shortcut: "Control + Alt + 2" },
    { action: "Eliminate Option C", shortcut: "Control + Alt + 3" },
    { action: "Eliminate Option D", shortcut: "Control + Alt + 4" },
    { action: "Eliminate Option E", shortcut: "Control + Alt + 5" },
    { action: "Mark for Review", shortcut: "Alt + P" },
    { action: "Highlights & Notes", shortcut: "Control" },
    { action: "Open/Close Calculator", shortcut: "Alt + C" }
  ];

  /* ===========================================================
     STATE & INITIALIZATION
     =========================================================== */

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
    reviewFilterIncorrect: false,
    reviewFilterSkipped: false,
    selectedMistakeDomains: null,
    selectedMistakeTypes: null,
    notice: null,
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
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  async function init() {
    initPersistentDesmos();
    fileInput.addEventListener("change", handleFileImport);
    document.addEventListener("keydown", handleKeyboard);
    await refreshLocalData();
    await restoreActiveTest();
    ensureConfigDefaults();
    if (state.activeTest) {
      renderActiveTest();
    } else {
      renderHome();
    }
  }

  function initPersistentDesmos() {
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

  async function refreshLocalData() {
    const [banks, questions, sessions, responses] = await Promise.all([
      DB.getAll("questionBanks"),
      DB.getAll("questions"),
      DB.getAll("sessions"),
      DB.getAll("responses")
    ]);

    state.banks = banks.sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
    state.questions = questions.sort((a, b) => {
      const subject = String(a.subject).localeCompare(String(b.subject));
      if (subject !== 0) return subject;
      return String(a.questionId || a.id).localeCompare(String(b.questionId || b.id));
    });
    state.sessions = sessions
      .filter(s => s.id !== "__active_test__")
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
    state.responses = responses.sort((a, b) => String(b.answeredAt).localeCompare(String(a.answeredAt)));

    const backupConf = await DB.get("appConfig", "backupHandle");
    state.backupHandle = backupConf ? backupConf.handle : null;
  }

  /* ===========================================================
     RENDERING — HOME VIEWS
     =========================================================== */

  function renderHome() {
    stopTicker();
    app.className = "app-shell";
    app.innerHTML = `
      ${renderTopbar()}
      ${state.notice ? renderNotice(state.notice) : ""}
      <main class="main-grid">
        ${state.view === "results" && state.lastResult ? renderSessionDashboard(state.lastResult) : ""}
        ${state.view === "config" ? renderTestConfig() : ""}
        ${state.view === "history" ? renderTestHistory() : ""}
        ${state.view === "review" ? renderTestReview() : ""}
        ${state.view === "dashboard" ? renderDashboard() : ""}
        ${state.view === "mistakes" ? renderMistakesDashboard() : ""}
      </main>
      ${state.showSupport ? renderSupportModal() : ""}
    `;
    bindHomeEvents();
    renderMath(app);
  }

  function renderTopbar() {
    return `
      <header class="topbar">
        <button class="brand-mark" type="button" data-action="dashboard" aria-label="Open dashboard">
          <img class="brand-icon" src="logo.png" alt="SAT Logo">
          <span>
            <strong>Interactive Practice</strong>
            <small>Local question bank · Timed tests</small>
          </span>
        </button>
        <nav class="top-actions">
          <button class="ghost-btn" type="button" data-action="open-support" style="color: #7c3aed; border: 1px solid #7c3aed;">☕ Buy me a coffee</button>
          <button class="ghost-btn" type="button" data-action="dashboard">Dashboard</button>
          <button class="ghost-btn" type="button" data-action="config">Create New Test</button>
          <button class="ghost-btn" type="button" data-action="history">Past Tests</button>
          <button class="primary-btn" type="button" data-action="import">Import .sat-test</button>
        </nav>
      </header>
    `;
  }

  function renderSupportModal() {
    return `
      <div class="overlay-backdrop" style="display: flex;">
        <section class="support-modal panel">
          <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p class="eyebrow">Support this project</p>
              <h2>Buy me a coffee ☕</h2>
            </div>
            <button class="ghost-btn" type="button" data-action="close-support" style="padding: 4px 8px;">✕</button>
          </div>
          <div style="text-align: center; margin: 20px 0;">
            <img src="qr.png" alt="Payment QR Code" style="width: 200px; height: 200px; border-radius: var(--radius-sm); border: 1px solid var(--line);">
          </div>
          <div class="support-code-wrap" style="width: 100%; justify-content: center;">
            <span>UPI ID:</span>
            <code title="Copy UPI ID">sharthak-jaiswal@fam</code>
          </div>
        </section>
      </div>
    `;
  }

  function renderNotice(notice) {
    return `
      <section class="notice ${notice.type || "info"}">
        <p>${escapeHtml(notice.text)}</p>
        <button type="button" data-action="dismiss-notice" aria-label="Dismiss">✕</button>
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
      <section class="hero-card">
        <div>
          <p class="eyebrow">Global overview</p>
          <h1>Your SAT Practice Dashboard</h1>
          <p>${state.banks.length} imported bank${state.banks.length === 1 ? "" : "s"} · ${state.questions.length} total questions</p>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="primary-btn large" type="button" data-action="config">Create New Test</button>
          <button class="ghost-btn large" type="button" data-action="retry-mistakes" style="background:var(--paper);border-color:var(--line)">Retry Mistakes</button>
        </div>
      </section>

      <section class="metric-grid">
        ${renderMetric("Math Bank", mathCount, "questions imported")}
        ${renderMetric("RW Bank", rwCount, "questions imported")}
        ${renderMetric("Accuracy", formatPercent(metrics.overall.accuracy), `${metrics.overall.answered} answered`)}
        ${renderMetric("Avg Time", metrics.overall.avgTime ? `${Math.round(metrics.overall.avgTime)}s` : "—", "per question")}
      </section>

      <section class="panel two-column">
        <div>
          <div class="panel-heading">
            <p class="eyebrow">Progress</p>
            <h2>Skill Level by Domain</h2>
          </div>
          ${renderDomainPerformance(metrics.domains)}
        </div>
        <div>
          <div class="panel-heading">
            <p class="eyebrow">Volume</p>
            <h2>Completed Questions</h2>
          </div>
          ${renderVolumeStats(metrics.domains, metrics.subjects)}
        </div>
      </section>

      <section class="panel two-column" style="margin-top: 32px;">
        <div style="border-right: 1px solid var(--border); padding-right: 24px;">
          <div class="panel-heading">
            <p class="eyebrow">Data Security</p>
            <h2>Automatic Backups</h2>
          </div>
          <p class="muted" style="margin-bottom:16px;">Link a backup folder to automatically save your progress after every test.</p>
          ${state.backupHandle 
            ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><div class="success-dot"></div><span>Backup folder linked</span><button class="ghost-btn" data-action="unlink-backup">Unlink</button></div>
               <button class="ghost-btn" data-action="force-backup">Sync Now</button>`
            : `<button class="secondary-btn" data-action="link-backup">Link Backup Folder</button>`}
          ${state.backupMessage ? `<p style="color:var(--${state.backupMessage.type === 'error' ? 'red' : 'blue'}); font-size:13px; margin-top:8px;">${state.backupMessage.text}</p>` : ''}
        </div>
        <div style="padding-left: 24px;">
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

      <section class="panel two-column" style="margin-top: 32px;">
        <div>
          <div class="panel-heading">
            <p class="eyebrow">Timing</p>
            <h2>Average Time by Subject</h2>
          </div>
          ${renderSubjectTiming(metrics.subjects)}
        </div>
        <div>
          <div class="panel-heading">
            <p class="eyebrow">Weaknesses</p>
            <h2>Priority Review Areas</h2>
          </div>
          ${renderWeaknesses(metrics.domains)}
        </div>
      </section>

      <section class="panel" style="margin-top: 32px; border-color: var(--red-border); background: var(--red-bg);">
        <div class="panel-heading">
          <p class="eyebrow" style="color: var(--red);">Danger Zone</p>
          <h2 style="color: var(--red);">Reset Application Data</h2>
        </div>
        <p style="color: var(--red); opacity: 0.8; margin-bottom: 16px;">This will clear all imported question banks, sessions, and history. This action cannot be undone.</p>
        <button class="danger-btn" type="button" data-action="reset">Reset Data</button>
      </section>

      <section class="panel support-panel" style="margin-top: 32px;">
        <div class="panel-heading">
          <p class="eyebrow">Support this project</p>
          <h2>Buy me a coffee ☕</h2>
        </div>
        <p class="muted">If this tool helped your SAT prep, you can support its development!</p>
        <div style="margin-top: 16px;">
          <a href="https://ko-fi.com/sevrony" target="_blank" rel="noopener noreferrer">
            <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi" style="height: 36px; border-radius: 4px;">
          </a>
        </div>
        <div class="support-code-wrap" style="margin-top: 16px;">
          <span>UPI ID:</span>
          <code title="Copy UPI ID">sharthak-jaiswal@fam</code>
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
    const title = result.session.mode === "full" ? "Full Test Complete" : "Practice Complete";

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

      ${renderScoreboard(result.session)}

      <section class="metric-grid">
        ${renderMetric("Answered", result.session.totalAnswered, "questions")}
        ${renderMetric("Correct", result.session.totalCorrect, "right answers")}
        ${renderMetric("Incorrect", result.session.totalIncorrect, "wrong answers")}
        ${renderMetric("Avg Time", result.session.averageSeconds ? `${Math.round(result.session.averageSeconds)}s` : "—", "this session")}
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

  function renderScoreboard(session) {
    if (session.mode !== "full" || !session.moduleSummaries) return "";

    let rwThetaSum = 0, mathThetaSum = 0, rwMods = 0, mathMods = 0;
    for (const s of session.moduleSummaries) {
      if (s.subject === "rw") { rwThetaSum += s.theta; rwMods++; }
      if (s.subject === "math") { mathThetaSum += s.theta; mathMods++; }
    }
    const rwTheta = rwMods ? (rwThetaSum / rwMods) : 0;
    const mathTheta = mathMods ? (mathThetaSum / mathMods) : 0;
    
    const rwScore = Math.round(Math.min(800, Math.max(200, 500 + (rwTheta * 100))) / 10) * 10;
    const mathScore = Math.round(Math.min(800, Math.max(200, 500 + (mathTheta * 100))) / 10) * 10;
    const totalScore = rwScore + mathScore;

    return `
      <section class="panel scoreboard-panel" style="text-align: center; margin-bottom: 24px; padding: 32px;">
        <p class="eyebrow">Simulated Score</p>
        <h1 style="font-size: 4rem; color: var(--blue); margin: 8px 0;">${totalScore}</h1>
        <div style="display: flex; justify-content: center; gap: 32px; margin-top: 16px;">
          <div>
            <p class="muted" style="margin-bottom: 4px;">Reading & Writing</p>
            <h2 style="font-size: 2rem;">${rwScore}</h2>
          </div>
          <div>
            <p class="muted" style="margin-bottom: 4px;">Math</p>
            <h2 style="font-size: 2rem;">${mathScore}</h2>
          </div>
        </div>
        <p class="muted" style="margin-top: 16px; font-size: 13px;">Scores are simulated using an IRT approximation and may not perfectly reflect official College Board scoring.</p>
      </section>
    `;
  }

  function renderTestHistory() {
    const fullTests = state.sessions.filter(s => s.mode === "full");
    const subjectTests = state.sessions.filter(s => s.mode !== "full");
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
        <div class="history-tabs" role="tablist">
          <button class="${state.historyTab === "full" ? "active" : ""}" type="button" data-action="history-tab" data-tab="full">Full Tests <span>${fullTests.length}</span></button>
          <button class="${state.historyTab === "subject" ? "active" : ""}" type="button" data-action="history-tab" data-tab="subject">Subject Tests <span>${subjectTests.length}</span></button>
        </div>
        ${sessions.length ? `
          <div class="history-list">
            ${sessions.map(session => `
              <article class="history-card">
                <div>
                  <p class="eyebrow">${session.mode === "full" ? "Full test" : (session.config?.isRetry || session.subject === "both") ? "Retry Mistakes" : escapeHtml(SUBJECTS[session.subject] || "Subject test")}</p>
                  <h2>${escapeHtml(formatSessionDate(session.completedAt))}</h2>
                  <small>${session.totalAnswered || 0} answered${session.totalQuestionsServed ? ` of ${session.totalQuestionsServed}` : ""}</small>
                </div>
                <div class="history-score">
                  <strong>${session.totalAnswered ? formatPercent(session.totalCorrect / session.totalAnswered) : "—"}</strong>
                  <span>${session.totalCorrect || 0} correct · ${session.totalIncorrect || 0} incorrect</span>
                  <small>${session.averageSeconds ? `${Math.round(session.averageSeconds)}s avg/question` : ""}</small>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <button class="primary-btn" type="button" data-action="review-session" data-session-id="${escapeAttr(session.id)}">Review</button>
                  <button class="ghost-btn" type="button" data-action="delete-session" data-session-id="${escapeAttr(session.id)}" title="Delete this test" style="color:var(--red);border-color:var(--red-border)">✕</button>
                </div>
              </article>
            `).join("")}
          </div>
        ` : `<p class="empty-message">No ${state.historyTab === "full" ? "full" : "subject"} tests completed yet.</p>`}
      </section>
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

    let responses = allResponses;
    if (state.reviewFilterIncorrect || state.reviewFilterSkipped) {
      responses = allResponses.filter(r => {
        const isSkipped = !isAnsweredResponse(r);
        const isWrong = !isSkipped && !r.isCorrect;
        if (state.reviewFilterIncorrect && isWrong) return true;
        if (state.reviewFilterSkipped && isSkipped) return true;
        return false;
      });
    }

    return `
      <section class="review-heading panel">
        <div class="review-heading-top">
          <div>
            <p class="eyebrow">${session.mode === "full" ? "Full test review" : (session.config?.isRetry || session.subject === "both") ? "Retry Mistakes review" : "Subject test review"}</p>
            <h1>${escapeHtml(formatSessionDate(session.completedAt))}</h1>
            <p>${session.totalCorrect || 0} correct · ${session.totalIncorrect || 0} incorrect · ${session.totalAnswered || 0} answered</p>
          </div>
          <button class="ghost-btn" type="button" data-action="history">Back</button>
        </div>
        <div style="display:flex; gap:20px;">
          <label class="wrong-toggle">
            <input type="checkbox" data-action="review-wrong-toggle" data-type="incorrect" ${state.reviewFilterIncorrect ? "checked" : ""}>
            <span class="toggle-ui"></span>
            <strong>Show Incorrect</strong>
          </label>
          <label class="wrong-toggle">
            <input type="checkbox" data-action="review-wrong-toggle" data-type="skipped" ${state.reviewFilterSkipped ? "checked" : ""}>
            <span class="toggle-ui"></span>
            <strong>Show Skipped</strong>
          </label>
        </div>
      </section>
      <section class="review-list">
        ${responses.length ? responses.map((r, i) => renderReviewedQuestion(questionMap.get(r.questionId), r, i)).join("") : `
          <article class="panel empty-message">All questions were answered correctly!</article>
        `}
      </section>
    `;
  }

  function renderReviewedQuestion(question, response, index) {
    const num = (response.sequence ?? index) + 1;
    if (!question) {
      return `
        <article class="panel review-card">
          <div class="review-card-header">
            <strong>Question ${num}</strong>
            ${renderReviewStatus(response)}
          </div>
          <p class="muted">Question data no longer available. Your answer: ${escapeHtml(response.answer || "blank")}.</p>
        </article>
      `;
    }

    return `
      <article class="panel review-card">
        <div class="review-card-header">
          <div>
            <span class="question-number">Question ${num}</span>
            <strong>${escapeHtml(question.domain)} · ${escapeHtml(response.moduleTitle || SUBJECTS[question.subject] || "")}</strong>
          </div>
          <div class="review-meta">
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
        <div class="explanation-card">
          <strong>Explanation</strong>
          <div class="html-content rationale">${sanitizeHtml(question.rationale || "No explanation included in this export.")}</div>
        </div>
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
      return `<span class="status-pill unanswered">Skipped</span>`;
    }
    return response.isCorrect
      ? `<span class="status-pill correct">Correct</span>`
      : `<span class="status-pill incorrect">Incorrect</span>`;
  }

  function getMistakesData() {
    // Collect all question IDs that were ever wrong or skipped in ANY test
    const everWrongIds = new Set();
    const everSkippedIds = new Set();

    for (const r of state.responses) {
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
          <h1>Retry incorrect or skipped questions.</h1>
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
              <span>Incorrect Answers</span>
              <small>${wrongQuestions.length} questions</small>
            </label>
            <label class="check-card" style="flex: 1; min-width: 150px; min-height:76px; margin: 0;">
              <input type="checkbox" data-action="toggle-mistake-type" data-type="skipped" ${state.selectedMistakeTypes.has("skipped") ? "checked" : ""}>
              <span>Skipped Questions</span>
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
                  <h2>${totalWrong + totalSkipped} total errors (${totalWrong} wrong · ${totalSkipped} skipped)</h2>
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
                    <small>${data.wrong} wrong · ${data.skipped} skipped</small>
                  </label>
                `).join("")}
              </div>
            </section>
          `;
        }).join("")}

        <section class="panel action-panel" style="grid-template-columns: auto 1fr auto auto;">
          <button class="ghost-btn large" type="button" data-action="dashboard">Back to Dashboard</button>
          <div></div>
          <div class="start-summary" style="text-align: right; margin-right: 16px;">
            <strong>${selectedCount}</strong>
            <span>selected questions</span>
          </div>
          <button class="primary-btn large" type="button" data-action="start-retry-practice" ${selectedCount === 0 ? "disabled" : ""}>Start Retry</button>
        </section>
      </div>
    `;
  }

  /* ---- Dashboard Sub-Components ---- */

  function renderMetric(label, value, caption) {
    return `
      <article class="metric-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
        <small>${escapeHtml(caption)}</small>
      </article>
    `;
  }

  function renderDomainPerformance(domains) {
    if (!domains.length) return `<p class="muted">Answer some questions to see skill levels.</p>`;
    return `
      <div class="domain-list">
        ${domains.map(d => `
          <article class="domain-row">
            <div><strong>${escapeHtml(d.label)}</strong><small>${escapeHtml(SUBJECTS[d.subject] || d.subject)} · ${d.answered} answered</small></div>
            <div class="level-meter" aria-label="Level ${d.skillLevel}/7"><span style="width:${d.skillLevel / 7 * 100}%"></span></div>
            <b>Lv ${d.skillLevel}</b>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderVolumeStats(domains, subjects) {
    if (!domains.length) return `<p class="muted">No completed questions yet.</p>`;
    return `
      <div class="domain-list">
        ${Object.entries(SUBJECTS).map(([sub, label]) => `
          <article class="domain-row compact-row subject-total">
            <div><strong>${label}</strong><small>Total</small></div>
            <b>${subjects[sub]?.answered || 0}</b>
          </article>
        `).join("")}
        ${domains.map(d => `
          <article class="domain-row compact-row">
            <div><strong>${escapeHtml(d.label)}</strong><small>${escapeHtml(SUBJECTS[d.subject] || d.subject)}</small></div>
            <b>${d.answered}</b>
          </article>
        `).join("")}
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

  function bindHomeEvents() {
    for (const btn of app.querySelectorAll("[data-action]")) {
      btn.addEventListener("click", handleHomeAction);
    }
    const form = app.querySelector("#configForm");
    if (form) {
      form.addEventListener("submit", e => { e.preventDefault(); startPractice(readConfigFromForm(form)); });
      form.addEventListener("change", e => {
        state.config = readConfigFromForm(form);
        if (e.target.name === "subject") {
          state.config.domainCodes = getAvailableDomains(state.config.subject).map(d => d.code);
          renderHome();
        }
      });
    }
  }

  async function handleHomeAction(event) {
    const action = event.currentTarget.dataset.action;

    if (action === "dashboard") { state.view = "dashboard"; state.notice = null; renderHome(); }
    if (action === "open-support") { state.showSupport = true; renderHome(); }
    if (action === "close-support") { state.showSupport = false; renderHome(); }
    if (action === "config") { state.view = "config"; state.notice = null; ensureConfigDefaults(); renderHome(); }
    if (action === "history") { state.view = "history"; state.notice = null; renderHome(); }
    if (action === "history-tab") { state.historyTab = event.currentTarget.dataset.tab || "full"; renderHome(); }
    if (action === "retry-mistakes") {
      const { wrongQuestions, skippedQuestions } = getMistakesData();
      const allMistakes = [...wrongQuestions, ...skippedQuestions];
      if (allMistakes.length === 0) {
        showNotice("No mistakes or skipped questions found to practice!", "info");
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
      renderHome();
    }
    if (action === "toggle-mistake-type") {
      const type = event.currentTarget.dataset.type;
      if (event.currentTarget.checked) {
        state.selectedMistakeTypes.add(type);
      } else {
        state.selectedMistakeTypes.delete(type);
      }
      renderHome();
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
      renderHome();
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
      startCustomPractice({ subject: "both", limit: questionsToPractice.length, isRetry: true }, questionsToPractice);
    }
    if (action === "review-session") {
      state.reviewSessionId = event.currentTarget.dataset.sessionId || null;
      state.reviewFilterIncorrect = false;
      state.reviewFilterSkipped = false;
      state.view = "review";
      renderHome();
    }
    if (action === "review-wrong-toggle") {
      const type = event.currentTarget.dataset.type;
      if (type === "incorrect") state.reviewFilterIncorrect = event.currentTarget.checked;
      if (type === "skipped") state.reviewFilterSkipped = event.currentTarget.checked;
      renderHome();
    }
    if (action === "import") { fileInput.click(); }
    if (action === "dismiss-notice") { state.notice = null; renderHome(); }
    if (action === "reset") {
      if (!window.confirm("Clear all imported question banks, sessions, and history?")) return;
      await DB.clearAll();
      state.lastResult = null;
      state.view = "dashboard";
      await refreshLocalData();
      showNotice("Local data cleared.", "info");
      renderHome();
    }
    if (action === "delete-session") {
      const sessionId = event.currentTarget.dataset.sessionId;
      if (!sessionId || !window.confirm("Delete this test and all its responses?")) return;
      const responseIds = state.responses.filter(r => r.sessionId === sessionId).map(r => r.id);
      await DB.remove("sessions", sessionId);
      if (responseIds.length) await DB.removeMany("responses", responseIds);
      await refreshLocalData();
      showNotice("Test deleted.", "info");
      renderHome();
      syncBackup(false);
    }
    
    if (action === "link-backup") { await linkBackupFolder(); renderHome(); }
    if (action === "unlink-backup") { await unlinkBackupFolder(); renderHome(); }
    if (action === "force-backup") { await syncBackup(true); }
    if (action === "download-backup") { await downloadManualBackup(); }
    if (action === "restore-backup") { await restoreBackup(); }
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

  async function syncBackup(requireGesture = false) {
    if (!state.backupHandle) return;
    try {
      if ((await state.backupHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        if (!requireGesture) return;
        if ((await state.backupHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
      }
      
      const fileHandle = await state.backupHandle.getFileHandle("sat-app-backup.json", { create: true });
      const writable = await fileHandle.createWritable();
      
      const payload = {
        exportedAt: new Date().toISOString(),
        questionBanks: state.banks,
        questions: state.questions,
        sessions: state.sessions,
        responses: state.responses
      };
      
      await writable.write(JSON.stringify(payload));
      await writable.close();
      if (requireGesture) showBackupMsg("Backup saved successfully.", "success");
    } catch (err) {
      console.error("Backup failed:", err);
      if (requireGesture) showBackupMsg("Failed to save backup.", "error");
    }
  }

  async function downloadManualBackup() {
    state.backupMessage = null;
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        questionBanks: state.banks,
        questions: state.questions,
        sessions: state.sessions,
        responses: state.responses
      };
      
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
        if (!window.confirm("Restore backup? This will overwrite your current progress.")) return;

        await DB.clearAll();
        if (banksData.length) await DB.putMany("questionBanks", banksData);
        if (payload.questions.length) await DB.putMany("questions", payload.questions);
        if (payload.sessions && payload.sessions.length) await DB.putMany("sessions", payload.sessions);
        if (payload.responses && payload.responses.length) await DB.putMany("responses", payload.responses);

        await refreshLocalData();
        showBackupMsg("Backup restored successfully.", "success");
        renderHome();
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
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const result = normalizeImportPayload(payload, file.name);
      await DB.put("questionBanks", result.bank);
      await DB.putMany("questions", result.questions);
      await refreshLocalData();
      ensureConfigDefaults();
      state.view = "dashboard";
      showNotice(`Imported ${result.questions.length} questions from ${file.name}.`, "success");
      renderHome();
    } catch (err) {
      showNotice(err.message || String(err), "error");
      renderHome();
    }
    syncBackup(false);
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
      bank: { id: bankId, filename, importedAt, exportedAt: payload.exportedAt || null, source: payload.source || null, formatVersion: payload.formatVersion || null, questionCount: questions.length },
      questions
    };
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
      bankId, importedAt: new Date().toISOString(), subject,
      test: question.test || SUBJECTS[subject] || "",
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
      limit: clamp(parseInt(data.get("limit"), 10) || 20, 1, 200)
    };
  }

  function startPractice(config) {
    state.config = config;
    if (!state.questions.length) { showNotice("Import a .sat-test file first.", "error"); renderHome(); return; }
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
    const rwModule1 = pickModuleQuestions("rw", config.difficulties, FULL_TEST.rw.size, usedIds, config);

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
    persistActiveTest();
    renderActiveTest();
  }

  /* ===========================================================
     TEST RENDERING
     =========================================================== */

  function renderActiveTest() {
    app.className = "test-shell";
    if (!state.activeTest) { renderHome(); return; }

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
    renderMath(app);
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
              ${renderAnswerArea(question, answer)}
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

  function renderAnswerArea(question, answer) {
    if (question.type === "spr" || !question.answerOptions.length) {
      return `
        <div class="spr-card">
          <label for="sprAnswer">Enter your answer</label>
          <input id="sprAnswer" type="text" inputmode="decimal" autocomplete="off" value="${escapeAttr(answer)}" data-answer-input>
          <small>Student-produced response — scored by exact match.</small>
        </div>
      `;
    }

    const elim = state.eliminatedChoices[question.id] || {};
    return `
      <div class="choice-list">
        ${question.answerOptions.map(opt => `
          <div class="choice-row ${elim[opt.letter] ? "eliminated" : ""}">
            <button class="choice-button ${answer === opt.letter ? "selected" : ""} ${elim[opt.letter] ? "eliminated" : ""}"
              type="button" data-test-action="select-option" data-value="${escapeAttr(opt.letter)}">
              <span class="choice-letter">${escapeHtml(opt.letter)}</span>
              <span class="choice-content">${sanitizeHtml(opt.content)}</span>
            </button>
            <button class="choice-elim-btn ${elim[opt.letter] ? "active" : ""}" type="button"
              data-test-action="eliminate-option" data-value="${escapeAttr(opt.letter)}"
              title="${elim[opt.letter] ? "Undo cross-out" : "Cross out"}" aria-label="Eliminate option ${escapeAttr(opt.letter)}">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function shouldUseAnswerColumns(question) {
    return question.subject === "math" && !question.stimulus && question.answerOptions.length > 0;
  }

  function renderForwardButton(ctx) {
    const test = state.activeTest;
    const isLast = ctx.index === ctx.list.length - 1;
    if (test.mode === "custom") {
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
    if (action === "end-custom") endCustomTest();
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
    const question = test.questions[test.currentIndex];
    const answer = test.currentAnswer;

    const elapsed = (Date.now() - test.currentQuestionStartedAt) / 1000;
    const response = makeResponse(question, answer, elapsed, test, true);
    if (response) test.responses.push(response);

    if (test.currentIndex >= test.questions.length - 1) {
      finishActiveTest(test.responses);
      return;
    }

    test.currentIndex += 1;
    test.currentAnswer = "";
    test.currentQuestionStartedAt = Date.now();
    test.notice = null;
    persistActiveTest();
    renderActiveTest();
  }

  function endCustomTest() {
    const test = state.activeTest;
    const question = test.questions[test.currentIndex];
    if (hasAnswer(test.currentAnswer)) {
      const elapsed = (Date.now() - test.currentQuestionStartedAt) / 1000;
      const response = makeResponse(question, test.currentAnswer, elapsed, test);
      if (response) test.responses.push(response);
    }
    finishActiveTest(test.responses);
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
      const questions = pickModuleQuestions("rw", routeDifficulties(route), FULL_TEST.rw.size, usedIds, test.config);
      test.usedIds = [...usedIds];
      showTransition(makeModule("rw2", "rw", 2, "Reading and Writing — Module 2", FULL_TEST.rw.seconds, questions, route),
        `${route === "upper" ? "Upper" : "Lower"} difficulty route based on Module 1 performance.`, Math.round(FULL_TEST.rw.seconds / 60));
      return;
    }

    if (module.id === "rw2") { beginBreak(); return; }

    if (module.id === "math1") {
      const route = summary.theta >= 0.0 ? "upper" : "lower";
      const usedIds = new Set(test.usedIds);
      const questions = pickModuleQuestions("math", routeDifficulties(route), FULL_TEST.math.size, usedIds, test.config);
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
    const questions = pickModuleQuestions("math", test.config.difficulties, FULL_TEST.math.size, usedIds, test.config);
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
      ...r, id: `${session.id}:${i}:${r.questionId}`, sessionId: session.id, sequence: i, answeredAt: completedAt
    }));

    await DB.put("sessions", session);
    if (persistedResponses.length) await DB.putMany("responses", persistedResponses);
    clearActiveTestPersistence();

    state.activeTest = null;
    state.lastResult = { session, responses: persistedResponses };
    state.view = "results";
    state.notice = null;
    state.transitionLocked = false;
    state.eliminatedChoices = {};
    await refreshLocalData();
    renderHome();
    syncBackup(false);
  }

  function buildSession(test, responses, completedAt) {
    const answered = responses.filter(isAnsweredResponse);
    const totalCorrect = answered.filter(r => r.isCorrect).length;
    const totalAnswered = answered.length;
    const totalSeconds = answered.reduce((s, r) => s + r.timeSpentSeconds, 0);
    return {
      id: test.id, mode: test.mode, subject: test.config.subject,
      startedAt: test.startedAt, completedAt,
      totalAnswered, totalCorrect, totalIncorrect: totalAnswered - totalCorrect,
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

  function estimateTheta(responses) {
    const difficulties = { E: -1.5, M: 0.0, H: 1.5 };
    const items = [];
    let score = 0;
    
    for (const r of responses) {
      let b = difficulties[r.difficultyCode || "M"] ?? 0;
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

  function summarizeModule(module, responses, reason) {
    const answered = responses.filter(isAnsweredResponse);
    const correct = answered.filter(r => r.isCorrect).length;
    const theta = estimateTheta(responses);
    return {
      id: module.id, title: module.title, subject: module.subject, route: module.route,
      reason, answered: answered.length, correct, incorrect: answered.length - correct,
      accuracy: answered.length ? correct / answered.length : 0,
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
    if (test.mode === "custom") return formatTimer(Math.floor((Date.now() - test.currentQuestionStartedAt) / 1000));
    if (test.phase === "break") return formatTimer(Math.max(0, Math.ceil((test.breakEndsAt - Date.now()) / 1000)));
    if (test.phase === "transition") return "—";
    return formatTimer(Math.max(0, Math.ceil((test.moduleEndsAt - Date.now()) / 1000)));
  }

  function getCurrentContext() {
    const test = state.activeTest;
    if (test.mode === "custom") {
      return { list: test.questions, question: test.questions[test.currentIndex], index: test.currentIndex, module: null };
    }
    return { list: test.currentModule.questions, question: test.currentModule.questions[test.currentQuestionIndex], index: test.currentQuestionIndex, module: test.currentModule };
  }

  function getCurrentAnswer() {
    const test = state.activeTest;
    const question = getCurrentContext().question;
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

  async function persistActiveTest() {
    if (!state.activeTest) return;
    try {
      const snapshot = JSON.parse(JSON.stringify(state.activeTest));
      snapshot._persistedAt = Date.now();
      await DB.put("sessions", { id: "__active_test__", snapshot, type: "active" });
    } catch (_) { /* ignore */ }
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
          state.activeTest.currentQuestionStartedAt = Date.now();
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

    const selected = balancedPick([...preferred, ...fallback, ...emergency], difficulties, count);
    for (const q of selected) usedIds.add(q.id);
    return selected;
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

  function getFilteredQuestions(config) {
    const subjects = config.subject === "both" ? ["math", "rw"] : [config.subject];
    const domainCodes = new Set(config.domainCodes?.length ? config.domainCodes : getAvailableDomains(config.subject).map(d => d.code));
    const difficulties = new Set(config.difficulties?.length ? config.difficulties : ["E", "M", "H"]);
    const answered = config.excludeAnswered ? new Set(state.responses.filter(isAnsweredResponse).map(r => r.questionId)) : new Set();

    return state.questions.filter(q => {
      if (!subjects.includes(q.subject)) return false;
      if (domainCodes.size && !domainCodes.has(q.domainCode)) return false;
      if (difficulties.size && !difficulties.has(q.difficultyCode)) return false;
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
    let totalTime = 0, correct = 0;

    for (const q of questions) {
      const key = `${q.subject}:${q.domainCode}`;
      if (!domainMap.has(key)) domainMap.set(key, { subject: q.subject, code: q.domainCode, label: q.domain || findDomainLabel(q.subject, q.domainCode) || "Unknown", answered: 0, correct: 0, incorrect: 0, totalTime: 0, accuracy: 0, skillLevel: 1 });
    }

    for (const r of answeredResponses) {
      const sub = subjects[r.subject] || { answered: 0, correct: 0, incorrect: 0, totalTime: 0, avgTime: 0 };
      sub.answered++; sub.correct += r.isCorrect ? 1 : 0; sub.incorrect += r.isCorrect ? 0 : 1;
      sub.totalTime += r.timeSpentSeconds || 0; sub.avgTime = sub.answered ? sub.totalTime / sub.answered : 0;
      subjects[r.subject] = sub;

      const key = `${r.subject}:${r.domainCode}`;
      const domain = domainMap.get(key) || { subject: r.subject, code: r.domainCode, label: r.domain || findDomainLabel(r.subject, r.domainCode) || "Unknown", answered: 0, correct: 0, incorrect: 0, totalTime: 0, accuracy: 0, skillLevel: 1 };
      domain.answered++; domain.correct += r.isCorrect ? 1 : 0; domain.incorrect += r.isCorrect ? 0 : 1;
      domain.totalTime += r.timeSpentSeconds || 0; domain.accuracy = domain.answered ? domain.correct / domain.answered : 0;
      domain.skillLevel = estimateSkillLevel(domain);
      domainMap.set(key, domain);

      correct += r.isCorrect ? 1 : 0;
      totalTime += r.timeSpentSeconds || 0;
    }

    const answered = answeredResponses.length;
    return {
      bank, overall: { answered, correct, incorrect: answered - correct, accuracy: answered ? correct / answered : 0, avgTime: answered ? totalTime / answered : 0 },
      subjects, domains: [...domainMap.values()].sort((a, b) => String(a.subject).localeCompare(String(b.subject)) || String(a.label).localeCompare(String(b.label)))
    };
  }

  function estimateSkillLevel(domain) {
    if (!domain.answered) return 1;
    return clamp(Math.round(domain.accuracy * 5 + Math.min(1, domain.answered / 20) * 2), 1, 7);
  }

  /* ===========================================================
     HTML SANITIZATION & MATH RENDERING
     =========================================================== */

  function sanitizeHtml(value) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(value || "");

    for (const el of tpl.content.querySelectorAll("script,iframe,object,embed,link,meta")) el.remove();
    for (const el of tpl.content.querySelectorAll("*")) {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const val = String(attr.value || "");
        if (name.startsWith("on") || /javascript:/i.test(val)) { el.removeAttribute(attr.name); continue; }
        if ((name === "src" || name === "href") && isRelativeUrl(val)) {
          el.setAttribute(attr.name, new URL(val, "https://mypractice.collegeboard.org/").href);
        }
      }
    }

    removeAccessibilityDescriptions(tpl.content);
    normalizeMathMarkup(tpl.content);
    return tpl.innerHTML;
  }

  function removeAccessibilityDescriptions(root) {
    const selectors = [
      "[class*='sr-only' i]", "[class*='screen-reader' i]", "[class*='visually-hidden' i]",
      "[class*='offscreen' i]", "[class*='accessib' i]", "[class*='a11y' i]",
      "[data-testid*='accessib' i]", "[aria-hidden='true']",
      "[style*='position: absolute'][style*='clip']",
      "[style*='position:absolute'][style*='clip']",
    ];
    for (const el of root.querySelectorAll(selectors.join(","))) {
      if (/^_+$/.test(el.textContent.trim())) {
        continue;
      }
      el.remove();
    }

    if (!root.querySelector("svg,img,canvas,[role='img'],[aria-label*='graph' i],object")) return;
    for (const list of root.querySelectorAll("ul,ol")) {
      if (isLikelyGraphicDescription(list.textContent.replace(/\s+/g, " ").trim())) list.remove();
    }
    // Also remove divs/spans that look like descriptions
    for (const el of root.querySelectorAll("div,span,p")) {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (text.length > 30 && isLikelyGraphicDescription(text) && !el.querySelector("math,img,svg,table")) {
        el.remove();
      }
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
      const seps = sepsAttr !== null ? sepsAttr : ",";
      
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
          return text;
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
          return text;
        }

        case "mtext": {
          const text = el.textContent || "";
          if (!text.trim()) return "\\; ";
          return "\\text{" + text + "}";
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
          const latex = mathmlToLatex(mathEl);
          if (!latex) continue;
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

  function showNotice(text, type) { state.notice = { text, type }; }

  function showBackupMsg(text, type = "success") {
    state.backupMessage = { text, type };
    if (state.backupMsgTimer) clearTimeout(state.backupMsgTimer);
    state.backupMsgTimer = setTimeout(() => { state.backupMessage = null; if (state.view === "dashboard") renderHome(); }, 10000);
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
