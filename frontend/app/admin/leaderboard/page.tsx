"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./leaderboard.module.css";
import Skeleton from "@/components/Skeleton";

const API = process.env.NEXT_PUBLIC_API_URL || "/api";
const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "admin@examguard2024";

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
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const prevRanks = useRef<Map<string, number>>(new Map());

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`${API}/leaderboard/admin`, {
        headers: { "x-admin-secret": ADMIN_SECRET },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      // Track rank deltas
      const newMap = new Map<string, number>();
      (data.entries as LeaderboardEntry[]).forEach((e) => newMap.set(e.student_id, e.rank));
      prevRanks.current = newMap;
      setEntries(data.entries);
      setUpdatedAt(data.updated_at);
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

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>
            ⚡ Quantum Leaderboard
          </div>
          <div className={styles.subtitle}>
            Ranked by Accuracy × Velocity · {entries.length} students submitted
          </div>
        </div>
        <div className={styles.liveIndicator}>
          <div className={styles.liveDot} />
          LIVE
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
