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

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { questions, replace_existing, exam_name, category, max_questions } = body;

    if (!questions || !Array.isArray(questions)) {
      return NextResponse.json({ error: "Invalid questions data" }, { status: 400 });
    }

    if (!exam_name) {
      return NextResponse.json({ error: "exam_name is required" }, { status: 400 });
    }

    // 1. If replace_existing is true, delete existing questions for this exam
    if (replace_existing) {
      const { error: delError } = await supabase
        .from("questions")
        .delete()
        .eq("exam_name", exam_name);
      
      if (delError) throw delError;
    }

    // 2. Prepare questions for insertion
    let questionsToInsert = questions.map((q, idx) => ({
      text: q.text,
      options: q.options || [],
      correct_answer: q.correct_answer || "A",
      marks: q.marks || 4,
      branch: q.branch || "CS",
      exam_name: exam_name,
      category: category || "Others",
      order_index: idx,
      image_url: q.image_url || null,
      audio_url: q.audio_url || null,
      question_type: q.question_type || "mcq",
      starter_code: q.starter_code || null,
      test_cases: q.test_cases || null,
    }));

    // 3. Handle max_questions if specified
    if (max_questions && max_questions < questionsToInsert.length) {
      questionsToInsert = questionsToInsert
        .sort(() => Math.random() - 0.5)
        .slice(0, max_questions);
    }

    // 4. Insert in batches (Supabase handles this well, but let's be safe if count is huge)
    const { data, error } = await supabase
      .from("questions")
      .insert(questionsToInsert)
      .select("id");

    if (error) throw error;

    return NextResponse.json({
      success: true,
      committed: data.length,
      message: `Successfully imported ${data.length} questions into ${exam_name}`,
    });

  } catch (err: any) {
    console.error("[INGEST-COMMIT] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
