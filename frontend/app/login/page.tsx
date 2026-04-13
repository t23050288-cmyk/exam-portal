"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginStudent } from "@/lib/api";
import { BRANCHES } from "@/lib/constants";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [usn, setUsn] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState("CS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const usnRegex = /^[A-Z0-9]{5}[A-Z]{2}[0-9]{3}$/;
    if (!usn.trim() || !password.trim()) {
      setError("Please enter both USN NO and password.");
      return;
    }
    if (!usnRegex.test(usn.trim())) {
      setError("Invalid USN format. Example: 1RM25XY000 (5 chars, 2 letters, 3 digits)");
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

      // Store session
      sessionStorage.setItem("exam_token", data.access_token);
      sessionStorage.setItem(
        "exam_student",
        JSON.stringify({
          id: data.student_id,
          name: data.student_name,
          examStartTime: data.exam_start_time,
          examDurationMinutes: data.exam_duration_minutes,
        })
      );

      router.push("/exam");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      {/* Background grid */}
      <div className={styles.grid} aria-hidden="true" />

      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#4f6ef7" />
              <path
                d="M8 12h16M8 16h10M8 20h12"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="24" cy="20" r="4" fill="#22c55e" stroke="white" strokeWidth="1.5" />
              <path d="M22.5 20l1 1 2-2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className={styles.title}>ExamGuard</h1>
          <p className={styles.subtitle}>Online Examination Portal</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.form} autoComplete="off">
          <div className={styles.field}>
            <label htmlFor="usn" className={styles.label}>
              USN NO
            </label>
            <input
              id="usn"
              type="text"
              className="input"
              placeholder="e.g. 1RM25XY000"
              value={usn}
              onChange={(e) => setUsn(e.target.value.toUpperCase())}
              disabled={loading}
              autoFocus
              spellCheck={false}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="name" className={styles.label}>
              Full Name (Optional)
            </label>
            <input
              id="name"
              type="text"
              className="input"
              placeholder="Defaults to USN if left blank"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>
              Email Address (Optional)
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="e.g. name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="branch" className={styles.label}>
              Branch
            </label>
            <select
              id="branch"
              className="input"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={loading}
            >
              {BRANCHES.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className={styles.error} role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" />
                <path d="M8 5v3M8 10.5v.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Logging in...
              </>
            ) : (
              "Start Exam →"
            )}
          </button>
        </form>

        {/* Info */}
        <div className={styles.info}>
          <div className={styles.infoItem}>
            <span className={styles.dot} style={{ background: "var(--success)" }} />
            Secure encrypted connection
          </div>
          <div className={styles.infoItem}>
            <span className={styles.dot} style={{ background: "var(--warning)" }} />
            Single device only
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className={styles.footer}>
        ExamGuard v1.0 · Proctored Examination System
      </p>
    </div>
  );
}
