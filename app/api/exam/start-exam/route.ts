import { NextRequest, NextResponse } from "next/server";
import { getStudentFromRequest, supabaseAdmin } from "@/lib/auth";

/**
 * POST /api/exam/start-exam?title=...
 * Validates that the exam is active and starts the session for the student.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const student = await getStudentFromRequest(auth);
    if (!student) {
      return NextResponse.json({ detail: "Invalid or expired token" }, { status: 401 });
    }

    const title = req.nextUrl.searchParams.get("title") || "";
    if (!title) {
      return NextResponse.json({ detail: "Missing exam title" }, { status: 400 });
    }

    // Check if exam config exists and is active
    const { data: configs } = await supabaseAdmin
      .from("exam_config")
      .select("*")
      .eq("is_active", true);

    const allConfigs = configs || [];
    
    // Find matching config (case-insensitive)
    const matchingConfig = allConfigs.find(
      (c: any) => c.exam_title?.trim().toLowerCase() === title.trim().toLowerCase()
    );

    if (!matchingConfig) {
      // Check if ANY config is active — if so, the student may be using the wrong title
      console.log(`[START-EXAM] No active config matching '${title}'. Active configs:`, 
        allConfigs.map((c: any) => c.exam_title));
      return NextResponse.json({ detail: "exam inactive" }, { status: 423 });
    }

    // Check if student already submitted
    const { data: statusData } = await supabaseAdmin
      .from("exam_status")
      .select("status")
      .eq("student_id", student.studentId)
      .maybeSingle();

    if (statusData?.status === "submitted") {
      return NextResponse.json({ 
        status: "submitted",
        detail: "You have already submitted this exam." 
      });
    }

    // Update exam_status to active
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("exam_status")
      .upsert({
        student_id: student.studentId,
        status: "active",
        exam_title: title,
        started_at: now,
      }, { onConflict: "student_id" });

    // Store session
    const sessionId = `${student.studentId}_${Date.now()}`;
    
    console.log(`[START-EXAM] Student ${student.studentId} started '${title}'`);

    return NextResponse.json({
      ok: true,
      status: "active",
      session_id: sessionId,
      started_at: now,
      exam_title: matchingConfig.exam_title,
      duration_minutes: matchingConfig.duration_minutes || 20,
    });
  } catch (err: any) {
    console.error("[START-EXAM] Error:", err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
