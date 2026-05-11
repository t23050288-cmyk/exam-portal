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
    // We want a summary: branch, exam_name, count
    // Supabase/Postgrest doesn't support GROUP BY directly via the client easily, 
    // so we either fetch all or use an RPC.
    // Since we only need unique combinations, we'll fetch them.
    
    const { data: questions, error } = await supabase
      .from("questions")
      .select("branch, exam_name");

    if (error) throw error;

    const summaryMap: Record<string, number> = {};
    questions?.forEach(q => {
      const key = `${q.branch}|||${q.exam_name}`;
      summaryMap[key] = (summaryMap[key] || 0) + 1;
    });

    const result = Object.entries(summaryMap).map(([key, count]) => {
      const [branch, exam_name] = key.split("|||");
      return { branch, exam_name, question_count: count };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
