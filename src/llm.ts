/** A streaming chat completion from any OpenAI-compatible endpoint (OpenRouter by default). */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

/**
 * OpenRouter's app-attribution header, for OpenRouter only: a browser asks an endpoint's
 * permission for every unusual header (CORS), and other servers (Hermes Agent, a local model)
 * refuse the whole request over one they don't know.
 */
export function extraHeaders(baseUrl: string): Record<string, string> {
  try {
    return new URL(baseUrl).hostname.endsWith("openrouter.ai") ? { "X-Title": "Chimera Voice Chat" } : {};
  } catch {
    return {};
  }
}

/** Yields the reply's text as it arrives. Throws with the provider's message on an error. */
export async function* streamChat(o: ChatOptions): AsyncGenerator<string> {
  const res = await fetch(`${o.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    signal: o.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}`, ...extraHeaders(o.baseUrl) },
    body: JSON.stringify({ model: o.model, messages: o.messages, stream: true }),
  });
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      // no JSON body: the status is all there is
    }
    throw new Error(`The model request failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue; // comments (": OPENROUTER PROCESSING") and blanks
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let event: { error?: { message?: string }; choices?: { delta?: { content?: string } }[] };
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.error) throw new Error(event.error.message ?? "The model returned an error");
      const text = event.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}

/** The model ids the endpoint offers (for the settings box's suggestions); empty if it won't say. */
export async function listModels(baseUrl: string, apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { id: string }[] };
    return (body.data ?? []).map((m) => m.id).sort();
  } catch {
    return [];
  }
}
