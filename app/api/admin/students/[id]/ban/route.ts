import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const secret = req.headers.get("x-admin-secret") || "";
  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  // Mark student as banned
  const { error } = await supabaseAdmin
    .from("students")
    .update({ is_banned: true, status: "banned" })
    .eq("id", id);

  if (error) {
    // Try with just is_banned if status column doesn't exist
    const { error: e2 } = await supabaseAdmin
      .from("students")
      .update({ is_banned: true })
      .eq("id", id);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, banned: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const secret = req.headers.get("x-admin-secret") || "";
  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  // Unban student
  const { error } = await supabaseAdmin
    .from("students")
    .update({ is_banned: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, banned: false });
}
