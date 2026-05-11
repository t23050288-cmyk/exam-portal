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

    const { data, error } = await sb
      .from("exam_config")
      .select("category, updated_at")
      .eq("exam_title", "PYHUNT_GLOBAL_CONFIG")
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error("[PYHUNT] Config not found:", error?.message);
      return NextResponse.json({ ok: false, config: null }, { headers: NO_CACHE });
    }

    let config: any = null;
    try {
      config = typeof data.category === "string" ? JSON.parse(data.category) : data.category;
    } catch {
      return NextResponse.json({ ok: false, config: null }, { headers: NO_CACHE });
    }

    return NextResponse.json({ ok: true, config, updated_at: data.updated_at }, { headers: NO_CACHE });
  } catch (err: any) {
    console.error("[PYHUNT] Error:", err?.message);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500, headers: NO_CACHE });
  }
}
