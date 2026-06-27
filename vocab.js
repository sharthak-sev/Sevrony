(function () {
  "use strict";

    let vocabState = {
    sessionActive: false,
    sessionWords: [], // total 20 words for the session
    cycle: 1,
    maxCycles: 2,
    words: [], // words for the current cycle
    currentIndex: 0,
    currentBatch: [],
    batchSize: 10,
    mode: null, // 'learn' or 'flashcard'
    phase: null, // 'flashcard' | 'mcq' | 'match' | 'sentence'
    phaseIndex: 0, // which phase we're on (0-3)
    allDbWords: [], // cached copy for distractor generation
    // Match state
    matchWords: [],
    matchSelected: { left: null, right: null },
    matchPaired: [],
    matchWrong: null,
    matchCorrect: null,
    matchChunk: null,
    matchMeanings: null,
    matchCompleteScheduled: false,
    // MCQ state
    mcqSelected: null,
    mcqCorrectValue: null,
    mcqOptions: null,
    lastSentenceSubmitted: null,
    // Backend API
    backendEndpoint: 'https://divine-silence-6016.sharthakjaiswal50.workers.dev/', // Replace this with your actual deployed Cloudflare Worker URL
    showSettings: false,
  };

  try {
    const saved = localStorage.getItem('sat_vocab_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(vocabState, parsed);
      vocabState.completedWords = new Set(parsed.completedWords || []);
    }
  } catch(e) {}

  function saveVocabState() {
    const { allDbWords, ...stateToSave } = vocabState;
    stateToSave.completedWords = Array.from(vocabState.completedWords || []);
    localStorage.setItem('sat_vocab_state', JSON.stringify(stateToSave));
  }

  const PHASES_LEARN = ['flashcard', 'mcq', 'match', 'sentence'];

  // Fisher-Yates shuffle
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  
  async function updateWordDB(wordObj, mastered) {
    const dbWords = await window.SatPracticeDB.getAll("vocabWords");
    const dbWord = dbWords.find(w => w.word === wordObj.word);
    if (!dbWord) return;

    if (mastered) {
      if (dbWord.status === "New") {
        dbWord.status = "Learning";
        dbWord.interval = 1;
      } else {
        if (dbWord.interval === 0) dbWord.interval = 1;
        else if (dbWord.interval === 1) dbWord.interval = 6;
        else dbWord.interval = Math.round(dbWord.interval * dbWord.easeFactor);
      }
      dbWord.status = "Mastered";
      dbWord.nextReviewDate = Date.now() + dbWord.interval * 24 * 60 * 60 * 1000;
    } else {
      dbWord.status = "Learning";
      dbWord.interval = 0;
      dbWord.easeFactor = Math.max(1.3, dbWord.easeFactor - 0.2);
      dbWord.nextReviewDate = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
    }
    await window.SatPracticeDB.put("vocabWords", dbWord);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Strip the "noun. " / "verb. " / "adj. " prefix for display-only contexts
  function stripPosTag(meaning) {
    return meaning.replace(/^(noun|verb|adj|adv)\.\s*/i, '');
  }

  // Get the POS tag from a meaning string
  function getPosTag(meaning) {
    const m = meaning.match(/^(noun|verb|adj|adv)\./i);
    return m ? m[1].toLowerCase() : null;
  }

  // Pick N distractors from allDbWords that share the same POS tag prefix
  function pickDistractors(correctWord, count = 3) {
    const correctPos = getPosTag(correctWord.meaning);
    let pool = vocabState.allDbWords.filter(w =>
      w.word !== correctWord.word
    );

    // If the correct answer has a POS tag, prefer distractors with the SAME tag
    if (correctPos) {
      const samePosPool = pool.filter(w => getPosTag(w.meaning) === correctPos);
      if (samePosPool.length >= count) {
        pool = samePosPool;
      }
      // else fall back to full pool so we have enough options
    }

    const shuffled = shuffle(pool);
    return shuffled.slice(0, count);
  }

  function getAIBadgeStyle() {
    return vocabState.backendEndpoint ? 'background: var(--bb-blue-soft); color: var(--bb-blue); border: 1px solid var(--line);' : 'background: var(--paper); color: var(--ink-muted); border: 1px solid var(--line);';
  }

  async function initVocab() {
    try {
      const existingWords = await window.SatPracticeDB.getAll("vocabWords");
      if (existingWords.length === 0) {
        const response = await fetch("dsat_vocabulary.json");
        if (response.ok) {
          const words = await response.json();
          const dbWords = words.map(w => ({
            word: w.word,
            meaning: w.meaning,
            example: w.example,
            status: "New",
            easeFactor: 2.5,
            interval: 0,
            nextReviewDate: Date.now()
          }));
          await window.SatPracticeDB.putMany("vocabWords", dbWords);
          console.log(`Seeded ${dbWords.length} vocabulary words.`);
        } else {
          console.warn("dsat_vocabulary.json not found for seeding.");
        }
      }
    } catch (e) {
      console.error("Error initializing vocabulary:", e);
    }
  }

  function renderDashboard() {
    if (vocabState.sessionActive) {
      return renderSession();
    }

    return `
      <style>
        .vocab-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          max-width: 800px;
          margin: 0 auto;
        }
        @media (max-width: 600px) {
          .vocab-grid {
            grid-template-columns: 1fr;
          }
        }
        
        .vocab-card {
          position: relative;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg, 16px);
          padding: 32px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          text-align: left;
          /* Emil Design: Hardware-accelerated properties only, custom cubic-bezier */
          transition: transform 250ms cubic-bezier(0.23, 1, 0.32, 1), 
                      box-shadow 250ms cubic-bezier(0.23, 1, 0.32, 1),
                      border-color 250ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        
        /* Emil Design: Hover and active states */
        .vocab-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
          border-color: var(--ink-muted);
        }
        
        .vocab-card:active {
          transform: translateY(0) scale(0.98);
          box-shadow: var(--shadow-sm);
        }
        
        /* Inner elements */
        .vocab-icon-wrapper {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
          /* Theme integration */
          background: var(--paper);
          border: 1px solid var(--line-light);
          color: var(--ink);
          transition: background 250ms ease, color 250ms ease;
        }
        
        .vocab-card.primary:hover .vocab-icon-wrapper {
          background: var(--bb-navy);
          color: white;
        }

        .vocab-title {
          font-size: 20px;
          font-weight: 700;
          color: var(--ink);
          margin: 0 0 8px 0;
          letter-spacing: -0.02em;
        }
        
        .vocab-desc {
          font-size: 15px;
          line-height: 1.6;
          color: var(--ink-secondary);
          margin: 0 0 32px 0;
        }
        
        /* Button styling aligned with Shadcn */
        .vocab-btn {
          margin-top: auto;
          width: 100%;
          border-radius: var(--radius-md);
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 150ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        
        .vocab-btn-primary {
          background: var(--bb-navy);
          color: white;
          border: 1px solid var(--bb-navy);
        }
        
        .vocab-btn-secondary {
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        
        /* Emil: Button active scale */
        .vocab-card:hover .vocab-btn-secondary {
          border-color: var(--ink-muted);
        }
        
        .vocab-tag {
          display: inline-flex;
          align-items: center;
          padding: 2px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          background: var(--paper);
          border: 1px solid var(--line);
          color: var(--ink-secondary);
        }
      </style>
      
      <div style="margin-bottom: 48px; text-align: center; max-width: 600px; margin-left: auto; margin-right: auto; padding-top: 24px;">
        <h2 style="font-size: 32px; font-weight: 800; letter-spacing: -0.04em; color: var(--ink); margin-bottom: 12px;">Vocabulary</h2>
        <p style="font-size: 16px; line-height: 1.6; color: var(--ink-secondary); text-wrap: balance; margin-bottom: 24px;">Master high-frequency SAT words with adaptive spaced repetition.</p>
        <button class="secondary-btn" style="border-radius: var(--radius-pill); padding: 8px 24px; font-size: 14px;" onclick="window.location.hash='#vocab-mastered'">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; vertical-align: -3px;"><path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"></path></svg>
          View Mastered Words
        </button>
      </div>
      
      <div class="vocab-grid">
        
        <!-- Learn Mode -->
        <div class="vocab-card primary" onclick="window.Vocab.startSession('learn')">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div class="vocab-icon-wrapper">
               <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </div>
            <span class="vocab-tag">Recommended</span>
          </div>
          
          <h3 class="vocab-title">Learn Mode</h3>
          <p class="vocab-desc">Master words through a sequential flow: Flashcards, Multiple Choice, Matching, and Sentence Construction.</p>
          
          <div class="vocab-btn vocab-btn-primary">
            Start Learning
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </div>



        <!-- Flashcard Mode -->
        <div class="vocab-card" onclick="window.Vocab.startSession('flashcard')">
          <div class="vocab-icon-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/></svg>
          </div>
          
          <h3 class="vocab-title">Flashcard Practice</h3>
          <p class="vocab-desc">Flip through a batch of 20 flashcards to quickly review and reinforce your vocabulary knowledge.</p>
          
          <div class="vocab-btn vocab-btn-secondary">
            Quick Review
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </div>

      </div>
    `;
  }

    async function startSession(mode) {
    const allWords = await window.SatPracticeDB.getAll("vocabWords");
    vocabState.allDbWords = allWords; // cache for distractors

    const shuffledAll = shuffle(allWords);
    shuffledAll.sort((a, b) => a.nextReviewDate - b.nextReviewDate);

    if (mode === 'learn' && vocabState.mode === 'learn' && vocabState.sessionWords && vocabState.sessionWords.length > 0 && !vocabState.sessionComplete) {
       vocabState.sessionActive = true;
       saveVocabState();
       if (window.renderHome) window.renderHome();
       return;
    }

    vocabState.sessionActive = true;
    vocabState.mode = mode;
    vocabState.currentIndex = 0;
    vocabState.completedWords = new Set();
    vocabState.phasesPassed = 0;
    vocabState.sessionComplete = false;

    if (mode === 'flashcard') {
      vocabState.words = shuffle(shuffledAll.slice(0, 20));
      vocabState.currentBatch = vocabState.words.map(w => ({
        ...w,
        activity: 'flashcard',
        passed: false,
        mistakes: 0
      }));
      vocabState.phase = 'flashcard';
      vocabState.phaseIndex = 0;
    } else {
      vocabState.sessionWords = shuffledAll.slice(0, 20); // up to 20 words due
      vocabState.words = shuffle(vocabState.sessionWords.slice(0, 10)); // first 10 for cycle 1
      vocabState.cycle = 1;
      vocabState.phase = PHASES_LEARN[0];
      vocabState.phaseIndex = 0;
      vocabState.currentBatch = vocabState.words.map(w => ({
        ...w,
        activity: vocabState.phase,
        passed: false,
        mistakes: 0
      }));
    }

    saveVocabState();
    if (window.renderHome) window.renderHome();
  }

    function advancePhase() {
    if (vocabState.mode === 'flashcard') {
      return false;
    }

    vocabState.phaseIndex++;
    if (vocabState.phaseIndex >= PHASES_LEARN.length) {
      if (vocabState.cycle < vocabState.maxCycles) {
        // End of Cycle 1
        const unmastered = [];
        vocabState.currentBatch.forEach(w => {
          let orig = vocabState.words.find(x => x.word === w.word);
          let mistakes = orig ? orig.mistakes : w.mistakes;
          if (mistakes > 0) {
            unmastered.push(w);
            updateWordDB(w, false);
          } else {
            updateWordDB(w, true);
          }
        });
        
        // Prepare Cycle 2
        const neededNew = 10 - unmastered.length;
        const newWords = vocabState.sessionWords.slice(10, 10 + neededNew);
        vocabState.words = shuffle([...unmastered, ...newWords]);
        
        vocabState.cycle++;
        vocabState.phaseIndex = 0;
        vocabState.phase = PHASES_LEARN[vocabState.phaseIndex];
        vocabState.currentIndex = 0;
        
        vocabState.currentBatch = vocabState.words.map(w => ({
          ...w,
          activity: vocabState.phase,
          passed: false,
          mistakes: 0
        }));
        
        saveVocabState();
        return true;
      } else {
        // End of Cycle 2
        vocabState.currentBatch.forEach(w => {
          let orig = vocabState.words.find(x => x.word === w.word);
          let mistakes = orig ? orig.mistakes : w.mistakes;
          updateWordDB(w, mistakes === 0);
        });
        vocabState.sessionComplete = true;
        saveVocabState();
        return false;
      }
    }

    vocabState.phase = PHASES_LEARN[vocabState.phaseIndex];
    vocabState.currentIndex = 0;

    const reshuffled = shuffle(vocabState.words);
    vocabState.currentBatch = reshuffled.map(w => ({
      ...w,
      activity: vocabState.phase,
      passed: false,
      mistakes: w.mistakes || 0
    }));
    
    // Copy over accumulated mistakes for currentBatch from the canonical vocabState.words
    vocabState.currentBatch.forEach(w => {
      const orig = vocabState.words.find(x => x.word === w.word);
      if (orig) w.mistakes = orig.mistakes || 0;
    });

    saveVocabState();

    if (vocabState.phase === 'match') {
      vocabState.matchWords = [];
      vocabState.matchSelected = { left: null, right: null };
      vocabState.matchPaired = [];
      vocabState.matchWrong = null;
      vocabState.matchCorrect = null;
      vocabState.matchChunk = null;
      vocabState.matchMeanings = null;
      vocabState.matchCompleteScheduled = false;
    }

    return true;
  }

  function renderSession() {
    if (vocabState.currentIndex >= vocabState.currentBatch.length) {
      // Current phase complete — try to advance
      if (advancePhase()) {
        return renderSession(); // Re-render the next phase directly to avoid DOM overwrites
      }
      return renderSessionComplete();
    }

    const currentWord = vocabState.currentBatch[vocabState.currentIndex];

    let activityHTML = '';
    if (currentWord.activity === 'flashcard') {
      activityHTML = renderFlashcard(currentWord);
    } else if (currentWord.activity === 'mcq') {
      activityHTML = renderMCQ(currentWord);
    } else if (currentWord.activity === 'sentence') {
      activityHTML = renderSentence(currentWord);
    } else if (currentWord.activity === 'match') {
      activityHTML = renderMatch();
    }

    // Global progress across all phases
    let totalItems, completedItems, progress;
    if (vocabState.mode === 'flashcard') {
      totalItems = vocabState.words.length;
      completedItems = vocabState.currentIndex;
      progress = (vocabState.currentIndex / vocabState.currentBatch.length) * 100;
    } else {
      totalItems = 20;
      completedItems = vocabState.completedWords ? vocabState.completedWords.size : 0;
      progress = Math.min(((vocabState.phasesPassed || 0) / 80) * 100, 100);
    }

    const phaseLabel = vocabState.mode === 'learn'
      ? `<span style="font-size: 12px; padding: 2px 10px; border-radius: 12px; font-weight: 600; ${getPhaseStyle(vocabState.phase)}">${getPhaseName(vocabState.phase)}</span>`
      : '';

    return `
      <div class="vocab-session">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
          <button class="ghost-btn icon-btn" onclick="window.Vocab.showExitModal()">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <div style="flex: 1; height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; position: relative;">
            <div style="height: 100%; width: ${progress}%; background: var(--bb-blue); transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 4px;"></div>
          </div>
          <span class="muted" style="font-size: 14px; white-space: nowrap; font-weight: 600;">${completedItems} / ${totalItems}</span>
          ${phaseLabel}
        </div>
        
        <div style="max-width: 800px; margin: 0 auto;">
          ${activityHTML}
        </div>
      </div>
    `;
  }

  function getPhaseName(phase) {
    switch (phase) {
      case 'flashcard': return 'Flashcards';
      case 'mcq': return 'Multiple Choice';
      case 'match': return 'Match';
      case 'sentence': return 'Use in a Sentence';
      default: return '';
    }
  }

  function getPhaseStyle(phase) {
    switch (phase) {
      case 'flashcard': return 'background: #dbeafe; color: #1d4ed8;';
      case 'mcq': return 'background: #dcfce7; color: #15803d;';
      case 'match': return 'background: #ede9fe; color: #6d28d9;';
      case 'sentence': return 'background: #fef3c7; color: #b45309;';
      default: return '';
    }
  }

  function renderFlashcard(wordObj) {
    return `
      <div class="vocab-flashcard-container" onclick="this.classList.toggle('flipped')">
        <div class="vocab-flashcard-inner">
          <div class="vocab-flashcard-front">
            <h2 style="font-size: 36px; margin-bottom: 16px; font-weight: 800; letter-spacing: -0.02em; word-break: break-word; padding: 0 16px;">${wordObj.word}</h2>
            <p class="vocab-flashcard-hint muted">Click to flip</p>
          </div>
          <div class="vocab-flashcard-back">
            <h2 style="font-size: 28px; margin-bottom: 16px; font-weight: 800; letter-spacing: -0.02em; border-bottom: 1px solid var(--line); padding-bottom: 16px; width: 100%; word-break: break-word;">${wordObj.word}</h2>
            <p style="font-size: 18px; margin-bottom: 16px; line-height: 1.5; word-break: break-word;"><strong>Meaning:</strong> ${wordObj.meaning}</p>
            <p class="muted" style="font-style: italic; font-size: 16px; line-height: 1.5;">"${wordObj.example}"</p>
          </div>
        </div>
      </div>
      <div style="display: flex; justify-content: center; gap: 16px; margin-top: 32px;">
        <button class="ghost-btn large" style="min-width: 140px;" onclick="window.Vocab.nextQuestion(false)">Still Learning</button>
        <button class="primary-btn large" style="min-width: 140px; border-radius: var(--radius-pill);" onclick="window.Vocab.nextQuestion(true)">Got It</button>
      </div>
    `;
  }

  function renderMCQ(wordObj) {
    // Pull distractors from the SAME DB pool
    const distractors = pickDistractors(wordObj, 3);
    
    // We want consistent options across re-renders when an option is selected.
    if (!vocabState.mcqOptions) {
      vocabState.mcqOptions = shuffle([
        stripPosTag(wordObj.meaning),
        ...distractors.map(d => stripPosTag(d.meaning))
      ]);
      vocabState.mcqCorrectValue = stripPosTag(wordObj.meaning);
    }
    const options = vocabState.mcqOptions;

    const labels = ['A', 'B', 'C', 'D'];

    const nextButton = vocabState.mcqSelected ? 
      `<div style="margin-top: 32px; text-align: center;"><button class="primary-btn large" style="min-width: 200px; border-radius: var(--radius-pill);" onclick="window.Vocab.nextMCQ()">Next Question</button></div>` : '';

    return `
      <div style="margin-bottom: 24px;">
        <span class="vocab-phase-badge" style="background: var(--blue); color: white;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Multiple Choice
        </span>
      </div>
      <h2 style="font-size: 26px; margin-bottom: 32px; font-weight: 700; letter-spacing: -0.02em; word-break: break-word;">What does <strong style="color: var(--bb-blue); font-weight: 800;">${wordObj.word}</strong> mean?</h2>
      <div class="choice-list" style="max-width: 600px; margin: 0 auto;">
        ${options.map((opt, i) => {
          let extraClass = "";
          let clickHandler = vocabState.mcqSelected ? "" : `onclick="window.Vocab.selectMCQ('${opt.replace(/'/g, "\\'")}')"`;

          if (vocabState.mcqSelected) {
            if (opt === vocabState.mcqCorrectValue) {
              extraClass = "correct-choice";
            } else if (opt === vocabState.mcqSelected && opt !== vocabState.mcqCorrectValue) {
              extraClass = "incorrect-choice";
            } else {
              extraClass = "dimmed-choice";
            }
          }

          return `
            <div class="choice-row ${extraClass}">
              <button class="choice-button" style="border-radius: var(--radius-md);" ${clickHandler}>
                <span class="choice-letter">${labels[i]}</span>
                <span class="choice-content"><p>${opt}</p></span>
              </button>
            </div>
          `;
        }).join('')}
      </div>
      ${nextButton}
    `;
  }

  function renderMatch() {
    // Initialize match state if not done
    if (vocabState.matchWords.length === 0) {
      vocabState.matchWords = vocabState.currentBatch.map(w => ({
        word: w.word,
        meaning: w.meaning,
        id: w.word
      }));
      vocabState.matchPaired = [];
      vocabState.matchSelected = { left: null, right: null };
      vocabState.matchWrong = null;
      vocabState.matchCorrect = null;
      vocabState.matchChunk = null;
      vocabState.matchMeanings = null;
      vocabState.matchCompleteScheduled = false;
    }

    // Refresh chunk if empty or fully paired
    if (!vocabState.matchChunk || vocabState.matchChunk.every(w => vocabState.matchPaired.includes(w.id))) {
      const unpaired = vocabState.matchWords.filter(w => !vocabState.matchPaired.includes(w.id));
      if (unpaired.length === 0) {
        // All matched — advance to next phase
        if (!vocabState.matchCompleteScheduled) {
          vocabState.matchCompleteScheduled = true;
          setTimeout(() => {
            if (vocabState.phase === 'match') {
              vocabState.currentIndex = vocabState.currentBatch.length; // force phase advance
              saveVocabState();
              if (window.renderHome) window.renderHome();
            }
          }, 800);
        }
        return `
          <div class="card" style="text-align: center; padding: 48px;">
            <h3 style="color: #10b981; margin-bottom: 8px;">All Matched! ✓</h3>
            <p class="muted">Moving on...</p>
          </div>
        `;
      }
      // Show up to 5 at a time for readability
      vocabState.matchChunk = unpaired;
      vocabState.matchMeanings = shuffle(vocabState.matchChunk.map(w => ({ meaning: stripPosTag(w.meaning), id: w.id })));
    }

    const chunk = vocabState.matchChunk;
    const shuffledMeanings = vocabState.matchMeanings;
    const sel = vocabState.matchSelected;
    const paired = vocabState.matchPaired;

    return `
      <div style="margin-bottom: 32px;">
        <span class="vocab-phase-badge" style="background: #8b5cf6; color: white;">
          Match the Following
        </span>
        <span class="muted" style="font-size: 14px; margin-left: 16px; font-weight: 500;">${vocabState.matchPaired.length} / ${vocabState.matchWords.length} matched</span>
      </div>
      <div class="vocab-match-grid">
        <div class="vocab-match-col">
          <div class="vocab-match-header">Word</div>
          ${chunk.map(w => {
            const isPaired = paired.includes(w.id);
            const isSelected = sel.left === w.id;
            const isWrongLeft = vocabState.matchWrong && sel.left === w.id;
            const isCorrectLeft = vocabState.matchCorrect && vocabState.matchCorrect.left === w.id;
            
            let stateClass = "";
            if (isPaired && !isCorrectLeft) stateClass = "paired";
            else if (isCorrectLeft) stateClass = "correct";
            else if (isWrongLeft) stateClass = "wrong";
            else if (isSelected) stateClass = "selected";

            return `<button class="vocab-match-btn ${stateClass}" onclick="window.Vocab.matchSelect('left', '${w.id.replace(/'/g, "\\'")}')">
              <span>${w.word}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="vocab-match-col">
          <div class="vocab-match-header">Meaning</div>
          ${shuffledMeanings.map(m => {
            const isPaired = paired.includes(m.id);
            const isSelected = sel.right === m.id;
            const isWrongRight = vocabState.matchWrong && sel.right === m.id;
            const isCorrectRight = vocabState.matchCorrect && vocabState.matchCorrect.right === m.id;
            
            let stateClass = "";
            if (isPaired && !isCorrectRight) stateClass = "paired";
            else if (isCorrectRight) stateClass = "correct";
            else if (isWrongRight) stateClass = "wrong";
            else if (isSelected) stateClass = "selected-right";

            return `<button class="vocab-match-btn text-small ${stateClass}" onclick="window.Vocab.matchSelect('right', '${m.id.replace(/'/g, "\\'")}')">
              <span>${m.meaning}</span>
            </button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

    function matchSelect(side, id) {
    vocabState.matchWrong = null;
    vocabState.matchSelected[side] = id;

    if (vocabState.matchSelected.left && vocabState.matchSelected.right) {
      if (vocabState.matchSelected.left === vocabState.matchSelected.right) {
        vocabState.matchCorrect = { left: vocabState.matchSelected.left, right: vocabState.matchSelected.right };
        vocabState.matchPaired.push(vocabState.matchSelected.left);
        vocabState.matchSelected = { left: null, right: null };
        
        if (window.renderHome) window.renderHome();
        
        setTimeout(() => {
          vocabState.matchCorrect = null;
          if (window.renderHome) window.renderHome();
        }, 600);
      } else {
        let w = vocabState.words.find(x => x.word === vocabState.matchSelected.left);
        if (w) w.mistakes = (w.mistakes || 0) + 1;
        
        vocabState.matchWrong = true;
        setTimeout(() => {
          vocabState.matchWrong = null;
          vocabState.matchSelected = { left: null, right: null };
          if (window.renderHome) window.renderHome();
        }, 800);
      }
    }
    saveVocabState();
    if (window.renderHome) window.renderHome();
  }

  function renderSentence(wordObj) {
    return `
      <div style="margin-bottom: 24px;">
        <span class="vocab-phase-badge" style="background: var(--amber); color: white;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Use in a Sentence
        </span>
      </div>
      <h2 style="font-size: 28px; margin-bottom: 12px; font-weight: 800; letter-spacing: -0.02em;">${wordObj.word}</h2>
      <p class="muted" style="margin-bottom: 32px; font-size: 16px;">${wordObj.meaning}</p>
      
      <div class="vocab-sentence-card card">
        <input type="text" id="vocab-sentence-input" class="vocab-sentence-input" placeholder="Type your sentence here..." autocomplete="off">
        <button id="vocab-check-btn" class="primary-btn large" style="border-radius: var(--radius-pill); flex-shrink: 0; padding: 0 32px;" onclick="window.Vocab.checkSentence()">Check</button>
      </div>
      
      <div id="sentence-feedback" class="vocab-sentence-feedback" style="display: none;"></div>
    `;
  }

  function renderSessionComplete() {
    const phaseSummary = vocabState.mode === 'learn' ? `
      <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px;">
        <span style="padding: 4px 12px; border-radius: 12px; font-size: 12px; ${getPhaseStyle('flashcard')}">✓ Flashcards</span>
        <span style="padding: 4px 12px; border-radius: 12px; font-size: 12px; ${getPhaseStyle('mcq')}">✓ MCQ</span>
        <span style="padding: 4px 12px; border-radius: 12px; font-size: 12px; ${getPhaseStyle('match')}">✓ Match</span>
        <span style="padding: 4px 12px; border-radius: 12px; font-size: 12px; ${getPhaseStyle('sentence')}">✓ Sentences</span>
      </div>
    ` : '';

    return `
      <div class="card" style="text-align: center; padding: 48px; max-width: 500px; margin: 40px auto;">
        <h2 style="font-size: 28px; margin-bottom: 16px;">Session Complete! 🎉</h2>
        ${phaseSummary}
        <p class="muted" style="margin-bottom: 24px;">You've finished your vocabulary session.</p>
        <button class="primary-btn large" style="border-radius: var(--radius-pill);" onclick="window.Vocab.endSession()">Return to Dashboard</button>
      </div>
    `;
  }

  function checkMCQ(selected, correct) {
    const passed = selected === correct;
    nextQuestion(passed);
  }

  function selectMCQ(opt) {
    if (vocabState.mcqSelected) return; // Prevent multiple selections
    vocabState.mcqSelected = opt;
    saveVocabState();
    if (window.renderHome) window.renderHome();
  }

  function nextMCQ() {
    const passed = vocabState.mcqSelected === vocabState.mcqCorrectValue;
    vocabState.mcqSelected = null;
    vocabState.mcqCorrectValue = null;
    vocabState.mcqOptions = null;
    nextQuestion(passed);
  }

  async function callBackend(word, meaning, sentence) {
    const response = await fetch(vocabState.backendEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ word, meaning, sentence })
    });
    
    if (!response.ok) {
      let errorMessage = `Backend returned ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage += ` - ${errorData.error}`;
        }
      } catch (e) {
        // Fallback if not JSON
      }
      throw new Error(errorMessage);
    }
    
    return await response.json();
  }

  async function checkSentence() {
    const input = document.getElementById('vocab-sentence-input').value.trim();
    const feedbackDiv = document.getElementById('sentence-feedback');
    const checkBtn = document.getElementById('vocab-check-btn');
    const wordObj = vocabState.currentBatch[vocabState.currentIndex];

    if (!input) return;

    if (input === vocabState.lastSentenceSubmitted) {
      feedbackDiv.style.display = 'block';
      feedbackDiv.innerHTML = `
        <div class="vocab-sentence-feedback-inner error">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 18px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <strong>Duplicate Sentence</strong>
          </div>
          <p style="font-size: 15px; margin: 0;">You just submitted this exact sentence. Please modify it before trying again.</p>
        </div>
      `;
      return;
    }

    if (checkBtn && checkBtn.disabled) return;

    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.dataset.originalText = checkBtn.innerText;
      checkBtn.innerText = "Checking...";
      checkBtn.style.opacity = "0.5";
    }

    feedbackDiv.style.display = 'block';
    feedbackDiv.innerHTML = '<p class="muted">Analyzing...</p>';

    let isValid = false;
    let feedback = "";
    let modelUsed = "";
    let isRateLimited = false;

    vocabState.lastSentenceSubmitted = input;

    try {
      if (vocabState.backendEndpoint) {
        const result = await callBackend(wordObj.word, wordObj.meaning, input);
        isValid = result.isValid;
        feedback = result.feedback;
        modelUsed = 'AI Evaluated';
      } else {
        // Heuristic fallback if no backend is set
        if (input.length < 15) {
          isValid = false;
          feedback = "Your sentence is very short and lacks context to show that you understand the meaning. Try adding more detail.";
        } else if (!input.toLowerCase().includes(wordObj.word.toLowerCase())) {
          isValid = false;
          feedback = "Your sentence doesn't seem to include the target word. Please use it in context.";
        } else {
          isValid = true;
          feedback = "Your sentence appears reasonable based on length and word usage.";
        }
        modelUsed = 'Basic Checks';
      }
    } catch (e) {
      if (e.message && e.message.includes('429')) {
        isRateLimited = true;
        feedback = "Too many attempts. Please wait a few seconds before trying again.";
        modelUsed = 'Rate Limited';
      } else {
        // Error fallback
        if (input.length > 10 && input.toLowerCase().includes(wordObj.word.toLowerCase())) {
          isValid = true;
        }
        feedback = "Unable to reach AI. Applied basic checks instead.";
        modelUsed = 'Basic Checks';
      }
    }

    const modelBadge = `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: var(--radius-pill); margin-top: 8px; ${getAIBadgeStyle()}">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
      ${modelUsed}
    </span>`;

    if (isValid) {
      if (checkBtn) {
        checkBtn.innerText = checkBtn.dataset.originalText;
        checkBtn.style.opacity = "1";
        checkBtn.disabled = false;
      }
      feedbackDiv.innerHTML = `
        <div class="vocab-sentence-feedback-inner success">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 18px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            <strong>Correct!</strong>
          </div>
          <p style="font-size: 15px; margin: 0;">${feedback}</p>
          <div>${modelBadge}</div>
          <div style="margin-top: 8px;">
            <button class="primary-btn" style="border-radius: var(--radius-pill); padding: 8px 24px;" onclick="window.Vocab.nextQuestion(true)">Next Word &rsaquo;</button>
          </div>
        </div>
      `;
    } else {
      if (checkBtn) {
        let cooldown = 3;
        checkBtn.innerText = `Wait ${cooldown}s...`;
        const interval = setInterval(() => {
          cooldown--;
          if (cooldown <= 0) {
            clearInterval(interval);
            checkBtn.innerText = checkBtn.dataset.originalText;
            checkBtn.style.opacity = "1";
            checkBtn.disabled = false;
          } else {
            checkBtn.innerText = `Wait ${cooldown}s...`;
          }
        }, 1000);
      }

      const alertClass = isRateLimited ? 'rate-limit' : 'error';
      const icon = isRateLimited ? 
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>` : 
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
      const title = isRateLimited ? 'Too Many Requests' : 'Need More Context';
      
      feedbackDiv.innerHTML = `
        <div class="vocab-sentence-feedback-inner ${alertClass}">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 18px;">
            ${icon}
            <strong>${title}</strong>
          </div>
          <p style="font-size: 15px; margin: 0;">${feedback}</p>
          <div>${modelBadge}</div>
          <div style="margin-top: 8px; display: flex; gap: 12px;">
            ${isRateLimited ? '' : `<button class="secondary-btn" style="border-radius: var(--radius-pill); padding: 8px 24px;" onclick="document.getElementById('sentence-feedback').style.display='none'">Try Again</button>`}
            <button class="ghost-btn" style="border-radius: var(--radius-pill); padding: 8px 24px;" onclick="window.Vocab.nextQuestion(false)">Skip for now</button>
          </div>
        </div>
      `;
    }
  }

  function nextQuestion(passed) {
    vocabState.lastSentenceSubmitted = null;
    const currentWord = vocabState.currentBatch[vocabState.currentIndex];
    if (passed) {
      currentWord.passed = true;
      if (vocabState.mode === 'learn') {
        vocabState.phasesPassed = (vocabState.phasesPassed || 0) + 1;
      }
    } else {
      currentWord.mistakes = (currentWord.mistakes || 0) + 1;
      let orig = vocabState.words.find(w => w.word === currentWord.word);
      if (orig) orig.mistakes = (orig.mistakes || 0) + 1;
      
      if (vocabState.mode === 'flashcard') {
        vocabState.currentBatch.push(currentWord);
      }
    }
    
    if (vocabState.mode === 'learn' && vocabState.phase === 'sentence' && passed) {
        let orig = vocabState.words.find(w => w.word === currentWord.word);
        if (orig && (orig.mistakes || 0) === 0) {
            if (!vocabState.completedWords) vocabState.completedWords = new Set();
            vocabState.completedWords.add(currentWord.word);
            updateWordDB(currentWord, true);
        }
    }

    vocabState.currentIndex++;
    saveVocabState();
    if (window.renderHome) window.renderHome();
  }

  function endSession() {
    vocabState.sessionActive = false;
    if (vocabState.mode === 'flashcard' || vocabState.sessionComplete) {
      vocabState.words = [];
      vocabState.sessionWords = [];
      vocabState.currentBatch = [];
      vocabState.phase = null;
      vocabState.phaseIndex = 0;
      vocabState.completedWords = new Set();
      vocabState.sessionComplete = false;
      vocabState.phasesPassed = 0;
    }
    vocabState.matchWords = [];
    vocabState.matchPaired = [];
    vocabState.matchSelected = { left: null, right: null };
    vocabState.matchWrong = null;
    vocabState.matchCorrect = null;
    vocabState.matchChunk = null;
    vocabState.matchMeanings = null;
    vocabState.matchCompleteScheduled = false;
    vocabState.mcqSelected = null;
    vocabState.mcqCorrectValue = null;
    vocabState.mcqOptions = null;
    vocabState.lastSentenceSubmitted = null;
    saveVocabState();
    if (window.renderHome) window.renderHome();
  }

  function showExitModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal-content confirm-modal";
    modal.style.position = "relative";
    
    modal.innerHTML = `
      <button class="ghost-btn icon-btn close-modal-btn" style="position: absolute; top: 12px; right: 12px; padding: 6px; z-index: 10;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <h3 style="margin-top: 0; font-size: 18px; font-weight: 700;">Exit Session</h3>
      <p class="modal-message" style="margin-top: 8px;">Mastered words are already saved.</p>
      <div class="modal-actions" style="display:flex; flex-direction: column; gap:12px; margin-top:24px;">
        <button class="secondary-btn save-exit-btn" style="width: 100%; justify-content: center;">Save and Exit</button>
        <button class="danger-btn finalize-btn" style="width: 100%; justify-content: center;">Finalize Session</button>
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

    modal.querySelector(".close-modal-btn").onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
    
    modal.querySelector(".save-exit-btn").onclick = () => {
      close();
      endSession();
    };
    
    modal.querySelector(".finalize-btn").onclick = () => {
      close();
      finalizeSession();
    };
  }

  function toggleSettings() {
    vocabState.showSettings = !vocabState.showSettings;
    if (window.renderHome) window.renderHome();
  }

  
  function renderMastered() {
    setTimeout(() => {
      if (window.renderMasteredList) window.renderMasteredList();
    }, 0);
    return `
      <style>
        .mastered-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 16px;
          max-width: 800px;
          margin: 0 auto;
          padding: 0 20px 40px;
        }
        @media (max-width: 600px) {
          .mastered-grid {
            grid-template-columns: 1fr;
            padding: 0 16px 40px;
          }
        }
        .mastered-card {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          padding: 16px;
        }
      </style>
      <div style="margin-bottom: 48px; text-align: center; max-width: 600px; margin-left: auto; margin-right: auto; padding-top: 24px;">
        <h2 style="font-size: 32px; font-weight: 800; letter-spacing: -0.04em; color: var(--ink); margin-bottom: 12px;">Mastered Words</h2>
        <p style="font-size: 16px; line-height: 1.6; color: var(--ink-secondary); text-wrap: balance;">Words you've successfully learned.</p>
        <button class="ghost-btn" style="margin-top: 16px;" onclick="window.location.hash='#vocab'">Back to Dashboard</button>
      </div>
      <div id="mastered-list" class="mastered-grid" style="text-align: center; color: var(--ink-muted);">Loading...</div>
    `;
  }
  
  window.renderMasteredList = async function() {
    const allWords = await window.SatPracticeDB.getAll("vocabWords");
    const mastered = allWords.filter(w => w.status === "Mastered");
    const container = document.getElementById("mastered-list");
    if (!container) return;
    if (mastered.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--ink-muted); padding: 0 16px; width: 100%; box-sizing: border-box;">You haven't mastered any words yet.</div>`;
      return;
    }
    container.innerHTML = mastered.map(w => `
      <div class="mastered-card" style="text-align: left;">
        <h3 style="font-size: 18px; margin: 0 0 8px 0; font-weight: 700;">${w.word}</h3>
        <p style="font-size: 14px; margin: 0; color: var(--ink-secondary);">${w.meaning}</p>
      </div>
    `).join('');
  };

  function finalizeSession() {
    vocabState.sessionComplete = true;
    endSession();
  }

  window.Vocab = {
    init: initVocab,
    renderDashboard,
    startSession,
    endSession,
    finalizeSession,
    showExitModal,
    nextQuestion,
    checkMCQ,
    selectMCQ,
    nextMCQ,
    checkSentence,
    matchSelect,
    toggleSettings,
    renderMastered
  };

})();
