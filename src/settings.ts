/** Settings kept in this browser's localStorage (the API key never leaves it except to the endpoint). */
import type { BodyName } from "./voice.ts";

export interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  body: BodyName;
  rate: number;
  pitch: number;
  /** listen again by itself once the reply has been spoken */
  handsFree: boolean;
}

export const DEFAULT_PROMPT =
  "You are a voice assistant. Everything you write is spoken aloud by a quirky, robotic physical-model voice synthesizer that is hard to understand, so: " +
  "reply in one to three short sentences unless asked for more. Use plain, common words. " +
  "Never use markdown, lists, emoji, symbols or abbreviations, and write numbers the way they are said. " +
  "Be warm, direct and a little funny.";

export const DEFAULTS: Settings = {
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "anthropic/claude-haiku-4.5",
  systemPrompt: DEFAULT_PROMPT,
  body: "male",
  rate: 1,
  pitch: 1,
  handsFree: true,
};

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
