"use client";

import { useState, useCallback, useEffect } from "react";

export type Answers = Record<string, string>; // { questionId: "A"|"B"|"C"|"D" }

const STORAGE_KEY = "examguard_answers";
const QUESTIONS_CACHE_KEY = "examguard_questions_cache";
const QUESTIONS_CACHE_META = "examguard_questions_meta";

// ── Answer persistence ────────────────────────────────────────
function loadFromStorage(): Answers {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToStorage(answers: Answers) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {}
}

export function clearExamStorage() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(QUESTIONS_CACHE_KEY);
    localStorage.removeItem(QUESTIONS_CACHE_META);
  }
}

// ── Question caching (browser-side) ───────────────────────────
// Questions don't change during an exam session — cache them in
// localStorage so if the student refreshes, they load instantly
// from their own browser with zero server hit.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function saveQuestionsToCache(title: string, questions: unknown[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(questions));
    localStorage.setItem(QUESTIONS_CACHE_META, JSON.stringify({ title, ts: Date.now() }));
  } catch {}
}

export function loadQuestionsFromCache(title: string): unknown[] | null {
  if (typeof window === "undefined") return null;
  try {
    const meta = localStorage.getItem(QUESTIONS_CACHE_META);
    if (!meta) return null;
    const { title: cachedTitle, ts } = JSON.parse(meta);
    // Cache hit only if same exam AND still fresh
    if (cachedTitle !== title) return null;
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    const raw = localStorage.getItem(QUESTIONS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── useExamState hook ─────────────────────────────────────────
export function useExamState() {
  const [answers, setAnswers] = useState<Answers>(() => loadFromStorage());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  // Persist answers to localStorage on every change (belt-and-suspenders)
  useEffect(() => {
    saveToStorage(answers);
  }, [answers]);

  const selectAnswer = useCallback((questionId: string, option: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: option };
      saveToStorage(next);
      return next;
    });
    setDirtyIds((prev) => new Set(prev).add(questionId));
  }, []);

  const clearDirty = useCallback(() => {
    setDirtyIds(new Set());
  }, []);

  const getAnsweredCount = useCallback(
    (_total: number) => {
      return Object.keys(answers).filter((id) => answers[id]).length;
    },
    [answers]
  );

  return { answers, dirtyIds, selectAnswer, clearDirty, getAnsweredCount };
}
