import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

/**
 * POST /api/exam/submit-exam
 * Submits the exam, calculates score, and records the result.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const answers: Record<string, string> = body.answers || {};
    const examTitle = answers.__exam_title || "";
    delete answers.__exam_title;

    if (!examTitle) {
      return NextResponse.json({ detail: "Missing exam title." }, { status: 400 });
    }

    // Fetch questions for this exam to calculate score
    const { data: allQuestions } = await supabaseAdmin
      .from("questions")
      .select("id, text, options, correct_answer, marks, exam_name, branch")
      .limit(500);

    const rows = allQuestions || [];
    const studentBranch = student.branch.trim().toUpperCase();

    // Filter by exam_name
    const examQuestions = rows.filter((q: any) => {
      let qExam = q.exam_name;
      const text = q.text || "";
      if (!qExam && text.startsWith("⟦EXAM:")) {
        const endIdx = text.indexOf("⟧");
        if (endIdx !== -1) qExam = text.substring(6, endIdx);
      }
      return qExam && qExam.trim().toLowerCase() === examTitle.trim().toLowerCase();
    });

    // Filter by branch
    let filtered = examQuestions.filter((q: any) => {
      const qBranch = (q.branch || "").trim().toUpperCase();
      if (!qBranch) return true;
      return qBranch.includes(studentBranch) || studentBranch.includes(qBranch) || studentBranch === qBranch;
    });

    if (filtered.length === 0 && examQuestions.length > 0) {
      filtered = examQuestions;
    }

    // Calculate score
    let score = 0;
    let totalMarks = 0;
    const results: { question_id: string; selected: string; correct: string; is_correct: boolean; marks: number }[] = [];

    for (const q of filtered) {
      const marks = q.marks || 1;
      totalMarks += marks;
      const selected = answers[q.id] || "";
      const correct = q.correct_answer || "";
      const isCorrect = selected.toUpperCase() === correct.toUpperCase();
      if (isCorrect) score += marks;
      results.push({
        question_id: q.id,
        selected,
        correct,
        is_correct: isCorrect,
        marks,
      });
    }

    // Save to exam_results
    const { error: resultErr } = await supabaseAdmin
      .from("exam_results")
      .upsert({
        student_id: student.id,
        exam_title: examTitle,
        category: body.category || "Others",
        score,
        total_marks: totalMarks,
        answers: answers,
        submitted_at: new Date().toISOString(),
      }, { onConflict: "student_id,exam_title" });

    if (resultErr) {
      console.error("[SUBMIT] Result insert error:", resultErr);
    }

    // Update exam_status
    await supabaseAdmin
      .from("exam_status")
      .upsert({
        student_id: student.id, // Use actual UUID
        status: "submitted",
        submitted_at: new Date().toISOString(),
      }, { onConflict: "student_id" });

    console.log(`[SUBMIT] Student ${student.id} submitted '${examTitle}': ${score}/${totalMarks}`);

    const correctCount = results.filter(r => r.is_correct).length;
    const wrongCount = filtered.length - correctCount;

    return NextResponse.json({
      ok: true,
      score,
      total_marks: totalMarks,
      correct_count: correctCount,
      wrong_count: wrongCount,
      total_questions: filtered.length,
      answered: Object.keys(answers).length,
      results,
    });
  } catch (err: any) {
    console.error("[SUBMIT] Error:", err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
