import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
};

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    // Support ?title=nb  (ignore ?_t= cache-buster param)
    const title = req.nextUrl.searchParams.get("title") || "";
    if (!title) {
      return NextResponse.json({ questions: [], total: 0 }, { headers: NO_CACHE });
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
      return NextResponse.json({ questions: [], total: 0 }, { headers: NO_CACHE });
    }

    const rows = allQuestions || [];
    console.log(`[QUESTIONS] Total rows: ${rows.length}`);

    // Debug: log unique exam_names in DB
    const uniqueExams = [...new Set(rows.map((q: any) => q.exam_name))];
    console.log(`[QUESTIONS] Unique exam_names in DB: ${JSON.stringify(uniqueExams)}`);

    // Filter by exam — checks BOTH exam_name column AND spectral tag in text
    const examFiltered = rows.filter((q: any) => {
      let qExam = (q.exam_name || "").trim().toLowerCase();

      // Spectral tag in text ALWAYS overrides exam_name column
      const text: string = q.text || "";
      if (text.startsWith("⟦EXAM:")) {
        const end = text.indexOf("⟧");
        if (end !== -1) {
          qExam = text.slice(6, end).trim().toLowerCase();
        }
      }

      return (
        qExam === titleLower ||
        qExam.replace(/\s+/g, "") === titleLower.replace(/\s+/g, "")
        // Note: removed .includes() checks — they caused false positives
        // e.g. "nb" is a substring of "initial assessment"... wait no it isn't
        // But "nb" includes "nb" ✓ and being safe: exact match + no-whitespace match only
      );
    });

    console.log(`[QUESTIONS] Matched ${examFiltered.length} questions for '${title}'`);

    // Filter by branch
    const studentBranch = (student.branch || "CS").trim().toUpperCase();
    let filtered = examFiltered.filter((q: any) => {
      const qBranch = (q.branch || "").trim().toUpperCase();
      if (!qBranch) return true;
      return studentBranch === qBranch || qBranch.includes(studentBranch) || studentBranch.includes(qBranch);
    });

    // Branch fallback: if no branch match, return all exam questions
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
    return NextResponse.json({ questions, total: questions.length }, { headers: NO_CACHE });

  } catch (err: any) {
    console.error("[QUESTIONS] Error:", err);
    return NextResponse.json({ detail: err.message }, { status: 500, headers: NO_CACHE });
  }
}
