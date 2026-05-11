import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_DEBOUNCE_MS = 3000; // ignore violations within 3s of last one
const MAX_WARNINGS = 3;

/**
 * POST /api/exam/report-violation
 * Records an anti-cheat violation. Server-side debounced.
 * Uses 'last_active' as debounce timestamp (works without migration).
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
      .select("*")
      .eq("student_id", student.id)
      .maybeSingle();

    const currentWarnings = statusRow?.warnings || 0;
    const isAlreadySubmitted = statusRow?.status === "submitted";

    // If already submitted, return current state
    if (isAlreadySubmitted) {
      return NextResponse.json({
        ok: true,
        warning_count: currentWarnings,
        auto_submitted: true,
      });
    }

    // ── Server-side debounce using last_active timestamp ──────────────
    // Use last_active as the debounce field (available without migration)
    const debounceField = statusRow?.last_violation_at ?? statusRow?.last_active;
    if (debounceField) {
      const msSinceLast = Date.now() - new Date(debounceField).getTime();
      if (msSinceLast < SERVER_DEBOUNCE_MS) {
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
    const now = new Date().toISOString();

    // Insert violation record
    await supabaseAdmin.from("violations").insert({
      student_id: student.id,
      type: type || "unknown",
      metadata: {
        ...metadata,
        warning_count: newWarningCount,
        is_auto_submit: isAutoSubmit,
      },
      timestamp: now,
    });

    // Build the update object — include new columns only if they exist
    const updateData: Record<string, any> = {
      student_id: student.id,
      warnings: newWarningCount,
      status: isAutoSubmit ? "submitted" : "active",
      last_active: now,
      ...(isAutoSubmit ? { submitted_at: now } : {}),
    };

    // Try to set new columns if they exist (won't error if missing in upsert)
    try {
      await supabaseAdmin.from("exam_status").upsert(
        { ...updateData, last_violation_at: now, auto_submitted: isAutoSubmit },
        { onConflict: "student_id" }
      );
    } catch {
      // Fallback without new columns if migration hasn't been run yet
      await supabaseAdmin.from("exam_status").upsert(
        updateData,
        { onConflict: "student_id" }
      );
    }

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
