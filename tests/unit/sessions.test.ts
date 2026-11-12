import { expect, test } from "bun:test";
import { HermesError, conversationName, conversationTurns, deleteConversation, hermesRoot, listConversations, renameConversation, startConversation, when } from "../../src/sessions.ts";

/** Hermes's sessions API, answering as v0.23.1 does (gateway/platforms/api_server.py) */
function withHermes(answer: (method: string, url: URL, body: unknown) => Response): { calls: { method: string; url: string; auth: string; body: unknown }[]; done: () => void } {
  const real = globalThis.fetch;
  const calls: { method: string; url: string; auth: string; body: unknown }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET", body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, auth: (init.headers as Record<string, string>).Authorization, body });
    return answer(method, new URL(url), body);
  }) as typeof fetch;
  return { calls, done: () => (globalThis.fetch = real) };
}

const session = { id: "api_1752000000_ab12cd34", source: "api_server", title: null, started_at: 1752000000.5, last_active: 1752000300.25, preview: "what is the weather in Paris this weekend and the next", message_count: 4 };

test("the REST root is the endpoint without its /v1", () => {
  expect(hermesRoot("https://hermes.tail1234.ts.net/v1")).toBe("https://hermes.tail1234.ts.net");
  expect(hermesRoot("http://127.0.0.1:8642/v1/")).toBe("http://127.0.0.1:8642");
});

test("conversations are listed from the sessions the API server owns, newest first as Hermes gives them", async () => {
  const h = withHermes(() => Response.json({ object: "list", data: [session, { ...session, id: "api_2", title: "Trip plans" }], limit: 50, offset: 0, has_more: false }));
  try {
    const list = await listConversations("https://hermes.tail1234.ts.net/v1", "key");
    expect(h.calls[0]).toMatchObject({ method: "GET", url: "https://hermes.tail1234.ts.net/api/sessions?source=api_server&limit=50", auth: "Bearer key" });
    expect(list).toEqual([
      { id: "api_1752000000_ab12cd34", title: null, preview: session.preview, at: 1752000300.25 },
      { id: "api_2", title: "Trip plans", preview: session.preview, at: 1752000300.25 },
    ]);
    expect(list.map(conversationName)).toEqual(["what is the weather in Paris this weekend…", "Trip plans"]);
  } finally {
    h.done();
  }
});

test("starting, renaming and deleting a conversation", async () => {
  const h = withHermes((method, _url, body) =>
    method === "DELETE" ? Response.json({ object: "hermes.session.deleted", id: "api_9", deleted: true }) : Response.json({ object: "hermes.session", session: { id: "api_9", source: "api_server", started_at: 1752000000, ...(body as object) } }, { status: method === "POST" ? 201 : 200 }),
  );
  try {
    const started = await startConversation("http://127.0.0.1:8642/v1", "key");
    expect(started).toEqual({ id: "api_9", title: null, preview: "", at: 1752000000 });
    expect(h.calls[0]).toMatchObject({ method: "POST", url: "http://127.0.0.1:8642/api/sessions", body: {} });
    expect((await renameConversation("http://127.0.0.1:8642/v1", "key", "api_9", "Weather")).title).toBe("Weather");
    expect(h.calls[1]).toMatchObject({ method: "PATCH", url: "http://127.0.0.1:8642/api/sessions/api_9", body: { title: "Weather" } });
    await deleteConversation("http://127.0.0.1:8642/v1", "key", "api_9");
    expect(h.calls[2]).toMatchObject({ method: "DELETE", url: "http://127.0.0.1:8642/api/sessions/api_9" });
  } finally {
    h.done();
  }
});

test("a conversation's turns are what was said: no tool calls, tool results or hidden rows", async () => {
  const h = withHermes(() =>
    Response.json({
      object: "list",
      session_id: "api_1",
      data: [
        { id: 1, role: "user", content: "what is the weather", timestamp: 1 },
        { id: 2, role: "assistant", content: "", tool_calls: [{ id: "call_1" }], timestamp: 2 },
        { id: 3, role: "tool", content: '{"result": "sunny"}', tool_call_id: "call_1", timestamp: 3 },
        { id: 4, role: "assistant", content: "[happy] It is *sunny*.", timestamp: 4 },
        { id: 5, role: "assistant", content: "", display_kind: "hidden", timestamp: 5 },
      ],
      pagination: { limit: 500, offset: 0, order: "latest", returned: 5 },
    }),
  );
  try {
    expect(await conversationTurns("http://127.0.0.1:8642/v1", "key", "api_1")).toEqual([
      { role: "user", content: "what is the weather" },
      { role: "assistant", content: "[happy] It is *sunny*." },
    ]);
    expect(h.calls[0].url).toBe("http://127.0.0.1:8642/api/sessions/api_1/messages");
  } finally {
    h.done();
  }
});

test("Hermes's refusals keep their status and message", async () => {
  const h = withHermes(() => Response.json({ error: { message: "Session not found: api_gone", type: "invalid_request_error", code: "session_not_found" } }, { status: 404 }));
  try {
    const err = await conversationTurns("http://127.0.0.1:8642/v1", "key", "api_gone").catch((e) => e);
    expect(err).toBeInstanceOf(HermesError);
    expect(err.status).toBe(404);
    expect(err.message).toContain("Session not found: api_gone");
  } finally {
    h.done();
  }
});

test("a conversation without a title or words is a new one; times read as people say them", () => {
  expect(conversationName({ id: "a", title: null, preview: "  ", at: 0 })).toBe("New conversation");
  expect(conversationName({ id: "a", title: null, preview: "hello there", at: 0 })).toBe("hello there");
  const now = new Date(2026, 10, 12, 15, 0);
  expect(when(now.getTime() / 1000 - 20, now)).toBe("just now");
  expect(when(new Date(2026, 10, 11, 9, 0).getTime() / 1000, now)).toBe("yesterday");
  expect(when(new Date(2026, 10, 12, 9, 5).getTime() / 1000, now)).toMatch(/9.05/);
  expect(when(0, now)).toBe("");
});
