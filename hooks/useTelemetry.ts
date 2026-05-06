"use client";

import { useEffect, useRef, useCallback } from "react";
import { flushTelemetryBatch, TelemetryEvent } from "@/lib/api";

const FLUSH_INTERVAL_MS = 30_000;  // flush every 30s
const FLUSH_THRESHOLD   = 20;       // or when queue hits 20 events

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface UseTelemetryOptions {
  isSubmitted: boolean;
}

/**
 * Queues telemetry events locally and flushes them in batches every 30s.
 * This replaces individual per-event POSTs — dramatically reduces requests at scale.
 */
export function useTelemetry({ isSubmitted }: UseTelemetryOptions) {
  const queueRef     = useRef<TelemetryEvent[]>([]);
  const submittedRef = useRef(isSubmitted);
  submittedRef.current = isSubmitted;

  const flush = useCallback(async () => {
    if (queueRef.current.length === 0) return;
    const batch = [...queueRef.current];
    queueRef.current = []; // optimistic clear
    try {
      await flushTelemetryBatch(batch);
    } catch {
      // Re-queue on failure (prepend so order is preserved)
      queueRef.current = [...batch, ...queueRef.current];
    }
  }, []);

  const queueEvent = useCallback((type: string, payload?: Record<string, unknown>) => {
    if (submittedRef.current) return;
    const event: TelemetryEvent = {
      id: genId(),
      type,
      ts: new Date().toISOString(),
      payload,
    };
    queueRef.current.push(event);
    if (queueRef.current.length >= FLUSH_THRESHOLD) flush();
  }, [flush]);

  // Periodic flush
  useEffect(() => {
    const id = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Flush on page hide
  useEffect(() => {
    const handler = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [flush]);

  return { queueEvent, flushNow: flush };
}
