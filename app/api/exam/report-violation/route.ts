import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WARNINGS = 4;

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { type = "unknown", metadata = {} } = body;

    // Get current warning count
    const { data: statusRow } = await supabaseAdmin
      .from("exam_status")
      .select("warnings, status, exam_title")
      .eq("student_id", student.id)
      .maybeSingle();

    if (statusRow?.status === "submitted") {
      return NextResponse.json({
        warning_count: statusRow.warnings || 0,
        auto_submitted: false,
        message: "Exam already submitted.",
      });
    }

    const currentWarnings = statusRow?.warnings || 0;
    const newWarnings = currentWarnings + 1;
    const autoSubmit = newWarnings >= MAX_WARNINGS;

    // Insert violation log
    await supabaseAdmin.from("violations").insert({
      student_id: student.id,
      type: type,
      timestamp: new Date().toISOString(),
      metadata: { ...metadata, usn: student.studentId },
    }).then(() => {}).catch(() => {});

    // Update exam_status
    await supabaseAdmin.from("exam_status").upsert({
      student_id: student.id,
      warnings: newWarnings,
      status: autoSubmit ? "submitted" : (statusRow?.status || "active"),
      last_violation_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
      ...(statusRow?.exam_title ? { exam_title: statusRow.exam_title } : {}),
    }, { onConflict: "student_id" });

    console.log(`[VIOLATION] ${type} | ${student.studentId} | ${newWarnings}/${MAX_WARNINGS} | auto=${autoSubmit}`);

    let message: string;
    if (autoSubmit) {
      message = `🔴 4th violation: Your exam has been auto-submitted.`;
    } else if (newWarnings === 3) {
      message = `🚨 Warning 3 of 4: ONE more violation = auto-submit!`;
    } else if (newWarnings === 2) {
      message = `⚠️ Warning 2 of 4: Stay in fullscreen.`;
    } else {
      message = `⚠️ Warning 1 of 4: Stay in fullscreen.`;
    }

    return NextResponse.json({
      ok: true,
      warning_count: newWarnings,
      auto_submitted: autoSubmit,
      message,
    });
  } catch (err: any) {
    console.error("[VIOLATION] Error:", err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
