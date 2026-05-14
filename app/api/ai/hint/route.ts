/**
 * /api/ai/hint — One-sentence hint for stuck PyHunt students
 * Uses direct Groq REST API (no SDK) for maximum reliability.
 * Runtime: serverless (NOT edge)
 * Returns: { hint: string }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === "gsk_your_key_here") {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured" },
        { status: 500 }
      );
    }

    const { problem_title, code, error: errMsg } = await req.json();

    const prompt = `You are a helpful Python mentor in a student coding competition called PyHunt.

Problem: ${problem_title}

Student code:
\`\`\`python
${code}
\`\`\`

Issue: ${errMsg || "Logic might be incorrect"}

Give ONE short, encouraging hint (1-2 sentences max) nudging toward the solution. No code. No spoilers.`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 100,
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error("[AI/hint] Groq API error:", groqRes.status, errBody);
      return NextResponse.json(
        { error: `Groq API error: ${groqRes.status}` },
        { status: 502 }
      );
    }

    const data = await groqRes.json();
    const hint = data.choices?.[0]?.message?.content?.trim() || "Try reviewing your logic step by step.";

    return NextResponse.json({ hint: hint.slice(0, 300) });
  } catch (err: any) {
    console.error("[AI/hint] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err.message },
      { status: 500 }
    );
  }
}
