/** Settings kept in this browser's localStorage (the API key never leaves it except to the endpoint). */
import type { BodyName } from "./voice.ts";

/** what answers the chat: OpenRouter, a Hermes Agent's API server, or any other OpenAI-compatible endpoint */
export type Backend = "openrouter" | "hermes" | "custom";

export interface Connection {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** each backend's name in Settings and where it starts out */
export const BACKENDS: Record<Backend, { label: string } & Connection> = {
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "", model: "nousresearch/hermes-4-70b" },
  hermes: { label: "Hermes Agent", baseUrl: "http://127.0.0.1:8642/v1", apiKey: "", model: "hermes-agent" },
  custom: { label: "Other (OpenAI-compatible)", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "" },
};

export interface Settings {
  backend: Backend;
  /** the endpoint, key and model last used with the other backends, so switching loses nothing */
  connections: Partial<Record<Backend, Connection>>;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** OpenRouter: only providers with Zero Data Retention */
  zdr: boolean;
  systemPrompt: string;
  body: BodyName;
  rate: number;
  pitch: number;
  /** listen again by itself once the reply has been spoken */
  handsFree: boolean;
  /** natural pitch and the model's mood and emphasis marks, or Chimera's own flat pitch */
  naturalPitch: boolean;
  /** with natural pitch: take the contour from the trained model when the site has one */
  trainedPitch: boolean;
  /** stop the voice when the user starts talking over it */
  bargeIn: boolean;
  /** draw the 3D head (costs a phone some CPU the voice may want) */
  showHead: boolean;
}

export const DEFAULT_PROMPT =
  "You are a voice assistant. Everything you write is spoken aloud by a quirky, robotic physical-model voice synthesizer that is hard to understand, so: " +
  "reply in one to three short sentences unless asked for more. Use plain, common words. " +
  "Never use markdown, lists, emoji, symbols or abbreviations, and write numbers the way they are said. " +
  "Be warm, direct and a little funny.";

export const DEFAULTS: Settings = {
  backend: "openrouter",
  connections: {},
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "nousresearch/hermes-4-70b",
  zdr: true,
  systemPrompt: DEFAULT_PROMPT,
  body: "male",
  rate: 1,
  pitch: 1,
  handsFree: true,
  naturalPitch: true,
  trainedPitch: true,
  bargeIn: true,
  showHead: true,
};

/** models worth trying for spoken chat (fast, cheap, conversational), offered first in Settings */
export const SUGGESTED_MODELS = ["nousresearch/hermes-4-70b", "cognitivecomputations/dolphin-mistral-24b-venice-edition", "qwen/qwen3.7-flash", "qwen/qwen3.6-35b-a3b"];

const KEY = "chimera-voice-chat:settings";

/** The settings with another backend chosen: the current connection is put away and that one's brought back. */
export function switchBackend(s: Settings, to: Backend): Settings {
  if (to === s.backend) return s;
  const { baseUrl, apiKey, model } = s.connections[to] ?? BACKENDS[to];
  return { ...s, backend: to, connections: { ...s.connections, [s.backend]: { baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model } }, baseUrl, apiKey, model };
}

/** Which backend settings saved before there was a choice were using, going by their endpoint. */
export function guessBackend(baseUrl: string): Backend {
  try {
    const url = new URL(baseUrl);
    return url.hostname.endsWith("openrouter.ai") ? "openrouter" : url.port === "8642" ? "hermes" : "custom";
  } catch {
    return "custom";
  }
}

export function loadSettings(): Settings {
  try {
    const saved: Partial<Settings> = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const s = { ...DEFAULTS, ...saved };
    return saved.backend ? s : { ...s, backend: guessBackend(s.baseUrl) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private window or storage blocked: the settings last for this visit
  }
}
