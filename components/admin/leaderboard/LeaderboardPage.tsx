"use client";


import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./leaderboard.module.css";
import Skeleton from "@/components/Skeleton";

import { adminFetch, deleteAllLeaderboard } from "@/lib/api";
import React from "react";

interface LeaderboardEntry {
  rank: number;
  student_id: string;
  usn: string;
  name: string;
  branch: string;
  score: number;
  total_marks: number;
  percentage: number;
  time_taken_seconds: number | null;
  submitted_at: string | null;
}

function formatTime(secs: number | null): string {
  if (secs === null) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function pctColor(pct: number): string {
  if (pct >= 80) return "#34d399";
  if (pct >= 60) return "#fbbf24";
  if (pct >= 40) return "#fb923c";
  return "#f87171";
}

const CROWNS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const [mounted, setMounted] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<string>("ALL");
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const prevRanks = useRef<Map<string, number>>(new Map());
  const [deleteAllCount, setDeleteAllCount] = React.useState(0);
  const [deleteAllTimer, setDeleteAllTimer] = React.useState<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteAllLeaderboard = async () => {
    const newCount = deleteAllCount + 1;
    setDeleteAllCount(newCount);
    if (deleteAllTimer) clearTimeout(deleteAllTimer);
    const t = setTimeout(() => setDeleteAllCount(0), 3000);
    setDeleteAllTimer(t);
    if (newCount >= 3) {
      setDeleteAllCount(0);
      if (deleteAllTimer) clearTimeout(deleteAllTimer);
      try {
        await deleteAllLeaderboard();
        setEntries([]);
        alert("All leaderboard data deleted. Students remain but exam history is cleared.");
      } catch { alert("Failed to delete leaderboard data."); }
    }
  };

  const handleExportCSV = () => {
    const headers = ["Rank", "Name", "USN", "Branch", "Score", "Total Marks", "Percentage", "Time Taken"];
    const rows = filteredEntries.map(e => [
      e.rank,
      e.name.replace(/,/g, " "), // avoid csv comma issue
      e.usn,
      e.branch,
      e.score,
      e.total_marks,
      e.percentage.toFixed(1) + "%",
      formatTime(e.time_taken_seconds)
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leaderboard_${selectedExam}_${selectedBranch}_${new Date().toISOString().slice(0,10)}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const data = await adminFetch<{ entries: LeaderboardEntry[]; updated_at: string }>("/leaderboard/admin", {
        cache: "no-store",
      });
      const entriesArr = Array.isArray(data?.entries) ? data.entries : [];
      // Track rank deltas
      const newMap = new Map<string, number>();
      (entriesArr as LeaderboardEntry[]).forEach((e) => newMap.set(e.student_id, e.rank));
      prevRanks.current = newMap;
      setEntries(entriesArr);
      setUpdatedAt(data?.updated_at || "");
    } catch {
      // swallow network errors silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();

    // Subscribe to Supabase realtime for live updates
    const channel = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_results" }, fetchLeaderboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_status" }, fetchLeaderboard)
      .subscribe();

    const interval = setInterval(fetchLeaderboard, 10_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchLeaderboard]);

  // Derive unique exams and branches for filters
  const exams = Array.from(new Set(entries.map(e => (e as any).exam_name))).filter(Boolean).sort();
  const branches = Array.from(new Set(entries.map(e => e.branch))).filter(Boolean).sort();

  // Filter and RE-RANK
  const filteredEntries = entries
    .filter(e => (selectedExam === "ALL" || (e as any).exam_name === selectedExam))
    .filter(e => (selectedBranch === "ALL" || e.branch === selectedBranch))
    .map((e, index) => ({ ...e, rank: index + 1 }));

  const top3 = filteredEntries.slice(0, 3);
  const rest = filteredEntries.slice(3);

  if (!mounted) return null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div style={{ flex: 1 }}>
          <div className={styles.title}>
            ⚡ Quantum Leaderboard
          </div>
          <div className={styles.subtitle}>
            Ranked by Accuracy × Velocity · {filteredEntries.length} matches
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select 
            className={styles.filterSelect}
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
          >
            <option value="ALL">All Quizzes</option>
            {exams.map(ex => <option key={ex as string} value={ex as string}>{ex as string}</option>)}
          </select>

          <select 
            className={styles.filterSelect}
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            <option value="ALL">All Branches</option>
            {branches.map(br => <option key={br} value={br}>{br}</option>)}
          </select>

          <button
            onClick={handleExportCSV}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid rgba(16,185,129,0.4)",
              background: "transparent",
              color: "#10b981",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            📥 Export CSV
          </button>

          <button
            onClick={handleDeleteAllLeaderboard}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid " + (deleteAllCount > 0 ? "#f87171" : "rgba(248,113,113,0.4)"),
              background: "transparent",
              color: deleteAllCount > 0 ? "#f87171" : "#f87171",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            🗑️ Delete All {deleteAllCount > 0 ? `(${deleteAllCount}/3)` : ""}
          </button>
          {deleteAllCount > 0 && (
            <span style={{ fontSize: 11, color: "#f87171", alignSelf: "center" }}>
              {3 - deleteAllCount} more click{3 - deleteAllCount !== 1 ? "s" : ""}
            </span>
          )}
          <div className={styles.liveIndicator}>
            <div className={styles.liveDot} />
            LIVE
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 24 }}>
          <Skeleton height={200} borderRadius={24} />
          <Skeleton height={80} borderRadius={16} />
          <Skeleton height={80} borderRadius={16} />
          <Skeleton height={80} borderRadius={16} />
        </div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🌌</div>
          <p>No submissions yet. The leaderboard will crystallize as students complete their exam.</p>
        </div>
      ) : (
        <>
          {/* ── Podium (top 3) ── */}
          {top3.length > 0 && (
            <div className={styles.podium}>
              {top3.map((entry, i) => (
                <div
                  key={entry.student_id}
                  className={`${styles.podiumCard} ${styles[`rank${i + 1}` as "rank1" | "rank2" | "rank3"]}`}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className={styles.podiumRank}>{entry.rank}</div>
                  <div className={styles.podiumCrown}>{CROWNS[i]}</div>
                  <div className={styles.podiumBranch}>{entry.branch}</div>
                  <div className={styles.podiumName}>{entry.name}</div>
                  <div className={styles.podiumUsn}>{entry.usn}</div>
                  <div className={styles.podiumScore}>{entry.percentage.toFixed(1)}%</div>
                  <div className={styles.podiumMeta}>
                    {entry.score}/{entry.total_marks} marks · {formatTime(entry.time_taken_seconds)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Full list ── */}
          {rest.length > 0 && (
            <div className={styles.rankList}>
              {rest.map((entry, i) => (
                <div
                  key={entry.student_id}
                  className={styles.rankCard}
                  style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                >
                  <div className={styles.rankNum}>{entry.rank}</div>
                  <div className={styles.rankInfo}>
                    <div className={styles.rankName}>{entry.name}</div>
                    <div className={styles.rankMeta}>
                      <span className="mono" style={{ fontSize: 11 }}>{entry.usn}</span>
                      <span className="badge badge-neutral" style={{ fontSize: 10, padding: "2px 6px" }}>{entry.branch}</span>
                      <span>⏱ {formatTime(entry.time_taken_seconds)}</span>
                    </div>
                  </div>
                  <div className={styles.rankScore}>
                    <div
                      className={styles.rankPct}
                      style={{ color: pctColor(entry.percentage) }}
                    >
                      {entry.percentage.toFixed(1)}%
                    </div>
                    <div className={styles.rankTime}>
                      {entry.score}/{entry.total_marks} marks
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
