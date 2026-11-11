// End-to-end check of the built app in headless Chromium: `bun run build`, then `bun run e2e`.
// The model endpoint is mocked (a streamed reply in small pieces) and the browser's speech
// recognizer is replaced with a fake that "hears" one sentence, so no network or microphone is used.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  check(await page.locator("#trained-row").isHidden(), "no trained pitch model on the site, so no switch for one");
  check((await page.locator("#models option").first().getAttribute("value")) === "test/model-a", "suggested models the endpoint doesn't have are not offered");
  // another model with ZDR off: the next request says so, to OpenRouter and to the model
  await page.fill('input[name="model"]', "test/model-b");
  await page.uncheck('input[name="zdr"]');
  await page.uncheck('input[name="showHead"]');
  check(await page.evaluate(() => document.getElementById("stage").hidden && !document.querySelector("#stage canvas")), "the head can be turned off");

  await page.keyboard.press("Escape");
  await page.fill("#text", "which model are you");
  await page.press("#text", "Enter");
  await page.waitForFunction(() => window.chimeraVoiceChat.state() === "speaking", null, { timeout: 15000 });
  const third = requests[2]?.body ?? {};
  check(third.model === "test/model-b" && third.provider?.zdr === undefined && third.provider?.sort === "latency", "a changed model and ZDR switched off go into the next request");
  check(/running as the model "test\/model-b"/.test(third.messages?.[0]?.content ?? "") && /different model, "nousresearch\/hermes-4-70b"/.test(third.messages[0].content), "the model is told it has changed");
  check((await page.locator(".msg.note").last().textContent()) === "Now using test/model-b via openrouter.ai", "and the log announces the change");
  await page.click("#mic");

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await page.screenshot({ path: "test-results/app.png" }).catch(() => {});

  await withTrainedModel(browser);
  await talkOver(3);
  await talkOver(null);
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  await browser.close();
  server.kill();
}
