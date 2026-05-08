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

  const { data, error } = await supabase
    .from("exam_config")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function PUT(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { exam_title, ...updates } = body;

    if (!exam_title) {
      return NextResponse.json({ error: "exam_title is required" }, { status: 400 });
    }

    // Clean up fields that don't belong in the DB
    const cleanUpdates: Record<string, any> = {};
    const allowedFields = [
      "is_active", "duration_minutes", "scheduled_start", "scheduled_end",
      "total_questions", "total_marks", "category", "exam_title",
      "marks_per_question", "negative_marks", "shuffle_questions", "shuffle_options",
      "max_attempts", "show_answers_after", "exam_description",
    ];

    for (const key of allowedFields) {
      if (key in body) cleanUpdates[key] = body[key];
    }

    // Check if config exists
    const { data: existing } = await supabase
      .from("exam_config")
      .select("id")
      .eq("exam_title", exam_title)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("exam_config")
        .update(cleanUpdates)
        .eq("exam_title", exam_title)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    } else {
      const newConfig = {
        exam_title,
        is_active: cleanUpdates.is_active ?? false,
        duration_minutes: cleanUpdates.duration_minutes ?? 30,
        scheduled_start: cleanUpdates.scheduled_start ?? null,
        ...cleanUpdates,
      };
      const { data, error } = await supabase
        .from("exam_config")
        .insert(newConfig)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
