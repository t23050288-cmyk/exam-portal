import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

/**
 * GET /api/exam/questions?title=...
 * Fetches all questions for a specific exam, filtered by student branch.
 * The exam must have been started via /api/exam/start-exam first.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      console.error("[QUESTIONS] Auth failed — no valid token");
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const title = req.nextUrl.searchParams.get("title") || "";
    if (!title) {
      console.log("[QUESTIONS] No title provided");
      return NextResponse.json({ questions: [], total: 0 });
    }

    console.log(`[QUESTIONS] Fetching for title='${title}', student='${student.studentId}', branch='${student.branch}'`);

    // Fetch ALL questions from the database
    const { data: allQuestions, error } = await supabaseAdmin
      .from("questions")
      .select("id, text, options, branch, order_index, marks, exam_name, image_url, audio_url, question_type, category, correct_answer, starter_code, test_cases")
      .order("order_index")
      .limit(500);

    if (error) {
      console.error("[QUESTIONS] DB error:", error);
      return NextResponse.json({ questions: [], total: 0 });
    }

    const rows = allQuestions || [];
    console.log(`[QUESTIONS] Total rows in DB: ${rows.length}`);

    // Log all unique exam_names for debugging
    const uniqueExams = [...new Set(rows.map((q: any) => q.exam_name).filter(Boolean))];
    console.log(`[QUESTIONS] Unique exam_names in DB: ${JSON.stringify(uniqueExams)}`);

    const titleLower = title.trim().toLowerCase();

    // Filter by exam_name match (case-insensitive)
    const examFiltered = rows.filter((q: any) => {
      const qExam = (q.exam_name || "").trim().toLowerCase();
      return qExam === titleLower;
    });

    console.log(`[QUESTIONS] Matched by exam_name: ${examFiltered.length}`);

    // Filter by branch
    const studentBranch = student.branch.trim().toUpperCase();
    let filtered = examFiltered.filter((q: any) => {
      const qBranch = (q.branch || "").trim().toUpperCase();
      if (!qBranch) return true; // No branch = applies to all
      return (
        studentBranch === qBranch ||
        qBranch.includes(studentBranch) ||
        studentBranch.includes(qBranch)
      );
    });

    console.log(`[QUESTIONS] After branch filter (${studentBranch}): ${filtered.length}`);

    // Fallback: if no branch match, return ALL questions for this exam
    if (filtered.length === 0 && examFiltered.length > 0) {
      console.log(`[QUESTIONS] Branch fallback — returning all ${examFiltered.length} questions`);
      filtered = examFiltered;
    }

    // Map to output format (strip correct_answer so students can't see it)
    const questions = filtered.map((q: any) => ({
      id: q.id,
      text: q.text || "",
      options: q.options || [],
      branch: q.branch || student.branch,
      order_index: q.order_index,
      marks: q.marks || 1,
      image_url: q.image_url || null,
      audio_url: q.audio_url || null,
      question_type: q.question_type || "mcq",
      starter_code: q.starter_code || null,
      test_cases: q.test_cases || null,
    }));

    console.log(`[QUESTIONS] Returning ${questions.length} questions for '${title}'`);

    return NextResponse.json({ questions, total: questions.length });
  } catch (err: any) {
    console.error("[QUESTIONS] Error:", err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
