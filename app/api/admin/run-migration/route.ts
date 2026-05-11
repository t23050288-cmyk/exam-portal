import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/run-migration
 * One-time migration to add anti-cheat columns to exam_status.
 * Protected by admin secret.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-migration-secret");
  if (secret !== process.env.ADMIN_SECRET && secret !== process.env.SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];

  try {
    // Add last_violation_at column
    const { error: e1 } = await supabaseAdmin.rpc("exec_ddl", {
      sql: "ALTER TABLE exam_status ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ",
    }).single();
    if (e1) {
      // Fallback: try direct insert approach to test if column exists
      results.push(`last_violation_at: ${e1.message}`);
    } else {
      results.push("last_violation_at: added ✅");
    }
  } catch (e: any) {
    results.push(`last_violation_at error: ${e.message}`);
  }

  try {
    const { error: e2 } = await supabaseAdmin.rpc("exec_ddl", {
      sql: "ALTER TABLE exam_status ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE",
    }).single();
    if (e2) {
      results.push(`auto_submitted: ${e2.message}`);
    } else {
      results.push("auto_submitted: added ✅");
    }
  } catch (e: any) {
    results.push(`auto_submitted error: ${e.message}`);
  }

  return NextResponse.json({ results, note: "Run this SQL in Supabase dashboard if auto-migration failed: ALTER TABLE exam_status ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ; ALTER TABLE exam_status ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE;" });
}
