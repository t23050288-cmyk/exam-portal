import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

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

    const titleLower = title.trim().toLowerCase();
    console.log(`[QUESTIONS] Fetching for title='${title}', branch='${student.branch}'`);

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
    console.log(`[QUESTIONS] Total rows: ${rows.length}`);

    // Debug: log unique exam_names
    const uniqueExams = [...new Set(rows.map((q: any) => q.exam_name))];
    console.log(`[QUESTIONS] Unique exam_names: ${JSON.stringify(uniqueExams)}`);

    // Filter by exam — checks BOTH exam_name column AND spectral tag in text
    // (Many questions have exam_name="Initial Assessment" but text starts with ⟦EXAM:nb⟧)
    const examFiltered = rows.filter((q: any) => {
      let qExam = (q.exam_name || "").trim().toLowerCase();

      // ALWAYS check spectral tag in text — it overrides exam_name column
      const text: string = q.text || "";
      if (text.startsWith("⟦EXAM:")) {
        const end = text.indexOf("⟧");
        if (end !== -1) {
          qExam = text.slice(6, end).trim().toLowerCase();
        }
      }

      return (
        qExam === titleLower ||
        qExam.replace(/\s+/g, "") === titleLower.replace(/\s+/g, "") ||
        qExam.includes(titleLower) ||
        titleLower.includes(qExam)
      );
    });

    console.log(`[QUESTIONS] Matched ${examFiltered.length} questions for '${title}'`);

    // Filter by branch
    const studentBranch = student.branch.trim().toUpperCase();
    let filtered = examFiltered.filter((q: any) => {
      const qBranch = (q.branch || "").trim().toUpperCase();
      if (!qBranch) return true;
      return studentBranch === qBranch || qBranch.includes(studentBranch) || studentBranch.includes(qBranch);
    });

    // Fallback: no branch match → return all exam questions
    if (filtered.length === 0 && examFiltered.length > 0) {
      console.log(`[QUESTIONS] Branch fallback — returning all ${examFiltered.length}`);
      filtered = examFiltered;
    }

    const questions = filtered.map((q: any) => {
      // Strip spectral tag from displayed text
      let text: string = q.text || "";
      if (text.startsWith("⟦EXAM:")) {
        const end = text.indexOf("⟧");
        if (end !== -1) text = text.slice(end + 1).trim();
      }
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
        starter_code: q.starter_code || null,
        test_cases: q.test_cases || null,
      };
    });

    console.log(`[QUESTIONS] Returning ${questions.length} questions`);
    return NextResponse.json({ questions, total: questions.length });

  } catch (err: any) {
    console.error("[QUESTIONS] Error:", err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
