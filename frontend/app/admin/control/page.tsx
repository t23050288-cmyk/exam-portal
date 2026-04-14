"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./control.module.css";
import Skeleton from "@/components/Skeleton";

const API = process.env.NEXT_PUBLIC_API_URL || "/api";
const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "admin@examguard2024";

type ExamState = "active" | "inactive" | "scheduled";

interface ExamConfig {
  is_active: boolean;
  scheduled_start: string | null;
  duration_minutes: number;
  exam_title: string;
}

function deriveState(cfg: ExamConfig): ExamState {
  if (!cfg.is_active) return "inactive";
  if (cfg.scheduled_start) {
    const start = new Date(cfg.scheduled_start);
    if (start > new Date()) return "scheduled";
  }
  return "active";
}

function useCountdown(scheduledStart: string | null): string {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    if (!scheduledStart) return;
    const target = new Date(scheduledStart).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setDisplay("Starting now…"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setDisplay(
        h > 0
          ? `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`
          : `${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scheduledStart]);
  return display;
}

export default function OrbitalControlPage() {
  const [config, setConfig] = useState<ExamConfig>({
    is_active: true,
    scheduled_start: null,
    duration_minutes: 60,
    exam_title: "ExamGuard Assessment",
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const countdown = useCountdown(config.scheduled_start);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/exam/config`, {
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch {
      // ignore — backend may not have the table yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/exam/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setConfig(data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e: any) {
      alert(e.message || "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const examState = deriveState(config);

  const STATUS_META: Record<ExamState, { icon: string; label: string; desc: string }> = {
    active: {
      icon: "🟢",
      label: "ACTIVE",
      desc: "Exam is live. Students can authenticate and begin their session immediately.",
    },
    inactive: {
      icon: "🔴",
      label: "INACTIVE",
      desc: "Exam is deactivated. Student exam pages display a weightless 'Unavailable' overlay.",
    },
    scheduled: {
      icon: "🟡",
      label: "SCHEDULED",
      desc: `Exam launches at ${config.scheduled_start ? new Date(config.scheduled_start).toLocaleString() : "—"}. A countdown is shown to students.`,
    },
  };

  const meta = STATUS_META[examState];

  const setState = (s: ExamState) => {
    if (s === "active") {
      setConfig((c) => ({ ...c, is_active: true, scheduled_start: null }));
    } else if (s === "inactive") {
      setConfig((c) => ({ ...c, is_active: false, scheduled_start: null }));
    } else {
      // scheduled — set a default 10 min from now if none
      const defaultStart = config.scheduled_start || new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 16);
      setConfig((c) => ({ ...c, is_active: true, scheduled_start: defaultStart }));
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 64, maxWidth: 600, margin: "0 auto" }}>
        <Skeleton height={200} borderRadius={100} width={200} className="mx-auto" style={{ margin: "0 auto" }} />
        <Skeleton height={40} width="60%" style={{ margin: "0 auto" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Skeleton height={120} borderRadius={20} />
          <Skeleton height={120} borderRadius={20} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Orbital Status Node ── */}
      <div className={styles.orbiterWrap}>
        <div className={`${styles.statusNode} ${styles[examState]}`}>
          <div className={styles.statusIcon}>{meta.icon}</div>
          {examState === "active" && <div className={styles.orbitSatellite} />}
        </div>

        <div className={`${styles.statusLabel} ${styles[examState]}`}>{meta.label}</div>
        <div className={styles.statusDesc}>{meta.desc}</div>

        {/* ── 3-State Toggle ── */}
        <div className={styles.toggleRow}>
          {(["active", "scheduled", "inactive"] as ExamState[]).map((s) => (
            <button
              key={s}
              className={`${styles.stateBtn} ${examState === s ? styles[`activeBtn${s.charAt(0).toUpperCase() + s.slice(1)}` as "activeBtnActive" | "activeBtnInactive" | "activeBtnScheduled"] : ""}`}
              onClick={() => setState(s)}
            >
              {s === "active" ? "⚡ Activate" : s === "inactive" ? "⏹ Deactivate" : "🕐 Schedule"}
            </button>
          ))}
        </div>

        {/* Countdown if scheduled */}
        {examState === "scheduled" && countdown && (
          <div className={styles.countdown} style={{ marginTop: 20, width: "100%", maxWidth: 320 }}>
            <div className={styles.countdownTime}>{countdown}</div>
            <div className={styles.countdownLabel}>until exam launches</div>
          </div>
        )}
      </div>

      {/* ── Config Cards ── */}
      <div className={styles.configGrid}>
        {/* Duration Slider */}
        <div className={styles.configCard}>
          <div className={styles.configLabel}>⏱ Exam Duration</div>
          <div className={styles.sliderValue}>{config.duration_minutes} min</div>
          <div className={styles.sliderWrap}>
            <div className={styles.sliderTrack}>
              <div
                className={styles.sliderFill}
                style={{ width: `${((config.duration_minutes - 10) / (240 - 10)) * 100}%` }}
              />
              <input
                type="range"
                className={styles.slider}
                min={10}
                max={240}
                step={5}
                value={config.duration_minutes}
                onChange={(e) => setConfig((c) => ({ ...c, duration_minutes: Number(e.target.value) }))}
              />
            </div>
            <div className={styles.sliderMin}>
              <span>10 min</span>
              <span>240 min</span>
            </div>
          </div>
        </div>

        {/* Schedule Start Time */}
        <div className={styles.configCard}>
          <div className={styles.configLabel}>📅 Scheduled Start</div>
          <input
            type="datetime-local"
            className={styles.input}
            style={{ fontSize: 14 }}
            value={config.scheduled_start ? config.scheduled_start.slice(0, 16) : ""}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                scheduled_start: e.target.value ? new Date(e.target.value).toISOString() : null,
              }))
            }
          />
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Leave blank to make exam immediately available when active.
          </div>
        </div>

        {/* Exam Title */}
        <div className={styles.configCard} style={{ gridColumn: "1 / -1" }}>
          <div className={styles.configLabel}>✦ Exam Title</div>
          <input
            className={styles.input}
            value={config.exam_title}
            onChange={(e) => setConfig((c) => ({ ...c, exam_title: e.target.value }))}
            placeholder="ExamGuard Assessment"
          />
        </div>
      </div>

      {/* ── Info Box ── */}
      <div className={styles.infoBox} style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 18 }}>ℹ️</span>
        <span>
          When the exam is <strong>Deactivated</strong>, a weightless fade overlay replaces the exam interface for all students,
          preventing any further interactions. Changes take effect within seconds via the public config endpoint.
        </span>
      </div>

      {/* ── Save Button ── */}
      <button
        className={`${styles.saveBtn} ${saveSuccess ? styles.saveBtnSuccess : ""}`}
        onClick={save}
        disabled={saving}
      >
        {saving ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="skeleton" style={{ width: 20, height: 20, borderRadius: "50%", opacity: 0.3 }} />
            Saving…
          </div>
        ) : saveSuccess ? (
          "✓ Configuration Saved"
        ) : (
          "⚡ Deploy Configuration"
        )}
      </button>
    </div>
  );
}
