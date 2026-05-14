/**
 * /api/ai/hint — One-sentence hint for stuck PyHunt students
 * Returns: { hint: string }
 */
import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

export const runtime = 'edge';
export const maxDuration = 15;

export async function POST(req: Request) {
  const apiKey = (process.env as Record<string, string | undefined>).GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });

  const groq = createGroq({ apiKey });

  const { problem_title, code, error: errMsg } = await req.json();

  const prompt = `You are a helpful Python mentor in a student coding competition.

Problem: ${problem_title}

Student code:
\`\`\`python
${code}
\`\`\`

Issue: ${errMsg || 'Logic might be incorrect'}

Give ONE short, encouraging hint (1-2 sentences max) nudging toward the solution. No code. No spoilers.`;

  const result = await generateText({
    model: groq('llama-3.1-70b-versatile'),
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    maxTokens: 80,
  });

  return Response.json({ hint: result.text.trim().slice(0, 300) });
}
