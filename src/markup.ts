/**
 * What the model's reply says about how to say it: a mood tag in square brackets, and emphasis in
 * asterisks. The model is asked for these when natural pitch is on (`MARKUP_PROMPT`); they are
 * stripped from what is spoken and shown either way.
 */
import { toSpeakable } from "./normalize.ts";

export const MOODS = {
  neutral: { shift: 0, range: 1, rate: 1 },
  happy: { shift: 1, range: 1.25, rate: 1.03 },
  excited: { shift: 2, range: 1.45, rate: 1.08 },
  curious: { shift: 1, range: 1.2, rate: 1 },
  calm: { shift: -0.5, range: 0.8, rate: 0.95 },
  serious: { shift: -1, range: 0.85, rate: 0.96 },
  sad: { shift: -1.5, range: 0.6, rate: 0.9 },
} as const satisfies Record<string, { /** semitones on the baseline */ shift: number; /** multiplier on every pitch movement */ range: number; rate: number }>;

export type Mood = keyof typeof MOODS;

export const MARKUP_PROMPT =
  "Your voice follows two marks, which are never read aloud. " +
  `Start a reply with a mood in square brackets when one fits: ${Object.keys(MOODS).filter((m) => m !== "neutral").map((m) => `[${m}]`).join(", ")}. ` +
  "Put asterisks around the one word in a sentence you would stress if you said it aloud, like: I said *tomorrow*, not today. " +
  "Stress at most one word per sentence, and only where a person would.";

const MOOD_TAG = new RegExp(`\\[\\s*(${Object.keys(MOODS).join("|")})\\s*\\]`, "gi");
/** *word*, **word** or _word_: closed on the same line, not spaces inside the marks */
const EMPHASIS = /(\*\*|\*|(?<![\p{L}\p{N}])_)(?=\S)([^*_\n]+?)(?<=\S)\1(?![\p{L}\p{N}])/gu;
/** a longer span than this is formatting (a bold heading), not a stressed word */
const MAX_EMPHASIS_WORDS = 3;
/** stands in front of an emphasized word on its way through `toSpeakable` (which keeps letters) */
const MARK = "zzemphzz";

export interface Sayable {
  /** plain words and pauses, for the synth */
  text: string;
  /** which of its words (counted as the synth counts them) are emphasized */
  emphasis: number[];
  /** the mood this sentence sets, if it has a tag */
  mood: Mood | null;
}

/** The words of speakable text, as Chimera's front end splits them. */
export const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^a-z'-]+/).filter((w) => /[a-z]/.test(w));

/** One sentence of the model's reply → what to say and how. */
export function toSayable(sentence: string): Sayable {
  let mood: Mood | null = null;
  let s = sentence.replace(MOOD_TAG, (_, m: string) => {
    mood = m.toLowerCase() as Mood;
    return " ";
  });
  s = s.replace(EMPHASIS, (whole, _mark: string, inner: string) => {
    const words = inner.trim().split(/\s+/);
    return words.length > MAX_EMPHASIS_WORDS ? whole : words.map((w) => `${MARK} ${w}`).join(" ");
  });
  const emphasis: number[] = [];
  let n = 0, marked = false;
  for (const w of wordsOf(toSpeakable(s))) {
    if (w === MARK) marked = true;
    else {
      if (marked) emphasis.push(n);
      marked = false;
      n++;
    }
  }
  const text = toSpeakable(s.replaceAll(MARK, " "));
  return { text, emphasis, mood };
}

/** The reply as shown: mood tags gone, emphasis as <em>. */
export function renderReply(el: HTMLElement, reply: string): void {
  const text = reply.replace(MOOD_TAG, "").replace(/^\s+/, "");
  const nodes: (Node | string)[] = [];
  let from = 0;
  for (const m of text.matchAll(EMPHASIS)) {
    nodes.push(text.slice(from, m.index));
    const em = document.createElement("em");
    em.textContent = m[2];
    nodes.push(em);
    from = m.index + m[0].length;
  }
  nodes.push(text.slice(from));
  el.replaceChildren(...nodes);
}
