/**
 * /api/ai/hint — Single-sentence hint for stuck students in PyHunt
 */
import { NextRequest, NextResponse } from "next/server";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "deepseek-ai/deepseek-v4-flash";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });

  const { problem_title, code, error: errMsg } = await req.json();

  const prompt = `You are a helpful Python mentor in a treasure hunt game.

Problem: ${problem_title}

Student code:
\`\`\`python
${code}
\`\`\`

Error/issues: ${errMsg || "Logic might be wrong"}

Give ONE short encouraging hint (max 2 sentences) nudging them toward the solution. No code snippets.`;

  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 120,
      }),
      signal: AbortSignal.timeout(28_000),
    });
    const data = await res.json();
    let hint: string = data.choices?.[0]?.message?.content ?? "";
    hint = hint.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return NextResponse.json({ hint: hint.slice(0, 300) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
