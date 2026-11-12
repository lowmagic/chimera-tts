import { expect, test } from "bun:test";
import { DEFAULTS, loadDeploy, parseDeploy, settingsFrom, switchBackend } from "../../src/settings.ts";

const PAGE = "https://hermes.tail1234.ts.net/";
const deploy = { backend: "hermes" as const, baseUrl: "https://hermes.tail1234.ts.net/v1" };

test("deploy.json names a backend and an endpoint; a relative endpoint is on the page's own address", () => {
  expect(parseDeploy({ backend: "hermes", baseUrl: "/v1" }, PAGE)).toEqual(deploy);
  expect(parseDeploy({ backend: "custom", baseUrl: "http://127.0.0.1:11434/v1" }, PAGE)).toEqual({ backend: "custom", baseUrl: "http://127.0.0.1:11434/v1" });
  for (const bad of [null, "hermes", [], {}, { backend: "hermes" }, { backend: "toString", baseUrl: "/v1" }, { backend: "hermes", baseUrl: 5 }]) expect(parseDeploy(bad, PAGE)).toBeNull();
});

test("with deploy.json and nothing saved, its backend and endpoint are the defaults; the key is still the owner's", () => {
  const s = settingsFrom({}, deploy);
  expect([s.backend, s.baseUrl, s.model, s.apiKey]).toEqual(["hermes", "https://hermes.tail1234.ts.net/v1", "hermes-agent", ""]);
  // other saved settings don't make it the owner's choice of backend
  const keyed = settingsFrom({ apiKey: "hermes-key", handsFree: false }, deploy);
  expect([keyed.backend, keyed.baseUrl, keyed.apiKey, keyed.handsFree]).toEqual(["hermes", deploy.baseUrl, "hermes-key", false]);
});

test("what the owner saved wins over deploy.json", () => {
  const saved = { ...DEFAULTS, apiKey: "sk-or-1" }; // Settings saves everything, OpenRouter here
  expect(settingsFrom(saved, deploy)).toEqual(saved);
  // saved before there was a choice of backend: placed by its endpoint, as without deploy.json
  expect(settingsFrom({ baseUrl: "https://openrouter.ai/api/v1" }, deploy).backend).toBe("openrouter");
  // switching to the deployment's backend starts at its endpoint, not the usual one
  expect(switchBackend(saved, "hermes", deploy).baseUrl).toBe(deploy.baseUrl);
  expect(switchBackend(saved, "hermes").baseUrl).toBe("http://127.0.0.1:8642/v1");
});

test("without deploy.json nothing changes", () => {
  expect(settingsFrom({}, null)).toEqual(DEFAULTS);
  expect(settingsFrom({ apiKey: "sk-or-1" }, null)).toEqual({ ...DEFAULTS, apiKey: "sk-or-1" });
  expect(settingsFrom({ baseUrl: "http://127.0.0.1:8642/v1" }, null).backend).toBe("hermes");
});

test("the site's deploy.json is read if it is there, and anything else is no deploy.json", async () => {
  const real = globalThis.fetch;
  const answers: (() => Response)[] = [
    () => Response.json({ backend: "hermes", baseUrl: "/v1" }),
    () => new Response("Not found", { status: 404 }), // GitHub Pages
    () => new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html" } }), // a server answering every path with index.html
    () => {
      throw new TypeError("Failed to fetch");
    },
  ];
  try {
    const found = [];
    for (const answer of answers) {
      globalThis.fetch = (async () => answer()) as unknown as typeof fetch;
      found.push(await loadDeploy("./deploy.json", PAGE));
    }
    expect(found).toEqual([deploy, null, null, null]);
  } finally {
    globalThis.fetch = real;
  }
});
