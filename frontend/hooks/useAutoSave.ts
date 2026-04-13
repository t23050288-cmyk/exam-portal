"use client";

import { useEffect, useRef, useCallback } from "react";
import { saveAnswer } from "@/lib/api";
import type { Answers } from "./useExamState";

const SAVE_INTERVAL_MS = 15_000; // 15 seconds

interface UseAutoSaveOptions {
  answers: Answers;
  dirtyIds: Set<string>;
  clearDirty: () => void;
  isSubmitted: boolean;
}

export function useAutoSave({
  answers,
  dirtyIds,
  clearDirty,
  isSubmitted,
}: UseAutoSaveOptions) {
  // Keep a ref so interval always sees latest values without re-triggering
  const answersRef = useRef(answers);
  const dirtyRef = useRef(dirtyIds);
  const submittedRef = useRef(isSubmitted);

  answersRef.current = answers;
  dirtyRef.current = dirtyIds;
  submittedRef.current = isSubmitted;

  const flush = useCallback(async () => {
    if (submittedRef.current) return;
    const dirty = dirtyRef.current;
    if (dirty.size === 0) return;

    const current = answersRef.current;
    const toSave = Array.from(dirty).filter((id) => current[id]);

    if (toSave.length === 0) return;

    // Fire all saves in parallel — batch network calls
    await Promise.allSettled(
      toSave.map((qId) => saveAnswer(qId, current[qId]))
    );

    clearDirty();
  }, [clearDirty]);

  useEffect(() => {
    const id = setInterval(flush, SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Save on page unload / visibility change
  useEffect(() => {
    const handleUnload = () => {
      // Synchronous flush best-effort
      const dirty = Array.from(dirtyRef.current);
      const current = answersRef.current;
      dirty.forEach((qId) => {
        if (current[qId]) {
          navigator.sendBeacon(
            `${process.env.NEXT_PUBLIC_API_URL}/exam/save-answer`,
            new Blob(
              [
                JSON.stringify({
                  question_id: qId,
                  selected_option: current[qId],
                }),
              ],
              { type: "application/json" }
            )
          );
        }
      });
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  return { flush };
}
