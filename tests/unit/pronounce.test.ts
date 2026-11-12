import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { LEXICON, withLexicon, wordsIn } from "../../src/lexicon.ts";
import { setKnownWords, toSpeakable } from "../../src/normalize.ts";

const cmudict = gunzipSync(readFileSync(new URL("../../vendor/chimera/public/data/cmudict.txt.gz", import.meta.url))).toString();
const dictionary = withLexicon(cmudict), words = wordsIn(dictionary);
beforeAll(() => setKnownWords((w) => words.has(w)));
afterAll(() => setKnownWords(null));

const PHONES = new Set("AA AE AH AO AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z ZH".split(" "));

test("the lexicon is well-formed ARPAbet with one main stress a word, and is added to the dictionary", () => {
  for (const [word, phones] of Object.entries(LEXICON)) {
    expect(word).toMatch(/^[a-z']+$/);
    for (const p of phones.split(" ")) expect(PHONES.has(p.replace(/[012]$/, ""))).toBe(true);
    expect(phones.match(/1/g)?.length).toBe(1);
  }
  expect(dictionary).toContain("\nchatgpt\tCH AE2 T JH IY2 P IY2 T IY1\n");
  expect(words.has("chatgpt") && words.has("hello") && !words.has("zxqv")).toBe(true);
  // the dictionary's own text is still all there, and the lexicon's lines come after it
  expect(dictionary.startsWith(cmudict.trimEnd())).toBe(true);
});

test("names in the lexicon or the dictionary are left whole", () => {
  expect(toSpeakable("ChatGPT and OpenAI use PyTorch on GitHub.")).toBe("ChatGPT and OpenAI use PyTorch on GitHub.");
  expect(toSpeakable("Ask NASA, or the FBI.")).toBe("Ask NASA, or the FBI.");
  expect(toSpeakable("STOP. I said NO!")).toBe("STOP. I said NO!");
});

test("initials the dictionary lacks are said as letters", () => {
  expect(toSpeakable("A GPT model")).toBe("A gee pee tee model");
  expect(toSpeakable("two LLMs")).toBe("two el el em's");
  expect(toSpeakable("in the US, show ID")).toBe("in the u ess, show eye dee");
  expect(toSpeakable("GPT4")).toBe("gee pee tee four");
});

test("joined names are split, and their initials spelled", () => {
  expect(toSpeakable("DailyTalk is a dataset")).toBe("Daily Talk is a dataset");
  expect(toSpeakable("the XQModel")).toBe("the ex cue Model");
});

test("every word the letter names use is one the voice can say", () => {
  for (const w of toSpeakable("ABCDEF GHIJKL MNOPQR STUVWX YZ").split(" ")) expect(words.has(w)).toBe(true);
});

test("before the dictionary loads, only vowel-less capitals are letters", () => {
  setKnownWords(null);
  expect(toSpeakable("STOP the GPT")).toBe("STOP the gee pee tee");
  expect(toSpeakable("DailyTalk")).toBe("Daily Talk");
  setKnownWords((w) => words.has(w));
});
