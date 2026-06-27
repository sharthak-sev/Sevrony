(function () {
  "use strict";

  let vocabState = {
    sessionActive: false,
    words: [],
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
    // MCQ state
    // Backend API
    backendEndpoint: 'https://divine-silence-6016.sharthakjaiswal50.workers.dev/', // Replace this with your actual deployed Cloudflare Worker URL
    showSettings: false,
  };

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
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
          max-width: 800px;
          margin: 0 auto;
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
        <p style="font-size: 16px; line-height: 1.6; color: var(--ink-secondary); text-wrap: balance;">Master high-frequency SAT words with adaptive spaced repetition.</p>
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

    // Sort by due date
    allWords.sort((a, b) => a.nextReviewDate - b.nextReviewDate);

    // Pick 10 words and SHUFFLE them (not alphabetical)
    const sessionWords = shuffle(allWords.slice(0, 10));

    vocabState.sessionActive = true;
    vocabState.mode = mode;
    vocabState.words = sessionWords;
    vocabState.currentIndex = 0;

    if (mode === 'flashcard') {
      // Pure flashcard mode: 20 flashcards
      vocabState.words = shuffle(allWords.slice(0, 20));
      vocabState.currentBatch = vocabState.words.map(w => ({
        ...w,
        activity: 'flashcard',
        passed: false
      }));
      vocabState.phase = 'flashcard';
      vocabState.phaseIndex = 0;
    } else {
      // Learn mode: 4 phases, 10 words each phase (same 10 words, different activities)
      vocabState.phase = PHASES_LEARN[0];
      vocabState.phaseIndex = 0;
      vocabState.currentBatch = sessionWords.map(w => ({
        ...w,
        activity: vocabState.phase,
        passed: false
      }));
    }

    // Re-render app
    if (window.renderHome) window.renderHome();
  }

  function advancePhase() {
    if (vocabState.mode === 'flashcard') {
      // Flashcard mode has no phases, just finish
      return false;
    }

    vocabState.phaseIndex++;
    if (vocabState.phaseIndex >= PHASES_LEARN.length) {
      return false; // All phases done
    }

    vocabState.phase = PHASES_LEARN[vocabState.phaseIndex];
    vocabState.currentIndex = 0;

    // Re-shuffle the same words for variety
    const reshuffled = shuffle(vocabState.words);
    vocabState.currentBatch = reshuffled.map(w => ({
      ...w,
      activity: vocabState.phase,
      passed: false
    }));

    // Reset match state for new match phase
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
    let totalItems, completedItems;
    if (vocabState.mode === 'flashcard') {
      totalItems = vocabState.currentBatch.length;
      completedItems = vocabState.currentIndex;
    } else {
      totalItems = vocabState.words.length;
      completedItems = vocabState.phaseIndex === 3 ? vocabState.currentIndex : 0;
    }
    const progress = (completedItems / totalItems) * 100;

    const phaseLabel = vocabState.mode === 'learn'
      ? `<span style="font-size: 12px; padding: 2px 10px; border-radius: 12px; font-weight: 600; ${getPhaseStyle(vocabState.phase)}">${getPhaseName(vocabState.phase)}</span>`
      : '';

    return `
      <div class="vocab-session">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
          <button class="ghost-btn icon-btn" onclick="window.Vocab.endSession()">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <div style="flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
            <div style="height: 100%; width: ${progress}%; background: var(--primary); transition: width 0.3s ease;"></div>
          </div>
          <span class="muted" style="font-size: 14px;">${completedItems} / ${totalItems}</span>
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
            <h2 style="font-size: 36px; margin-bottom: 16px; font-weight: 800; letter-spacing: -0.02em;">${wordObj.word}</h2>
            <p class="vocab-flashcard-hint muted">Click to flip</p>
          </div>
          <div class="vocab-flashcard-back">
            <h2 style="font-size: 28px; margin-bottom: 16px; font-weight: 800; letter-spacing: -0.02em; border-bottom: 1px solid var(--line); padding-bottom: 16px; width: 100%;">${wordObj.word}</h2>
            <p style="font-size: 18px; margin-bottom: 16px; line-height: 1.5;"><strong>Meaning:</strong> ${wordObj.meaning}</p>
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
      <h2 style="font-size: 26px; margin-bottom: 32px; font-weight: 700; letter-spacing: -0.02em;">What does <strong style="color: var(--bb-blue); font-weight: 800;">${wordObj.word}</strong> mean?</h2>
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
      vocabState.matchChunk = unpaired.slice(0, 5);
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
    if (vocabState.matchCorrect) return; // Prevent clicking while showing green correct animation
    
    vocabState.matchWrong = null;
    vocabState.matchSelected[side] = id;

    // Check if both sides selected
    if (vocabState.matchSelected.left && vocabState.matchSelected.right) {
      if (vocabState.matchSelected.left === vocabState.matchSelected.right) {
        // Correct match! Show green state temporarily
        vocabState.matchCorrect = { left: vocabState.matchSelected.left, right: vocabState.matchSelected.right };
        vocabState.matchPaired.push(vocabState.matchSelected.left);
        vocabState.matchSelected = { left: null, right: null };
        
        if (window.renderHome) window.renderHome();
        
        setTimeout(() => {
          vocabState.matchCorrect = null;
          if (window.renderHome) window.renderHome();
        }, 600);
        return; // Early return to avoid immediate render without correct state
      } else {
        // Wrong match
        vocabState.matchWrong = true;
        setTimeout(() => {
          vocabState.matchWrong = null;
          vocabState.matchSelected = { left: null, right: null };
          if (window.renderHome) window.renderHome();
        }, 800);
      }
    }
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
    if (passed) {
      vocabState.currentBatch[vocabState.currentIndex].passed = true;
    } else {
      // Don't re-queue for match (it handles its own completion)
      if (vocabState.phase !== 'match') {
        vocabState.currentBatch.push(vocabState.currentBatch[vocabState.currentIndex]);
      }
    }
    vocabState.currentIndex++;
    if (window.renderHome) window.renderHome();
  }

  function endSession() {
    vocabState.sessionActive = false;
    vocabState.words = [];
    vocabState.currentBatch = [];
    vocabState.phase = null;
    vocabState.phaseIndex = 0;
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
    if (window.renderHome) window.renderHome();
  }

  function toggleSettings() {
    vocabState.showSettings = !vocabState.showSettings;
    if (window.renderHome) window.renderHome();
  }

  window.Vocab = {
    init: initVocab,
    renderDashboard,
    startSession,
    endSession,
    nextQuestion,
    checkMCQ,
    selectMCQ,
    nextMCQ,
    checkSentence,
    matchSelect,
    toggleSettings
  };

})();
