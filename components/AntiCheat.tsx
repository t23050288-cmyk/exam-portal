"use client";

import { useEffect, useCallback, useState } from "react";
import { reportViolation } from "@/lib/api";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useFullscreen } from "@/hooks/useFullscreen";
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
  const { enter: enterFullscreen } = useFullscreen();
  const { queueEvent } = useTelemetry({ isSubmitted });

  // ── Enforce fullscreen immediately on mount ────────────────
  useEffect(() => {
    if (!isSubmitted) {
      const timer = setTimeout(() => { enterFullscreen(); }, 300);
      return () => clearTimeout(timer);
    }
  }, [isSubmitted, enterFullscreen]);

  const [ready, setReady] = useState(false);

  // Grace period: don't fire violations for first 10 seconds to allow setup/fullscreen
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 10000);
    return () => clearTimeout(t);
  }, []);

  const isMobile = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  const triggerViolation = useCallback(
    async (type: string, metadata?: Record<string, unknown>) => {
      if (isSubmitted || !ready || showModal) return;

      // Queue telemetry event (batched, low-overhead)
      queueEvent(type, metadata);

      // Also report to violation counter (this drives warnings + auto-submit logic)
    try {
      const res = await reportViolation(type, metadata);
      const count = res.warning_count;
      setWarningCount(count);
      setModalMessage(res.message);
      setShowModal(true);
      if (res.auto_submitted) onAutoSubmit();
    } catch {
      setWarningCount((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          setModalMessage("⚠️ 3rd violation detected. Your exam has been auto-submitted.");
          onAutoSubmit();
        } else if (next === 2) {
          setModalMessage("🚨 Final warning! One more violation and your exam will be auto-submitted.");
        } else {
          setModalMessage("⚠️ Warning 1: Please return to the exam and stay focused.");
        }
        setShowModal(true);
        return next;
      });
    }
    },
    [isSubmitted, ready, onAutoSubmit, queueEvent]
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

  // ── Fullscreen exit ────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      if (!isFullscreen) triggerViolation("fullscreen_exit");
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, [triggerViolation]);

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
          onDismiss={() => setShowModal(false)}
          onReenterFullscreen={enterFullscreen}
        />
      )}
      {/* {!isMobile && <FaceMonitor isSubmitted={isSubmitted} onViolation={triggerViolation} />} */}
    </>
  );
}
