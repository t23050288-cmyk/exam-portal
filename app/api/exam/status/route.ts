import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/exam/status
 * Returns exam_status rows for the authenticated student.
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
      .from("exam_status")
      .select("status, exam_title, started_at, submitted_at, warnings")
      .eq("student_id", student.id);

    if (error) {
      console.error("[EXAM-STATUS] DB error:", error.message);
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ data: [], error: err.message });
  }
}
