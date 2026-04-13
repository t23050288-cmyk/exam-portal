"use client";

import { useEffect, useCallback, useState } from "react";
import { reportViolation } from "@/lib/api";
import { useFullscreen } from "@/hooks/useFullscreen";
import WarningModal from "./WarningModal";
import FaceMonitor from "./FaceMonitor";

interface AntiCheatProps {
  isSubmitted: boolean;
  onAutoSubmit: () => void;
}

export default function AntiCheat({ isSubmitted, onAutoSubmit }: AntiCheatProps) {
  const [warningCount, setWarningCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const { enter: enterFullscreen } = useFullscreen();

  const triggerViolation = useCallback(
    async (type: string, metadata?: Record<string, unknown>) => {
      if (isSubmitted) return;

      try {
        const res = await reportViolation(type, metadata);
        const count = res.warning_count;
        setWarningCount(count);
        setModalMessage(res.message);
        setShowModal(true);

        if (res.auto_submitted) {
          onAutoSubmit();
        }
      } catch {
        // Network error — increment locally and still show warning
        setWarningCount((prev) => {
          const next = prev + 1;
          setModalMessage(
            next >= 3
              ? "⚠️ Exam auto-submitted due to repeated violations."
              : next === 2
              ? "🚨 Final warning! One more violation will submit your exam."
              : "⚠️ Warning: Please stay on the exam tab."
          );
          setShowModal(true);
          if (next >= 3) onAutoSubmit();
          return next;
        });
      }
    },
    [isSubmitted, onAutoSubmit]
  );

  // ── Tab visibility ────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        triggerViolation("tab_switch");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [triggerViolation]);

  // ── Window blur ───────────────────────────────────────────
  useEffect(() => {
    const handleBlur = () => triggerViolation("window_blur");
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [triggerViolation]);

  // ── Fullscreen exit ───────────────────────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      const isFs =
        !!document.fullscreenElement ||
        !!(document as any).webkitFullscreenElement;
      if (!isFs && !isSubmitted) {
        triggerViolation("fullscreen_exit");
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, [isSubmitted, triggerViolation]);

  // ── Right-click disable ───────────────────────────────────
  useEffect(() => {
    const prevent = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    return () => document.removeEventListener("contextmenu", prevent);
  }, []);

  // ── Copy / Paste / Select All / DevTools shortcuts ────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isSubmitted) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const blocked = ["c", "v", "a", "u", "s", "p"];
      if (ctrl && blocked.includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === "c") triggerViolation("copy_attempt");
        else if (e.key.toLowerCase() === "v") triggerViolation("paste_attempt");
        else triggerViolation("keyboard_shortcut");
      }
      // F12 DevTools
      if (e.key === "F12") {
        e.preventDefault();
        triggerViolation("keyboard_shortcut");
      }
      // PrintScreen
      if (e.key === "PrintScreen") {
        e.preventDefault();
        triggerViolation("keyboard_shortcut");
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (!isSubmitted) e.preventDefault();
    };
    const handlePaste = (e: ClipboardEvent) => {
      if (!isSubmitted) e.preventDefault();
    };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
    };
  }, [isSubmitted, triggerViolation]);

  if (!showModal) return null;

  return (
    <>
      <FaceMonitor onViolation={triggerViolation} isSubmitted={isSubmitted} />
      <WarningModal
        warningCount={warningCount}
        message={modalMessage}
        onDismiss={warningCount < 3 ? () => setShowModal(false) : undefined}
        onReenterFullscreen={() => enterFullscreen()}
      />
    </>
  );
}
