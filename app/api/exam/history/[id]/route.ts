import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "nexus_exam_secret";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  let studentId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    studentId = payload.student_id || payload.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  // Only allow deleting own results
  const { error } = await supabaseAdmin
    .from("exam_results")
    .delete()
    .eq("id", id)
    .eq("student_id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
