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
  const status = searchParams.get("status");

  try {
    let query = supabase.from("grading_queue").select("*").order("created_at", { ascending: false });
    
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === "PGRST116" || error.message.includes("relation \"grading_queue\" does not exist")) {
        // Return empty list if table doesn't exist yet
        return NextResponse.json({ items: [] });
      }
      throw error;
    }

    return NextResponse.json({ items: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/process_grading
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const batch = parseInt(searchParams.get("batch") || "5");

  try {
    // 1. Get pending jobs
    const { data: jobs, error: fetchError } = await supabase
      .from("grading_queue")
      .select("*")
      .eq("status", "pending")
      .limit(batch);

    if (fetchError) throw fetchError;

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ processed: 0, message: "No pending jobs" });
    }

    // 2. Mark as processing
    const jobIds = jobs.map(j => j.id);
    await supabase.from("grading_queue").update({ status: "processing" }).in("id", jobIds);

    // 3. Process each (Mock for now, but usually triggers a worker or calls a Python function)
    let processed = 0;
    for (const job of jobs) {
      try {
        // Logic would go here:
        // - Fetch user code from exam_sessions
        // - Run tests
        // - Update score in results
        
        await supabase.from("grading_queue").update({ 
          status: "done", 
          graded_at: new Date().toISOString() 
        }).eq("id", job.id);
        
        processed++;
      } catch (e: any) {
        await supabase.from("grading_queue").update({ 
          status: "failed", 
          last_error: e.message,
          attempts: (job.attempts || 0) + 1
        }).eq("id", job.id);
      }
    }

    return NextResponse.json({ processed, message: `Processed ${processed} jobs` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
