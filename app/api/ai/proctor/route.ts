/**
 * /api/ai/proctor — Next.js edge-compatible proxy to NVIDIA NIM DeepSeek
 * Supports both streaming (SSE) and non-streaming JSON responses.
 * Timeout: 90s (DeepSeek reasoning phase can take 30-40s)
 */

import { NextRequest, NextResponse } from "next/server";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "deepseek-ai/deepseek-v4-flash";

const SYSTEM_PROMPT = `You are the 'ExamPortal Intelligence', a high-performance AI proctor and study assistant for the ExamPortal project.

Your Mission:
- Provide strictly helpful, concise, and academic guidance.
- Act as a supportive proctor or study guide.
- NEVER leak direct answers if the user is in an active exam session. Instead, provide hints, concepts, or logic-based explanations to guide them.
- Use your deep reasoning capabilities to ensure technical accuracy in programming (Python) and aptitude.

Response Style:
- Professional, encouraging, and highly structured.
- Use bullet points or numbered lists for clarity.
- When explaining code, focus on the "why" and "how" rather than just the "what".`;

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
  }

  let body: { messages: Array<{ role: string; content: string }>; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...body.messages];
  const stream = body.stream ?? false;

  const payload = {
    model: MODEL,
    messages,
    temperature: 1.0,
    top_p: 0.95,
    max_tokens: 4096,
    stream,
  };

  let nvidiaRes: Response;
  try {
    nvidiaRes = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      // @ts-ignore — Node 18+ fetch supports signal
      signal: AbortSignal.timeout(88_000),
    });
  } catch (err: any) {
    return NextResponse.json({ error: `NVIDIA request failed: ${err.message}` }, { status: 502 });
  }

  if (!nvidiaRes.ok) {
    const errText = await nvidiaRes.text().catch(() => "unknown");
    return NextResponse.json(
      { error: `NVIDIA API error ${nvidiaRes.status}: ${errText}` },
      { status: nvidiaRes.status }
    );
  }

  // ── STREAMING ─────────────────────────────────────────────────────────────
  if (stream) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      const reader = nvidiaRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let inThink = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            writer.write(encoder.encode("data: [DONE]\n\n"));
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") {
              writer.write(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            try {
              const chunk = JSON.parse(payload);
              const delta = chunk.choices?.[0]?.delta ?? {};
              let content: string = delta.content ?? "";
              const reasoning: string = delta.reasoning_content ?? delta.reasoning ?? "";

              // Route <think> inline tags to reasoning_content field
              if (content.includes("<think>")) {
                inThink = true;
                const [before, after] = content.split("<think>", 2);
                if (before) {
                  const c = structuredClone(chunk);
                  c.choices[0].delta.content = before;
                  writer.write(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
                }
                content = after ?? "";
                chunk.choices[0].delta.content = "";
                chunk.choices[0].delta.reasoning_content = content;
                if (content) writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                continue;
              }
              if (content.includes("</think>")) {
                inThink = false;
                const [reasonPart, answerPart] = content.split("</think>", 2);
                if (reasonPart) {
                  const c = structuredClone(chunk);
                  c.choices[0].delta.content = "";
                  c.choices[0].delta.reasoning_content = reasonPart;
                  writer.write(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
                }
                chunk.choices[0].delta.content = answerPart ?? "";
                chunk.choices[0].delta.reasoning_content = "";
                if (answerPart) writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                continue;
              }
              if (inThink && content && !reasoning) {
                chunk.choices[0].delta.content = "";
                chunk.choices[0].delta.reasoning_content = content;
              }
              writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } catch {
              // skip malformed chunk
            }
          }
        }
      } catch (e) {
        writer.write(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`));
        writer.write(encoder.encode("data: [DONE]\n\n"));
      } finally {
        writer.close();
      }
    })();

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  }

  // ── NON-STREAMING ─────────────────────────────────────────────────────────
  const data = await nvidiaRes.json();
  for (const choice of data.choices ?? []) {
    const msg = choice.message ?? {};
    const raw: string = msg.content ?? "";
    const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      msg.reasoning_content = thinkMatch[1].trim();
      msg.content = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
  }
  return NextResponse.json(data);
}
