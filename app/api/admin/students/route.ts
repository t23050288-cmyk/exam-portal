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

// GET all students
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("exam_status")
    .select("*")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Normalize the field names
  const students = (data || []).map((s: any) => ({
    student_id: s.student_id || s.id,
    usn: s.usn || s.roll_number || "",
    name: s.name || "",
    email: s.email || null,
    branch: s.branch || "CS",
    status: s.status || "not_started",
    warnings: s.warnings || 0,
    last_active: s.last_active || null,
    submitted_at: s.submitted_at || null,
    started_at: s.started_at || null,
    password: s.password || null,
  }));

  return NextResponse.json(students);
}

// POST — create a student
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { data, error } = await supabase
      .from("exam_status")
      .insert({
        usn: body.usn,
        name: body.name,
        email: body.email || null,
        branch: body.branch || "CS",
        password: body.password || body.usn,
        status: "not_started",
        warnings: 0,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
