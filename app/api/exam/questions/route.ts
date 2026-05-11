import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

function verifyToken(token: string): string | null {
  try {
    const secret = process.env.JWT_SECRET || "examguard-super-secret-jwt-2024";
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest("base64url");
    if (signature !== expected) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded.sub || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    
    let studentBranch = "CS"; // default
    
    if (token) {
      const sub = verifyToken(token);
      if (sub) {
        try {
          const sb = getSupabase();
          // Try by id first, then usn
          let { data: s } = await sb.from("students").select("branch").eq("id", sub).maybeSingle();
          if (!s) {
            const { data: s2 } = await sb.from("students").select("branch").eq("usn", sub).maybeSingle();
            s = s2;
          }
          if (!s) {
            const { data: s3 } = await sb.from("students").select("branch").eq("usn", sub.toUpperCase()).maybeSingle();
            s = s3;
          }
          if (s?.branch) studentBranch = s.branch.trim().toUpperCase();
        } catch (e) {
          console.warn("[QUESTIONS] Student lookup failed, using default branch:", e);
        }
      } else {
        return NextResponse.json({ detail: "Unauthorized" }, { status: 401, headers: NO_CACHE });
      }
    } else {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401, headers: NO_CACHE });
    }

    const title = (req.nextUrl.searchParams.get("title") || "").trim();
    if (!title) {
      return NextResponse.json({ questions: [], total: 0 }, { headers: NO_CACHE });
    }
    const titleLower = title.toLowerCase();
    console.log(`[QUESTIONS] title="${title}" branch="${studentBranch}"`);

    // ── Fetch questions from DB ──────────────────────────────────
    const sb = getSupabase();
    
    // We fetch a larger set of questions to ensure we don't miss anything due to matching glitches
    const { data: allRows, error } = await sb
      .from("questions")
      .select("*")
      .order("order_index");

    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const dbKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    if (error) {
      console.error("[QUESTIONS] DB error:", error.message);
      return NextResponse.json({ 
        questions: [], 
        total: 0, 
        error: error.message,
        debug: { url: dbUrl.substring(0, 20) + "...", key: dbKey ? "set" : "missing" }
      }, { headers: NO_CACHE });
    }

    const all = allRows || [];
    if (all.length === 0) {
       return NextResponse.json({ 
         questions: [], 
         total: 0, 
         message: "Database table 'questions' is empty.",
         debug: { rowCount: 0, title, dbUrl: dbUrl.substring(0, 30) } 
       }, { headers: NO_CACHE });
    }

    const t = titleLower.trim();

    // ── Title Filtering ──────────────────────────────────────────
    let examRows = all.filter((q: any) => {
      const qExam = (q.exam_name || "").trim().toLowerCase();
      return qExam === t || qExam.includes(t) || t.includes(qExam) || qExam.replace(/\s+/g,"") === t.replace(/\s+/g,"");
    });

    if (examRows.length === 0) {
       const availableExams = Array.from(new Set(all.map((q: any) => q.exam_name || "Untitled")));
       return NextResponse.json({ 
         questions: [], 
         total: 0, 
         message: `No questions found for "${title}".`,
         available_exams: availableExams,
         debug: { totalRowsInDB: all.length, requestedTitle: title }
       }, { headers: NO_CACHE });
    }

    // ── Branch Filtering ──────────────────────────────────────────
    let filtered = examRows.filter((q: any) => {
      const qb = (q.branch || "").trim().toUpperCase();
      const stBranch = studentBranch.toUpperCase();
      
      if (!qb || qb === "GLOBAL" || qb === "ALL") return true;
      
      const branches = qb.split(",").map((b: string) => b.trim().toUpperCase());
      return branches.some((b: string) => b === stBranch || b.includes(stBranch) || stBranch.includes(b));
    });

    // Final Fallback: if branch filter kills everything, return all exam rows
    if (filtered.length === 0 && examRows.length > 0) {
      filtered = examRows;
    }

    // ── Shape output ─────────────────────────────────────────
    const questions = filtered.map((q: any) => ({
      id: q.id,
      text: q.text || "",
      options: q.options || [],
      branch: q.branch || studentBranch,
      order_index: q.order_index ?? 0,
      marks: q.marks || 1,
      image_url: q.image_url || null,
      question_type: q.question_type || "mcq",
      category: q.category || "Others",
    }));

    console.log(`[QUESTIONS] Returning ${questions.length} questions`);
    return NextResponse.json({ questions, total: questions.length }, { headers: NO_CACHE });

  } catch (err: any) {
    console.error("[QUESTIONS] Unhandled error:", err?.message || err);
    return NextResponse.json(
      { detail: "Internal server error", error: err?.message },
      { status: 500, headers: NO_CACHE }
    );
  }
}
