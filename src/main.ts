/** The page: local text-to-speech in one click, or live voice chat against an OpenAI-compatible model. */
import { Listener, listeningSupported } from "./listen.ts";
import { identityNotice, isOpenRouter, listModels, streamChat, type ChatMessage, type ToolProgress } from "./llm.ts";
import { MARKUP_PROMPT, renderReply, toSayable } from "./markup.ts";
import { FUNNY_LINES, MOCK_TURN, PRESETS, SAMPLE, spokenText, streamChunks, type PresetName } from "./demo.ts";
import { replySentences } from "./reply.ts";
import { SentenceStream } from "./sentences.ts";
import { DEFAULT_PROMPT, SUGGESTED_MODELS, loadDeploy, loadSettings, saveSettings, switchBackend, type Backend, type Settings } from "./settings.ts";
import { HermesError, conversationName, conversationTurns, deleteConversation, hermesRoot, listConversations, openedConversation, rememberConversation, renameConversation, startConversation, when, type Conversation } from "./sessions.ts";
import { Voice, type Caption } from "./voice.ts";
import { Head } from "./head.ts";
import { BargeIn } from "./bargein.ts";
import { PitchModel } from "./trained.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = $("log"), statusEl = $("status"), captionEl = $("caption"), hint = $("hint");
const mic = $<HTMLButtonElement>("mic"), micLabel = $("mic-label"), chatFooter = $("chat-footer");
const composer = $<HTMLFormElement>("composer"), textInput = $<HTMLInputElement>("text");
const dialog = $<HTMLDialogElement>("settings"), form = $<HTMLFormElement>("settings-form"), chatSettings = $<HTMLDetailsElement>("chat-settings");
const demoEl = $("demo"), demoForm = $<HTMLFormElement>("demo-form"), demoText = $<HTMLTextAreaElement>("demo-text");
const speakBtn = $<HTMLButtonElement>("speak"), stopBtn = $<HTMLButtonElement>("stop"), spokenPreview = $("spoken-preview");
const demoStream = $("demo-stream"), demoPrompt = $("demo-prompt"), demoReply = $("demo-reply");
const modeDemoBtn = $<HTMLButtonElement>("mode-demo"), modeChatBtn = $<HTMLButtonElement>("mode-chat");
const presetBtns = [...document.querySelectorAll<HTMLButtonElement>(".preset")];

/** how many past messages go to the model with each turn */
const HISTORY = 24;

type Mode = "demo" | "chat";
type State = "loading" | "idle" | "listening" | "thinking" | "speaking";
let mode: Mode = "demo";
let state: State = "loading";
/** the site's deploy.json, if it has one: its backend and endpoint are the defaults until the owner saves their own */
const deploy = await loadDeploy(`${import.meta.env.BASE_URL}deploy.json`, location.href);
let settings: Settings = loadSettings(deploy);
/** the conversation so far (a new array when another conversation is opened) */
let history: ChatMessage[] = [];
const voice = new Voice();
const stage = $("stage");
const head = new Head(stage);
/** the reply being fetched or mock-streamed (aborted on Stop or when talked over) */
let request: AbortController | null = null;
let interimEl: HTMLElement | null = null;
let hermesResumed = false;

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

const STATUS: Record<State, string> = { loading: "loading the voice…", idle: "ready", listening: "listening…", thinking: "thinking…", speaking: "speaking" };

function setState(s: State): void {
  state = s;
  keepAwake(s !== "idle" && s !== "loading");
  mic.dataset.state = s;
  mic.disabled = s === "loading";
  micLabel.textContent = { loading: "…", idle: "Talk", listening: "Send", thinking: "Stop", speaking: "Stop" }[s];
  speakBtn.disabled = s === "loading";
  for (const b of presetBtns) b.disabled = s === "loading";
  stopBtn.disabled = s !== "speaking" && s !== "thinking";
  showStatus();
}

/** the tools Hermes is running for the reply being fetched, by its id for each call */
const tools = new Map<string, ToolProgress>();

/** The state, or what the agent is doing while a tool runs ("🔍 web_search: weather in Paris…"). */
function showStatus(): void {
  const t = [...tools.values()].at(-1);
  statusEl.textContent = t ? `${t.emoji ? `${t.emoji} ` : ""}${t.label === t.tool ? `using ${t.tool}` : `${t.tool}: ${t.label}`}…` : STATUS[state];
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
    // a spoken conversation can be interrupted by talking; a typed or demo one doesn't open the mic
    if (mode === "chat" && settings.bargeIn && heardBySpeech && listeningSupported) void bargeIn.arm();
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
  if (mode === "chat" && settings.handsFree && listeningSupported && heardBySpeech) startListening();
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
  if (mode !== "chat" || (state !== "speaking" && state !== "thinking")) return;
  startListening();
});

/** true while `interrupt` is stopping the voice (which is not the reply finishing) */
let interrupting = false;

function interrupt(): void {
  request?.abort();
  request = null;
  tools.clear();
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

// ---------------------------------------------------------------- local speak (landing view)

function updatePreview(): void {
  spokenPreview.textContent = spokenText(demoText.value) || "—";
}

function markPreset(chosen: string | null): void {
  for (const btn of presetBtns) btn.setAttribute("aria-pressed", String(btn.dataset.preset === chosen));
}

async function speakMarkdown(markdown: string): Promise<void> {
  if (state === "loading") return;
  interrupt();
  heardBySpeech = false;
  await voice.unlock();
  voice.newReply();
  for (const s of replySentences(markdown)) voice.say(toSayable(s));
  if (!voice.speaking) setState("idle");
}

async function playMockReply(): Promise<void> {
  if (state === "loading") return;
  interrupt();
  heardBySpeech = false;
  await voice.unlock();
  demoPrompt.textContent = MOCK_TURN.prompt;
  demoReply.replaceChildren();
  demoStream.hidden = false;
  demoText.value = "";
  updatePreview();
  setState("thinking");
  const ctl = new AbortController();
  request = ctl;
  const sentences = new SentenceStream();
  let reply = "";
  const say = (parts: string[]) => parts.forEach((s) => voice.say(toSayable(s)));
  voice.newReply();
  for await (const delta of streamChunks(MOCK_TURN.reply, 35, ctl.signal)) {
    if (request !== ctl) return;
    reply += delta;
    renderReply(demoReply, reply);
    demoText.value = reply;
    updatePreview();
    say(sentences.push(delta));
  }
  if (request !== ctl) return;
  say(sentences.flush());
  request = null;
  if (!voice.speaking) finishedReply();
}

demoText.value = SAMPLE;
updatePreview();

demoText.addEventListener("input", () => {
  markPreset(null);
  demoStream.hidden = true;
  updatePreview();
});
demoText.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    demoForm.requestSubmit();
  }
});
demoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  demoStream.hidden = true;
  void speakMarkdown(demoText.value);
});
stopBtn.addEventListener("click", () => {
  if (state === "loading") return;
  interrupt();
  setState("idle");
});
let funnyAt = 0;
for (const btn of presetBtns) {
  btn.addEventListener("click", () => {
    const kind = btn.dataset.preset as PresetName | "stream" | "funny";
    markPreset(kind);
    if (kind === "stream") {
      void playMockReply();
      return;
    }
    const text = kind === "funny" ? FUNNY_LINES[funnyAt++ % FUNNY_LINES.length] : PRESETS[kind];
    demoStream.hidden = true;
    demoText.value = text;
    updatePreview();
    void speakMarkdown(text);
  });
}

// ---------------------------------------------------------------- mode switch

function setMode(next: Mode): void {
  if (next === mode) return;
  if (state === "listening") listener.cancel();
  if (state !== "idle" && state !== "loading") {
    interrupt();
    setState("idle");
  }
  mode = next;
  modeDemoBtn.setAttribute("aria-pressed", String(mode === "demo"));
  modeChatBtn.setAttribute("aria-pressed", String(mode === "chat"));
  demoEl.hidden = mode !== "demo";
  log.hidden = mode !== "chat";
  chatFooter.hidden = mode !== "chat";
  $("open-chats").hidden = mode !== "chat" || settings.backend !== "hermes";
  if (mode === "chat") {
    if (state !== "loading" && !hint.textContent) {
      hint.textContent = listeningSupported ? "Tap Talk, say something, and pause." : "Type a message to start.";
    }
    // carry on with the conversation this device last had open on this Hermes
    if (!hermesResumed && settings.backend === "hermes" && settings.apiKey) {
      hermesResumed = true;
      const opened = openedConversation(settings.baseUrl);
      if (opened && !conversation && !history.length) void openConversation(opened);
    }
  }
}

modeDemoBtn.addEventListener("click", () => setMode("demo"));
modeChatBtn.addEventListener("click", () => setMode("chat"));

// ---------------------------------------------------------------- live LLM chat

async function send(text: string, spoken: boolean): Promise<void> {
  interrupt();
  listener.cancel();
  heardBySpeech = spoken;
  bubble("user", text);
  const turns = history; // this conversation's, even if another is opened while the reply comes
  turns.push({ role: "user", content: text });
  if (!settings.apiKey) {
    bubble("error", "Add an API key in Settings first.");
    setState("idle");
    fillForm();
    chatSettings.open = true;
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
    const { model, baseUrl, apiKey } = settings;
    const identity = identityNotice(baseUrl, model, lastBackend?.model);
    const zdrOn = settings.zdr && isOpenRouter(baseUrl);
    const backend = `${model} via ${hostOf(baseUrl)}${zdrOn ? ", zero data retention" : ""}`;
    if (backend !== notedBackend) {
      log.insertBefore(Object.assign(document.createElement("div"), { className: "msg note", textContent: `${notedBackend ? "Now using" : "Using"} ${backend}` }), el);
      notedBackend = backend;
    }
    const system = [settings.systemPrompt, identity, ...(settings.naturalPitch ? [MARKUP_PROMPT] : [])].join("\n\n");
    const messages: ChatMessage[] = [{ role: "system", content: system }, ...turns.slice(-HISTORY)];
    const hermes = settings.backend === "hermes";
    let hermesSession: string | undefined;
    if (hermes) {
      // Hermes keeps the conversation: a new one is started with its first turn
      const root = hermesRoot(baseUrl);
      hermesSession = conversation?.root === root ? conversation.id : (await startConversation(baseUrl, apiKey)).id;
      if (!ctl.signal.aborted && conversation?.id !== hermesSession) {
        conversation = { root, id: hermesSession };
        rememberConversation(baseUrl, hermesSession);
      }
    }
    const onTool = (t: ToolProgress) => {
      if (request !== ctl) return;
      if (t.done) tools.delete(t.id);
      else tools.set(t.id, t);
      showStatus();
    };
    for await (const delta of streamChat({ baseUrl, apiKey, model, messages, zdr: settings.zdr, reasoning: settings.reasoning, hermes, hermesSession, onTool, signal: ctl.signal })) {
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
      if (reply) turns.push({ role: "assistant", content: reply });
      else el.remove();
      return;
    }
    el.remove();
    bubble("error", e instanceof Error ? e.message : String(e));
  }
  if (request !== ctl) return;
  request = null;
  tools.clear(); // a tool Hermes never said had finished is over with the reply
  showStatus();
  if (reply) turns.push({ role: "assistant", content: reply });
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

/** What the chosen backend needs from the person, shown under the choice. */
function showBackend(): void {
  const hermes = settings.backend === "hermes";
  let fromHermes = false; // this page is served from Hermes's own address
  try {
    fromHermes = hermes && new URL(settings.baseUrl).origin === location.origin;
  } catch {
    // not an address yet
  }
  $("backend-hint").textContent = fromHermes
    ? "Hermes keeps the memory, the tools and the conversations; this is its voice. Paste its API_SERVER_KEY below."
    : hermes
      ? `Hermes keeps the memory, the tools and the conversations; this is its voice. In ~/.hermes/.env set API_SERVER_ENABLED=true, an API_SERVER_KEY (the key below) and API_SERVER_CORS_ORIGINS=${location.origin}, then run "hermes gateway".`
      : settings.backend === "custom" ? "Any server that speaks the OpenAI chat API: a local model, another provider." : "";
  $("zdr-row").hidden = !isOpenRouter(settings.baseUrl);
  field<HTMLInputElement>("apiKey").placeholder = hermes ? "your API_SERVER_KEY" : settings.backend === "openrouter" ? "sk-or-…" : "";
}

function fillForm(): void {
  for (const k of ["backend", "apiKey", "baseUrl", "model", "reasoning", "systemPrompt", "body"] as const) field(k).value = settings[k];
  showBackend();
  for (const k of ["rate", "pitch", "plosives", "voicing"] as const) field(k).value = String(settings[k]);
  field<HTMLInputElement>("handsFree").checked = settings.handsFree;
  field<HTMLInputElement>("zdr").checked = settings.zdr;
  field<HTMLInputElement>("showHead").checked = settings.showHead;
  field<HTMLInputElement>("bargeIn").checked = settings.bargeIn;
  field<HTMLInputElement>("naturalPitch").checked = settings.naturalPitch;
  field<HTMLInputElement>("trainedPitch").checked = settings.trainedPitch;
  field<HTMLInputElement>("trainedTiming").checked = settings.trainedTiming;
  showRanges();
}

function showRanges(): void {
  for (const out of form.querySelectorAll<HTMLOutputElement>("output[data-for]")) out.textContent = `${Number(field(out.dataset.for as keyof Settings).value).toFixed(2)}×`;
}

function readForm(): void {
  const chosen = field<HTMLSelectElement>("backend").value as Backend;
  settings = {
    backend: settings.backend,
    connections: settings.connections,
    apiKey: field("apiKey").value.trim(),
    baseUrl: field("baseUrl").value.trim() || settings.baseUrl,
    model: field("model").value.trim() || settings.model,
    reasoning: field<HTMLSelectElement>("reasoning").value as Settings["reasoning"],
    systemPrompt: field("systemPrompt").value,
    body: field<HTMLSelectElement>("body").value as Settings["body"],
    rate: Number(field("rate").value),
    pitch: Number(field("pitch").value),
    plosives: Number(field("plosives").value),
    voicing: Number(field("voicing").value),
    handsFree: field<HTMLInputElement>("handsFree").checked,
    zdr: field<HTMLInputElement>("zdr").checked,
    showHead: field<HTMLInputElement>("showHead").checked,
    bargeIn: field<HTMLInputElement>("bargeIn").checked,
    naturalPitch: field<HTMLInputElement>("naturalPitch").checked,
    trainedPitch: field<HTMLInputElement>("trainedPitch").checked,
    trainedTiming: field<HTMLInputElement>("trainedTiming").checked,
  };
  if (chosen !== settings.backend) {
    // another backend: put this one's endpoint, key and model away and bring that one's back
    settings = switchBackend(settings, chosen, deploy);
    for (const k of ["apiKey", "baseUrl", "model"] as const) field(k).value = settings[k];
    if (mode === "chat" || settings.apiKey) void suggestModels();
  }
  showBackend();
  saveSettings(settings);
  void applySettings();
}

// ---------------------------------------------------------------- conversations (Hermes Agent)

/** the Hermes conversation this page is in; null for a new one, which its first turn starts */
let conversation: { root: string; id: string } | null = null;
const chats = $<HTMLDialogElement>("chats"), chatList = $("chat-list"), chatsNote = $("chats-note");

/** Show a conversation's earlier turns (none for a new one) and carry on in it from here. */
async function openConversation(id: string | null): Promise<void> {
  if (state === "listening") listener.cancel();
  if (state !== "idle" && state !== "loading") {
    interrupt();
    setState("idle");
  }
  const { baseUrl, apiKey } = settings;
  conversation = id ? { root: hermesRoot(baseUrl), id } : null;
  rememberConversation(baseUrl, id);
  const turns: ChatMessage[] = (history = []);
  log.replaceChildren();
  lastBackend = null;
  notedBackend = "";
  if (!id) return;
  try {
    const earlier = await conversationTurns(baseUrl, apiKey, id);
    if (history !== turns) return; // another one was opened meanwhile
    const els = earlier.map((m) => {
      const el = bubble(m.role === "user" ? "user" : "assistant", m.content);
      if (m.role === "assistant") renderReply(el, m.content);
      return el;
    });
    log.prepend(...els); // before anything said while they loaded
    turns.unshift(...earlier);
    log.scrollTop = log.scrollHeight;
  } catch (e) {
    if (history !== turns) return;
    if (e instanceof HermesError && e.status === 404) {
      // deleted, perhaps from another device: what is said next starts a new one
      conversation = null;
      rememberConversation(baseUrl, null);
      bubble("note", "That conversation is gone from Hermes. What you say next starts a new one.");
    } else bubble("error", `Couldn't open that conversation. ${e instanceof Error ? e.message : e}`);
  }
}

/** The conversations Hermes has, in the Conversations box. */
async function showConversations(): Promise<void> {
  chatList.replaceChildren();
  if (!settings.apiKey) {
    chatsNote.textContent = "Add Hermes's API key in Settings first.";
    return;
  }
  chatsNote.textContent = "loading…";
  try {
    const list = await listConversations(settings.baseUrl, settings.apiKey);
    chatsNote.textContent = list.length ? "" : "No conversations yet. Say something to start one.";
    chatList.replaceChildren(...list.map(conversationRow));
  } catch (e) {
    chatsNote.textContent = e instanceof Error ? e.message : String(e);
  }
}

/** One conversation in the list: tap to open it, rename it, delete it (asks once more first). */
function conversationRow(c: Conversation): HTMLElement {
  const li = document.createElement("li");
  li.classList.toggle("current", conversation?.id === c.id);
  const open = Object.assign(document.createElement("button"), { type: "button", className: "open" });
  const name = Object.assign(document.createElement("span"), { textContent: conversationName(c) });
  open.append(name, Object.assign(document.createElement("small"), { textContent: when(c.at) }));
  open.addEventListener("click", () => {
    chats.close();
    void openConversation(c.id);
  });
  const rename = Object.assign(document.createElement("button"), { type: "button", className: "ghost", textContent: "Rename" });
  rename.addEventListener("click", () => {
    const input = Object.assign(document.createElement("input"), { type: "text", value: c.title ?? conversationName(c), ariaLabel: "Name" });
    let done = false;
    const finish = async (save: boolean) => {
      if (done) return;
      done = true;
      const title = input.value.trim();
      if (save && title && title !== c.title) {
        try {
          c = await renameConversation(settings.baseUrl, settings.apiKey, c.id, title);
          name.textContent = conversationName(c);
        } catch (e) {
          chatsNote.textContent = e instanceof Error ? e.message : String(e);
        }
      }
      input.replaceWith(open);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== "Escape") return;
      e.preventDefault(); // not the dialog's: Enter would close it and Escape cancel it
      void finish(e.key === "Enter");
    });
    input.addEventListener("blur", () => void finish(true));
    open.replaceWith(input);
    input.focus();
    input.select();
  });
  const del = Object.assign(document.createElement("button"), { type: "button", className: "ghost", textContent: "Delete" });
  del.addEventListener("click", async () => {
    if (!del.classList.contains("sure")) {
      del.classList.add("sure");
      del.textContent = "Delete it?";
      return;
    }
    try {
      await deleteConversation(settings.baseUrl, settings.apiKey, c.id);
      li.remove();
      if (!chatList.children.length) chatsNote.textContent = "No conversations yet. Say something to start one.";
      if (conversation?.id === c.id) void openConversation(null);
    } catch (e) {
      chatsNote.textContent = e instanceof Error ? e.message : String(e);
    }
  });
  li.append(open, rename, del);
  return li;
}

$("open-chats").addEventListener("click", () => {
  chats.showModal();
  void showConversations();
});
$("new-chat").addEventListener("click", () => {
  chats.close();
  void openConversation(null);
});

/** the site's trained pitch model, if it has one (public/models/prosody.json; see training/README.md) */
let pitchModel: PitchModel | null = null;

/** Push the settings into the voice and the head. */
async function applySettings(): Promise<void> {
  voice.settings = { body: settings.body, rate: settings.rate, pitch: settings.pitch, plosives: settings.plosives, voicing: settings.voicing, natural: settings.naturalPitch, model: settings.trainedPitch ? pitchModel : null, timing: settings.trainedTiming };
  head.setBody(settings.body);
  $("open-chats").hidden = mode !== "chat" || settings.backend !== "hermes";
  if (!voice.loaded) return;
  if (!settings.bargeIn) bargeIn.disarm();
  if (!settings.showHead) {
    head.hide();
    stage.hidden = true;
  } else if (!head.shown) {
    stage.hidden = false;
    const ok = await head.show();
    if (!ok) stage.hidden = true; // no WebGL here: the page works without the head
  }
}

function setModelOptions(ids: string[]): void {
  $("models").replaceChildren(...ids.map((id) => Object.assign(document.createElement("option"), { value: id })));
}
setModelOptions(SUGGESTED_MODELS);

async function suggestModels(): Promise<void> {
  const ids = await listModels(field("baseUrl").value.trim() || settings.baseUrl, field("apiKey").value.trim());
  // the suggestions first (those the endpoint has, or all of them if it won't list its models)
  const first = ids.length ? SUGGESTED_MODELS.filter((id) => ids.includes(id)) : SUGGESTED_MODELS;
  setModelOptions([...first, ...ids.filter((id) => !first.includes(id))]);
}

$("open-settings").addEventListener("click", () => {
  fillForm();
  chatSettings.open = mode === "chat";
  dialog.showModal();
  if (mode === "chat") void suggestModels();
});
chatSettings.addEventListener("toggle", () => {
  if (chatSettings.open && (mode === "chat" || settings.apiKey)) void suggestModels();
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

void applySettings();
// for the end-to-end test and for poking at it from the console
Object.assign(window, { chimeraVoiceChat: { voice, head, mode: () => mode, setMode, state: () => state, pitch: () => voice.pitch() } });

Promise.all([voice.load(), PitchModel.load(`${import.meta.env.BASE_URL}models/prosody.json`)])
  .then(async ([, m]) => {
    if (m) {
      pitchModel = m;
      $("trained-row").hidden = false;
      $("timing-row").hidden = !m.timed;
    }
    updatePreview(); // the dictionary is loaded now: refresh names and initials in the preview
    await applySettings();
    setState("idle");
    if (mode === "chat" && !hint.textContent) {
      hint.textContent = listeningSupported ? "Tap Talk, say something, and pause." : "Type a message to start.";
    }
  })
  .catch((e) => {
    statusEl.textContent = "the voice failed to load";
    const msg = `The Chimera engine failed to load: ${e instanceof Error ? e.message : e}`;
    if (mode === "chat") bubble("error", msg);
    else spokenPreview.textContent = msg;
  });
