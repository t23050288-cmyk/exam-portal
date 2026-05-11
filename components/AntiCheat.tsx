"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { reportViolation } from "@/lib/api";
import WarningModal from "./WarningModal";

interface AntiCheatProps {
  isSubmitted: boolean;
  onAutoSubmit: () => void;
  onViolation?: (type: string, metadata?: any) => void;
  initialWarningCount?: number;
  forceReenterFullscreen?: () => void;
}

export default function AntiCheat({
  isSubmitted,
  onAutoSubmit,
  onViolation,
  initialWarningCount = 0,
  forceReenterFullscreen,
}: AntiCheatProps) {
  const [warningCount, setWarningCount] = useState(initialWarningCount);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const warningRef = useRef(initialWarningCount);
  const [ready, setReady] = useState(false);

  // Sync initialWarningCount only if it's higher (don't overwrite local violations)
  useEffect(() => {
    if (initialWarningCount > warningRef.current) {
      setWarningCount(initialWarningCount);
      warningRef.current = initialWarningCount;
    }
  }, [initialWarningCount]);

  // 3-second grace period on mount — gives fullscreen dialog time to settle
  // and prevents page load blur from counting as violation
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const isMobile =
    typeof window !== "undefined" &&
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  const reenterFullscreen = useCallback(() => {
    if (forceReenterFullscreen) {
      forceReenterFullscreen();
      return;
    }
    if (!document.fullscreenElement && !isSubmitted) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, [forceReenterFullscreen, isSubmitted]);

  // Cooldown between violations (ms) — prevents tab_switch firing 3 events as 3 violations
  const lastViolationTimeRef = useRef<number>(0);
  const processingRef = useRef<boolean>(false);
  // Track if we're in a tab-switch event so fullscreenchange doesn't double-count
  const tabSwitchActiveRef = useRef<boolean>(false);

  const triggerViolation = useCallback(
    (type: string, metadata?: Record<string, unknown>) => {
      if (isSubmitted || !ready || processingRef.current) return;

      const now = Date.now();
      // 3-second cooldown between violations
      if (now - lastViolationTimeRef.current < 3000) return;

      processingRef.current = true;
      lastViolationTimeRef.current = now;
      setTimeout(() => { processingRef.current = false; }, 100);

      const nextCount = warningRef.current + 1;
      warningRef.current = nextCount;
      setWarningCount(nextCount);

      if (onViolation) onViolation(type, { ...metadata, warning_count: nextCount });

      const friendlyType = type.replace(/_/g, " ");
      let message: string;
      const isAutoSubmit = nextCount >= 3;

      if (isAutoSubmit) {
        message = `🔴 FINAL VIOLATION (${friendlyType}): Your exam is being AUTO-SUBMITTED for security review.`;
      } else if (nextCount === 2) {
        message = `🚨 Warning 2 of 3: ${friendlyType} detected. ONE more violation = auto-submit!`;
      } else {
        message = `⚠️ Warning 1 of 3: ${friendlyType} detected. Stay in fullscreen — next violation is your LAST warning.`;
      }

      setModalMessage(message);
      setShowModal(true);

      // Report to backend (fire-and-forget)
      reportViolation(type, {
        ...metadata,
        warning_count: nextCount,
        status: isAutoSubmit ? "auto_submitted" : "active",
        is_auto_submit: isAutoSubmit,
      }).catch(() => {});

      if (isAutoSubmit) {
        // 2.5s so student can read the message
        setTimeout(() => onAutoSubmit(), 2500);
      } else {
        // Re-enter fullscreen after a moment
        setTimeout(reenterFullscreen, 600);
      }
    },
    [isSubmitted, ready, onAutoSubmit, onViolation, reenterFullscreen]
  );

  // ── Visibility + Blur ──────────────────────────────────────────
  useEffect(() => {
    if (isMobile) return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        tabSwitchActiveRef.current = true;
        triggerViolation("tab_switch");
        // Reset flag after 2s (enough time for fullscreenchange to fire and skip)
        setTimeout(() => { tabSwitchActiveRef.current = false; }, 2000);
      } else {
        // Student returned — try to re-enter fullscreen
        setTimeout(() => {
          if (!document.fullscreenElement && !isSubmitted) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        }, 300);
      }
    };

    // Window blur: only fire if tab is STILL VISIBLE (window blur within same tab, e.g. DevTools)
    const handleBlur = () => {
      if (document.visibilityState === "visible" && !tabSwitchActiveRef.current) {
        triggerViolation("window_blur");
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  }, [triggerViolation, isMobile, isSubmitted]);

  // ── Fullscreen change ──────────────────────────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      // Only count as violation if: fullscreen EXITED + not caused by tab switch
      if (!document.fullscreenElement && !isSubmitted && ready && !tabSwitchActiveRef.current) {
        triggerViolation("fullscreen_exit");
      }
    };

    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, [triggerViolation, isSubmitted, ready]);

  // ── Clipboard + Context Menu ───────────────────────────────────
  useEffect(() => {
    const cmh = (e: MouseEvent) => { e.preventDefault(); triggerViolation("right_click"); };
    const ch = (e: ClipboardEvent) => { e.preventDefault(); triggerViolation("copy_attempt"); };
    const ph = (e: ClipboardEvent) => { e.preventDefault(); triggerViolation("paste_attempt"); };
    document.addEventListener("contextmenu", cmh);
    document.addEventListener("copy", ch);
    document.addEventListener("paste", ph);
    return () => {
      document.removeEventListener("contextmenu", cmh);
      document.removeEventListener("copy", ch);
      document.removeEventListener("paste", ph);
    };
  }, [triggerViolation]);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const kdh = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      const code = e.code.toLowerCase();

      const blocked = [
        cmdOrCtrl && ["c", "v", "a", "u", "s", "p", "f"].includes(key),
        key === "f12",
        cmdOrCtrl && e.shiftKey && ["i", "j", "c"].includes(key),
        e.altKey && ["tab", "f4", "d", "enter"].includes(key),
        key === "printscreen" || code === "printscreen",
        (e.metaKey || e.ctrlKey) && (key === "tab" || key === "w"),
        cmdOrCtrl && e.shiftKey && key === "escape",
        e.metaKey && e.shiftKey && ["3", "4", "5", "s"].includes(key),
      ].some(Boolean);

      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        const isScreenshot =
          key === "printscreen" ||
          code === "printscreen" ||
          (e.shiftKey && ["s", "3", "4"].includes(key));
        triggerViolation(isScreenshot ? "screenshot_attempt" : "keyboard_shortcut", {
          key: e.key,
          code: e.code,
        });
      }
    };
    document.addEventListener("keydown", kdh, true);
    return () => document.removeEventListener("keydown", kdh, true);
  }, [triggerViolation]);

  return (
    <>
      {showModal && (
        <>
          {/* Full-screen black backdrop — covers everything */}
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999997,
              background: "rgba(0,0,0,0.95)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
          />
          <WarningModal
            message={modalMessage}
            warningCount={warningCount}
            onDismiss={() => {
              setShowModal(false);
              if (warningCount < 3) reenterFullscreen();
            }}
            onReenterFullscreen={reenterFullscreen}
          />
        </>
      )}
    </>
  );
}
