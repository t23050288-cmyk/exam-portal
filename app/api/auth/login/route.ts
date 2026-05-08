import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

/**
 * /api/auth/login — Direct Supabase login handler.
 * Simply checks credentials. If they match, logs in. No "already logged in" blocking.
 * For signup (extra fields provided), creates/updates the student record.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "examguard-super-secret-jwt-2024";

const supabase = createClient(supabaseUrl, supabaseKey);

function makeToken(studentId: string): string {
  // Simple JWT-like token: base64(header).base64(payload).signature
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: studentId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24h
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { usn, password, name, email, branch } = body;

    if (!usn || !password) {
      return NextResponse.json({ detail: "USN and password are required." }, { status: 400 });
    }

    const usnTrimmed = usn.trim().toUpperCase();

    // Check if student exists
    const { data: student, error: fetchErr } = await supabase
      .from("students")
      .select("*")
      .eq("usn", usnTrimmed)
      .maybeSingle();

    if (fetchErr) {
      console.error("[AUTH] Supabase error:", fetchErr);
      return NextResponse.json({ detail: "Database error." }, { status: 500 });
    }

    // ── SIGNUP MODE (name/email provided + student doesn't exist) ──
    if (!student && name) {
      // Create new student
      const { data: newStudent, error: createErr } = await supabase
        .from("students")
        .insert({
          usn: usnTrimmed,
          name: name.trim(),
          email: email?.trim() || null,
          branch: branch || "CS",
          password: password,
          status: "not_started",
          warnings: 0,
        })
        .select()
        .single();

      if (createErr) {
        console.error("[AUTH] Create error:", createErr);
        return NextResponse.json({ detail: createErr.message || "Failed to create account." }, { status: 400 });
      }

      const token = makeToken(newStudent.student_id || newStudent.id || usnTrimmed);

      // Reset any stale exam_status for this student
      await supabase.from("exam_status").upsert({
        student_id: newStudent.student_id || newStudent.id || usnTrimmed,
        status: "not_started",
        warnings: 0,
      }, { onConflict: "student_id" }).select();

      return NextResponse.json({
        access_token: token,
        student_id: newStudent.student_id || newStudent.id || usnTrimmed,
        student_name: newStudent.name,
        email: newStudent.email,
        branch: newStudent.branch,
        exam_start_time: null,
        exam_title: "",
        total_questions: 0,
      });
    }

    // ── LOGIN MODE ──
    if (!student) {
      return NextResponse.json({ detail: "Student not found. Please sign up first." }, { status: 404 });
    }

    // Check password
    if (student.password !== password) {
      return NextResponse.json({ detail: "Invalid password." }, { status: 401 });
    }

    // Reset session status so they can log in (no "already logged in" blocking)
    await supabase.from("exam_status")
      .upsert({
        student_id: student.student_id || student.id,
        status: student.status === "submitted" ? "submitted" : "not_started",
      }, { onConflict: "student_id" })
      .select();

    const token = makeToken(student.student_id || student.id || usnTrimmed);

    // Get active exam config
    const { data: configs } = await supabase
      .from("exam_config")
      .select("*")
      .eq("is_active", true)
      .limit(1);

    const activeConfig = configs?.[0];

    return NextResponse.json({
      access_token: token,
      student_id: student.student_id || student.id || usnTrimmed,
      student_name: student.name,
      email: student.email,
      branch: student.branch,
      exam_start_time: activeConfig?.scheduled_start || null,
      exam_duration_minutes: activeConfig?.duration_minutes || 60,
      exam_title: activeConfig?.exam_title || "",
      total_questions: activeConfig?.total_questions || 0,
    });

  } catch (err: any) {
    console.error("[AUTH] Unexpected error:", err);
    return NextResponse.json({ detail: err.message || "Server error." }, { status: 500 });
  }
}
