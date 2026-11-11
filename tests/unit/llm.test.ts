import { expect, test } from "bun:test";
import { extraHeaders, identityNotice, requestBody } from "../../src/llm.ts";

test("the attribution header goes to OpenRouter and nowhere else", () => {
  expect(extraHeaders("https://openrouter.ai/api/v1")).toEqual({ "X-Title": "Chimera Voice Chat" });
  expect(extraHeaders("http://127.0.0.1:8642/v1")).toEqual({});
  expect(extraHeaders("https://hermes.example.ts.net/v1")).toEqual({});
  expect(extraHeaders("https://openrouter.ai.evil.example/v1")).toEqual({});
  expect(extraHeaders("not a url")).toEqual({});
});

const messages = [{ role: "user" as const, content: "hi" }];

test("OpenRouter gets its routing fields; other endpoints only the standard ones", () => {
  expect(requestBody({ baseUrl: "https://openrouter.ai/api/v1", model: "m", messages, zdr: true })).toEqual({
    model: "m",
    messages,
    stream: true,
    max_tokens: 400,
    reasoning: { enabled: false },
    provider: { sort: "latency", zdr: true, data_collection: "deny" },
  });
  expect(requestBody({ baseUrl: "https://openrouter.ai/api/v1", model: "m", messages, zdr: false }).provider).toEqual({ sort: "latency" });
  expect(requestBody({ baseUrl: "http://127.0.0.1:8642/v1", model: "hermes-agent", messages, zdr: true })).toEqual({ model: "hermes-agent", messages, stream: true, max_tokens: 400 });
});

test("the model is told what it is, and when the model before it was another", () => {
  expect(identityNotice("https://openrouter.ai/api/v1", "nousresearch/hermes-4-70b")).toBe('You are running as the model "nousresearch/hermes-4-70b", served through openrouter.ai. If you are asked which model or AI you are, say exactly that.');
  expect(identityNotice("http://127.0.0.1:8642/v1", "hermes-agent", "qwen/qwen3.7-flash")).toContain('served through 127.0.0.1:8642.');
  expect(identityNotice("http://127.0.0.1:8642/v1", "hermes-agent", "qwen/qwen3.7-flash")).toContain('written by a different model, "qwen/qwen3.7-flash"');
  expect(identityNotice("https://openrouter.ai/api/v1", "m", "m")).not.toContain("different model");
});

// ---- Hermes Agent and other backends

import { streamChat, unreachable } from "../../src/llm.ts";
import { DEFAULTS, guessBackend, switchBackend } from "../../src/settings.ts";

const sse = (text: string) => new Response(new Blob([text]).stream(), { status: 200, headers: { "content-type": "text/event-stream" } });
const chunk = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
async function collect(o: Partial<Parameters<typeof streamChat>[0]> & { baseUrl: string }): Promise<string> {
  let out = "";
  for await (const d of streamChat({ apiKey: "k", model: "hermes-agent", messages: [], ...o })) out += d;
  return out;
}

test("a Hermes stream: tool progress is reported, not spoken, and keepalives are skipped", async () => {
  const real = globalThis.fetch;
  const sent: Record<string, string>[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(init.headers as Record<string, string>);
    return sse(chunk("Let me look. ") + `event: hermes.tool.progress\ndata: ${JSON.stringify({ tool: "web_search", choices: [{ delta: { content: "NOT SPOKEN" } }] })}\n\n` + ": keepalive\n\n" + chunk("It is sunny.") + "data: [DONE]\n\n");
  }) as typeof fetch;
  try {
    const tools: string[] = [];
    expect(await collect({ baseUrl: "http://127.0.0.1:8642/v1", hermesSession: "abc", onTool: (n) => tools.push(n) })).toBe("Let me look. It is sunny.");
    expect(tools).toEqual(["web_search"]);
    expect(sent[0]["X-Hermes-Session-Id"]).toBe("abc");
    // no session, no header: other servers refuse requests with headers they don't know
    await collect({ baseUrl: "http://127.0.0.1:11434/v1" });
    expect("X-Hermes-Session-Id" in sent[1]).toBe(false);
  } finally {
    globalThis.fetch = real;
  }
});

test("a Hermes that refuses the session header is asked again without it, and not sent it after", async () => {
  const real = globalThis.fetch;
  const withHeader: boolean[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const has = "X-Hermes-Session-Id" in (init.headers as Record<string, string>);
    withHeader.push(has);
    if (has) throw new TypeError("Failed to fetch"); // what a refused preflight looks like to a page
    return sse(chunk("Hello.") + "data: [DONE]\n\n");
  }) as typeof fetch;
  try {
    const o = { baseUrl: "http://127.0.0.1:9999/v1", hermesSession: "abc" };
    expect(await collect(o)).toBe("Hello.");
    expect(await collect(o)).toBe("Hello.");
    expect(withHeader).toEqual([true, false, false]);
  } finally {
    globalThis.fetch = real;
  }
});

test("a server that can't be reached is explained, by the likely cause", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  try {
    await expect(collect({ baseUrl: "http://127.0.0.1:8643/v1", hermesSession: "abc" })).rejects.toThrow(/Couldn't reach Hermes at 127\.0\.0\.1:8643/);
  } finally {
    globalThis.fetch = real;
  }
  const page = { origin: "https://www.example.com", protocol: "https:" };
  expect(unreachable("http://127.0.0.1:8642/v1", page, true)).toContain("API_SERVER_CORS_ORIGINS includes https://www.example.com");
  expect(unreachable("http://127.0.0.1:8642/v1", page, true)).toContain("from a phone");
  expect(unreachable("http://192.168.1.20:8642/v1", page, true)).toContain("plain HTTP on another machine");
  expect(unreachable("https://box.tail1234.ts.net/v1", page, true)).not.toContain("from a phone");
  expect(unreachable("https://api.example.com/v1", page, false)).toContain("(CORS)");
  expect(unreachable("nonsense", page, false)).toContain("not an address");
});

test("switching backend puts the connection away and brings the other back", () => {
  const a = { ...DEFAULTS, apiKey: "sk-or-1", model: "qwen/qwen3.7-flash" };
  const h = switchBackend(a, "hermes");
  expect([h.backend, h.baseUrl, h.model, h.apiKey]).toEqual(["hermes", "http://127.0.0.1:8642/v1", "hermes-agent", ""]);
  const back = switchBackend({ ...h, apiKey: "hermes-key", baseUrl: "https://box.ts.net/v1" }, "openrouter");
  expect([back.backend, back.baseUrl, back.model, back.apiKey]).toEqual(["openrouter", "https://openrouter.ai/api/v1", "qwen/qwen3.7-flash", "sk-or-1"]);
  expect(switchBackend(back, "hermes").apiKey).toBe("hermes-key");
  expect(switchBackend(back, "hermes").baseUrl).toBe("https://box.ts.net/v1");
  expect(switchBackend(a, "openrouter")).toBe(a);
});

test("settings from before the choice existed are placed by their endpoint", () => {
  expect(guessBackend("https://openrouter.ai/api/v1")).toBe("openrouter");
  expect(guessBackend("http://127.0.0.1:8642/v1")).toBe("hermes");
  expect(guessBackend("http://localhost:11434/v1")).toBe("custom");
});
