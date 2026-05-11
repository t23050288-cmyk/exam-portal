import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
};

export async function GET(_req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const sb = createClient(url, key);

    // Return all exam configs except the pyhunt global config
    const { data, error } = await sb
      .from("exam_config")
      .select("id, exam_title, is_active, scheduled_start, duration_minutes, category, updated_at")
      .neq("exam_title", "PYHUNT_GLOBAL_CONFIG")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[PUBLIC CONFIG] DB error:", error.message);
      return NextResponse.json([], { headers: NO_CACHE });
    }

    // Map to the shape the dashboard expects
    const configs = (data || []).map((row: any) => ({
      id: row.id,
      exam_title: row.exam_title,
      is_active: row.is_active,
      scheduled_start: row.scheduled_start || null,
      duration_minutes: row.duration_minutes || 30,
      category: row.category || "Others",
      max_attempts: row.max_attempts || 1,
    }));

    return NextResponse.json(configs, { headers: NO_CACHE });
  } catch (err: any) {
    console.error("[PUBLIC CONFIG] Error:", err?.message);
    return NextResponse.json([], { status: 500, headers: NO_CACHE });
  }
}
