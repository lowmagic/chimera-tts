// End-to-end check of the built app in headless Chromium: `bun run build`, then `bun run e2e`.
// The model endpoint is mocked (a streamed reply in small pieces) and the browser's speech
// recognizer is replaced with a fake that "hears" one sentence, so no network or microphone is used.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Playwright is not a dependency of this repo: install it (with Chromium) yourself, locally or
// globally (require also looks in NODE_PATH, which an ESM import does not).
const { chromium } = createRequire(import.meta.url)("playwright");

const URL = "http://127.0.0.1:5328/";
// as a model writes when asked for the marks: a mood tag, one stressed word
const REPLY = "[happy] Hello there, this is the *first* sentence of the reply. And here is a second one, with 2 numbers & a symbol!";
const SHOWN = "Hello there, this is the first sentence of the reply. And here is a second one, with 2 numbers & a symbol!";
const HEARD = "what is the capital of Australia";

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};
const check = (ok, msg) => (ok ? console.log("ok  ", msg) : fail(msg));

/** A 16-bit mono WAV of `secs` seconds; `sample(t)` gives each sample in -1..1. */
function writeWav(file, secs, sample, rate = 48000) {
  const n = Math.round(secs * rate), buf = Buffer.alloc(44 + 2 * n);
  buf.write("RIFF", 0), buf.writeUInt32LE(36 + 2 * n, 4), buf.write("WAVEfmt ", 8), buf.writeUInt32LE(16, 16), buf.writeUInt16LE(1, 20), buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24), buf.writeUInt32LE(2 * rate, 28), buf.writeUInt16LE(2, 32), buf.writeUInt16LE(16, 34), buf.write("data", 36), buf.writeUInt32LE(2 * n, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, sample(i / rate)))), 44 + 2 * i);
  writeFileSync(file, buf);
}
/** a voice-like buzz: a 140 Hz pulse train's first harmonics, in syllables */
const buzz = (t) => 0.5 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t)) * [1, 2, 3, 4, 5, 6].reduce((s, k) => s + Math.sin(2 * Math.PI * 140 * k * t) / k, 0) * 0.4;
const hiss = () => (Math.random() - 0.5) * 0.004;

/**
 * A site that has a trained pitch model (here the tests' tiny random one): the page loads it,
 * offers the switch, and speaks with it.
 */
async function withTrainedModel(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const fixture = (name) => readFileSync(join(import.meta.dirname, "fixtures", name));
  await page.route("**/models/prosody.json", (route) => route.fulfill({ contentType: "application/json", body: fixture("prosody-tiny.json") }));
  await page.route("**/models/prosody.bin", (route) => route.fulfill({ contentType: "application/octet-stream", body: fixture("prosody-tiny.bin") }));
  await page.route("https://openrouter.ai/api/v1/**", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ choices: [{ delta: { content: "Well, that depends. Do you *really* want to know?" } }] })}\n\ndata: [DONE]\n\n` }));
  await page.addInitScript(() => localStorage.setItem("chimera-voice-chat:settings", JSON.stringify({ apiKey: "sk-test", handsFree: false, showHead: false })));
  await page.goto(URL);
  await page.waitForFunction(() => window.chimeraVoiceChat?.state() === "idle", null, { timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById("trained-row").hidden, null, { timeout: 5000 });
  check(await page.evaluate(() => window.chimeraVoiceChat.voice.settings.model != null), "a site with a trained pitch model loads it and uses it");
  await page.evaluate(() => {
    window.pitches = [];
    setInterval(() => {
      const f0 = window.chimeraVoiceChat.pitch();
      if (f0) window.pitches.push(f0);
    }, 20);
  });
  await page.fill("#text", "tell me");
  await page.press("#text", "Enter");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "speaking", null, { timeout: 15000 });
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "idle", null, { timeout: 60000 });
  const pitches = await page.evaluate(() => window.pitches);
  check(pitches.length >= 5 && pitches.every((f) => f > 50 && f < 300), `the voice speaks with the model's pitch (${pitches.length} readings, ${Math.min(...pitches).toFixed(0)} to ${Math.max(...pitches).toFixed(0)} Hz)`);
  await page.click("#open-settings");
  await page.uncheck('input[name="trainedPitch"]');
  check(await page.evaluate(() => window.chimeraVoiceChat.voice.settings.model == null), "and the switch in settings goes back to the rules");
  check(errors.length === 0, `no page errors with a trained model${errors.length ? ": " + errors.join(" | ") : ""}`);
  await page.close();
}

/**
 * A stand-in for Hermes Agent's API server, written from v0.23.1's source and docs (not a real
 * Hermes): sessions kept in memory, and chat turns that take the earlier turns from the session
 * X-Hermes-Session-Id names, then add the new turn, the tool call and the reply to it. Each reply
 * runs a tool first, reported as Hermes does: `running` with a label, then `completed`.
 */
function standInHermes(seed = []) {
  const sessions = new Map(seed.map((s) => [s.id, s]));
  const chats = [];
  let made = 0;
  const listed = (s) => ({ id: s.id, source: s.source, title: s.title, started_at: s.started_at, last_active: s.last_active, preview: s.messages.find((m) => m.role === "user")?.content ?? "", message_count: s.messages.length });
  async function handle(route, headers = {}) {
    const req = route.request(), method = req.method(), path = new globalThis.URL(req.url()).pathname;
    const json = (body, status = 200) => route.fulfill({ status, headers, json: body });
    if (req.headers().authorization !== "Bearer hermes-key") return json({ error: { message: "Invalid API key" } }, 401);
    if (path.endsWith("/v1/models")) return json({ data: [{ id: "hermes-agent" }] });
    if (path.endsWith("/v1/chat/completions")) {
      const body = req.postDataJSON(), id = req.headers()["x-hermes-session-id"];
      chats.push({ headers: req.headers(), body });
      const s = sessions.get(id);
      if (!s) return json({ error: { message: `Session not found: ${id}`, code: "not_found" } }, 404);
      // history comes from the session; of the request only the system prompt and the last turn count
      const turn = body.messages.at(-1).content, at = Date.now() / 1000;
      s.messages.push({ role: "user", content: turn, timestamp: at }, { role: "assistant", content: "", tool_calls: [{ id: `call_${chats.length}` }], timestamp: at }, { role: "tool", content: "{}", tool_call_id: `call_${chats.length}`, timestamp: at }, { role: "assistant", content: "[happy] It is *sunny*.", timestamp: at });
      s.last_active = at;
      const tool = (o) => `event: hermes.tool.progress\ndata: ${JSON.stringify({ tool: "web_search", toolCallId: `call_${chats.length}`, ...o })}\n\n`;
      return route.fulfill({ status: 200, headers: { ...headers, "x-hermes-session-id": id }, contentType: "text/event-stream", body: tool({ emoji: "🔍", label: "weather in Paris", status: "running" }) + ": keepalive\n\n" + tool({ status: "completed" }) + `data: ${JSON.stringify({ choices: [{ delta: { content: "[happy] It is *sunny*." } }] })}\n\ndata: [DONE]\n\n` });
    }
    const [, id, messages] = path.match(/\/api\/sessions(?:\/([^/]+))?(\/messages)?$/) ?? [];
    if (!id && method === "GET") return json({ object: "list", data: [...sessions.values()].sort((a, b) => b.last_active - a.last_active).map(listed), limit: 50, offset: 0, has_more: false });
    if (!id && method === "POST") {
      const s = { id: `api_${Math.floor(Date.now() / 1000)}_${++made}`, source: "api_server", title: null, started_at: Date.now() / 1000, last_active: Date.now() / 1000, messages: [] };
      sessions.set(s.id, s);
      return json({ object: "hermes.session", session: listed(s) }, 201);
    }
    const s = sessions.get(decodeURIComponent(id ?? ""));
    if (!s) return json({ error: { message: `Session not found: ${id}`, code: "session_not_found" } }, 404);
    if (messages) return json({ object: "list", session_id: s.id, data: s.messages.map((m, i) => ({ id: i + 1, session_id: s.id, ...m })) });
    if (method === "PATCH") {
      s.title = req.postDataJSON().title;
      return json({ object: "hermes.session", session: listed(s) });
    }
    if (method === "DELETE") {
      sessions.delete(s.id);
      return json({ object: "hermes.session.deleted", id: s.id, deleted: true });
    }
    return json({ object: "hermes.session", session: listed(s) });
  }
  return { sessions, chats, handle };
}

/** Every text the status line shows, collected in the page (a tool's label can come and go in one go). */
const watchStatus = (page) =>
  page.evaluate(() => {
    window.statuses = [];
    new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => window.statuses.push(n.textContent)))).observe(document.getElementById("status"), { childList: true });
  });

/** Choosing Hermes Agent in Settings: its own endpoint and key, a conversation kept by Hermes, tool use shown. */
async function withHermes(browser) {
  const page = await browser.newPage();
  const hermes = standInHermes();
  await page.route("http://127.0.0.1:8642/**", (route) => hermes.handle(route, { "access-control-allow-origin": "*" }));
  await page.addInitScript(() => localStorage.getItem("chimera-voice-chat:settings") ?? localStorage.setItem("chimera-voice-chat:settings", JSON.stringify({ apiKey: "sk-or-key", handsFree: false, showHead: false })));
  await page.goto(URL);
  await page.waitForFunction(() => window.chimeraVoiceChat?.state() === "idle", null, { timeout: 30000 });
  check(await page.locator("#open-chats").isHidden(), "with OpenRouter there is no list of conversations");
  await page.click("#open-settings");
  await page.selectOption('select[name="backend"]', "hermes");
  check((await page.inputValue('input[name="baseUrl"]')) === "http://127.0.0.1:8642/v1" && (await page.inputValue('input[name="model"]')) === "hermes-agent" && (await page.inputValue('input[name="apiKey"]')) === "", "choosing Hermes Agent fills in its endpoint and model, with a key of its own");
  check((await page.locator("#backend-hint").textContent()).includes("API_SERVER_CORS_ORIGINS=http://127.0.0.1:5328") && (await page.locator("#zdr-row").isHidden()), "and says what Hermes needs to allow this site");
  await page.fill('input[name="apiKey"]', "hermes-key");
  await page.keyboard.press("Escape");
  await watchStatus(page);
  await page.fill("#text", "what is the weather");
  await page.press("#text", "Enter");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "idle" && document.querySelectorAll(".msg.assistant").length === 1, null, { timeout: 60000 });
  const [id] = hermes.sessions.keys();
  const first = hermes.chats[0] ?? { headers: {}, body: {} };
  check(hermes.sessions.size === 1 && first.headers.authorization === "Bearer hermes-key" && first.headers["x-hermes-session-id"] === id && first.body.provider === undefined, "the first turn starts a conversation in Hermes, and the request names it, with Hermes's key and without OpenRouter's fields");
  check((await page.locator(".msg.assistant").textContent()) === "It is sunny.", "the agent's reply is shown, and its tool use is not");
  const statuses = await page.evaluate(() => window.statuses);
  const shown = statuses.filter((s) => s.includes("weather in Paris"));
  check(shown.length === 1 && shown[0] === "🔍 web_search: weather in Paris…" && statuses[statuses.indexOf(shown[0]) + 1] === "thinking…" && !(await page.locator("#status").textContent()).includes("Paris"), `a running tool shows what it is doing, once, and goes when it has finished (${statuses.join(" → ")})`);
  await page.fill("#text", "and tomorrow");
  await page.press("#text", "Enter");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "idle" && document.querySelectorAll(".msg.assistant").length === 2, null, { timeout: 60000 });
  const second = hermes.chats[1] ?? { headers: {}, body: { messages: [] } };
  check(second.headers["x-hermes-session-id"] === id && hermes.sessions.size === 1, "the next turn is the same conversation");
  check(second.body.messages.length === 2 && second.body.messages[0].role === "system" && second.body.messages[1].content === "and tomorrow", "and carries only the new turn: Hermes has the earlier ones");
  check(hermes.sessions.get(id).messages.filter((m) => m.role === "user").length === 2, "so Hermes holds each turn once");
  await page.click("#open-settings");
  await page.selectOption('select[name="backend"]', "openrouter");
  check((await page.inputValue('input[name="apiKey"]')) === "sk-or-key" && (await page.inputValue('input[name="baseUrl"]')) === "https://openrouter.ai/api/v1", "switching back to OpenRouter brings its key back");
  await page.close();
}

/**
 * Served from Hermes's own address, as on the NAS: deploy.json makes Hermes (at /v1 on the same
 * address) the default, conversations are listed, opened, carried on, renamed and deleted, and
 * another device, or this one reopened, continues them.
 */
async function fromHermes(browser) {
  const at = Date.now() / 1000 - 3600;
  const hermes = standInHermes([
    { id: "api_old", source: "api_server", title: null, started_at: at, last_active: at, messages: [{ role: "user", content: "what should I cook tonight", timestamp: at }, { role: "assistant", content: "[excited] Try a *mushroom* risotto.", timestamp: at }] },
  ]);
  const context = await browser.newContext(); // one device; the stand-in's sessions are shared by all
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/deploy.json", (route) => route.fulfill({ json: { backend: "hermes", baseUrl: "/v1" } }));
  await page.route(/^http:\/\/127\.0\.0\.1:5328\/(v1|api)\//, (route) => hermes.handle(route)); // same address: no CORS
  await page.addInitScript(() => localStorage.getItem("chimera-voice-chat:settings") ?? localStorage.setItem("chimera-voice-chat:settings", JSON.stringify({ apiKey: "hermes-key", handsFree: false, showHead: false })));
  await page.goto(URL);
  await page.waitForFunction(() => window.chimeraVoiceChat?.state() === "idle", null, { timeout: 30000 });
  await page.click("#open-settings");
  check((await page.inputValue('select[name="backend"]')) === "hermes" && (await page.inputValue('input[name="baseUrl"]')) === "http://127.0.0.1:5328/v1", "deploy.json makes Hermes at this site's own /v1 the default");
  check(!(await page.locator("#backend-hint").textContent()).includes("CORS"), "and Settings asks only for the key, no CORS origin");
  await page.keyboard.press("Escape");

  await page.click("#open-chats");
  await page.waitForFunction(() => document.querySelectorAll("#chat-list li").length === 1);
  check((await page.locator("#chat-list li .open span").textContent()) === "what should I cook tonight" && (await page.locator("#chat-list li .open small").textContent()) !== "", "the conversations are listed by their first words, with when");
  await page.click("#chat-list li .open");
  await page.waitForFunction(() => document.querySelectorAll(".msg.assistant").length === 1);
  check((await page.locator(".msg.user").textContent()) === "what should I cook tonight" && (await page.locator(".msg.assistant").textContent()) === "Try a mushroom risotto.", "opening one shows its earlier turns, from another device");
  await page.fill("#text", "how long does it take");
  await page.press("#text", "Enter");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "idle" && document.querySelectorAll(".msg.assistant").length === 2, null, { timeout: 60000 });
  const turn = hermes.chats[0] ?? { headers: {}, body: { messages: [] } };
  check(turn.headers["x-hermes-session-id"] === "api_old" && turn.body.messages.length === 2 && turn.body.messages[1].content === "how long does it take", "carrying it on names it, and sends only the new turn");
  check(hermes.sessions.get("api_old").messages.filter((m) => m.role === "user").length === 2 && hermes.sessions.size === 1, "and the turn is added to that conversation, once");

  await page.click("#open-chats");
  await page.waitForFunction(() => document.querySelectorAll("#chat-list li").length === 1);
  await page.click("#chat-list li button:text('Rename')");
  await page.fill("#chat-list li input", "Risotto");
  await page.press("#chat-list li input", "Enter");
  await page.waitForFunction(() => document.querySelector("#chat-list li .open span")?.textContent === "Risotto");
  check(hermes.sessions.get("api_old").title === "Risotto" && (await page.locator("#chats").evaluate((d) => d.open)), "renaming one renames it in Hermes, and the list stays open");
  await page.keyboard.press("Escape");

  await page.reload();
  await page.waitForFunction(() => window.chimeraVoiceChat?.state() === "idle" && document.querySelectorAll(".msg.assistant").length === 2, null, { timeout: 30000 });
  check((await page.locator(".msg.user").allTextContents()).join(" | ") === "what should I cook tonight | how long does it take", "reopened, the app carries on with the conversation it had open");

  await page.click("#open-chats");
  await page.click("#new-chat");
  check((await page.locator(".msg").count()) === 0, "a new conversation starts empty");
  await page.fill("#text", "hello");
  await page.press("#text", "Enter");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "idle" && document.querySelectorAll(".msg.assistant").length === 1, null, { timeout: 60000 });
  const fresh = [...hermes.sessions.keys()].find((id) => id !== "api_old");
  check(!!fresh && hermes.chats.at(-1)?.headers["x-hermes-session-id"] === fresh && hermes.chats.at(-1)?.body.messages.length === 2, "and its first turn starts it in Hermes");

  await page.click("#open-chats");
  await page.waitForFunction(() => document.querySelectorAll("#chat-list li").length === 2);
  check((await page.locator("#chat-list li:first-child.current .open span").textContent({ timeout: 2000 }).catch(() => "")) === "hello", "the list marks the open conversation, newest first");
  const old = page.locator("#chat-list li", { hasText: "Risotto" });
  await old.locator("button", { hasText: "Delete" }).click();
  check(hermes.sessions.has("api_old"), "deleting asks once more first");
  await old.locator("button", { hasText: "Delete it?" }).click();
  await page.waitForFunction(() => document.querySelectorAll("#chat-list li").length === 1);
  check(!hermes.sessions.has("api_old"), "and then deletes it from Hermes");
  check(errors.length === 0, `no page errors served from Hermes${errors.length ? ": " + errors.join(" | ") : ""}`);
  await context.close();
}

/**
 * Talking over the voice: Chromium's fake microphone plays a WAV. With `talkAt` seconds of quiet
 * and then a voice, the reply must stop about then; with only quiet, it must play to its end.
 */
async function talkOver(talkAt) {
  const wav = join(tmp, talkAt === null ? "quiet.wav" : "talk.wav");
  writeWav(wav, 30, (t) => (talkAt !== null && t >= talkAt ? buzz(t) : hiss()));
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}%noloop`] });
  try {
    const page = await browser.newPage();
    // four different sentences, all arriving at once: each must be said, one after another
    const long = "This is a long reply that keeps going for a good while. Here comes the second sentence of the four. The third one follows it without any hurry. And the fourth sentence is the last of them.";
    await page.route("https://openrouter.ai/api/v1/**", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ choices: [{ delta: { content: long } }] })}\n\ndata: [DONE]\n\n` }));
    await page.addInitScript(() => {
      localStorage.setItem("chimera-voice-chat:settings", JSON.stringify({ apiKey: "sk-test", handsFree: false, showHead: false }));
      let turn = 0; // hears a question on the first turn; after the interruption, nothing
      window.SpeechRecognition = class {
        start() {
          if (turn++ === 0) setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: "go on" }], { isFinal: true })] }), 100);
          else window.listenedAgain = true;
          setTimeout(() => this.onend?.(), 200);
        }
        stop() {}
        abort() {}
      };
    });
    await page.goto(URL);
    await page.waitForFunction(() => window.chimeraVoiceChat?.state() === "idle", null, { timeout: 30000 });
    await page.click("#mic");
    await page.waitForFunction(() => window.chimeraVoiceChat.state() === "speaking", null, { timeout: 15000 });
    const t0 = Date.now();
    await page.waitForFunction(() => window.chimeraVoiceChat.state() !== "speaking", null, { timeout: 60000 });
    const secs = (Date.now() - t0) / 1000;
    const listened = await page.evaluate(() => !!window.listenedAgain);
    if (talkAt === null) check(!listened && secs > 9, `a quiet microphone lets all four sentences of the reply finish (${secs.toFixed(1)} s)`);
    else {
      // the fake microphone starts its file when the page opens it, a moment into the reply
      check(listened && secs > talkAt && secs < talkAt + 2, `talking over the voice ${talkAt} s in stops it and listens (stopped after ${secs.toFixed(1)} s)`);
      await page.waitForTimeout(300);
      const level = await page.evaluate(() => window.chimeraVoiceChat.voice.level());
      check(level < 0.005, `and the voice is silent (level ${level.toFixed(4)})`);
    }
  } finally {
    await browser.close();
  }
}

const tmp = mkdtempSync(join(tmpdir(), "chimera-e2e-"));
const server = spawn("node_modules/.bin/vite", ["preview"], { stdio: "ignore" });
const browser = await chromium.launch();
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(URL)).ok) break;
    } catch {}
    if (i > 50) throw new Error("vite preview did not start");
    await new Promise((r) => setTimeout(r, 200));
  }
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const requests = [];
  await page.route("https://openrouter.ai/api/v1/**", async (route) => {
    const req = route.request();
    if (req.url().endsWith("/models")) return route.fulfill({ json: { data: [{ id: "test/model-a" }, { id: "test/model-b" }] } });
    requests.push({ auth: req.headers().authorization, body: req.postDataJSON() });
    const pieces = REPLY.match(/.{1,7}/gs);
    const sse = ": OPENROUTER PROCESSING\n\n" + pieces.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join("") + "data: [DONE]\n\n";
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse });
  });
  await page.addInitScript((heard) => {
    localStorage.setItem("chimera-voice-chat:settings", JSON.stringify({ apiKey: "sk-test", handsFree: false }));
    let heardOnce = false; // the fake hears its sentence the first time, and silence after that
    window.SpeechRecognition = class {
      start() {
        if (!heardOnce) setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: heard }], { isFinal: true })] }), 150);
        heardOnce = true;
        setTimeout(() => this.onend?.(), 250);
      }
      stop() {}
      abort() {}
    };
  }, HEARD);

  await page.goto(URL);
  await page.waitForFunction(() => window.chimeraVoiceChat?.state() === "idle", null, { timeout: 30000 });
  check(true, "engine and dictionary loaded");
  // the default endpoint is OpenRouter's: the requests below go there
  check(await page.locator("#open-chats").isHidden(), "without deploy.json (as on GitHub Pages) the defaults are as before: OpenRouter, no list of conversations");

  // every word the caption lights, collected in the page (polling from here misses most of them)
  await page.evaluate(() => {
    window.litWords = [];
    window.pitches = [];
    setInterval(() => {
      const f0 = window.chimeraVoiceChat.pitch();
      if (f0) window.pitches.push(f0);
    }, 20);
    new MutationObserver(() => {
      const w = document.querySelector("#caption .now")?.textContent;
      if (w && window.litWords.at(-1) !== w) window.litWords.push(w);
    }).observe(document.getElementById("caption"), { childList: true, subtree: true });
  });

  // a spoken turn
  await page.click("#mic");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "speaking", null, { timeout: 15000 });
  check((await page.locator(".msg.user").first().textContent()) === HEARD, "the heard sentence became the user's message");
  check(requests[0]?.auth === "Bearer sk-test", "the request carries the API key");
  const sent = requests[0]?.body ?? {};
  check(sent.stream === true && sent.messages?.[0]?.role === "system" && sent.messages?.at(-1)?.content === HEARD, "the request is a streamed chat with the system prompt and the user's words");

  // while it speaks: sound comes out and the caption walks through the words
  let peak = 0;
  const captions = new Set();
  const t0 = Date.now();
  while ((await page.evaluate(() => window.chimeraVoiceChat.state())) === "speaking") {
    if (Date.now() - t0 > 60000) throw new Error("still speaking after 60 s");
    peak = Math.max(peak, await page.evaluate(() => window.chimeraVoiceChat.voice.level()));
    captions.add((await page.locator("#caption").textContent()).trim());
    await page.waitForTimeout(40);
  }
  const secs = (Date.now() - t0) / 1000;
  check(peak > 0.01, `the voice made sound (peak level ${peak.toFixed(3)})`);
  const lit = await page.evaluate(() => window.litWords);
  const pitches = await page.evaluate(() => window.pitches);
  const spoken = "hello there this is the first sentence of the reply and here is a second one with two numbers and a symbol".split(" ");
  // headless Chromium draws the head in software at a few frames a second, so a short word ("of",
  // "a") can pass between two frames: what is lit must be the spoken words in order, nearly all of them
  let k = 0;
  const inOrder = lit.every((w) => (k = spoken.indexOf(w, k) + 1) > 0);
  check(inOrder && lit.length >= 0.8 * spoken.length, `the caption lit the words of both sentences in order (${lit.length} of ${spoken.length}: ${lit.join(" ")})`);
  check([...captions].some((c) => c.includes("two numbers and a symbol")), "numbers and symbols were spoken as words");
  check(secs > 4 && secs < 30, `speaking took a plausible ${secs.toFixed(1)} s for two sentences`);
  check((await page.locator(".msg.assistant").textContent()) === SHOWN, "the reply is shown without its mood tag and asterisks");
  check((await page.locator(".msg.assistant em").textContent()) === "first", "and its stressed word is shown in italics");
  check(/running as the model "nousresearch\/hermes-4-70b", served through openrouter\.ai/.test(sent.messages?.[0]?.content ?? ""), "the model is told which model and backend it is");
  check((await page.locator(".msg.note").first().textContent()) === "Using nousresearch/hermes-4-70b via openrouter.ai, zero data retention", "and the log says so too");
  check(sent.provider?.zdr === true && sent.provider?.data_collection === "deny" && sent.provider?.sort === "latency" && sent.reasoning?.enabled === false && sent.max_tokens === 400, "the request asks OpenRouter for zero data retention, the fastest provider and no reasoning");
  check(/\[excited\]/.test(sent.messages?.[0]?.content ?? "") && /asterisks/.test(sent.messages[0].content), "the model was asked for mood and emphasis marks");
  // few readings: headless Chromium draws the head in software and the page gets a few frames a second
  check(pitches.length >= 5 && Math.max(...pitches) / Math.min(...pitches) > 1.4, `the pitch moves over a wide range (${pitches.length} readings, ${Math.min(...pitches).toFixed(0)} to ${Math.max(...pitches).toFixed(0)} Hz)`);
  check((await page.evaluate(() => window.chimeraVoiceChat.state())) === "idle", "back to idle afterwards");
  check((await page.locator("#caption").textContent()).trim() === "", "the caption clears");

  // a typed turn, interrupted mid-speech
  await page.fill("#text", "tell me more");
  await page.press("#text", "Enter");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "speaking", null, { timeout: 15000 });
  check(requests[1]?.body.messages.length === 4, "the second request carries the conversation so far");
  check((await page.locator(".msg.note").count()) === 1, "the backend is announced once while it stays the same");
  await page.waitForTimeout(600);
  await page.click("#mic");
  await page.waitForTimeout(400);
  const level = await page.evaluate(() => window.chimeraVoiceChat.voice.level());
  const st = await page.evaluate(() => window.chimeraVoiceChat.state());
  check(st === "idle", `tapping the button stops the reply and listens, hearing nothing (state ${st})`);
  check(requests.length === 2, "nothing more was sent to the model");
  check(level < 0.005, `and the sound stops (level ${level.toFixed(4)})`);

  // the head is drawn (WebGL), and can be turned off
  const lit3d = await page.evaluate(() => {
    const c = document.querySelector("#stage canvas");
    if (!c) return 0;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
    return n / (d.length / 4);
  });
  check(lit3d > 0.01, `the head is drawn (${(100 * lit3d).toFixed(1)} % of its pixels lit)`);

  // settings: the model list is offered
  await page.click("#open-settings");
  await page.waitForFunction(() => document.querySelectorAll("#models option").length === 2);
  check(true, "settings lists the endpoint's models");
  const shipped = existsSync(join(import.meta.dirname, "..", "dist", "models", "prosody.json"));
  check((await page.locator("#trained-row").isHidden()) === !shipped, shipped ? "the site's trained pitch model is offered in settings" : "no trained pitch model on the site, so no switch for one");
  check((await page.locator("#models option").first().getAttribute("value")) === "test/model-a", "suggested models the endpoint doesn't have are not offered");
  // another model with ZDR off: the next request says so, to OpenRouter and to the model
  await page.fill('input[name="model"]', "test/model-b");
  await page.uncheck('input[name="zdr"]');
  await page.selectOption('select[name="reasoning"]', "low");
  await page.uncheck('input[name="showHead"]');
  check(await page.evaluate(() => document.getElementById("stage").hidden && !document.querySelector("#stage canvas")), "the head can be turned off");

  await page.keyboard.press("Escape");
  await page.fill("#text", "which model are you");
  await page.press("#text", "Enter");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "speaking", null, { timeout: 15000 });
  const third = requests[2]?.body ?? {};
  check(third.model === "test/model-b" && third.provider?.zdr === undefined && third.provider?.sort === "latency", "a changed model and ZDR switched off go into the next request");
  check(third.reasoning?.effort === "low" && third.max_tokens === 1900, "and so does a reasoning level, with room to think");
  check(/running as the model "test\/model-b"/.test(third.messages?.[0]?.content ?? "") && /different model, "nousresearch\/hermes-4-70b"/.test(third.messages[0].content), "the model is told it has changed");
  check((await page.locator(".msg.note").last().textContent()) === "Now using test/model-b via openrouter.ai", "and the log announces the change");
  await page.click("#mic");

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await page.screenshot({ path: "test-results/app.png" }).catch(() => {});

  await withTrainedModel(browser);
  await withHermes(browser);
  await fromHermes(browser);
  await talkOver(3);
  await talkOver(null);
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  await browser.close();
  server.kill();
}
