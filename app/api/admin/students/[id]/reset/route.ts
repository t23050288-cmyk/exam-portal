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

// POST — reset student exam status
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from("exam_status")
      .update({
        status: "not_started",
        warnings: 0,
        started_at: null,
        submitted_at: null,
        last_active: null,
      })
      .eq("student_id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
