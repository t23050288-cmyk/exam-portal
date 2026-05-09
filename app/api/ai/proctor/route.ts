import { NextRequest, NextResponse } from "next/server";

/**
 * ExamPortal Intelligence — Secure AI Proxy
 * Model: DeepSeek-V4-Flash via NVIDIA NIM
 */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "deepseek-ai/deepseek-v4-flash";

const SYSTEM_PROMPT = `You are the 'ExamPortal Intelligence', a high-performance AI proctor and study assistant for the ExamPortal project.

Your Mission:
- Provide strictly helpful, concise, and academic guidance.
- Act as a supportive proctor or study guide.
- Programmable Restriction: NEVER leak direct answers if the user is in an active exam session. Instead, provide hints, concepts, or logic-based explanations to guide them.
- Use your deep reasoning capabilities to ensure technical accuracy in programming (Python) and aptitude.

Response Style:
- Professional, encouraging, and highly structured.
- Use bullet points or numbered lists for clarity.
- When explaining code, focus on the "why" and "how" rather than just the "what".`;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.NVIDIA_API_KEY;
    console.log("[ExamPortal AI] Request received. Key present:", !!apiKey);

    if (!apiKey) {
      console.error("[ExamPortal AI] NVIDIA_API_KEY is missing in environment.");
      return NextResponse.json(
        { error: "AI Service Configuration Error: NVIDIA_API_KEY is missing." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const userMessages = body.messages || [];

    // Build the full messages array with system prompt
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...userMessages,
    ];

    // Forward to NVIDIA NIM API with requested parameters
    const nvidiaResponse = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 1,
        top_p: 0.95,
        max_tokens: 16384,
        stream: body.stream || false,
        // Enable model's reasoning capabilities
        extra_body: {
          chat_template_kwargs: {
            thinking: true,
            reasoning_effort: "high",
          },
        },
      }),
    });

    if (!nvidiaResponse.ok) {
      const errText = await nvidiaResponse.text();
      console.error("[ExamPortal AI] NVIDIA API Error:", nvidiaResponse.status, errText);
      return NextResponse.json(
        { error: "AI service returned an error", detail: errText },
        { status: nvidiaResponse.status }
      );
    }

    // Handle Streaming Response
    if (body.stream) {
      const readable = nvidiaResponse.body;
      if (!readable) {
        return NextResponse.json({ error: "No stream body" }, { status: 500 });
      }
      return new NextResponse(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Handle Standard JSON Response
    const data = await nvidiaResponse.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[ExamPortal AI] Internal Error:", err);
    return NextResponse.json(
      { error: "Internal proxy error", detail: err.message },
      { status: 500 }
    );
  }
}
