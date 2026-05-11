import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_DEBOUNCE_MS = 3000; // ignore violations within 3s of the last one
const MAX_WARNINGS = 3;

/**
 * POST /api/exam/report-violation
 * Records an anti-cheat violation. Server-side debounced.
 * Returns { warning_count, auto_submitted }
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

    // ── Get current exam_status for this student ──────────────────────
    const { data: statusRow } = await supabaseAdmin
      .from("exam_status")
      .select("warnings, status, last_violation_at, auto_submitted")
      .eq("student_id", student.id)
      .maybeSingle();

    const currentWarnings = statusRow?.warnings || 0;
    const isAlreadySubmitted =
      statusRow?.status === "submitted" ||
      statusRow?.auto_submitted === true;

    // If already submitted, just return current state
    if (isAlreadySubmitted) {
      return NextResponse.json({
        ok: true,
        warning_count: currentWarnings,
        auto_submitted: true,
      });
    }

    // ── Server-side debounce ──────────────────────────────────────────
    if (statusRow?.last_violation_at) {
      const lastViolationAt = new Date(statusRow.last_violation_at).getTime();
      const msSinceLast = Date.now() - lastViolationAt;
      if (msSinceLast < SERVER_DEBOUNCE_MS) {
        // Too soon — return current state without incrementing
        return NextResponse.json({
          ok: true,
          warning_count: currentWarnings,
          auto_submitted: false,
          debounced: true,
        });
      }
    }

    // ── Increment warning count ───────────────────────────────────────
    const newWarningCount = currentWarnings + 1;
    const isAutoSubmit = newWarningCount >= MAX_WARNINGS;

    // Insert violation record
    await supabaseAdmin.from("violations").insert({
      student_id: student.id,
      type: type || "unknown",
      metadata: {
        ...metadata,
        warning_count: newWarningCount,
        is_auto_submit: isAutoSubmit,
      },
      timestamp: new Date().toISOString(),
    });

    // Upsert exam_status with new warning count + debounce timestamp
    await supabaseAdmin.from("exam_status").upsert(
      {
        student_id: student.id,
        warnings: newWarningCount,
        status: isAutoSubmit ? "submitted" : "active",
        auto_submitted: isAutoSubmit,
        last_violation_at: new Date().toISOString(),
        ...(isAutoSubmit ? { submitted_at: new Date().toISOString() } : {}),
      },
      { onConflict: "student_id" }
    );

    console.log(
      `[VIOLATION] type=${type} | student=${student.studentId} | warnings=${newWarningCount}/${MAX_WARNINGS} | auto_submit=${isAutoSubmit}`
    );

    return NextResponse.json({
      ok: true,
      warning_count: newWarningCount,
      auto_submitted: isAutoSubmit,
    });
  } catch (err: any) {
    console.error("[VIOLATION] Error:", err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
