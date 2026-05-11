"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { reportViolation } from "@/lib/api";
import WarningModal from "./WarningModal";

interface AntiCheatProps {
  isSubmitted: boolean;
  onAutoSubmit: () => void;
  onViolation?: (type: string, metadata?: Record<string, unknown>) => void;
  forceReenterFullscreen?: () => void;
  initialWarningCount?: number;
  isMobile?: boolean;
}

export default function AntiCheat({
  isSubmitted,
  onAutoSubmit,
  onViolation,
  forceReenterFullscreen,
  initialWarningCount = 0,
  isMobile = false,
}: AntiCheatProps) {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [warningCount, setWarningCount] = useState(initialWarningCount);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const warningRef = useRef(initialWarningCount);

  // Sync fullscreen state
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    document.addEventListener("webkitfullscreenchange", h);
    return () => {
      document.removeEventListener("fullscreenchange", h);
      document.removeEventListener("webkitfullscreenchange", h);
    };
  }, []);

  // ── Grace period: 3s so fullscreen dialog doesn't trigger instant violation ──
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // ── Cooldown between violations ──
  // 5s cooldown — prevents screenshot / brief alt-tab from stacking violations
  const lastViolationTimeRef = useRef<number>(0);
  const processingRef = useRef<boolean>(false);
  // Track tab-switch so fullscreenchange doesn't double-count
  const tabSwitchActiveRef = useRef<boolean>(false);
  // Track whether fullscreen was INTENTIONALLY exited (by us) — don't count as violation
  const intentionalExitRef = useRef<boolean>(false);

  const triggerViolation = useCallback(
    (type: string, metadata?: Record<string, unknown>) => {
      // Guards: not submitted, grace period done, not already processing
      if (isSubmitted || !ready || processingRef.current) return;

      // CRITICAL: Only count violations when exam IS in fullscreen mode.
      // If fullscreen was never entered (e.g. browser blocked it), don't punish student.
      // We check: either currently in fullscreen OR this IS a fullscreen_exit event
      const currentlyFullscreen = !!document.fullscreenElement;
      if (!currentlyFullscreen && type === "window_blur") {
        // window_blur while NOT in fullscreen = student never entered fullscreen properly
        // Don't count this — it's a browser/OS artifact (screenshot, alt-tab before start)
        return;
      }

      const now = Date.now();
      // 5-second cooldown between violations
      if (now - lastViolationTimeRef.current < 5000) return;

      processingRef.current = true;
      lastViolationTimeRef.current = now;
      // Release lock after 5s (matches cooldown)
      setTimeout(() => { processingRef.current = false; }, 5000);

      const nextCount = warningRef.current + 1;
      warningRef.current = nextCount;
      setWarningCount(nextCount);

      if (onViolation) onViolation(type, { ...metadata, warning_count: nextCount });

      const friendlyType = type.replace(/_/g, " ");
      let message: string;
      const isAutoSubmit = nextCount >= 4;

      if (isAutoSubmit) {
        message = `🔴 4th violation (${friendlyType}): Your exam has been auto-submitted.`;
      } else if (nextCount === 3) {
        message = `🚨 Warning 3 of 4: ${friendlyType}. ONE more violation = auto-submit!`;
      } else if (nextCount === 2) {
        message = `🚨 Warning 2 of 4: ${friendlyType} detected. ${4 - nextCount} violations remaining.`;
      } else {
        message = `⚠️ Warning 1 of 4: ${friendlyType} detected. Stay in fullscreen.`;
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
        setTimeout(() => onAutoSubmit(), 2500);
      }
      // NOTE: Do NOT try to re-enter fullscreen programmatically here.
      // Only the user clicking "I Understood" button can trigger requestFullscreen.
      // Any setTimeout(requestFullscreen) will be blocked by the browser = more violations.
    },
    [isSubmitted, ready, onAutoSubmit, onViolation]
  );

  // ── Visibility + Blur ──────────────────────────────────────────
  useEffect(() => {
    if (isMobile) return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        tabSwitchActiveRef.current = true;
        triggerViolation("tab_switch");
        // Reset tab-switch flag after 3s
        setTimeout(() => { tabSwitchActiveRef.current = false; }, 3000);
      }
      // NOTE: Do NOT auto-re-enter fullscreen on visibility "visible" — browser blocks it.
      // Student must click the "I Understood" button which re-enters fullscreen synchronously.
    };

    // Window blur: only fire if tab is STILL VISIBLE (DevTools open, alt-tab within same window)
    // AND we are in fullscreen (screenshots / OS-level focus changes happen while NOT fullscreen too)
    const handleBlur = () => {
      if (
        document.visibilityState === "visible" &&
        !tabSwitchActiveRef.current &&
        !!document.fullscreenElement  // Only count blur when actually in fullscreen exam
      ) {
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
      // Only count as violation if:
      // 1. Fullscreen was EXITED (not entered)
      // 2. Not caused by tab switch (tab switch already reported its own violation)
      // 3. Not intentionally exited by us
      // 4. Exam is active and grace period is done
      if (
        !document.fullscreenElement &&
        !isSubmitted &&
        ready &&
        !tabSwitchActiveRef.current &&
        !intentionalExitRef.current
      ) {
        triggerViolation("fullscreen_exit");
      }
      intentionalExitRef.current = false;
    };

    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, [triggerViolation, isSubmitted, ready]);

  const handleDismissModal = useCallback(() => {
    setShowModal(false);
    // Re-enter fullscreen SYNCHRONOUSLY inside this click handler (user gesture)
    if (forceReenterFullscreen) {
      forceReenterFullscreen();
    } else if (!document.fullscreenElement && !isSubmitted) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, [forceReenterFullscreen, isSubmitted]);

  return (
    <>
      {showModal && (
        <WarningModal
          warningCount={warningCount}
          message={modalMessage}
          onDismiss={handleDismissModal}
          onReenterFullscreen={forceReenterFullscreen}
        />
      )}
    </>
  );
}
