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
  // Always prefer service key so RLS is bypassed
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    console.error("[QUESTIONS] Missing Supabase URL or key env vars!");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { "Accept": "application/json" } },
  });
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

    let studentBranch = "CS";

    if (!token) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401, headers: NO_CACHE });
    }

    const sub = verifyToken(token);
    if (!sub) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401, headers: NO_CACHE });
    }

    try {
      const sb = getSupabase();
      let { data: s } = await sb.from("students").select("branch").eq("id", sub).maybeSingle();
      if (!s) {
        const { data: s2 } = await sb.from("students").select("branch").eq("usn", sub.toUpperCase()).maybeSingle();
        s = s2;
      }
      if (s?.branch) studentBranch = s.branch.trim().toUpperCase();
      console.log(`[QUESTIONS] Student branch resolved: "${studentBranch}" (sub="${sub.substring(0,8)}...")`);
    } catch (e) {
      console.warn("[QUESTIONS] Student lookup failed, using default branch CS:", e);
    }

    const title = (req.nextUrl.searchParams.get("title") || "").trim();
    if (!title) {
      return NextResponse.json({ questions: [], total: 0 }, { headers: NO_CACHE });
    }

    console.log(`[QUESTIONS] Fetching for title="${title}" branch="${studentBranch}"`);

    const sb = getSupabase();

    // ── Fetch all questions (service key bypasses RLS) ──
    const { data: allRows, error } = await sb
      .from("questions")
      .select("id, text, options, branch, exam_name, marks, image_url, question_type, order_index, category")
      .order("order_index", { ascending: true });

    if (error) {
      console.error("[QUESTIONS] DB error:", JSON.stringify(error));
      // Try without ordering in case column doesn't exist
      const { data: fallbackRows, error: err2 } = await sb
        .from("questions")
        .select("id, text, options, branch, exam_name, marks, image_url, question_type, order_index, category");
      
      if (err2) {
        console.error("[QUESTIONS] Fallback DB error too:", JSON.stringify(err2));
        return NextResponse.json({ questions: [], total: 0, error: err2.message }, { headers: NO_CACHE });
      }
      // Use fallback rows
      return processAndReturn(fallbackRows || [], title, studentBranch, NO_CACHE);
    }

    return processAndReturn(allRows || [], title, studentBranch, NO_CACHE);

  } catch (err: any) {
    console.error("[QUESTIONS] Unhandled error:", err?.message || err);
    return NextResponse.json(
      { detail: "Internal server error", error: err?.message },
      { status: 500, headers: NO_CACHE }
    );
  }
}

function processAndReturn(
  all: any[],
  title: string,
  studentBranch: string,
  NO_CACHE: Record<string, string>
) {
  const t = title.trim().toLowerCase();

  console.log(`[QUESTIONS] Total rows in DB: ${all.length}`);
  
  if (all.length === 0) {
    return NextResponse.json({ 
      questions: [], total: 0, 
      message: "Database table 'questions' is empty.",
    }, { headers: NO_CACHE });
  }

  // Log distinct exam_names for debugging
  const distinctNames = [...new Set(all.map((q: any) => q.exam_name || "(null)"))];
  console.log(`[QUESTIONS] Distinct exam_names in DB:`, distinctNames);

  // ── Title Filter (flexible matching) ──
  let examRows = all.filter((q: any) => {
    const qExam = (q.exam_name || "").trim().toLowerCase();
    return (
      qExam === t ||
      qExam.includes(t) ||
      t.includes(qExam) ||
      qExam.replace(/\s+/g, "") === t.replace(/\s+/g, "")
    );
  });

  console.log(`[QUESTIONS] After title filter ("${t}"): ${examRows.length} rows`);

  if (examRows.length === 0) {
    return NextResponse.json({
      questions: [], total: 0,
      message: `No questions found for exam "${title}".`,
      available_exams: distinctNames,
      debug: { totalRowsInDB: all.length, requestedTitle: title, distinctExamNames: distinctNames },
    }, { headers: NO_CACHE });
  }

  // ── Branch Filter ──
  const stBranch = studentBranch.toUpperCase();
  let filtered = examRows.filter((q: any) => {
    const qb = (q.branch || "").trim().toUpperCase();
    if (!qb || qb === "GLOBAL" || qb === "ALL" || qb === "") return true;
    const branches = qb.split(/[,;]/).map((b: string) => b.trim().toUpperCase());
    return branches.some(
      (b: string) => b === stBranch || b.includes(stBranch) || stBranch.includes(b)
    );
  });

  console.log(`[QUESTIONS] After branch filter ("${stBranch}"): ${filtered.length} rows`);

  // Fallback: if branch filter kills everything, return all exam rows
  if (filtered.length === 0 && examRows.length > 0) {
    console.warn(`[QUESTIONS] Branch filter returned 0 — falling back to all ${examRows.length} exam rows`);
    filtered = examRows;
  }

  const questions = filtered.map((q: any) => ({
    id: q.id,
    text: q.text || "",
    options: Array.isArray(q.options) ? q.options : (typeof q.options === "string" ? JSON.parse(q.options) : []),
    branch: q.branch || studentBranch,
    order_index: q.order_index ?? 0,
    marks: q.marks || 1,
    image_url: q.image_url || null,
    question_type: q.question_type || "mcq",
    category: q.category || "Others",
  }));

  console.log(`[QUESTIONS] Returning ${questions.length} questions`);
  return NextResponse.json({ questions, total: questions.length }, { headers: NO_CACHE });
}
