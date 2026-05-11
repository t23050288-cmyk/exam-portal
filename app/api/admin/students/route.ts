import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam";

function checkAdmin(req: NextRequest): boolean {
  const secret = req.headers.get("x-admin-secret") || "";
  return secret === ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch from exam_status and join with students to get name, branch, etc.
  // We use .select("*, students(*)") to perform the join in Supabase
  const { data, error } = await supabase
    .from("exam_status")
    .select("*, students(*)");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Normalize and flatten the joined data
  const students = (data || []).map((s: any) => {
    const info = s.students || {};
    return {
      student_id: s.student_id,
      usn: info.usn || s.usn || "UNKNOWN",
      name: info.name || s.name || "UNKNOWN",
      email: info.email || s.email || null,
      branch: info.branch || s.branch || "CS",
      status: s.status || "not_started",
      warnings: s.warnings || 0,
      last_active: s.last_active || null,
      submitted_at: s.submitted_at || null,
      started_at: s.started_at || null,
    };
  });

  // Sort by name in JavaScript since sorting by joined column is tricky in some Supabase setups
  students.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(students);
}

// POST — create a student
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const usn = (body.usn || "").trim().toUpperCase();

    // 1. Insert into students table first
    const { data: student, error: sError } = await supabase
      .from("students")
      .insert({
        usn: usn,
        name: body.name || "Unknown",
        email: body.email || null,
        branch: body.branch || "CS",
        password: body.password || usn,
      })
      .select()
      .single();

    if (sError) return NextResponse.json({ error: sError.message }, { status: 500 });

    // 2. Initialize exam_status record
    const { error: eError } = await supabase
      .from("exam_status")
      .insert({
        student_id: student.id,
        status: "not_started",
        warnings: 0,
      });

    if (eError) {
      console.error("Failed to init exam_status:", eError.message);
      // We don't fail the whole request since the student is already created
    }

    return NextResponse.json(student);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
