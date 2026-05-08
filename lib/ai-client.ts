/**
 * NEXUS AI Client — Frontend utility
 * Calls /api/ai-proxy which securely forwards to NVIDIA NIM (DeepSeek V4 Flash)
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
    /** DeepSeek reasoning/thinking content (if returned) */
    reasoning?: string;
    reasoning_content?: string;
  };
  finish_reason: string;
}

export interface AIResponse {
  id: string;
  choices: AIChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Send a conversation to the NEXUS AI (DeepSeek V4 Flash via NVIDIA NIM).
 * The system prompt is injected server-side — just send user/assistant messages.
 *
 * @param messages - Array of { role, content } messages
 * @returns The AI response with choices
 *
 * @example
 * ```ts
 * const res = await getAICompletion([
 *   { role: "user", content: "Explain binary search in simple terms" }
 * ]);
 * console.log(res.choices[0].message.content);
 * ```
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

  const data: AIResponse = await res.json();

  // Normalize DeepSeek reasoning fields into content if present
  if (data.choices?.[0]?.message) {
    const msg = data.choices[0].message;
    // Prioritize content, but if empty, check reasoning fields
    if (!msg.content && (msg.reasoning || msg.reasoning_content)) {
      msg.content = msg.reasoning || msg.reasoning_content || "";
    }
  }

  return data;
}

/**
 * Stream a conversation from the NEXUS AI.
 * Handles DeepSeek's `reasoning` and `reasoning_content` delta fields.
 */
export async function streamAICompletion(
  messages: AIMessage[],
  onToken: (token: string) => void,
  onReasoning?: (token: string) => void
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
        const delta = chunk.choices?.[0]?.delta;

        if (delta?.content) {
          fullText += delta.content;
          onToken(delta.content);
        }

        // DeepSeek reasoning/thinking tokens
        if ((delta?.reasoning || delta?.reasoning_content) && onReasoning) {
          onReasoning(delta.reasoning || delta.reasoning_content);
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return fullText;
}
