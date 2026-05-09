// v2.1.0 — Campus Nexus: Student Hub — Unified Auth & Support
"use client";

import React, { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { loginStudent, submitSupportRequest } from "@/lib/api";
import { BRANCHES } from "@/lib/constants";
import styles from "./login.module.css";

const NEWS_ITEMS = [
  "Portal Security: Multi-layered Auth Active",
  "Support System Live: Report issues directly",
  "Exam Window: Sept 20 - Sept 25",
  "New: Real-time Incident Monitoring",
  "Guidelines: One device, one session policy",
];

export default function LoginPage() {
  const router = useRouter();

  // View State
  const [view, setView] = useState<"login" | "signup" | "forgot" | "support">("login");

  // Shared & Form State
  const [usn, setUsn] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState("CS");
  const [supportMsg, setSupportMsg] = useState("");

  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [supportSuccess, setSupportSuccess] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  const selectRef = useRef<HTMLDivElement>(null);

  // Load saved USN on mount (locked after first signup)


  useEffect(() => {
    router.prefetch("/instructions");
    router.prefetch("/exam");

    // Removed USN lock logic
    const savedUsn = localStorage.getItem("nexus_usn");
    if (savedUsn) {
      setUsn(savedUsn);
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [router]);

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usn.trim() || !password.trim()) {
      setError("Please enter your credentials.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await loginStudent(usn.trim(), password);
      sessionStorage.setItem("exam_token", data.access_token);
      sessionStorage.setItem("exam_student", JSON.stringify({
        id: data.student_id,
        name: data.student_name,
        examStartTime: data.exam_start_time,
        examDurationMinutes: data.exam_duration_minutes || 60,
        examTitle: data.exam_title,
        totalQuestions: data.total_questions,
        email: data.email,
        branch: data.branch
      }));
      // Persist USN so it stays locked on future visits
      localStorage.setItem("nexus_usn", usn.trim().toUpperCase());
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usn.trim() || !password.trim() || !name.trim() || !email.trim()) {
      setError("Please fill all mandatory fields.");
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
      sessionStorage.setItem("exam_student", JSON.stringify({
        id: data.student_id,
        name: data.student_name,
        examStartTime: data.exam_start_time,
        examDurationMinutes: data.exam_duration_minutes || 60,
        examTitle: data.exam_title,
        totalQuestions: data.total_questions,
        email: data.email,
        branch: data.branch
      }));
      // USN lock removed
      localStorage.setItem("nexus_usn", usn.trim().toUpperCase());
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSupportSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usn.trim() || !supportMsg.trim()) {
      setError("Identification and description are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await submitSupportRequest(usn.trim(), supportMsg.trim());
      setSupportSuccess(true);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Failed to submit request.");
      setLoading(false);
    }
  }

  const selectedBranchName = BRANCHES.find(b => b.id === branch)?.name || branch;

  const resetViews = () => {
    setView("login");
    setError("");
    setSupportSuccess(false);
    setSupportMsg("");
  };

  return (
    <div className={styles.container}>
      <img src="/campus-bg.png" alt="" className={styles.bgImage} draggable={false} />

      <button className={styles.helpBtn} onClick={() => setView("support")}>
        <svg className={styles.helpIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Get Help
      </button>

      <div className={styles.crestWrap}>
        <div className={styles.crestGlow}></div>
        <svg className={styles.crest} viewBox="0 0 100 110" fill="none">
          <path d="M50 5 L90 20 L90 55 Q90 85 50 105 Q10 85 10 55 L10 20 Z" fill="url(#shieldGrad)" stroke="rgba(200,170,110,0.8)" strokeWidth="2" />
          <defs>
            <linearGradient id="shieldGrad" x1="50" y1="0" x2="50" y2="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1e3a8a" /><stop offset="100%" stopColor="#1e1b4b" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className={styles.card}>
        <div className={styles.header}>
          <svg className={styles.laurelLeft} viewBox="0 0 50 120" fill="none">
            <path d="M40 10 Q20 20 25 40 Q10 35 15 55 Q5 50 8 70 Q0 68 5 85 Q-2 85 5 100 Q8 110 20 115" stroke="rgba(200,170,110,0.3)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
          <svg className={styles.laurelRight} viewBox="0 0 50 120" fill="none">
            <path d="M10 10 Q30 20 25 40 Q40 35 35 55 Q45 50 42 70 Q50 68 45 85 Q52 85 45 100 Q42 110 30 115" stroke="rgba(200,170,110,0.3)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>

          <p className={styles.topLabel}>CAMPUS NEXUS:</p>
          <h1 className={styles.title}>
            {view === "login" && "Student Login"}
            {view === "signup" && "Registration"}
            {view === "forgot" && "Recovery"}
            {view === "support" && "Help Desk"}
          </h1>
          <p className={styles.subtitle}>Secure Academic Intelligence Framework</p>
        </div>

        <AnimatePresence mode="wait">
          {/* LOGIN VIEW */}
          {view === "login" && (
            <motion.div key="login" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <form onSubmit={handleLoginSubmit} className={styles.form}>
                <div className={styles.inputWrap}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  <input type="text" className={styles.inputField} placeholder="USN / Username" value={usn} onChange={(e) => setUsn(e.target.value.toUpperCase())} required />
                </div>
                <div className={styles.inputWrap}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <input type={showPassword ? "text" : "password"} className={styles.inputField} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <button type="button" className={styles.passToggle} onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <button type="submit" className={styles.submitBtn} disabled={loading}>{loading ? "Verifying..." : "SECURE LOGIN"}</button>

                <div className={styles.linksRow}>
                  <button className={styles.link} type="button" onClick={() => setView("forgot")}>Forgot Password?</button>
                </div>

                <div className={styles.signupPrompt}>
                  <span className={styles.signupLabel}>New to the portal?</span>
                  <button className={styles.signupLink} type="button" onClick={() => setView("signup")}>Create Student Account</button>
                </div>
              </form>
            </motion.div>
          )}

          {/* SIGNUP VIEW */}
          {view === "signup" && (
            <motion.div key="signup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <form onSubmit={handleSignupSubmit} className={styles.form}>
                <div className={styles.inputWrap}>
                  <input type="text" className={styles.inputField} placeholder="USN Number" value={usn} onChange={(e) => setUsn(e.target.value.toUpperCase())} required />
                </div>
                <div className={styles.inputWrap}>
                  <input type="text" className={styles.inputField} placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className={styles.inputWrap}>
                  <input type="email" className={styles.inputField} placeholder="University Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className={styles.inputWrap}>
                  <input type="password" className={styles.inputField} placeholder="Create Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className={styles.selectContainer} ref={selectRef}>
                  <div className={styles.selectTrigger} onClick={() => setSelectOpen(!selectOpen)}>
                    <span className={styles.selectedText}>{selectedBranchName}</span>
                  </div>
                  {selectOpen && (
                    <div className={styles.dropdown}>
                      {BRANCHES.map(b => (
                        <div key={b.id} className={styles.option} onClick={() => { setBranch(b.id); setSelectOpen(false); }}>{b.name}</div>
                      ))}
                    </div>
                  )}
                </div>

                {error && <div className={styles.error}>{error}</div>}
                <button type="submit" className={styles.submitBtn} disabled={loading}>{loading ? "Processing..." : "REGISTER ACCOUNT"}</button>
                <div className={styles.backRow}>
                  <button className={styles.link} onClick={() => setView("login")}>Back to Login</button>
                </div>
              </form>
            </motion.div>
          )}

          {/* FORGOT PASSWORD VIEW */}
          {view === "forgot" && (
            <motion.div key="forgot" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className={styles.recoveryText}>
                Please contact the <span className={styles.recoveryHighlight}>Admin or Faculty</span> to reset your password or recover your account details.
              </div>
              <button className={styles.submitBtn} onClick={() => setView("login")}>UNDERSTOOD</button>
            </motion.div>
          )}

          {/* SUPPORT VIEW */}
          {view === "support" && (
            <motion.div key="support" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {!supportSuccess ? (
                <form onSubmit={handleSupportSubmit} className={styles.form}>
                  <p className={styles.subtitle} style={{ marginBottom: "10px" }}>Describe your issue and an administrator will assist you shortly.</p>
                  <div className={styles.inputWrap}>
                    <input type="text" className={styles.inputField} placeholder="USN No / Email ID" value={usn} onChange={(e) => setUsn(e.target.value)} required />
                  </div>
                  <div className={styles.textareaWrap}>
                    <textarea className={styles.textareaField} placeholder="Describe your problem..." value={supportMsg} onChange={(e) => setSupportMsg(e.target.value)} required />
                  </div>
                  {error && <div className={styles.error}>{error}</div>}
                  <button type="submit" className={styles.submitBtn} disabled={loading}>{loading ? "Sending..." : "SUBMIT REQUEST"}</button>
                  <div className={styles.backRow}>
                    <button type="button" className={styles.link} onClick={resetViews}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className={styles.success}>
                  <div className={styles.successIcon}>✓</div>
                  <h2 className={styles.successTitle}>Request Sent</h2>
                  <p className={styles.successText}>Your SOS signal has been received. Please wait for an administrator to contact you.</p>
                  <button className={styles.submitBtn} onClick={resetViews}>BACK TO PORTAL</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.info}>
          <div className={styles.infoItem}><span className={styles.dot} style={{ background: "#22c55e" }} /> Secure Node</div>
          <div className={styles.infoItem}><span className={styles.dot} style={{ background: "#eab308" }} /> Multi-Factor</div>
        </div>
      </div>

      <div className={styles.ticker}>
        <span className={styles.tickerLabel}>Security Feed</span>
        <div className={styles.tickerTrack}>
          <div className={styles.tickerContent}>
            {[...NEWS_ITEMS, ...NEWS_ITEMS].map((item, i) => (
              <span key={i} className={styles.tickerItem}><span className={styles.tickerDot} />{item}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
