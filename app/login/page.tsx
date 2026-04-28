"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { loginStudent } from "@/lib/api";
import { BRANCHES } from "@/lib/constants";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [usn, setUsn] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState("CS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectOpen, setSelectOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    router.prefetch("/instructions");
    router.prefetch("/exam");

    const handleClickOutside = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usn.trim() || !password.trim()) {
      setError("Please enter both USN NO and password.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError("Please provide your Full Name and Email Address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await loginStudent(usn.trim(), password, {
        name: name.trim(),
        email: email.trim(),
        branch
      });

      sessionStorage.setItem("exam_token", data.access_token);
      sessionStorage.setItem(
        "exam_student",
        JSON.stringify({
          id: data.student_id,
          name: data.student_name,
          examStartTime: data.exam_start_time,
          examDurationMinutes: data.exam_duration_minutes,
          examTitle: data.exam_title,
          totalQuestions: data.total_questions,
        })
      );

      router.push("/instructions");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      setError(msg);
      setLoading(false);
    }
  }

  const selectedBranchName = BRANCHES.find(b => b.id === branch)?.name || branch;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="#1e1b4b" opacity="0.9"/>
              <path d="M24 10L36 17V31L24 38L12 31V17L24 10Z" stroke="#818cf8" strokeWidth="1.5" fill="none"/>
              <path d="M24 10L36 17L24 24L12 17L24 10Z" fill="#6366f1" opacity="0.5"/>
              <path d="M24 24L36 17V31L24 38V24Z" fill="#4338ca" opacity="0.4"/>
              <path d="M24 24L12 17V31L24 38V24Z" fill="#818cf8" opacity="0.3"/>
              <path d="M24 16L30 19.5V26.5L24 30L18 26.5V19.5L24 16Z" stroke="#c7d2fe" strokeWidth="1" fill="none" opacity="0.7"/>
            </svg>
          </div>
          <h1 className={styles.title}>ExamGuard</h1>
          <p className={styles.subtitle}>Secure Online Examination Portal</p>
          <p className={styles.subtitleSmall}>Sign up to continue</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} autoComplete="off">
          {/* USN */}
          <div className={styles.inputWrap}>
            <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 8h4M7 12h6M7 16h5"/><circle cx="17" cy="13" r="2.5"/>
            </svg>
            <input
              id="usn"
              type="text"
              className={styles.inputField}
              placeholder="USN (e.g. 1RM25XY000)"
              value={usn}
              onChange={(e) => setUsn(e.target.value.toUpperCase())}
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Name */}
          <div className={styles.inputWrap}>
            <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <input
              id="name"
              type="text"
              className={styles.inputField}
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Email */}
          <div className={styles.inputWrap}>
            <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            <input
              id="email"
              type="email"
              className={styles.inputField}
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Password */}
          <div className={styles.inputWrap}>
            <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className={styles.inputField}
              placeholder="Access Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <button 
              type="button" 
              className={styles.passToggle}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "👁️" : "👁️‍🗨️"}
            </button>
          </div>

          {/* Custom Branch Select */}
          <div className={styles.selectContainer} ref={selectRef}>
            <div 
              className={`${styles.selectTrigger} ${selectOpen ? styles.selectTriggerOpen : ""}`}
              onClick={() => !loading && setSelectOpen(!selectOpen)}
            >
              <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span className={styles.selectedText}>{selectedBranchName}</span>
              <motion.svg 
                animate={{ rotate: selectOpen ? 180 : 0 }}
                className={styles.selectChevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9"/>
              </motion.svg>
            </div>

            <AnimatePresence>
              {selectOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={styles.dropdown}
                >
                  {BRANCHES.map((b) => (
                    <div 
                      key={b.id} 
                      className={`${styles.option} ${branch === b.id ? styles.optionActive : ""}`}
                      onClick={() => {
                        setBranch(b.id);
                        setSelectOpen(false);
                      }}
                    >
                      {b.name}
                      {branch === b.id && <span className={styles.optionCheck}>✓</span>}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={styles.error}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" />
                <path d="M8 5v3M8 10.5v.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {error}
            </motion.div>
          )}

          <button id="login-submit" type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Signing up..." : "Sign Up"}
          </button>
        </form>

        <div className={styles.info}>
          <div className={styles.infoItem}><span className={styles.dot} style={{ background: "#22c55e" }} /> Secure Connection</div>
          <div className={styles.infoItem}><span className={styles.dot} style={{ background: "#eab308" }} /> Single Device</div>
        </div>
      </div>

      <svg className={styles.sparkle} viewBox="0 0 40 40" fill="none">
        <path d="M20 0L23 17L40 20L23 23L20 40L17 23L0 20L17 17L20 0Z" fill="rgba(255,255,255,0.6)"/>
      </svg>
      <p className={styles.footer}>ExamGuard v1.0 · Secured Portal</p>
    </div>
  );
}
