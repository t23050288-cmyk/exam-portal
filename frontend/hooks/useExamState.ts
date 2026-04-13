"use client";

import { useState, useCallback } from "react";

export type Answers = Record<string, string>; // { questionId: "A"|"B"|"C"|"D" }

const STORAGE_KEY = "examguard_answers";

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
  }
}

export function useExamState() {
  const [answers, setAnswers] = useState<Answers>(() => loadFromStorage());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

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
    (total: number) => {
      return Object.keys(answers).filter((id) => answers[id]).length;
    },
    [answers]
  );

  return { answers, dirtyIds, selectAnswer, clearDirty, getAnsweredCount };
}
