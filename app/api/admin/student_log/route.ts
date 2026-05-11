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

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  try {
    // 1. Get student/session info
    const { data: session, error: sessError } = await supabase
      .from("exam_status")
      .select("*")
      .eq("student_id", sessionId) // In our system, student_id acts as the session anchor
      .maybeSingle();

    if (sessError) throw sessError;

    // 2. Get violations
    const { data: violations, error: violError } = await supabase
      .from("violations")
      .select("*")
      .eq("student_id", sessionId)
      .order("timestamp", { ascending: true });

    if (violError) {
        if (violError.message.includes("relation \"violations\" does not exist")) {
            return NextResponse.json({ session, events: [], violations: [] });
        }
        throw violError;
    }

    // 3. Return combined log
    return NextResponse.json({
      session: session || {},
      events: [], // Generic telemetry events (not yet implemented in backend)
      violations: violations || [],
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
