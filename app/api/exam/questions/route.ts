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

    // ── Title param ───────────────────────────────────────────
    const title = (req.nextUrl.searchParams.get("title") || "").trim();
    if (!title) {
      return NextResponse.json({ questions: [], total: 0 }, { headers: NO_CACHE });
    }
    const titleLower = title.toLowerCase();
    console.log(`[QUESTIONS] title="${title}" branch="${studentBranch}"`);

    // ── Fetch ALL questions from DB ───────────────────────────
    const sb = getSupabase();
    const { data: rows, error } = await sb
      .from("questions")
      .select("id, text, options, branch, order_index, marks, exam_name, image_url, question_type, category")
      .order("order_index")
      .limit(1000);

    if (error) {
      console.error("[QUESTIONS] DB error:", error.message);
      return NextResponse.json({ questions: [], total: 0 }, { headers: NO_CACHE });
    }

    const all = rows || [];
    console.log(`[QUESTIONS] DB returned ${all.length} total rows`);

    // ── Filter by exam name ──────────────────────────────────
    const examRows = all.filter((q: any) => {
      const qExam = (q.exam_name || "").trim().toLowerCase();
      return qExam === titleLower || qExam.replace(/\s+/g,"") === titleLower.replace(/\s+/g,"");
    });

    console.log(`[QUESTIONS] Exam filter: ${examRows.length} rows match "${title}"`);

    // ── Filter by branch with Fallback ────────────────────────
    let filtered = examRows.filter((q: any) => {
      const qb = (q.branch || "").trim().toUpperCase();
      if (!qb || qb === "GLOBAL" || qb === "ALL") return true;
      
      // Support comma-separated branches
      const branches = qb.split(",").map(b => b.trim());
      return branches.includes(studentBranch);
    });

    // Fallback: if branch filter kills everything, return all exam rows
    if (filtered.length === 0 && examRows.length > 0) {
      console.log(`[QUESTIONS] No specific branch match for ${studentBranch}. Returning all ${examRows.length} questions for this exam.`);
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
