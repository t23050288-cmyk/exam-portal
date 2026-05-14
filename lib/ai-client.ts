/**
 * NEXUS AI Client — Frontend utility
 * Calls /api/ai-proxy which securely forwards to Groq (Llama 3.1)
 * API key never touches the browser.
 */

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

export interface AIResponse {
  id: string;
  choices: AIChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Send a conversation to the NEXUS AI (Groq Llama 3.1).
 * The system prompt is injected server-side — just send user/assistant messages.
 */
export async function getAICompletion(messages: AIMessage[]): Promise<AIResponse> {
  const res = await fetch("/api/ai/proctor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, stream: false }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `AI request failed (${res.status})`);
  }

  return res.json();
}

/**
 * Stream a conversation from the NEXUS AI (Groq).
 */
export async function streamAICompletion(
  messages: AIMessage[],
  onToken: (token: string) => void
): Promise<string> {
  const res = await fetch("/api/ai/proctor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `AI stream failed (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No readable stream");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") break;

      try {
        const chunk = JSON.parse(payload);
        const content = chunk.choices?.[0]?.delta?.content;

        if (content) {
          fullText += content;
          onToken(content);
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return fullText;
}

/**
 * Perform a deep logic check on student code (Round 3 & 4)
 * Returns { correct: boolean, score: number, status: string, feedback: string }
 */
export async function checkCodeAI(params: {
  problem_title: string;
  problem_description: string;
  code: string;
  test_cases: any[];
  round_num: number;
}) {
  const res = await fetch("/api/ai/check-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `AI check failed (${res.status})`);
  }

  return res.json();
}

/**
 * Get a subtle hint for a stuck student
 */
export async function getAIHint(params: {
  problem_title: string;
  code: string;
  error?: string;
}) {
  const res = await fetch("/api/ai/hint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `AI hint failed (${res.status})`);
  }

  return res.json();
}
