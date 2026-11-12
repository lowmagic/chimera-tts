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
