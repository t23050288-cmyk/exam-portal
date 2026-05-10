"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { reportViolation } from "@/lib/api";
import { useTelemetry } from "@/hooks/useTelemetry";
import WarningModal from "./WarningModal";
import dynamic from "next/dynamic";

const FaceMonitor = dynamic(() => import("./FaceMonitor"), { ssr: false });

interface AntiCheatProps {
  isSubmitted: boolean;
  onAutoSubmit: () => void;
}

export default function AntiCheat({ isSubmitted, onAutoSubmit }: AntiCheatProps) {
  const [warningCount, setWarningCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const { queueEvent } = useTelemetry({ isSubmitted });
  const warningRef = useRef(0); // Track count without stale closure issues

  // ── Force fullscreen on mount (synchronous with user gesture from dashboard click) ──
  useEffect(() => {
    if (isSubmitted) return;
    
    const forceFullscreen = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        el.requestFullscreen().then(() => {
          console.log("[AntiCheat] Fullscreen entered successfully");
        }).catch((err) => {
          console.warn("[AntiCheat] Fullscreen blocked by browser:", err.message);
        });
      }
    };

    // Try immediately (works if page was navigated via user click)
    forceFullscreen();
    
    // Retry after a short delay in case the first attempt was blocked
    const retry = setTimeout(forceFullscreen, 500);
    return () => clearTimeout(retry);
  }, [isSubmitted]);

  const [ready, setReady] = useState(false);

  // Grace period: reduced to 3 seconds (enough for page setup, not so long violations are missed)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const isMobile = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // ── Force re-enter fullscreen ──
  const forceReenterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch((err) => {
        console.warn("[AntiCheat] Re-enter fullscreen failed:", err.message);
      });
    }
  }, []);

  const triggerViolation = useCallback(
    async (type: string, metadata?: Record<string, unknown>) => {
      if (isSubmitted || !ready) return;

      // Queue telemetry event (batched, low-overhead)
      queueEvent(type, metadata);

      // Increment warning count
      const nextCount = warningRef.current + 1;
      warningRef.current = nextCount;
      setWarningCount(nextCount);

      // Build message based on count
      let message: string;
      if (nextCount >= 3) {
        message = `⚠️ 3rd violation detected (${type.replace(/_/g, ' ')}). Your exam has been auto-submitted.`;
      } else if (nextCount === 2) {
        message = `🚨 Final warning! Violation: ${type.replace(/_/g, ' ')}. One more and your exam will be auto-submitted.`;
      } else {
        message = `⚠️ Warning ${nextCount}: ${type.replace(/_/g, ' ')} detected. Please return to the exam and stay focused.`;
      }

      setModalMessage(message);
      setShowModal(true);

      // Auto-submit on 3rd violation
      if (nextCount >= 3) {
        onAutoSubmit();
      }

      // Also try to report to backend (non-blocking)
      try {
        await reportViolation(type, metadata);
      } catch {
        // Backend failure doesn't affect local enforcement
      }

      // Force re-enter fullscreen after any violation
      setTimeout(forceReenterFullscreen, 300);
    },
    [isSubmitted, ready, onAutoSubmit, queueEvent, forceReenterFullscreen]
  );

  // ── Tab/window visibility ──────────────────────────────────
  useEffect(() => {
    if (isMobile) return;
    const handler = () => {
      if (document.visibilityState === "hidden") triggerViolation("tab_switch");
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [triggerViolation, isMobile]);

  // ── Window blur ────────────────────────────────────────────
  useEffect(() => {
    if (isMobile) return;
    const handler = () => triggerViolation("window_blur");
    window.addEventListener("blur", handler);
    return () => window.removeEventListener("blur", handler);
  }, [triggerViolation, isMobile]);

  // ── Fullscreen exit detection + auto re-enter ──────────────
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) {
        console.log("[AntiCheat] Fullscreen exited — triggering violation + auto re-enter");
        triggerViolation("fullscreen_exit");
        // Auto re-enter fullscreen immediately
        setTimeout(forceReenterFullscreen, 200);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, [triggerViolation, forceReenterFullscreen]);

  // ── Right-click prevention ─────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      triggerViolation("right_click");
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, [triggerViolation]);

  // ── Copy/Paste prevention ──────────────────────────────────
  useEffect(() => {
    const onCopy = () => triggerViolation("copy_attempt");
    const onPaste = () => triggerViolation("paste_attempt");
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [triggerViolation]);

  // ── Keyboard shortcut prevention ──────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const blocked = [
        e.ctrlKey && (e.key === "c" || e.key === "v" || e.key === "a" || e.key === "u" || e.key === "s"),
        e.metaKey && (e.key === "c" || e.key === "v" || e.key === "a"),
        e.key === "F12",
        e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C"),
        e.altKey && e.key === "Tab",
        e.key === "PrintScreen",
      ].some(Boolean);

      if (blocked) {
        e.preventDefault();
        triggerViolation("keyboard_shortcut", { key: e.key });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [triggerViolation]);

  return (
    <>
      {showModal && (
        <WarningModal
          message={modalMessage}
          warningCount={warningCount}
          onDismiss={() => {
            setShowModal(false);
            // Re-enter fullscreen when user dismisses the warning
            forceReenterFullscreen();
          }}
          onReenterFullscreen={forceReenterFullscreen}
        />
      )}
      {/* {!isMobile && <FaceMonitor isSubmitted={isSubmitted} onViolation={triggerViolation} />} */}
    </>
  );
}
