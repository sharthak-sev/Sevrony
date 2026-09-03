"use strict";

function sprSanitize(value) {
  if (value == null) return { sanitized: "", isValid: false };
  let clean = "";
  let hasDecimal = false;
  let hasSlash = false;
  let hasMinus = false;
  
  const strVal = String(value).trim();
  for (let i = 0; i < strVal.length; i++) {
    const char = strVal[i];
    if (char === '-' && i === 0 && !hasMinus) {
      clean += char;
      hasMinus = true;
    } else if (/[0-9]/.test(char)) {
      clean += char;
    } else if (char === '.' && !hasDecimal && !hasSlash) {
      clean += char;
      hasDecimal = true;
    } else if (char === '/' && !hasSlash && !hasDecimal) {
      clean += char;
      hasSlash = true;
    }
  }
  const isValid = /^-?\d+$|^-?\d*\.\d+$|^-?\d+\/\d+$/.test(clean);
  return { sanitized: clean, isValid };
}

function parseSprValue(val) {
  if (typeof val !== 'string') return NaN;
  val = val.trim();
  if (val.includes('/')) {
    const parts = val.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
    }
  }
  return parseFloat(val);
}

function hasAnswer(value) { return String(value || "").trim().length > 0; }
function normalizeAnswerToken(v) { return String(v || "").trim().toUpperCase(); }
function normalizeFreeResponse(v) { return String(v || "").trim().replace(/\s+/g, "").toLowerCase(); }

function scoreAnswer(question, answer) {
  if (!hasAnswer(answer)) return { wasAnswered: false, isCorrect: false };
  
  let isSpr = false;
  if (question.type === "spr" || (question.type !== "mcq" && (!question.answerOptions || !question.answerOptions.length))) {
    isSpr = true;
    const spr = sprSanitize(answer);
    if (!spr.isValid) return { wasAnswered: false, isCorrect: false };
    answer = spr.sanitized;
  }

  const expected = question.correctAnswers || (question.correctAnswer ? (Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer]) : []);
  if (!expected.length) return { wasAnswered: true, isCorrect: false };
  if (question.type === "mcq" && question.answerOptions.length) {
    return { wasAnswered: true, isCorrect: expected.map(normalizeAnswerToken).includes(normalizeAnswerToken(answer)) };
  }
  
  const ansStr = normalizeFreeResponse(answer);
  if (isSpr) {
    const isCorrectSPR = expected.some(exp => {
      const expStr = normalizeFreeResponse(exp);
      if (expStr === ansStr) return true;
      const expVal = parseSprValue(expStr);
      const ansVal = parseSprValue(ansStr);
      return !isNaN(expVal) && !isNaN(ansVal) && Math.abs(expVal - ansVal) < 1e-6;
    });
    return { wasAnswered: true, isCorrect: isCorrectSPR };
  }
  
  return { wasAnswered: true, isCorrect: expected.map(normalizeFreeResponse).includes(ansStr) };
}

// Make globally available for app.js and db-worker.js
const _globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
if (_globalScope) {
  _globalScope.sprSanitize = sprSanitize;
  _globalScope.parseSprValue = parseSprValue;
  _globalScope.hasAnswer = hasAnswer;
  _globalScope.normalizeAnswerToken = normalizeAnswerToken;
  _globalScope.normalizeFreeResponse = normalizeFreeResponse;
  _globalScope.scoreAnswer = scoreAnswer;
}
if (typeof window !== 'undefined' && window !== _globalScope) {
  window.sprSanitize = sprSanitize;
  window.parseSprValue = parseSprValue;
  window.hasAnswer = hasAnswer;
  window.normalizeAnswerToken = normalizeAnswerToken;
  window.normalizeFreeResponse = normalizeFreeResponse;
  window.scoreAnswer = scoreAnswer;
}
if (typeof self !== 'undefined' && self !== _globalScope) {
  self.sprSanitize = sprSanitize;
  self.parseSprValue = parseSprValue;
  self.hasAnswer = hasAnswer;
  self.normalizeAnswerToken = normalizeAnswerToken;
  self.normalizeFreeResponse = normalizeFreeResponse;
  self.scoreAnswer = scoreAnswer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sprSanitize,
    parseSprValue,
    hasAnswer,
    normalizeAnswerToken,
    normalizeFreeResponse,
    scoreAnswer
  };
}
