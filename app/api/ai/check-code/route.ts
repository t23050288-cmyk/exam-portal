/**
 * /api/ai/check-code — AI code grader for PyHunt rounds 3 & 4
 * Uses direct Groq REST API (no SDK) for maximum reliability.
 * Runtime: serverless (NOT edge)
 * Returns: { correct: boolean, score: number, status: string, feedback: string, errors: string }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";       // serverless, not edge
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are an expert Python Examiner for the 'PyHunt' competition.
Your task is to analyze the student's code based on strict rules:

1. ACCURACY: Check for syntax errors and logical correctness against ALL provided test cases.
2. EFFICIENCY: Briefly note if the student used a better approach (e.g., list comprehensions).
3. FORMAT: You MUST respond ONLY with a valid JSON object — no markdown, no explanation, no code fences.

JSON Schema:
{
  "score": 0-10,
  "status": "Pass" or "Fail",
  "feedback": "A short, 1-sentence technical critique.",
  "correct_logic": true or false,
  "errors": "List any syntax errors, or 'None'."
}`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === "gsk_your_key_here") {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured. Add your key to .env and Vercel dashboard." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { problem_title, problem_description, code, test_cases, round_num } = body;

    if (!code) {
      return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }

    const tcText = (test_cases as Array<{ input: string; expected: string }>)
      .map((tc, i) => `  Case ${i + 1}: Input: ${tc.input} → Expected Output: ${tc.expected}`)
      .join("\n");

    const userPrompt = `Problem: ${problem_title || "Untitled"}
Description: ${problem_description || "No description"}
Round: ${round_num || "Unknown"}

Test Cases:
${tcText}

Student Code:
\`\`\`python
${code}
\`\`\`

Evaluate this code strictly. Return ONLY the JSON object.`;

    // Direct Groq REST API call — no SDK needed
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error("[AI/check-code] Groq API error:", groqRes.status, errBody);
      return NextResponse.json(
        { error: `Groq API error: ${groqRes.status}`, detail: errBody },
        { status: 502 }
      );
    }

    const groqData = await groqRes.json();
    let text = groqData.choices?.[0]?.message?.content?.trim() || "";

    // Strip markdown code fences if AI wraps its response
    text = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();

    // Extract the JSON object
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return NextResponse.json({
          correct: parsed.correct_logic === true || parsed.status === "Pass",
          score: parsed.score ?? (parsed.correct_logic ? 10 : 0),
          status: parsed.status || (parsed.correct_logic ? "Pass" : "Fail"),
          feedback: parsed.feedback || "No feedback provided.",
          errors: parsed.errors || "None",
        });
      } catch {
        // JSON parse failed — fall through
      }
    }

    // Fallback: couldn't parse JSON from AI response
    return NextResponse.json({
      correct: false,
      score: 0,
      status: "Fail",
      feedback: text.slice(0, 300) || "AI returned unparseable response.",
      errors: "AI response format error",
    });
  } catch (err: any) {
    console.error("[AI/check-code] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err.message },
      { status: 500 }
    );
  }
}
