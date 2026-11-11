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
  /** how much the model thinks before it answers; "off" (the default) starts speaking soonest */
  reasoning?: Reasoning;
  /** talking to a Hermes Agent, which takes some options in its own way */
  hermes?: boolean;
  /**
   * Hermes Agent only: the conversation's id, sent as X-Hermes-Session-Id so the agent keeps one
   * session for the whole chat instead of working out which one each request belongs to.
   */
  hermesSession?: string;
  /** Hermes Agent only: called when the agent starts using a tool, with the tool's name */
  onTool?: (name: string) => void;
  signal?: AbortSignal;
}

export type Reasoning = "off" | "low" | "medium" | "high";

/** replies are spoken: a runaway one is cut here (a few sentences is ~100 tokens) */
const MAX_TOKENS = 400;
/** thinking is counted against the same limit by most providers, so it gets room of its own */
const THINKING_TOKENS: Record<Reasoning, number> = { off: 0, low: 1500, medium: 4000, high: 10000 };

export const isOpenRouter = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname.endsWith("openrouter.ai");
  } catch {
    return false;
  }
};

/**
 * The request body. OpenRouter gets its own routing fields: the fastest provider first (the wait
 * before the voice starts is what a conversation feels), and with `zdr` only providers that
 * retain nothing. Reasoning is asked for in each backend's own way: OpenRouter's `reasoning`,
 * Hermes Agent's `model_options`, and OpenAI's `reasoning_effort` elsewhere. With reasoning off,
 * OpenRouter is told so (some models think by default) and other endpoints are sent nothing,
 * since some reject fields they don't know.
 */
export function requestBody(o: Pick<ChatOptions, "baseUrl" | "model" | "messages" | "zdr" | "reasoning" | "hermes">): Record<string, unknown> {
  const reasoning = o.reasoning ?? "off";
  const body: Record<string, unknown> = { model: o.model, messages: o.messages, stream: true, max_tokens: MAX_TOKENS + THINKING_TOKENS[reasoning] };
  if (isOpenRouter(o.baseUrl)) {
    body.reasoning = reasoning === "off" ? { enabled: false } : { effort: reasoning };
    body.provider = { sort: "latency", ...(o.zdr ? { zdr: true, data_collection: "deny" } : {}) };
  } else if (reasoning !== "off") {
    if (o.hermes) body.model_options = { reasoning_effort: reasoning };
    else body.reasoning_effort = reasoning;
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

/**
 * Why a request never got an answer, as far as a page can tell. A browser reports a server that
 * is down, one that doesn't allow this site (CORS) and a blocked insecure address all the same
 * way, so this names the likely causes for the address in question.
 */
export function unreachable(baseUrl: string, page: { origin: string; protocol: string }, hermes: boolean): string {
  let host = baseUrl, local = false, insecure = false;
  try {
    const url = new URL(baseUrl);
    host = url.host;
    local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    insecure = url.protocol === "http:";
  } catch {
    return `"${baseUrl}" is not an address. Check the endpoint in Settings.`;
  }
  if (page.protocol === "https:" && insecure && !local)
    return `Couldn't reach ${host}. This page is HTTPS and that address is plain HTTP on another machine, which browsers block. Give it an HTTPS address (Tailscale's "tailscale serve" does it) and use that as the endpoint.`;
  if (hermes) return `Couldn't reach Hermes at ${host}. Check that "hermes gateway" is running with API_SERVER_ENABLED=true, and that API_SERVER_CORS_ORIGINS includes ${page.origin}.${local ? " The address is this device itself: from a phone, use the computer's HTTPS address instead." : ""}`;
  return `Couldn't reach ${host}. Check the endpoint in Settings, that the server is running, and that it allows requests from ${page.origin} (CORS).`;
}

/** endpoints that turned the session header down (an older Hermes): not sent to them again */
const noSessionHeader = new Set<string>();

async function post(o: ChatOptions): Promise<Response> {
  const send = (session: boolean) =>
    fetch(`${o.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal: o.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}`, ...extraHeaders(o.baseUrl), ...(session && o.hermesSession ? { "X-Hermes-Session-Id": o.hermesSession } : {}) },
      body: JSON.stringify(requestBody(o)),
    });
  const withSession = !!o.hermesSession && !noSessionHeader.has(o.baseUrl);
  try {
    return await send(withSession);
  } catch (e) {
    if (o.signal?.aborted) throw e;
    // a server that doesn't allow the session header refuses the whole request, and the browser
    // won't say that was why: try once without it
    if (withSession) {
      try {
        const res = await send(false);
        noSessionHeader.add(o.baseUrl);
        return res;
      } catch (again) {
        if (o.signal?.aborted) throw again;
      }
    }
    throw new Error(unreachable(o.baseUrl, typeof location === "undefined" ? { origin: "this site", protocol: "" } : location, !!o.hermesSession));
  }
}

/** The tool's name in a Hermes "tool progress" event, whatever shape the event has. */
function toolName(data: string): string {
  try {
    const d = JSON.parse(data);
    const name = d?.tool ?? d?.tool_name ?? d?.name ?? d?.function?.name;
    return typeof name === "string" && name ? name.slice(0, 40) : "a tool";
  } catch {
    return "a tool";
  }
}

/** Yields the reply's text as it arrives. Throws with the provider's message on an error. */
export async function* streamChat(o: ChatOptions): AsyncGenerator<string> {
  const res = await post(o);
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
  let buf = "", event = ""; // `event` is the name of the server-sent event being read, if it has one
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) event = ""; // a blank line ends an event
      else if (line.startsWith("event:")) event = line.slice(6).trim();
      if (!line.startsWith("data:")) continue; // comments (": OPENROUTER PROCESSING", ": keepalive") and the rest
      const data = line.slice(5).trim();
      if (event === "hermes.tool.progress") {
        o.onTool?.(toolName(data));
        continue;
      }
      if (event && event !== "message") continue; // some other named event: not part of the reply
      if (data === "[DONE]") return;
      let chunk: { error?: { message?: string }; choices?: { delta?: { content?: string } }[] };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(chunk.error.message ?? "The model returned an error");
      const text = chunk.choices?.[0]?.delta?.content;
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
