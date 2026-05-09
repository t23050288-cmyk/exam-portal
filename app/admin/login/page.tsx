"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Background from "@/components/dashboard/Background";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });
      if (!r.ok) {
        setError((await r.json()).detail || "Login failed");
        return;
      }
      const d = await r.json();
      sessionStorage.setItem("examguard_admin_jwt", d.access_token);
      sessionStorage.setItem("examguard_admin_auth", "true");
      router.push("/admin");
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-primary)" }}>
      <Background />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: "var(--panel-glass)",
          backdropFilter: "blur(20px)",
          border: "1px solid var(--rim-metal)",
          borderRadius: "24px",
          padding: "48px 40px",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "var(--nexus-shadow-glass)",
          zIndex: 10,
          position: "relative",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚡</div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 8px 0" }}>
            EXAM Admin
          </h1>
          <p style={{ color: "var(--accent-cool)", fontSize: "14px", opacity: 0.8, margin: 0 }}>
            Control Node — Staff Authorization
          </p>
        </div>

        <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", opacity: 0.6, display: "block", marginBottom: "8px" }}>
              Administrator Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@nexus.local"
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid var(--rim-metal)",
                background: "rgba(255, 255, 255, 0.03)",
                color: "var(--text-primary)",
                fontSize: "14px",
                outline: "none",
                transition: "all 0.2s ease",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", opacity: 0.6, display: "block", marginBottom: "8px" }}>
              Access Key
            </label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••••••"
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid var(--rim-metal)",
                background: "rgba(255, 255, 255, 0.03)",
                color: "var(--text-primary)",
                fontSize: "14px",
                outline: "none",
                transition: "all 0.2s ease",
              }}
            />
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "10px",
                padding: "12px",
                color: "#f87171",
                fontSize: "13px",
                textAlign: "center",
              }}
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: loading ? "var(--rim-metal)" : "var(--accent-warm-grad)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "16px",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 4px 15px rgba(255, 154, 76, 0.2)",
              marginTop: "8px",
              transition: "all 0.3s ease",
            }}
          >
            {loading ? "Authorizing..." : "Initialize Access"}
          </button>
        </form>

        <p style={{ textAlign: "center", color: "var(--text-primary)", opacity: 0.4, fontSize: "11px", marginTop: "24px" }}>
          NEXUS Orbital Command · Secure Environment
        </p>
      </motion.div>
    </div>
  );
}
