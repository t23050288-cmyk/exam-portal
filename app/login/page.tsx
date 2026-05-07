// v2.0.0 — Campus Nexus: Student Hub Login
"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { loginStudent } from "@/lib/api";
import { BRANCHES } from "@/lib/constants";
import styles from "./login.module.css";

const NEWS_ITEMS = [
  "Registration Deadline: Sept 15",
  "New Research Grant Winners Announced!",
  "Campus Safety Alert: Standard Procedures in Place.",
  "Library Hours Extended During Finals Week",
  "Student Council Elections — Vote Now!",
];

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
    if (!usn.trim() || !password.trim() || !name.trim() || !email.trim() || !branch) {
      setError("Please fill in all mandatory details to continue.");
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
          examDurationMinutes: 20,
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
      <img
        src="/campus-bg.png"
        alt=""
        className={styles.bgImage}
        draggable={false}
      />

      <a className={styles.helpBtn} href="#" onClick={(e) => e.preventDefault()}>
        <svg className={styles.helpIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Get Help
      </a>

      {/* Simplified Layout Structure */}
      <div className={styles.crestWrap}>
        <div className={styles.crestGlow}></div>
        <svg className={styles.crest} viewBox="0 0 100 110" fill="none">
          <path d="M50 5 L90 20 L90 55 Q90 85 50 105 Q10 85 10 55 L10 20 Z"
            fill="url(#shieldGrad)" stroke="rgba(200,170,110,0.8)" strokeWidth="2"/>
          <path d="M38 65 L62 65 L62 45 L50 35 L38 45 Z" fill="none" stroke="rgba(200,170,110,0.8)" strokeWidth="1.5"/>
          <rect x="46" y="55" width="8" height="10" rx="1" fill="rgba(200,170,110,0.4)"/>
          <defs>
            <linearGradient id="shieldGrad" x1="50" y1="0" x2="50" y2="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1e3a8a"/>
              <stop offset="100%" stopColor="#1e1b4b"/>
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className={styles.card}>
        <div className={styles.header}>
          {/* Laurels moved inside relative header for guaranteed centering */}
          <svg className={styles.laurelLeft} viewBox="0 0 50 120" fill="none">
            <path d="M40 10 Q20 20 25 40 Q10 35 15 55 Q5 50 8 70 Q0 68 5 85 Q-2 85 5 100 Q8 110 20 115" 
              stroke="rgba(200,170,110,0.3)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>
          <svg className={styles.laurelRight} viewBox="0 0 50 120" fill="none">
            <path d="M10 10 Q30 20 25 40 Q40 35 35 55 Q45 50 42 70 Q50 68 45 85 Q52 85 45 100 Q42 110 30 115" 
              stroke="rgba(200,170,110,0.3)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>

          <p className={styles.topLabel}>CAMPUS NEXUS:</p>
          <h1 className={styles.title}>Student Hub</h1>
          <p className={styles.subtitle}>Secure Online Examination Portal</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} autoComplete="off">
          <div className={styles.inputWrap}>
            <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <input
              id="usn"
              type="text"
              className={styles.inputField}
              placeholder="Username"
              value={usn}
              onChange={(e) => setUsn(e.target.value.toUpperCase())}
              disabled={loading}
              autoFocus
              required
            />
          </div>

          <div className={styles.inputWrap}>
            <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 8h4M7 12h6M7 16h5"/><circle cx="17" cy="13" r="2.5"/>
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

          <div className={styles.inputWrap}>
            <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className={styles.inputField}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
            <button 
              type="button" 
              className={styles.passToggle}
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Toggle password visibility"
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              )}
            </button>
          </div>

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
            {loading ? "Authenticating..." : "Secure Login"}
          </button>
        </form>

        <div className={styles.linksRow}>
          <button className={styles.link} type="button">Forgot Password?</button>
          <button className={styles.link} type="button">Request Access</button>
        </div>

        <div className={styles.info}>
          <div className={styles.infoItem}><span className={styles.dot} style={{ background: "#22c55e" }} /> Secure Connection</div>
          <div className={styles.infoItem}><span className={styles.dot} style={{ background: "#eab308" }} /> Single Device</div>
        </div>
      </div>

      <div className={styles.ticker}>
        <span className={styles.tickerLabel}>Campus Pulse</span>
        <div className={styles.tickerTrack}>
          <div className={styles.tickerContent}>
            {[...NEWS_ITEMS, ...NEWS_ITEMS].map((item, i) => (
              <span key={i} className={styles.tickerItem}>
                <span className={styles.tickerDot} />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <svg className={styles.sparkle} viewBox="0 0 40 40" fill="none">
        <path d="M20 0L23 17L40 20L23 23L20 40L17 23L0 20L17 17L20 0Z" fill="rgba(200,170,110,0.4)"/>
      </svg>
    </div>
  );
}
