import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

/**
 * POST /api/exam/report-violation
 * Records an anti-cheat violation in the violations table.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, metadata } = body;
    const warningCount = metadata?.warning_count || 1;
    const isAutoSubmit = metadata?.is_auto_submit || false;

    // Insert violation record
    const { error: insertErr } = await supabaseAdmin
      .from("violations")
      .insert({
        student_id: student.studentId,
        violation_type: type,
        warning_count: warningCount,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error("[VIOLATION] Insert error:", insertErr);
    }

    // Update student warnings count
    await supabaseAdmin
      .from("exam_status")
      .upsert({
        student_id: student.studentId,
        warnings: warningCount,
        status: isAutoSubmit ? "submitted" : "active",
      }, { onConflict: "student_id" });

    console.log(`[VIOLATION] ${type} | Student: ${student.studentId} | Warning: ${warningCount}/3 | Auto-submit: ${isAutoSubmit}`);

    return NextResponse.json({
      ok: true,
      warning_count: warningCount,
      auto_submitted: isAutoSubmit,
    });
  } catch (err: any) {
    console.error("[VIOLATION] Error:", err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
