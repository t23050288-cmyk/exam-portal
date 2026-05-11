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

// PATCH — update student
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();

    // Split updates between students and exam_status
    const studentFields = ["name", "usn", "email", "branch", "password"];
    const statusFields = ["status", "warnings", "last_active", "submitted_at", "started_at"];

    const studentUpdates: any = {};
    const statusUpdates: any = {};

    for (const key of studentFields) {
      if (key in body) studentUpdates[key] = body[key];
    }
    for (const key of statusFields) {
      if (key in body) statusUpdates[key] = body[key];
    }

    if (Object.keys(studentUpdates).length > 0) {
      await supabase.from("students").update(studentUpdates).eq("id", id);
    }
    if (Object.keys(statusUpdates).length > 0) {
      await supabase.from("exam_status").update(statusUpdates).eq("student_id", id);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — delete student
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    
    // Delete from exam_status first (though DB should have cascade, let's be safe)
    await supabase.from("exam_status").delete().eq("student_id", id);
    
    // Then delete from students
    const { error } = await supabase
      .from("students")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
