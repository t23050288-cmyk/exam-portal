"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass]   = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/auth/login", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({email, password:pass}),
      });
      if (!r.ok) { setError((await r.json()).detail || "Login failed"); return; }
      const d = await r.json();
      sessionStorage.setItem("examguard_admin_jwt", d.access_token);
      sessionStorage.setItem("examguard_admin_auth", "true");
      router.push("/admin");
    } catch (err:unknown) { setError(String(err)); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0f172a", fontFamily:"system-ui" }}>
      <form onSubmit={login} style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:16, padding:"40px 36px", width:360, display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ textAlign:"center", marginBottom:8 }}>
          <div style={{ fontSize:36 }}>🛡️</div>
          <h2 style={{ color:"#f8fafc", margin:"8px 0 4px" }}>Admin Login</h2>
          <p style={{ color:"#64748b", fontSize:13, margin:0 }}>ExamGuard Control Center</p>
        </div>
        {[["email","email","Email","admin@examguard.local"],["password","password","Password","••••••••"]].map(([type,key,label,ph])=>(
          <div key={key}>
            <label style={{ color:"#94a3b8", fontSize:12, fontWeight:600, display:"block", marginBottom:6 }}>{label.toUpperCase()}</label>
            <input type={type} value={key==="email"?email:pass}
              onChange={e => key==="email" ? setEmail(e.target.value) : setPass(e.target.value)}
              placeholder={ph} required
              style={{ width:"100%", padding:"10px 14px", borderRadius:8, border:"1px solid #334155", background:"#0f172a", color:"#e2e8f0", fontSize:14, boxSizing:"border-box" }} />
          </div>
        ))}
        {error && <div style={{ background:"#450a0a", border:"1px solid #ef444433", borderRadius:8, padding:"10px 14px", color:"#f87171", fontSize:13 }}>{error}</div>}
        <button type="submit" disabled={loading}
          style={{ padding:12, borderRadius:8, border:"none", background:loading?"#334155":"#6366f1", color:"#fff", fontWeight:700, fontSize:15, cursor:loading?"not-allowed":"pointer", marginTop:4 }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
        <p style={{ textAlign:"center", color:"#475569", fontSize:11, margin:0 }}>
          Legacy: use admin secret on the main /admin page
        </p>
      </form>
    </div>
  );
}
