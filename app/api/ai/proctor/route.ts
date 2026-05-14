/**
 * /api/ai/proctor — Groq AI proctor endpoint (streaming + non-streaming)
 * Uses direct Groq REST API (no SDK) for maximum reliability.
 * Runtime: serverless (NOT edge)
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are ExamPortal Intelligence — a sharp, fair AI proctor and study assistant for a competitive coding exam called PyHunt.

Rules:
- If a student asks for direct code answers during an exam, refuse and give a conceptual hint instead.
- For general Python/aptitude questions, be fully helpful and clear.
- Keep responses concise. Use bullet points for multi-step explanations.
- When explaining code, focus on WHY and HOW.
- Be encouraging. Students are under exam pressure.`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === "gsk_your_key_here") {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured. Add your key to .env and Vercel dashboard." },
        { status: 500 }
      );
    }

    let body: { messages: Array<{ role: string; content: string }>; stream?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...body.messages.map(m => ({
        role: m.role as string,
        content: m.content,
      })),
    ];

    const shouldStream = body.stream !== false;

    // ── NON-STREAMING ──────────────────────────────────────────
    if (!shouldStream) {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-70b-versatile",
          messages,
          temperature: 0.3,
          max_tokens: 1024,
          stream: false,
        }),
      });

      if (!groqRes.ok) {
        const errBody = await groqRes.text();
        console.error("[AI/proctor] Groq API error:", groqRes.status, errBody);
        return NextResponse.json(
          { error: `Groq API error: ${groqRes.status}`, detail: errBody },
          { status: 502 }
        );
      }

      const data = await groqRes.json();
      return NextResponse.json({
        choices: [{
          index: 0,
          message: { role: "assistant", content: data.choices?.[0]?.message?.content || "" },
          finish_reason: "stop",
        }],
        usage: data.usage,
      });
    }

    // ── STREAMING — OpenAI SSE format ──────────────────────────
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        messages,
        temperature: 0.3,
        max_tokens: 1024,
        stream: true,
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error("[AI/proctor] Groq streaming error:", groqRes.status, errBody);
      return NextResponse.json(
        { error: `Groq API error: ${groqRes.status}` },
        { status: 502 }
      );
    }

    // Pass through the SSE stream from Groq directly
    return new Response(groqRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[AI/proctor] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err.message },
      { status: 500 }
    );
  }
}
