/** The page: talk or type, the model answers, Chimera says it, the caption follows along. */
import { Listener, listeningSupported } from "./listen.ts";
import { listModels, streamChat, type ChatMessage } from "./llm.ts";
import { toSpeakable } from "./normalize.ts";
import { SentenceStream } from "./sentences.ts";
import { DEFAULT_PROMPT, loadSettings, saveSettings, type Settings } from "./settings.ts";
import { Voice, type Caption } from "./voice.ts";

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
/** the reply being fetched (aborted when the user talks over it) */
let request: AbortController | null = null;
let interimEl: HTMLElement | null = null;

function setState(s: State): void {
  state = s;
  mic.dataset.state = s;
  mic.disabled = s === "loading";
  micLabel.textContent = { loading: "…", idle: "Talk", listening: "Send", thinking: "Stop", speaking: "Stop" }[s];
  statusEl.textContent = { loading: "loading the voice…", idle: "ready", listening: "listening…", thinking: "thinking…", speaking: "speaking" }[s];
}

function bubble(kind: "user" | "assistant" | "error", text = ""): HTMLElement {
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
  if (speaking) return void (state === "thinking" || state === "idle" ? setState("speaking") : 0);
  if (interrupting || state !== "speaking" || request) return; // cut off, or more of the reply is still arriving
  finishedReply();
};

/** The whole reply has been spoken. */
function finishedReply(): void {
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

/** true while `interrupt` is stopping the voice (which is not the reply finishing) */
let interrupting = false;

function interrupt(): void {
  request?.abort();
  request = null;
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
  const say = (parts: string[]) => parts.forEach((s) => voice.say(toSpeakable(s)));
  try {
    const messages: ChatMessage[] = [{ role: "system", content: settings.systemPrompt }, ...history.slice(-HISTORY)];
    for await (const delta of streamChat({ baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model, messages, signal: ctl.signal })) {
      reply += delta;
      el.textContent = reply;
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
  };
  saveSettings(settings);
  voice.settings = { body: settings.body, rate: settings.rate, pitch: settings.pitch };
}

async function suggestModels(): Promise<void> {
  const ids = await listModels(field("baseUrl").value.trim() || settings.baseUrl, field("apiKey").value.trim());
  $("models").replaceChildren(...ids.map((id) => Object.assign(document.createElement("option"), { value: id })));
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
  voice.say("Hello. This is how I sound.");
});

// ---------------------------------------------------------------- start

voice.settings = { body: settings.body, rate: settings.rate, pitch: settings.pitch };
// for the end-to-end test and for poking at it from the console
Object.assign(window, { chimeraVoiceChat: { voice, state: () => state } });

voice
  .load()
  .then(() => {
    setState("idle");
    hint.textContent = settings.apiKey ? (listeningSupported ? "Tap Talk, say something, and pause." : "Type a message to start.") : "Add your API key in Settings to start.";
  })
  .catch((e) => {
    statusEl.textContent = "the voice failed to load";
    bubble("error", `The Chimera engine failed to load: ${e instanceof Error ? e.message : e}`);
  });
