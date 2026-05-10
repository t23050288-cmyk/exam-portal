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
  const warningRef = useRef(0);
  const lastViolationRef = useRef(0); // debounce: prevent double-trigger

  const [ready, setReady] = useState(false);

  // Grace period: 2 seconds after mount before violations are enforced
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 2000);
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

      // Debounce: ignore if same violation within 1.5s (prevents tab_switch + blur double-fire)
      const now = Date.now();
      if (now - lastViolationRef.current < 1500) return;
      lastViolationRef.current = now;

      queueEvent(type, metadata);

      const nextCount = warningRef.current + 1;
      warningRef.current = nextCount;
      setWarningCount(nextCount);

      let message: string;
      if (nextCount >= 3) {
        message = `🔴 3rd violation detected (${type.replace(/_/g, ' ')}). Your exam has been auto-submitted.`;
      } else if (nextCount === 2) {
        message = `🚨 Warning ${nextCount} of 3: ${type.replace(/_/g, ' ')}. ${3 - nextCount} violation${3-nextCount===1?'':'s'} remaining before auto-submit.`;
      } else {
        message = `⚠️ Warning ${nextCount} of 3: ${type.replace(/_/g, ' ')} detected. Please return to fullscreen immediately.`;
      }

      setModalMessage(message);
      setShowModal(true);

      if (nextCount >= 3) {
        onAutoSubmit();
      }

      try {
        await reportViolation(type, metadata);
      } catch {
        // non-blocking
      }

      // Force re-enter fullscreen after violation
      setTimeout(forceReenterFullscreen, 400);
    },
    [isSubmitted, ready, onAutoSubmit, queueEvent, forceReenterFullscreen]
  );

  // ── Tab/window visibility — primary detector ──
  useEffect(() => {
    if (isMobile) return;
    const handler = () => {
      if (document.visibilityState === "hidden") triggerViolation("tab_switch");
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [triggerViolation, isMobile]);

  // ── Window blur — only fires if visibility didn't already catch it ──
  useEffect(() => {
    if (isMobile) return;
    const handler = () => {
      // Only trigger if document is still visible (means it's a different kind of blur)
      if (document.visibilityState === "visible") {
        triggerViolation("window_blur");
      }
    };
    window.addEventListener("blur", handler);
    return () => window.removeEventListener("blur", handler);
  }, [triggerViolation, isMobile]);

  // ── Fullscreen exit detection + auto re-enter ──
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && !isSubmitted) {
        triggerViolation("fullscreen_exit");
        setTimeout(forceReenterFullscreen, 300);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, [triggerViolation, forceReenterFullscreen, isSubmitted]);

  // ── Right-click prevention ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      triggerViolation("right_click");
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, [triggerViolation]);

  // ── Copy/Paste prevention ──
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

  // ── Keyboard shortcut prevention ──
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
            forceReenterFullscreen();
          }}
          onReenterFullscreen={forceReenterFullscreen}
        />
      )}
    </>
  );
}

