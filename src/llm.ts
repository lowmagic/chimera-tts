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
  /** OpenRouter only: route to providers that keep no data (Zero Data Retention) */
  zdr?: boolean;
  signal?: AbortSignal;
}

/** replies are spoken: a runaway one is cut here (a few sentences is ~100 tokens) */
const MAX_TOKENS = 400;

export const isOpenRouter = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname.endsWith("openrouter.ai");
  } catch {
    return false;
  }
};

/**
 * The request body. OpenRouter gets its own routing fields: the fastest provider first (the wait
 * before the voice starts is what a conversation feels), no hidden reasoning pass before the
 * reply, and with `zdr` only providers that retain nothing. Other endpoints get the standard
 * fields only, since some reject ones they don't know.
 */
export function requestBody(o: Pick<ChatOptions, "baseUrl" | "model" | "messages" | "zdr">): Record<string, unknown> {
  const body: Record<string, unknown> = { model: o.model, messages: o.messages, stream: true, max_tokens: MAX_TOKENS };
  if (isOpenRouter(o.baseUrl)) {
    body.reasoning = { enabled: false };
    body.provider = { sort: "latency", ...(o.zdr ? { zdr: true, data_collection: "deny" } : {}) };
  }
  return body;
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

/** What to tell the model about itself, so that asking it "which model are you?" gets the truth. */
export function identityNotice(baseUrl: string, model: string, previous?: string): string {
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
    // not a URL: say it as written
  }
  return (
    `You are running as the model "${model}", served through ${host}. If you are asked which model or AI you are, say exactly that.` +
    (previous && previous !== model ? ` Earlier replies in this conversation were written by a different model, "${previous}".` : "")
  );
}

/** Yields the reply's text as it arrives. Throws with the provider's message on an error. */
export async function* streamChat(o: ChatOptions): AsyncGenerator<string> {
  const res = await fetch(`${o.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    signal: o.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}`, ...extraHeaders(o.baseUrl) },
    body: JSON.stringify(requestBody(o)),
  });
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      // no JSON body: the status is all there is
    }
    // OpenRouter answers 404 "No endpoints found..." when the routing rules leave no provider
    const hint = o.zdr && isOpenRouter(o.baseUrl) && (res.status === 404 || /no (allowed )?(endpoints|providers)|data policy|zdr/i.test(detail)) ? " No provider of this model may meet Zero Data Retention: pick another model, or turn that off in Settings." : "";
    throw new Error(`The model request failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}.${hint}`);
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
