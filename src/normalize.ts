/**
 * Model text → text the synth can say. Chimera's front end reads plain words and whole numbers;
 * everything else (markdown, symbols, money, times, decimals) is turned into words here.
 */
import { cardinal, digits, ordinal, spoken } from "./numbers.ts";

const ABBREVIATIONS: [RegExp, string][] = [
  [/\be\.g\.,?/gi, "for example,"],
  [/\bi\.e\.,?/gi, "that is,"],
  [/\betc\.?/gi, "et cetera"],
  [/\bvs\.?/gi, "versus"],
  [/\bapprox\.?/gi, "approximately"],
  [/\bMr\./g, "Mister"],
  [/\bMrs\./g, "Missus"],
  [/\bMs\./g, "Miz"],
  [/\bDr\./g, "Doctor"],
  [/\bSt\./g, "Saint"],
];

/** how each letter is said, as words the dictionary has (not "a", "are", "you": those are reduced as function words) */
const LETTERS: Record<string, string> = {
  a: "ay", b: "bee", c: "see", d: "dee", e: "ee", f: "f", g: "gee", h: "h", i: "eye", j: "jay", k: "kay", l: "el", m: "em",
  n: "en", o: "oh", p: "pee", q: "cue", r: "r", s: "ess", t: "tee", u: "u", v: "vee", w: "w", x: "ex", y: "why", z: "zee",
};
/** capitals that are letters even though they spell a word */
const ALWAYS_LETTERS = new Set(["US", "ID", "OS", "UN", "PM", "QA", "TA", "AR", "VR"]);

/** whether the voice has a pronunciation for a (lowercase) word; set once the dictionary loads */
let known: ((word: string) => boolean) | null = null;
export function setKnownWords(has: ((word: string) => boolean) | null): void {
  known = has;
}

const spell = (letters: string) => [...letters.toLowerCase()].map((ch) => LETTERS[ch] ?? ch).join(" ");

/**
 * Names and initials the voice would otherwise sound out letter by letter, badly. A word the
 * dictionary knows is left alone ("NASA", "GitHub", a shouted "STOP"). Otherwise a name written
 * as joined words is split ("DailyTalk"), and a run of capitals is said as its letters ("GPT").
 */
function names(text: string): string {
  const isWord = (w: string) => !!known?.(w.toLowerCase());
  // before the dictionary has loaded nothing is known: then only capitals with no vowel are letters
  const initials = (w: string) => ALWAYS_LETTERS.has(w) || (known ? !isWord(w) : !/[AEIOUY]/.test(w));
  return text.replace(/(?<!\p{L})\p{L}{2,}(?!\p{L})/gu, (word) => {
    if (!/[A-Z]/.test(word.slice(1)) || !/^[A-Za-z]+$/.test(word)) return word; // an ordinary word
    if (/^[A-Z]{2,6}s?$/.test(word)) {
      const caps = word.replace(/s$/, "");
      if (!initials(caps)) return word;
      return ` ${spell(caps)}${word.endsWith("s") ? "'s" : ""} `;
    }
    if (isWord(word)) return word;
    // "DailyTalk" → "Daily Talk", "GPTModel" → "GPT Model", then each part on its own
    const parts = word.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(" ");
    if (parts.length === 1) return word;
    return parts.map((p) => (/^[A-Z]{2,6}$/.test(p) && initials(p) ? spell(p) : p)).join(" ");
  });
}

const plural = (n: number, word: string) => `${cardinal(n)} ${word}${n === 1 ? "" : "s"}`;

function money(_: string, whole: string, cents?: string): string {
  const d = Number(whole.replace(/,/g, "")), c = cents ? Number(cents.padEnd(2, "0").slice(0, 2)) : 0;
  if (!c) return plural(d, "dollar");
  if (!d) return plural(c, "cent");
  return `${plural(d, "dollar")} and ${plural(c, "cent")}`;
}

function clock(_: string, h: string, m: string): string {
  const mm = Number(m);
  return `${cardinal(Number(h))} ${mm === 0 ? "o'clock" : mm < 10 ? "oh " + cardinal(mm) : cardinal(mm)}`;
}

const meridiem = (x: string) => `${x.toLowerCase() === "a" ? "ay" : "pee"} em`;

export function toSpeakable(text: string): string {
  let s = text;
  // markdown and markup
  s = s.replace(/```[\s\S]*?```/g, " code block. ");
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  // a URL is "link", and the full stop after it still ends the sentence
  s = s.replace(/<?https?:\/\/[^\s<>]*[^\s<>.,;:!?'")\]]>?/g, " link ");
  s = s.replace(/^\s{0,3}(#{1,6}|[-*+]|\d+[.)])\s+/gm, "");
  s = s.replace(/[*_`~#>|]/g, " ");
  // emoji and other pictographs
  s = s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " ");
  for (const [re, to] of ABBREVIATIONS) s = s.replace(re, to);
  // "a.m." before names: its letters are not initials
  s = names(s);
  // money, times, percentages, ordinals, decimals, thousands separators
  s = s.replace(/\$\s?(\d[\d,]*)(?:\.(\d{1,2}))?/g, money);
  // "am" is a word: it is a time of day only straight after a number, or dotted ("a.m.")
  s = s.replace(/(\d)\s?([ap])\.?m\b\.?/gi, (_, d: string, x: string) => `${d} ${meridiem(x)}`);
  s = s.replace(/\b([ap])\.m\.?/gi, (_, x: string) => meridiem(x));
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, clock);
  s = s.replace(/(\d)\s?%/g, "$1 percent");
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, n: string) => ordinal(Number(n)));
  s = s.replace(/\b(\d[\d,]*)\.(\d+)\b/g, (_, a: string, b: string) => `${a.replace(/,/g, "")} point ${digits(b)}`);
  s = s.replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (m) => m.replace(/,/g, ""));
  // every number left becomes words here, not in the engine, so the words can be counted (the
  // emphasis marks are by word) and a year is said as one; a very long one is read digit by digit
  s = s.replace(/\d+/g, (m) => ` ${m.length > 15 ? digits(m) : spoken(Number(m))} `);
  // symbols with a spoken name
  s = s.replace(/&/g, " and ").replace(/\+/g, " plus ").replace(/=/g, " equals ").replace(/@/g, " at ").replace(/°/g, " degrees ");
  s = s.replace(/(\w)\/(\w)/g, "$1 slash $2");
  // dashes and brackets become pauses; whatever is left that is not a word or a pause is dropped
  s = s.replace(/\s[–—-]+\s|[–—]/g, ", ").replace(/[()[\]{}:;]/g, ", ");
  s = s.replace(/[^\p{L}\p{N}\s.,!?'’-]/gu, " ");
  // tidy the pauses: no space before one, no doubled commas, no comma against a full stop or an edge
  s = s.replace(/\s+([.,!?])/g, "$1").replace(/,(\s*,)+/g, ",").replace(/,+([.!?])/g, "$1");
  return s.replace(/^[\s,]+|[\s,]+$/g, "").replace(/\s+/g, " ");
}
