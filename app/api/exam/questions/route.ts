import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

/**
 * GET /api/exam/questions?title=...
 * Fetches all questions for a specific exam, filtered by student branch.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const title = req.nextUrl.searchParams.get("title") || "";
    if (!title) {
      return NextResponse.json({ questions: [], total: 0 });
    }

    // Check if exam is active
    const { data: configData } = await supabaseAdmin
      .from("exam_config")
      .select("is_active, exam_title")
      .eq("exam_title", title)
      .maybeSingle();

    if (!configData?.is_active) {
      return NextResponse.json({ detail: "Exam is not active." }, { status: 403 });
    }

    // Fetch ALL questions (we filter in JS to avoid PostgREST encoding issues)
    const { data: allQuestions, error } = await supabaseAdmin
      .from("questions")
      .select("id, text, options, branch, order_index, marks, exam_name, image_url, audio_url, question_type, category")
      .order("order_index")
      .limit(500);

    if (error) {
      console.error("[QUESTIONS] DB error:", error);
      return NextResponse.json({ questions: [], total: 0 });
    }

    const rows = allQuestions || [];
    const studentBranch = student.branch.trim().toUpperCase();

    // Filter by exam_name match
    const examFiltered = rows.filter((q: any) => {
      let qExam = q.exam_name;
      const text = q.text || "";
      // Handle legacy virtual folders
      if (!qExam && text.startsWith("⟦EXAM:")) {
        const endIdx = text.indexOf("⟧");
        if (endIdx !== -1) qExam = text.substring(6, endIdx);
      }
      return qExam && qExam.trim().toLowerCase() === title.trim().toLowerCase();
    });

    // Filter by branch
    let filtered = examFiltered.filter((q: any) => {
      const qBranch = (q.branch || "").trim().toUpperCase();
      if (!qBranch) return true; // No branch = applies to all
      return (
        studentBranch === qBranch ||
        qBranch.includes(studentBranch) ||
        studentBranch.includes(qBranch)
      );
    });

    // Fallback: if no branch match, return ALL questions for this exam
    if (filtered.length === 0 && examFiltered.length > 0) {
      console.log(`[QUESTIONS] No branch match for '${student.branch}', falling back to all questions for '${title}'`);
      filtered = examFiltered;
    }

    // Map to output format
    const questions = filtered.map((q: any) => {
      const text = q.text?.replace(`⟦EXAM:${title}⟧`, "").trim() || "";
      return {
        id: q.id,
        text,
        options: q.options || [],
        branch: q.branch || student.branch,
        order_index: q.order_index,
        marks: q.marks || 1,
        image_url: q.image_url || null,
        audio_url: q.audio_url || null,
        question_type: q.question_type || "mcq",
        starter_code: null,
        test_cases: null,
      };
    });

    console.log(`[QUESTIONS] Returning ${questions.length} questions for '${title}' (branch: ${student.branch})`);

    return NextResponse.json({ questions, total: questions.length });
  } catch (err: any) {
    console.error("[QUESTIONS] Error:", err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
