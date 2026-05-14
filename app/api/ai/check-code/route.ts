/**
 * /api/ai/check-code — AI code grader for PyHunt rounds 3 & 4
 */
import { NextRequest, NextResponse } from "next/server";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "deepseek-ai/deepseek-v4-flash";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });

  const { problem_title, problem_description, code, test_cases, round_num } = await req.json();

  const tcText = (test_cases as Array<{input:string;expected:string}>)
    .map(tc => `  Input: ${tc.input} → Expected: ${tc.expected}`)
    .join("\n");

  const prompt = `You are a Python code grader for a student competition called PyHunt.

Problem: ${problem_title}
Description: ${problem_description}

Test Cases:
${tcText}

Student Code:
\`\`\`python
${code}
\`\`\`

Respond ONLY with this JSON (no markdown, no extra text):
{"correct": true, "feedback": "One short encouraging sentence. If wrong, hint at what to fix — no answer."}`;

  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(58_000),
    });
    const data = await res.json();
    let content: string = data.choices?.[0]?.message?.content ?? "";
    // Strip <think> tags
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return NextResponse.json(JSON.parse(match[0]));
    return NextResponse.json({ correct: false, feedback: content.slice(0, 200) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
