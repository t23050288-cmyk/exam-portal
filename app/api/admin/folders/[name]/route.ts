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

// DELETE a folder (all questions under this exam_name)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name } = await params;
  const folderName = decodeURIComponent(name);

  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("exam_name", folderName);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: `Deleted folder ${folderName}` });
}

// RENAME a folder (update exam_name for all questions)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name } = await params;
  const oldName = decodeURIComponent(name);

  try {
    const { new_name } = await req.json();
    if (!new_name) return NextResponse.json({ error: "new_name is required" }, { status: 400 });

    const { error } = await supabase
      .from("questions")
      .update({ exam_name: new_name })
      .eq("exam_name", oldName);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: `Renamed ${oldName} to ${new_name}` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
