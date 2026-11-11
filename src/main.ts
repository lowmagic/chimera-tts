/** The page: talk or type, the model answers, Chimera says it, the caption follows along. */
import { Listener, listeningSupported } from "./listen.ts";
import { identityNotice, isOpenRouter, listModels, streamChat, type ChatMessage } from "./llm.ts";
import { MARKUP_PROMPT, renderReply, toSayable } from "./markup.ts";
import { SentenceStream } from "./sentences.ts";
import { DEFAULT_PROMPT, SUGGESTED_MODELS, loadSettings, saveSettings, type Settings } from "./settings.ts";
import { Voice, type Caption } from "./voice.ts";
import { Head } from "./head.ts";
import { BargeIn } from "./bargein.ts";
import { PitchModel } from "./trained.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = $("log"), statusEl = $("status"), captionEl = $("caption"), hint = $("hint");
const mic = $<HTMLButtonElement>("mic"), micLabel = $("mic-label");
const composer = $<HTMLFormElement>("composer"), textInput = $<HTMLInputElement>("text");
const dialog = $<HTMLDialogElement>("settings"), form = $<HTMLFormElement>("settings-form");

/** how many past messages go to the model with each turn */
const HISTORY = 24;

type State = "loading" | "idle" | "listening" | "thinking" | "speaking";
let state: State = "loading";
let settings: Settings = loadSettings();
const history: ChatMessage[] = [];
const voice = new Voice();
const stage = $("stage");
const head = new Head(stage);
/** the reply being fetched (aborted when the user talks over it) */
let request: AbortController | null = null;
let interimEl: HTMLElement | null = null;

/** keeps a phone's screen on through a conversation (the browser drops it when the page is hidden) */
let wakeLock: { release(): Promise<void> } | null = null;
function keepAwake(on: boolean): void {
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
  if (on && !wakeLock && document.visibilityState === "visible") {
    nav.wakeLock?.request("screen").then((l) => (wakeLock = l), () => {});
  } else if (!on && wakeLock) {
    void wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") wakeLock = null; // released by the browser
  else keepAwake(state !== "idle" && state !== "loading");
});

function setState(s: State): void {
  state = s;
  keepAwake(s !== "idle" && s !== "loading");
  mic.dataset.state = s;
  mic.disabled = s === "loading";
  micLabel.textContent = { loading: "…", idle: "Talk", listening: "Send", thinking: "Stop", speaking: "Stop" }[s];
  statusEl.textContent = { loading: "loading the voice…", idle: "ready", listening: "listening…", thinking: "thinking…", speaking: "speaking" }[s];
}

/** the model and endpoint the last reply came from (a change is told to the model and shown) */
let lastBackend: { model: string; baseUrl: string } | null = null;
/** the model and endpoint the log last announced */
let notedBackend = "";

function bubble(kind: "user" | "assistant" | "error" | "note", text = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  log.append(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function showCaption(c: Caption | null): void {
  captionEl.replaceChildren(
    ...(c?.words ?? []).flatMap((w, i) => {
      const span = document.createElement("span");
      span.textContent = w;
      // between words (at = -1) nothing is lit, but what was already said stays bright
      if (i === c!.at) span.className = "now";
      else if (c!.at >= 0 && i < c!.at) span.className = "said";
      return [span, " "];
    }),
  );
}

voice.onCaption = showCaption;
voice.onSpeaking = (speaking) => {
  if (speaking) {
    if (state === "thinking" || state === "idle") setState("speaking");
    // a spoken conversation can be interrupted by talking; a typed one doesn't open the mic
    if (settings.bargeIn && heardBySpeech && listeningSupported) void bargeIn.arm();
    return;
  }
  if (interrupting || state !== "speaking" || request) return; // cut off, or more of the reply is still arriving
  finishedReply();
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The whole reply has been spoken. */
function finishedReply(): void {
  bargeIn.disarm();
  setState("idle");
  if (settings.handsFree && listeningSupported && heardBySpeech) startListening();
}

/** true when the last turn came in by voice (typing a turn doesn't open the mic afterwards) */
let heardBySpeech = false;

const listener = new Listener({
  onInterim(text) {
    interimEl ??= bubble("user");
    interimEl.classList.add("interim");
    interimEl.textContent = text;
    log.scrollTop = log.scrollHeight;
  },
  onDone(text) {
    interimEl?.remove();
    interimEl = null;
    if (state === "listening") setState("idle");
    if (text) void send(text, true);
  },
  onError(code) {
    hint.textContent = code === "not-allowed" || code === "service-not-allowed" ? "The browser blocked the microphone. Allow it for this page, or type instead." : `Speech recognition failed (${code}). You can type instead.`;
  },
});

/** the user started talking over the voice */
const bargeIn = new BargeIn(() => {
  if (state !== "speaking" && state !== "thinking") return;
  startListening();
});

/** true while `interrupt` is stopping the voice (which is not the reply finishing) */
let interrupting = false;

function interrupt(): void {
  request?.abort();
  request = null;
  bargeIn.disarm(); // the recognizer needs the microphone next
  interrupting = true;
  voice.stop();
  interrupting = false;
}

function startListening(): void {
  interrupt();
  hint.textContent = "";
  setState("listening");
  listener.start();
}

async function send(text: string, spoken: boolean): Promise<void> {
  interrupt();
  listener.cancel();
  heardBySpeech = spoken;
  bubble("user", text);
  history.push({ role: "user", content: text });
  if (!settings.apiKey) {
    bubble("error", "Add an API key in Settings first.");
    setState("idle");
    dialog.showModal();
    return;
  }
  setState("thinking");
  const ctl = new AbortController();
  request = ctl;
  const el = bubble("assistant");
  const sentences = new SentenceStream();
  let reply = "";
  const say = (parts: string[]) => parts.forEach((s) => voice.say(toSayable(s)));
  voice.newReply();
  try {
    // the marks are only asked for when the voice will act on them; they are stripped either way
    // which model this is, on every request: true from the first turn and after any change
    const { model, baseUrl } = settings;
    const identity = identityNotice(baseUrl, model, lastBackend?.model);
    const zdrOn = settings.zdr && isOpenRouter(baseUrl);
    const backend = `${model} via ${hostOf(baseUrl)}${zdrOn ? ", zero data retention" : ""}`;
    if (backend !== notedBackend) {
      log.insertBefore(Object.assign(document.createElement("div"), { className: "msg note", textContent: `${notedBackend ? "Now using" : "Using"} ${backend}` }), el);
      notedBackend = backend;
    }
    const system = [settings.systemPrompt, identity, ...(settings.naturalPitch ? [MARKUP_PROMPT] : [])].join("\n\n");
    const messages: ChatMessage[] = [{ role: "system", content: system }, ...history.slice(-HISTORY)];
    for await (const delta of streamChat({ baseUrl, apiKey: settings.apiKey, model, messages, zdr: settings.zdr, signal: ctl.signal })) {
      lastBackend = { model, baseUrl }; // it answered: this is what the conversation is on now
      reply += delta;
      renderReply(el, reply);
      log.scrollTop = log.scrollHeight;
      say(sentences.push(delta));
    }
    say(sentences.flush());
  } catch (e) {
    if (ctl.signal.aborted) {
      // talked over: keep what was said so far in the history, so the model knows
      if (reply) history.push({ role: "assistant", content: reply });
      else el.remove();
      return;
    }
    el.remove();
    bubble("error", e instanceof Error ? e.message : String(e));
  }
  if (request !== ctl) return;
  request = null;
  if (reply) history.push({ role: "assistant", content: reply });
  else el.remove();
  if (!voice.speaking) finishedReply();
}

mic.addEventListener("click", async () => {
  await voice.unlock();
  if (state === "listening") return listener.finish();
  if (state === "thinking" || state === "speaking") {
    interrupt();
    setState("idle");
    if (!listeningSupported) return;
  }
  if (!listeningSupported) {
    hint.textContent = "This browser has no built-in speech recognition (try Chrome, Edge or Safari). Typing works.";
    return;
  }
  startListening();
});

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text || state === "loading") return;
  textInput.value = "";
  await voice.unlock();
  void send(text, false);
});

// ---------------------------------------------------------------- settings

function field<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(name: keyof Settings): T {
  return form.elements.namedItem(name) as T;
}

function fillForm(): void {
  for (const k of ["apiKey", "baseUrl", "model", "systemPrompt", "body"] as const) field(k).value = settings[k];
  for (const k of ["rate", "pitch"] as const) field(k).value = String(settings[k]);
  field<HTMLInputElement>("handsFree").checked = settings.handsFree;
  field<HTMLInputElement>("zdr").checked = settings.zdr;
  field<HTMLInputElement>("showHead").checked = settings.showHead;
  field<HTMLInputElement>("bargeIn").checked = settings.bargeIn;
  field<HTMLInputElement>("naturalPitch").checked = settings.naturalPitch;
  field<HTMLInputElement>("trainedPitch").checked = settings.trainedPitch;
  showRanges();
}

function showRanges(): void {
  for (const out of form.querySelectorAll<HTMLOutputElement>("output[data-for]")) out.textContent = `${Number(field(out.dataset.for as keyof Settings).value).toFixed(2)}×`;
}

function readForm(): void {
  settings = {
    apiKey: field("apiKey").value.trim(),
    baseUrl: field("baseUrl").value.trim() || settings.baseUrl,
    model: field("model").value.trim() || settings.model,
    systemPrompt: field("systemPrompt").value,
    body: field<HTMLSelectElement>("body").value as Settings["body"],
    rate: Number(field("rate").value),
    pitch: Number(field("pitch").value),
    handsFree: field<HTMLInputElement>("handsFree").checked,
    zdr: field<HTMLInputElement>("zdr").checked,
    showHead: field<HTMLInputElement>("showHead").checked,
    bargeIn: field<HTMLInputElement>("bargeIn").checked,
    naturalPitch: field<HTMLInputElement>("naturalPitch").checked,
    trainedPitch: field<HTMLInputElement>("trainedPitch").checked,
  };
  saveSettings(settings);
  applySettings();
}

/** the site's trained pitch model, if it has one (public/models/prosody.json; see training/README.md) */
let pitchModel: PitchModel | null = null;
void PitchModel.load(`${import.meta.env.BASE_URL}models/prosody.json`).then((m) => {
  if (!m) return;
  pitchModel = m;
  document.querySelector<HTMLElement>("#trained-row")!.hidden = false;
  applySettings();
});

/** Push the settings into the voice and the head. */
function applySettings(): void {
  voice.settings = { body: settings.body, rate: settings.rate, pitch: settings.pitch, natural: settings.naturalPitch, model: settings.trainedPitch ? pitchModel : null };
  head.setBody(settings.body);
  if (!voice.loaded) return;
  if (!settings.bargeIn) bargeIn.disarm();
  if (!settings.showHead) {
    head.hide();
    stage.hidden = true;
  } else if (!head.shown) {
    stage.hidden = false;
    void head.show().then((ok) => {
      if (ok) return;
      stage.hidden = true; // no WebGL here: the chat works without the head
    });
  }
}

async function suggestModels(): Promise<void> {
  const ids = await listModels(field("baseUrl").value.trim() || settings.baseUrl, field("apiKey").value.trim());
  // the suggestions first (those the endpoint has, or all of them if it won't list its models)
  const first = ids.length ? SUGGESTED_MODELS.filter((id) => ids.includes(id)) : SUGGESTED_MODELS;
  const all = [...first, ...ids.filter((id) => !first.includes(id))];
  $("models").replaceChildren(...all.map((id) => Object.assign(document.createElement("option"), { value: id })));
}

$("open-settings").addEventListener("click", () => {
  fillForm();
  dialog.showModal();
  void suggestModels();
});
form.addEventListener("input", () => {
  showRanges();
  readForm();
});
dialog.addEventListener("close", readForm);
$("reset-prompt").addEventListener("click", () => {
  field("systemPrompt").value = DEFAULT_PROMPT;
  readForm();
});
$("test-voice").addEventListener("click", async () => {
  readForm();
  await voice.unlock();
  voice.stop();
  voice.newReply();
  voice.say(toSayable("Hello! This is how I sound, and I *really* hope you like it. Do you?"));
});

// ---------------------------------------------------------------- start

applySettings();
// for the end-to-end test and for poking at it from the console
Object.assign(window, { chimeraVoiceChat: { voice, head, state: () => state, pitch: () => voice.pitch() } });

voice
  .load()
  .then(() => {
    setState("idle");
    applySettings();
    hint.textContent = settings.apiKey ? (listeningSupported ? "Tap Talk, say something, and pause." : "Type a message to start.") : "Add your API key in Settings to start.";
  })
  .catch((e) => {
    statusEl.textContent = "the voice failed to load";
    bubble("error", `The Chimera engine failed to load: ${e instanceof Error ? e.message : e}`);
  });
