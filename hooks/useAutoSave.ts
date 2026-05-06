"use client";

import { useEffect, useRef, useCallback } from "react";
import { batchSaveAnswers } from "@/lib/api";
import type { Answers } from "./useExamState";

// ── IndexedDB helpers ─────────────────────────────────────────
const IDB_DB_NAME = "examguard_idb";
const IDB_STORE   = "pending_answers";
const IDB_VERSION = 1;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("No IDB")); return; }
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "questionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbSaveAnswers(dirtyAnswers: Record<string, string>) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    Object.entries(dirtyAnswers).forEach(([questionId, answer]) => {
      store.put({ questionId, answer, savedAt: Date.now() });
    });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror    = () => rej(tx.error);
    });
    db.close();
  } catch {
    // IDB not available — fall through to network save
  }
}

async function idbGetAllPending(): Promise<Record<string, string>> {
  try {
    const db = await openIDB();
    const tx  = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const rows: Array<{ questionId: string; answer: string }> = await new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result as any);
      req.onerror   = () => rej(req.error);
    });
    db.close();
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.questionId] = r.answer; });
    return map;
  } catch {
    return {};
  }
}

async function idbClearAnswers(questionIds: string[]) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    questionIds.forEach(id => store.delete(id));
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror    = () => rej(tx.error);
    });
    db.close();
  } catch {}
}

// ─────────────────────────────────────────────────────────────

const SAVE_INTERVAL_MS = 30_000; // 30 seconds (was 15s)

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
  const answersRef   = useRef(answers);
  const dirtyRef     = useRef(dirtyIds);
  const submittedRef = useRef(isSubmitted);

  answersRef.current   = answers;
  dirtyRef.current     = dirtyIds;
  submittedRef.current = isSubmitted;

  const flush = useCallback(async () => {
    if (submittedRef.current) return;
    const dirty = dirtyRef.current;
    if (dirty.size === 0) return;

    const current = answersRef.current;
    const toSave: Record<string, string> = {};
    dirty.forEach(id => { if (current[id]) toSave[id] = current[id]; });
    if (Object.keys(toSave).length === 0) return;

    // 1. Save to IndexedDB immediately (local, zero-latency)
    await idbSaveAnswers(toSave);

    // 2. Send batch to server (one request instead of N individual saves)
    try {
      await batchSaveAnswers(toSave);
      clearDirty();
    } catch {
      // Network failed — answers safe in IDB, will retry next interval
    }
  }, [clearDirty]);

  // On mount: drain any pending IDB answers (crash/reload recovery)
  useEffect(() => {
    const recover = async () => {
      const pending = await idbGetAllPending();
      if (Object.keys(pending).length > 0) {
        try {
          await batchSaveAnswers(pending);
          await idbClearAnswers(Object.keys(pending));
        } catch {
          // Will retry on next flush
        }
      }
    };
    recover();
  }, []);

  // Periodic flush every 30s
  useEffect(() => {
    const id = setInterval(flush, SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Save on visibility change (tab hidden) — batch via IDB first
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [flush]);

  // Beacon on unload (best-effort last flush)
  useEffect(() => {
    const handleUnload = () => {
      const dirty = Array.from(dirtyRef.current);
      const current = answersRef.current;
      const toSave: Record<string, string> = {};
      dirty.forEach(id => { if (current[id]) toSave[id] = current[id]; });
      if (Object.keys(toSave).length === 0) return;

      navigator.sendBeacon(
        `/api/exam/batch-save`,
        new Blob([JSON.stringify({ answers: toSave })], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  return { flush };
}
