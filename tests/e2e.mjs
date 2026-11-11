// End-to-end check of the built app in headless Chromium: `bun run build`, then `bun run e2e`.
// The model endpoint is mocked (a streamed reply in small pieces) and the browser's speech
// recognizer is replaced with a fake that "hears" one sentence, so no network or microphone is used.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// Playwright is not a dependency of this repo: install it (with Chromium) yourself, locally or
// globally (require also looks in NODE_PATH, which an ESM import does not).
const { chromium } = createRequire(import.meta.url)("playwright");

const URL = "http://127.0.0.1:5328/";
const REPLY = "Hello there, this is the first sentence of the reply. And here is a second one, with 2 numbers & a symbol!";
const HEARD = "what is the capital of Australia";

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};
const check = (ok, msg) => (ok ? console.log("ok  ", msg) : fail(msg));

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

  // a spoken turn
  await page.click("#mic");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "speaking", null, { timeout: 15000 });
  check((await page.locator(".msg.user").first().textContent()) === HEARD, "the heard sentence became the user's message");
  check(requests[0]?.auth === "Bearer sk-test", "the request carries the API key");
  const sent = requests[0]?.body ?? {};
  check(sent.stream === true && sent.messages?.[0]?.role === "system" && sent.messages?.at(-1)?.content === HEARD, "the request is a streamed chat with the system prompt and the user's words");

  // while it speaks: sound comes out and the caption walks through the words
  let peak = 0;
  const lit = new Set();
  const captions = new Set();
  const t0 = Date.now();
  while ((await page.evaluate(() => window.chimeraVoiceChat.state())) === "speaking") {
    if (Date.now() - t0 > 60000) throw new Error("still speaking after 60 s");
    peak = Math.max(peak, await page.evaluate(() => window.chimeraVoiceChat.voice.level()));
    const now = await page.locator("#caption .now").allTextContents();
    now.forEach((w) => lit.add(w));
    captions.add((await page.locator("#caption").textContent()).trim());
    await page.waitForTimeout(40);
  }
  const secs = (Date.now() - t0) / 1000;
  check(peak > 0.01, `the voice made sound (peak level ${peak.toFixed(3)})`);
  check(lit.size >= 8, `the caption lit up words as they were said (${lit.size} distinct)`);
  check([...captions].some((c) => c.includes("two numbers and a symbol")), "numbers and symbols were spoken as words");
  check(secs > 4 && secs < 30, `speaking took a plausible ${secs.toFixed(1)} s for two sentences`);
  check((await page.locator(".msg.assistant").textContent()) === REPLY, "the reply is shown as the model wrote it");
  check((await page.evaluate(() => window.chimeraVoiceChat.state())) === "idle", "back to idle afterwards");
  check((await page.locator("#caption").textContent()).trim() === "", "the caption clears");

  // a typed turn, interrupted mid-speech
  await page.fill("#text", "tell me more");
  await page.press("#text", "Enter");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "speaking", null, { timeout: 15000 });
  check(requests[1]?.body.messages.length === 4, "the second request carries the conversation so far");
  await page.waitForTimeout(600);
  await page.click("#mic");
  await page.waitForTimeout(400);
  const level = await page.evaluate(() => window.chimeraVoiceChat.voice.level());
  const st = await page.evaluate(() => window.chimeraVoiceChat.state());
  check(st === "idle", `tapping the button stops the reply and listens, hearing nothing (state ${st})`);
  check(requests.length === 2, "nothing more was sent to the model");
  check(level < 0.005, `and the sound stops (level ${level.toFixed(4)})`);

  // settings: the model list is offered
  await page.click("#open-settings");
  await page.waitForFunction(() => document.querySelectorAll("#models option").length === 2);
  check(true, "settings lists the endpoint's models");

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await page.screenshot({ path: "test-results/app.png" }).catch(() => {});
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  await browser.close();
  server.kill();
}
