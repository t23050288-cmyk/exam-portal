/**
 * /api/ai/check-code — AI code grader for PyHunt rounds 3 & 4
 * Returns: { correct: boolean, feedback: string }
 */
import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

export const runtime = 'edge';
export const maxDuration = 30;

export async function POST(req: Request) {
  const apiKey = (process.env as Record<string, string | undefined>).GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });

  const groq = createGroq({ apiKey });

  const { problem_title, problem_description, code, test_cases } = await req.json();

  const tcText = (test_cases as Array<{ input: string; expected: string }>)
    .map(tc => `  Input: ${tc.input} → Expected: ${tc.expected}`)
    .join('\n');

  const prompt = `You are a strict Python code grader for a student competition called PyHunt.

Problem: ${problem_title}
Description: ${problem_description}

Test Cases:
${tcText}

Student Code:
\`\`\`python
${code}
\`\`\`

Evaluate if the code CORRECTLY solves the problem for ALL test cases.
Respond ONLY with valid JSON — no markdown, no extra text:
{"correct": true, "feedback": "Short encouraging sentence."}
or
{"correct": false, "feedback": "One sentence hint pointing toward what's wrong — no solution."}`;

  const result = await generateText({
    model: groq('llama-3.1-70b-versatile'),
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    maxOutputTokens: 150,
  });

  let text = result.text.trim();
  // Strip any markdown code fences
  text = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return Response.json(JSON.parse(match[0]));
    } catch { /* fall through */ }
  }
  return Response.json({ correct: false, feedback: text.slice(0, 200) });
}
