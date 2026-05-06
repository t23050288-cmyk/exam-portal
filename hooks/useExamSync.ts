/**
 * useExamSync.ts
 * Master client-side sync engine:
 *  - Debounced dirty save (3s idle)
 *  - Batch flush every 30s (configurable via throttle_mode)
 *  - Exponential backoff on failures
 *  - Online/offline detection → IDB drain on reconnect
 *  - navigator.sendBeacon on beforeunload
 *  - Progressive degrade on 429/503
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  saveResponse, getDirtyResponses, markResponsesSynced,
  queueEvent, getPendingEvents, deleteEvents,
  setMeta, getMeta, buildBeaconPayload,
  ResponseRecord, TelemetryEvent,
} from "@/lib/examIDB";

const BEACON_URL      = "/api/events_beacon";
const AUTOSAVE_URL    = "/api/autosave";
const EVENTS_URL      = "/api/events_batch";
const SYNC_URL        = "/api/sync";
const THROTTLE_URL    = "/api/admin/throttle_status";

const DEFAULT_INTERVAL_MS   = 30_000;
const IDLE_DEBOUNCE_MS      = 3_000;
const MAX_BACKOFF_MS        = 120_000;
const THROTTLE_POLL_MS      = 60_000;

type SyncStatus = "idle" | "syncing" | "offline" | "degraded" | "error";

export interface UseExamSyncOptions {
  sessionId: string;
  token:     string;
  enabled?:  boolean;
}

export function useExamSync({ sessionId, token, enabled = true }: UseExamSyncOptions) {
  const [syncStatus, setSyncStatus]     = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [offlineMsg, setOfflineMsg]     = useState<string | null>(null);

  const intervalMsRef   = useRef(DEFAULT_INTERVAL_MS);
  const backoffMsRef    = useRef(0);
  const failCountRef    = useRef(0);
  const debounceTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const throttleTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const isOnlineRef     = useRef(typeof navigator !== "undefined" ? navigator.onLine : true);

  const authHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  // ── Core flush function ────────────────────────────────────────────────────

  const flush = useCallback(async () => {
    if (!sessionId || !enabled) return;
    if (!isOnlineRef.current) return;

    setSyncStatus("syncing");

    try {
      const responses = await getDirtyResponses(sessionId, 50);
      const events    = await getPendingEvents(sessionId, 50);

      const promises: Promise<Response>[] = [];

      if (responses.length) {
        promises.push(
          fetch(AUTOSAVE_URL, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              session_id: sessionId,
              responses:  responses.map((r) => ({
                question_id: r.questionId,
                answer_json: r.answerJson,
                updated_at:  r.updatedAt,
                is_final:    r.isFinal,
              })),
              client_ts: Date.now(),
            }),
          })
        );
      }

      if (events.length) {
        promises.push(
          fetch(EVENTS_URL, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              session_id: sessionId,
              events:     events.map((e) => ({
                event_id:    e.eventId,
                type:        e.type,
                payload_json: e.payloadJson,
                ts:          e.ts,
              })),
            }),
          })
        );
      }

      if (!promises.length) {
        setSyncStatus("idle");
        return;
      }

      const results = await Promise.allSettled(promises);
      let anyFailed = false;

      for (const r of results) {
        if (r.status === "rejected") { anyFailed = true; continue; }
        const res = r.value;
        if (res.status === 429 || res.status === 503) {
          // Progressive degrade
          _onServerBusy(res.status);
          anyFailed = true;
        } else if (!res.ok) {
          anyFailed = true;
        }
      }

      if (!anyFailed) {
        // Mark synced
        await markResponsesSynced(sessionId, responses.map((r) => r.questionId));
        await deleteEvents(events.map((e) => e.eventId));
        failCountRef.current = 0;
        backoffMsRef.current = 0;
        setSyncStatus("idle");
        setLastSyncedAt(new Date());
        await setMeta("lastSyncedAt", new Date().toISOString());
        setOfflineMsg(null);
      } else {
        _onFlushFailed();
      }
    } catch {
      _onFlushFailed();
    }
  }, [sessionId, token, enabled]);

  function _onFlushFailed() {
    failCountRef.current++;
    const newBackoff = Math.min(MAX_BACKOFF_MS, (backoffMsRef.current || 5_000) * 2);
    backoffMsRef.current = newBackoff;

    if (failCountRef.current >= 3) {
      // Failure for > 2 mins → degrade
      setSyncStatus("degraded");
      intervalMsRef.current = 60_000;
      setOfflineMsg("⚠️ Connection unstable — saving locally. Stay on this tab.");
      _restartFlushTimer();
    } else {
      setSyncStatus("error");
    }
  }

  function _onServerBusy(status: number) {
    const current = intervalMsRef.current;
    if (status === 503) {
      intervalMsRef.current = Math.min(MAX_BACKOFF_MS, current * 2);
    } else {
      intervalMsRef.current = Math.min(60_000, current * 1.5);
    }
    setSyncStatus("degraded");
    setOfflineMsg("⚠️ Server under load — saving locally. Do not close this tab.");
    _restartFlushTimer();
  }

  function _restartFlushTimer() {
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = setInterval(flush, intervalMsRef.current);
  }

  // ── Throttle polling ────────────────────────────────────────────────────────

  const pollThrottle = useCallback(async () => {
    try {
      const res  = await fetch(THROTTLE_URL);
      if (!res.ok) return;
      const data = await res.json();
      const newInterval = data.autosave_interval_ms || DEFAULT_INTERVAL_MS;
      if (newInterval !== intervalMsRef.current) {
        intervalMsRef.current = newInterval;
        _restartFlushTimer();
        if (newInterval > DEFAULT_INTERVAL_MS) {
          setOfflineMsg(`⚠️ Admin throttle active — saving every ${newInterval / 1000}s`);
          setSyncStatus("degraded");
        } else {
          setOfflineMsg(null);
          setSyncStatus("idle");
        }
      }
    } catch { /* ignore */ }
  }, []);

  // ── Online/offline handlers ────────────────────────────────────────────────

  const onOnline = useCallback(async () => {
    isOnlineRef.current = true;
    setSyncStatus("idle");
    setOfflineMsg(null);

    // Drain IDB via /api/sync
    const responses = await getDirtyResponses(sessionId, 200);
    const events    = await getPendingEvents(sessionId, 200);
    if (!responses.length && !events.length) return;

    try {
      const res = await fetch(SYNC_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          session_id: sessionId,
          responses:  responses.map((r) => ({
            question_id: r.questionId,
            answer_json: r.answerJson,
            updated_at:  r.updatedAt,
            is_final:    r.isFinal,
          })),
          events: events.map((e) => ({
            event_id:    e.eventId,
            type:        e.type,
            payload_json: e.payloadJson,
            ts:          e.ts,
          })),
        }),
      });
      if (res.ok) {
        await markResponsesSynced(sessionId, responses.map((r) => r.questionId));
        await deleteEvents(events.map((e) => e.eventId));
        setLastSyncedAt(new Date());
      }
    } catch { /* ignore */ }
  }, [sessionId, token]);

  const onOffline = useCallback(() => {
    isOnlineRef.current = false;
    setSyncStatus("offline");
    setOfflineMsg("📡 You are offline — answers saved locally. Reconnect to sync.");
  }, []);

  // ── beforeunload beacon ────────────────────────────────────────────────────

  const onBeforeUnload = useCallback(async () => {
    const blob = await buildBeaconPayload(sessionId);
    if (blob) navigator.sendBeacon(BEACON_URL, blob);
  }, [sessionId]);

  // ── Public: save a response (dirty) ────────────────────────────────────────

  const saveAnswer = useCallback(async (
    questionId: string,
    answerJson: Record<string, unknown>,
    isFinal = false,
  ) => {
    const record: ResponseRecord = {
      sessionId,
      questionId,
      answerJson,
      updatedAt: new Date().toISOString(),
      dirty:     true,
      isFinal,
    };
    await saveResponse(record);

    // Debounce: 3s idle → flush
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(flush, IDLE_DEBOUNCE_MS);
  }, [sessionId, flush]);

  // ── Public: record a telemetry event ──────────────────────────────────────

  const recordEvent = useCallback(async (
    type: string,
    payloadJson: Record<string, unknown> = {},
  ) => {
    const event: TelemetryEvent = {
      eventId:     crypto.randomUUID(),
      type,
      payloadJson,
      ts:          Date.now(),
      sessionId,
    };
    await queueEvent(event);
  }, [sessionId]);

  // ── Public: download local backup ─────────────────────────────────────────

  const downloadBackup = useCallback(async () => {
    const { getAllResponses } = await import("@/lib/examIDB");
    const all = await getAllResponses(sessionId);
    const blob = new Blob([JSON.stringify({ sessionId, responses: all, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `exam-backup-${sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionId]);

  // ── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !enabled) return;

    // Load last synced timestamp
    getMeta<string>("lastSyncedAt").then((v) => { if (v) setLastSyncedAt(new Date(v)); });

    // Start flush interval
    flushTimer.current = setInterval(flush, intervalMsRef.current);

    // Poll throttle every 60s
    throttleTimer.current = setInterval(pollThrottle, THROTTLE_POLL_MS);
    pollThrottle();

    window.addEventListener("online",        onOnline);
    window.addEventListener("offline",       onOffline);
    window.addEventListener("beforeunload",  onBeforeUnload);

    return () => {
      if (flushTimer.current)   clearInterval(flushTimer.current);
      if (throttleTimer.current) clearInterval(throttleTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      window.removeEventListener("online",       onOnline);
      window.removeEventListener("offline",      onOffline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [sessionId, enabled, flush, onOnline, onOffline, onBeforeUnload, pollThrottle]);

  return {
    saveAnswer,
    recordEvent,
    downloadBackup,
    flush,
    syncStatus,
    lastSyncedAt,
    offlineMsg,
  };
}
