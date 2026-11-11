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
