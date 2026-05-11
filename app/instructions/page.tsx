"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./instructions.module.css";
import { startExam } from "@/lib/api";
import { useFullscreen } from "@/hooks/useFullscreen";
import Skeleton from "@/components/Skeleton";

export default function InstructionsPage() {
  const router = useRouter();
  const { enter: enterFullscreen } = useFullscreen();
  const [studentInfo, setStudentInfo] = useState<{
    name: string, 
    usn: string,
    examTitle: string,
    duration: number,
    totalQuestions: number
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSecureGate, setShowSecureGate] = useState(true);

  useEffect(() => {
    // Check authentication
    const token = sessionStorage.getItem("exam_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    
    // ── Prevent Back Navigation ──
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", handlePopState);
    // Token is long-lived (30 days) — no expiry check needed

    const studentData = sessionStorage.getItem("exam_student");
    if (studentData) {
      try {
        const parsed = JSON.parse(studentData);
        // PRIORITY: Use the exam title selected from dashboard, fallback to login data
        const examTitle = sessionStorage.getItem("exam_selected_title") || parsed.examTitle || "Online Assessment";
        
        // Set initial info immediately so UI renders fast
        setStudentInfo({
          name: parsed.name || "Student",
          usn: parsed.usn || "Candidate",
          examTitle,
          duration: 20,
          totalQuestions: parsed.totalQuestions || 30,
        });

        // Fetch the real question count for this branch + exam from the backend
        fetch(`/api/exam/questions?title=${encodeURIComponent(examTitle)}`, {
          headers: { "Authorization": `Bearer ${token}` }
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data && typeof data.total === "number" && data.total > 0) {
              setStudentInfo(prev => prev ? { ...prev, totalQuestions: data.total } : prev);
            }
          })
          .catch(() => {/* silently fall back to stored value */});

      } catch (err) {
        console.error("Could not parse student data", err);
      }
    } else {
      // Fallback if session storage is weirdly empty but token exists
      setStudentInfo({ 
        name: "Student", 
        usn: "Candidate", 
        examTitle: "Online Assessment", 
        duration: 20,
        totalQuestions: 30 
      });
    }
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [router]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) setShowSecureGate(false);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, []);


  // Called from "Enter Secure Mode" button — synchronous click → fullscreen
  const handleEnterSecureMode = () => {
    const docElm = document.documentElement;
    if (docElm.requestFullscreen) { docElm.requestFullscreen(); }
    else if ((docElm as any).webkitRequestFullscreen) { (docElm as any).webkitRequestFullscreen(); }
    else if ((docElm as any).mozRequestFullScreen) { (docElm as any).mozRequestFullScreen(); }
    // setShowSecureGate(false) will happen via fullscreenchange listener
  };

  const handleStartExam = () => {
    if (starting) return;
    // Ensure fullscreen before proceeding — also re-enter if lost
    if (!document.fullscreenElement) {
      const el = document.documentElement as any;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      if (req) req.call(el).catch(() => {});
    }
    setStarting(true);

    startExam(studentInfo?.examTitle || "Initial Assessment").then((res: any) => {
      
      if (res.status === "submitted") {
        alert("You have already submitted this exam.");
        setStarting(false);
        return;
      }

      // IMPORTANT: Do NOT overwrite exam_selected_title here.
      // It was already set correctly by the dashboard when student clicked the exam card.
      // Overwriting it with studentInfo.examTitle (from login) causes title mismatch.
      if (!sessionStorage.getItem("exam_selected_title")) {
        sessionStorage.setItem("exam_selected_title", studentInfo?.examTitle || "Online Assessment");
      }
      const studentData = sessionStorage.getItem("exam_student");
      if (studentData) {
        const parsed = JSON.parse(studentData);
        parsed.examStartTime = res.started_at;
        sessionStorage.setItem("exam_student", JSON.stringify(parsed));
      }

      router.push("/exam");
    }).catch((err: any) => {
      console.error("Failed to start exam", err);
      const msg: string = err.message || "";
      if (msg.toLowerCase().includes("invalid or expired token") || err.status === 401) {
        sessionStorage.removeItem("exam_token");
        sessionStorage.removeItem("exam_student");
        sessionStorage.removeItem("exam_login_at");
        alert("Your session has expired. Please log in again.");
        router.replace("/login");
        return;
      }
      alert(msg || "Error starting exam. Please try again.");
      setStarting(false);
    });
  };

  const handleLogout = () => {
    sessionStorage.removeItem("exam_token");
    sessionStorage.removeItem("exam_student");
    sessionStorage.removeItem("exam_selected_title");
    router.replace("/login");
  };

  if (!studentInfo) {
    return (
      <div className={styles.wrapper}>
        <div className="page-skeleton-wrap">
          <Skeleton height={40} width="60%" borderRadius={12} />
          <Skeleton height={300} borderRadius={24} />
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            <Skeleton height={50} width={150} borderRadius={12} />
            <Skeleton height={50} width={150} borderRadius={12} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* ── SECURE MODE GATE — shown until fullscreen is entered ── */}
      {showSecureGate && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "linear-gradient(135deg, #060b1a 0%, #0a1020 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "rgba(10,15,30,0.97)", border: "1px solid rgba(40,215,214,0.3)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.7)", padding: "48px 40px",
            borderRadius: "24px", textAlign: "center", maxWidth: 480, width: "90%",
          }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>🛡️</div>
            <h2 style={{ fontSize: "24px", fontWeight: 900, color: "#fff", marginBottom: 12 }}>
              Secure Environment Required
            </h2>
            <p style={{ color: "rgba(255,255,255,0.6)", marginBottom: 36, fontSize: 15, lineHeight: 1.6 }}>
              This exam requires mandatory full-screen mode to ensure assessment integrity.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={handleEnterSecureMode}
                style={{ flex: 1, padding: "16px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #28D7D6, #0066cc)", color: "#000", fontWeight: 900, cursor: "pointer", fontSize: 16, boxShadow: "0 8px 25px rgba(40,215,214,0.3)" }}
              >
                ENTER SECURE MODE →
              </button>
            </div>
            <div style={{ marginTop: 24, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", fontWeight: 700 }}>
              VIOLATIONS ARE RECORDED IN REAL-TIME
            </div>
          </div>
        </div>
      )}
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {/* Logo or empty space */}
        </div>
        <div className={styles.headerRight}>
          <div className={styles.studentInfo}>
            <span className={styles.studentName}>{studentInfo.name}</span>
            <span className={styles.studentRole}>{studentInfo.usn}</span>
          </div>
          <button onClick={handleLogout} className={styles.logoutBtn} title="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
          </button>
        </div>
      </header>

      {/* ── Main Instructions ── */}
      <main className={styles.main}>
        <div className={styles.card}>
          <h1 className={styles.title}>IP NEXUS EXAM Instructions</h1>

          <div className={styles.detailsBox}>
            <h2 className={styles.detailsTitle}>Exam Details</h2>
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <svg className={styles.detailIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Candidate Name: {studentInfo.name}
              </div>
              <div className={styles.detailItem}>
                <svg className={styles.detailIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                Duration: {studentInfo.duration} minutes
              </div>
              <div className={styles.detailItem}>
                <svg className={styles.detailIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Total Questions: {studentInfo.totalQuestions}
              </div>
              <div className={styles.detailItem}>
                <svg className={styles.detailIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                Proctoring: Enabled
              </div>
            </div>
          </div>

          <h2 className={styles.instructionsTitle}>Important Instructions</h2>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <span className={styles.bullet}>•</span>
              Read each question carefully before answering.
            </li>
            <li className={styles.listItem}>
              <span className={styles.bullet}>•</span>
              You can navigate between questions using the navigation buttons.
            </li>
            <li className={styles.listItem}>
              <span className={styles.bullet}>•</span>
              Your answers will be auto-saved. However, ensure you submit before time expires.
            </li>
            <li className={styles.listItem}>
              <span className={styles.bullet}>•</span>
              Do not switch tabs, minimize the browser window, or exit fullscreen during the exam.
            </li>
            <li className={styles.listItem}>
              <span className={styles.bullet}>•</span>
              Right-clicking, copying, pasting, and all keyboard shortcuts are strictly disabled and monitored. Do not switch tabs, automatic submission and disqualify you.
            </li>
            <li className={styles.listItem}>
              <span className={styles.bullet}>•</span>
              You can mark questions for review and come back to them later.
            </li>
          </ul>

          <div className={styles.actionArea}>
            <div style={{ flex: 1 }} /> {/* Spacer */}
            <button 
              onClick={handleStartExam} 
              className={styles.startBtn}
              disabled={starting}
            >
               {starting ? (
                <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                   <div className="skeleton" style={{ position: "absolute", inset: 0, opacity: 0.2, borderRadius: "12px" }} />
                   <span>Initializing...</span>
                </div>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  Start Exam
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}



