import { expect, test } from "bun:test";
import { extraHeaders } from "../../src/llm.ts";

test("the attribution header goes to OpenRouter and nowhere else", () => {
  expect(extraHeaders("https://openrouter.ai/api/v1")).toEqual({ "X-Title": "Chimera Voice Chat" });
  expect(extraHeaders("http://127.0.0.1:8642/v1")).toEqual({});
  expect(extraHeaders("https://hermes.example.ts.net/v1")).toEqual({});
  expect(extraHeaders("https://openrouter.ai.evil.example/v1")).toEqual({});
  expect(extraHeaders("not a url")).toEqual({});
});
