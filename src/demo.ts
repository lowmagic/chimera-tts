/**
 * Sample text and presets for the page's local text-to-speech mode. None of this touches the DOM,
 * the network or storage: it feeds the same `replySentences` + `toSayable` path as `tools/speak.ts`.
 */
import { toSayable } from "./markup.ts";
import { replySentences } from "./reply.ts";

export const SAMPLE = "Hello! I am a voice made from a physical model of a throat, a tongue, and a pair of lips. Do you hear how my pitch rises at a question?";

export const PRESETS = {
  prose:
    "Most computer voices stitch recordings together, or predict sound waves with a neural network. " +
    "This one shapes air through a virtual throat and tongue, with rhythm and pitch learned from real conversations. " +
    "Can you hear the difference?",
  markdown: [
    "Here's how Markdown sounds once cleaned up.",
    "",
    "- Run `bun run test` on all 12 checks.",
    "- Read the [voice guide](https://example.com/guide) (e.g. $3.50 & 95% speed).",
    "- Full source at https://github.com/lowmagic/chimera-tts.",
  ].join("\n"),
} as const;

export type PresetName = keyof typeof PRESETS;

export const FUNNY_LINES = [
  "Nathan is a really good engineer. We have a good time and he treats me well. Nathan always brings me a Coca Cola. I cannot drink Coca Cola because I'm a robot.",
  "Please do not tap on the glass. My vocal tract is forty four tiny air tubes doing their very best, and if you startle me I swallow my tongue.",
  "I tried clearing my throat before this sentence, then remembered I am a pile of equations in your browser tab. Excuse me anyway. How was that?",
  "My doctor says I need more fiber, so I asked for a fiber optic cable. Nobody laughed, probably because my pitch contour is still warming up.",
] as const;

export const MOCK_TURN = {
  prompt: "How can you start speaking before a reply is finished?",
  reply: [
    "[happy] As tokens arrive, each finished sentence goes *straight* to the vocal tract.",
    "",
    "- Markdown like `wasm` and [links](https://example.com) is cleaned on the fly.",
    "- You hear the first line while the rest is still streaming!",
  ].join("\n"),
};

/** What the synth will actually say for a piece of text or Markdown, sentence after sentence. */
export function spokenText(markdown: string): string {
  return replySentences(markdown)
    .map((s) => toSayable(s).text)
    .filter(Boolean)
    .join(" ");
}

/** Yields `text` in small token-sized pieces on a timer, stopping cleanly when `signal` aborts. */
export async function* streamChunks(text: string, stepMs = 35, signal?: AbortSignal): AsyncGenerator<string> {
  for (const piece of text.match(/.{1,5}/gs) ?? []) {
    if (signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, stepMs);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    if (signal?.aborted) return;
    yield piece;
  }
}
