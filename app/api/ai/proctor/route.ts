/**
 * /api/ai/proctor — Groq Edge streaming endpoint
 * Streams in OpenAI-compatible SSE format ("data: {...}\n\n")
 * so the existing ai-client.ts works without changes.
 * Runtime: Edge — bypasses Vercel's 10s serverless limit
 */
import { createGroq } from '@ai-sdk/groq';
import { streamText, generateText } from 'ai';

export const runtime = 'edge';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are ExamPortal Intelligence — a sharp, fair AI proctor and study assistant for a competitive coding exam called PyHunt.

Rules:
- If a student asks for direct code answers during an exam, refuse and give a conceptual hint instead.
- For general Python/aptitude questions, be fully helpful and clear.
- Keep responses concise. Use bullet points for multi-step explanations.
- When explaining code, focus on WHY and HOW.
- Be encouraging. Students are under exam pressure.`;

export async function POST(req: Request) {
  const apiKey = (process.env as Record<string, string | undefined>).GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  const groq = createGroq({ apiKey });

  let body: { messages: Array<{ role: string; content: string }>; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...body.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const shouldStream = body.stream !== false;

  // ── NON-STREAMING ────────────────────────────────────────────────────────
  if (!shouldStream) {
    const result = await generateText({
      model: groq('llama-3.1-70b-versatile'),
      messages,
      temperature: 0.3,
      maxOutputTokens: 1024,
    });
    // Return OpenAI-compatible format (what getAICompletion() expects)
    return Response.json({
      choices: [{
        index: 0,
        message: { role: 'assistant', content: result.text },
        finish_reason: 'stop',
      }],
      usage: result.usage,
    });
  }

  // ── STREAMING — OpenAI SSE format ────────────────────────────────────────
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const result = await streamText({
        model: groq('llama-3.1-70b-versatile'),
        messages,
        temperature: 0.3,
        maxOutputTokens: 1024,
      });

      for await (const delta of result.textStream) {
        const chunk = {
          choices: [{
            index: 0,
            delta: { role: 'assistant', content: delta },
            finish_reason: null,
          }],
        };
        writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      writer.write(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      writer.write(encoder.encode('data: [DONE]\n\n'));
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
