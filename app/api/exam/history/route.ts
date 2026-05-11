import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/exam/history
 * Returns exam_results for the authenticated student.
 * Uses service key to bypass RLS.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("exam_results")
      .select("score, total_marks, submitted_at, exam_title, category")
      .eq("student_id", student.id)
      .order("submitted_at", { ascending: false });

    if (error) {
      console.error("[EXAM-HISTORY] DB error:", error.message);
      return NextResponse.json({ results: [] });
    }

    return NextResponse.json({ results: data || [] });
  } catch (err: any) {
    return NextResponse.json({ results: [], error: err.message });
  }
}
