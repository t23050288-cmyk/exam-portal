import { NextRequest, NextResponse } from "next/server";

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam";

function checkAdmin(req: NextRequest): boolean {
  const secret = req.headers.get("x-admin-secret") || "";
  return secret === ADMIN_SECRET;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

    const questions: any[] = [];
    const parseWarnings: string[] = [];

    // Simple CSV parser (doesn't handle quoted commas yet, but good for basic use)
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const cols = lines[i].split(",").map(c => c.trim());
      const q: any = {
        text: "",
        options: [],
        correct_answer: "A",
        marks: 4,
        question_type: "mcq",
        branch: "CS",
        order_index: i - 1,
        exam_name: "Imported Exam"
      };

      headers.forEach((h, idx) => {
        const val = cols[idx];
        if (!val) return;

        if (h.includes("text") || h.includes("question")) q.text = val;
        else if (h.includes("option")) {
          // If it's a single column with comma-separated options
          if (val.includes(";")) q.options = val.split(";").map(o => o.trim());
          else q.options.push(val);
        }
        else if (h.includes("answer") || h.includes("correct")) q.correct_answer = val;
        else if (h.includes("marks")) q.marks = parseInt(val) || 4;
        else if (h.includes("type")) q.question_type = val.toLowerCase().includes("code") ? "code" : "mcq";
        else if (h.includes("branch")) q.branch = val;
        else if (h.includes("image")) q.image_url = val;
      });

      if (q.text) {
        // Validation
        if (q.options.length < 2 && q.question_type === "mcq") {
          parseWarnings.push(`Line ${i+1}: MCQ has fewer than 2 options.`);
        }
        questions.push(q);
      }
    }

    return NextResponse.json({
      questions,
      total: questions.length,
      source_file: file.name,
      parse_warnings: parseWarnings,
      ai_powered: false, // Legacy mode for now
    });

  } catch (err: any) {
    console.error("[INGEST-UPLOAD] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
