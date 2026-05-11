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

  try {
    const { data: students, error } = await supabase
      .from("exam_status")
      .select("status, warning_count");

    if (error) throw error;

    const aggregate = {
      active_sessions: students?.filter(s => s.status === "active").length || 0,
      submitted_count: students?.filter(s => s.status === "submitted").length || 0,
      flagged_count: students?.filter(s => (s.warning_count || 0) > 0).length || 0,
      violations_by_severity: {
        low: students?.filter(s => s.warning_count === 1).length || 0,
        medium: students?.filter(s => s.warning_count === 2).length || 0,
        high: students?.filter(s => (s.warning_count || 0) >= 3).length || 0,
      },
      throttle_mode: "normal", // This should ideally come from a settings table
      last_updated: new Date().toISOString(),
    };

    return NextResponse.json(aggregate);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
