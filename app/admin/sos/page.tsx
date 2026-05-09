// v1.0.0 — SOS Admin Dashboard
"use client";

import React, { useState, useEffect } from "react";
import { fetchSupportRequests, resolveSupportRequest, clearAllSupportRequests, SupportRequest } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./sos.module.css";
import nextDynamic from "next/dynamic";
const AdminBackground = nextDynamic(() => import("@/components/admin/AdminBackground"), { ssr: false });

export default function SOSAdminPage() {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "resolved">("pending");

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function loadRequests() {
    try {
      const data = await fetchSupportRequests();
      setRequests(data);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load SOS requests.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(id: string) {
    try {
      await resolveSupportRequest(id);
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "resolved" } : r));
    } catch (err: any) {
      alert("Error resolving request: " + err.message);
    }
  }

  async function handleClearAll() {
    if (!confirm("Are you sure you want to clear all requests?")) return;
    try {
      await clearAllSupportRequests();
      setRequests([]);
    } catch (err: any) {
      alert("Error clearing requests: " + err.message);
    }
  }

  const filtered = requests.filter(r => {
    if (filter === "all") return true;
    return r.status === filter;
  });

  return (
    <div className={styles.container}>
      <AdminBackground />
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Incident Response Center</h1>
          <p className={styles.subtitle}>Real-time Student SOS Monitoring</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.refreshBtn} onClick={loadRequests}>
            Refresh Data
          </button>
          <button className={styles.clearBtn} onClick={handleClearAll}>
            Purge History
          </button>
        </div>
      </header>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active Tickets</span>
          <span className={styles.statValue}>{requests.filter(r => r.status === "pending").length}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Resolved</span>
          <span className={styles.statValue}>{requests.filter(r => r.status === "resolved").length}</span>
        </div>
      </div>

      <div className={styles.filterBar}>
        <button className={filter === "pending" ? styles.activeFilter : ""} onClick={() => setFilter("pending")}>Pending</button>
        <button className={filter === "resolved" ? styles.activeFilter : ""} onClick={() => setFilter("resolved")}>Resolved</button>
        <button className={filter === "all" ? styles.activeFilter : ""} onClick={() => setFilter("all")}>All Logs</button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.grid}>
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.emptyState}>
              No {filter} support requests found.
            </motion.div>
          ) : (
            filtered.map((req) => (
              <motion.div 
                key={req.id} 
                layout
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95 }}
                className={`${styles.reqCard} ${req.status === "resolved" ? styles.resolved : ""}`}
              >
                <div className={styles.reqHeader}>
                  <span className={styles.usn}>{req.usn_or_email}</span>
                  <span className={styles.time}>{new Date(req.created_at).toLocaleString()}</span>
                </div>
                <div className={styles.reqBody}>
                  {req.description}
                </div>
                <div className={styles.reqFooter}>
                  {req.status === "pending" ? (
                    <button className={styles.resolveBtn} onClick={() => handleResolve(req.id)}>
                      Mark Resolved
                    </button>
                  ) : (
                    <span className={styles.statusLabel}>Resolved</span>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
