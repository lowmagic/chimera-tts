/** Settings kept in this browser's localStorage (the API key never leaves it except to the endpoint). */
import type { BodyName } from "./voice.ts";

export interface Settings {
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
  bargeIn: true,
  showHead: true,
};

/** models worth trying for spoken chat (fast, cheap, conversational), offered first in Settings */
export const SUGGESTED_MODELS = ["nousresearch/hermes-4-70b", "cognitivecomputations/dolphin-mistral-24b-venice-edition", "qwen/qwen3.7-flash", "qwen/qwen3.6-35b-a3b"];

const KEY = "chimera-voice-chat:settings";

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
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
