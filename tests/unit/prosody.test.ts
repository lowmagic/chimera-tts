import { expect, test } from "bun:test";
import type { Phrase, Plan } from "../../vendor/chimera/src/wasm/types.ts";
import { naturalPitch } from "../../src/prosody.ts";

const VOWELS = new Set(["a", "e", "i", "o", "u"]);
/**
 * A stand-in for the engine: words written as letters, one segment each, 0.1 s long; a vowel in
 * capitals has the main stress. Phrases are separated by "," (a comma's pause), "." or "?".
 */
function fake(text: string): { phrases: Phrase[]; plan: Plan; counts: number[] } {
  const phrases: Phrase[] = [], segments: Plan["segments"] = [];
  let t = 0;
  for (const m of text.matchAll(/([^,.?]+)([,.?])/g)) {
    const words = m[1].trim().split(/\s+/);
    phrases.push({
      words: words.map((w) => w.toLowerCase()),
      intonation: m[2] === "?" ? "question" : "statement",
      pause: m[2] === "," ? 0.18 : 0.35,
      segments: words.flatMap((w) => [...w].map((ch, i) => ({ ipa: ch.toLowerCase(), stress: VOWELS.has(ch.toLowerCase()) && ch === ch.toUpperCase() ? 1 : 0, wordEnd: i === w.length - 1 }))),
    });
    for (const s of phrases[phrases.length - 1].segments) segments.push({ ipa: s.ipa, t0: t, t1: (t += 0.1), stress: s.stress, kind: VOWELS.has(s.ipa) ? "vowel" : "stop" });
    t += m[2] === "," ? 0.18 : 0.35;
  }
  const plan: Plan = { segments, end: t, gestures: [{ t0: 0, t1: 1, rampIn: 0.06, rampOut: 0.06, strength: 1, targets: { f0: 999 }, label: "pitch" }, { t0: 0, t1: 1, rampIn: 0.01, rampOut: 0.01, strength: 1, targets: { jaw: 0.5 }, label: "a" }] };
  return { phrases, plan, counts: segments.map(() => 1) };
}

const BASE = 100;
/** the pitch of each vowel in order, in semitones from the base (the last target set within it) */
function contour(text: string, o: { emphasis?: number[]; mood?: "excited" | "sad" } = {}): number[] {
  const { phrases, plan, counts } = fake(text);
  const pitch = naturalPitch(phrases, plan, counts, { base: BASE, ...o }).filter((g) => g.label === "pitch");
  return plan.segments.filter((s) => s.kind === "vowel").map((v) => {
    const g = pitch.filter((g) => g.t0 >= v.t0 - 1e-9 && g.t0 < v.t1 - 1e-9).at(-1)!;
    return 12 * Math.log2(g.targets.f0! / BASE);
  });
}

test("the plan's other gestures are kept and its pitch gestures replaced", () => {
  const { phrases, plan, counts } = fake("bAd dOg.");
  const out = naturalPitch(phrases, plan, counts, { base: BASE });
  expect(out.filter((g) => g.label === "a")).toHaveLength(1);
  expect(out.some((g) => g.targets.f0 === 999)).toBe(false);
  expect(out.filter((g) => g.label === "pitch").length).toBeGreaterThanOrEqual(2);
  for (const g of out) expect(g.t1).toBeGreaterThan(g.t0);
});

test("a statement ends at the bottom of the voice", () => {
  const c = contour("the bAd dOg sat.");
  expect(c.at(-1)!).toBeLessThan(-4);
  expect(Math.min(...c)).toBe(c.at(-1)!);
});

test("content words are accented and function words are not", () => {
  // "the" and "of" (stressed in the dictionary sense here, to show the word list decides)
  const [the, bad, of, dog] = contour("thE bAd Of dOg, ran.");
  expect(bad - the).toBeGreaterThan(2);
  expect(bad - of).toBeGreaterThan(2);
  expect(dog).toBeGreaterThan(of);
});

test("before a comma the pitch ends up, not at the bottom", () => {
  const c = contour("bAd dOg sAt on, the mat.");
  const beforeComma = c[3]; // "on"
  expect(beforeComma).toBeGreaterThan(0);
  expect(beforeComma).toBeGreaterThan(c[2] - 3); // no fall to the floor
});

test("a yes/no question climbs to its end; a wh-question falls", () => {
  const yn = contour("is thE bAd dOg bIg?");
  expect(yn.at(-1)!).toBeGreaterThan(5);
  const wh = contour("whEn dId thE dOg sIt?");
  expect(wh.at(-1)!).toBeLessThan(-4);
  expect(wh[0]).toBeGreaterThan(2); // the wh-word itself is high
});

test("an emphasized word stands well above the rest, and what follows it is flattened", () => {
  const plain = contour("bAd dOg bIt mAd cAt nOw, ok.");
  const marked = contour("bAd dOg bIt mAd cAt nOw, ok.", { emphasis: [1] });
  expect(marked[1] - plain[1]).toBeGreaterThan(2.5);
  expect(marked[1]).toBe(Math.max(...marked));
  // the accents after it are smaller than they were
  expect(marked[3] - marked[2]).toBeLessThan(plain[3] - plain[2] + 3);
  expect(marked[4]).toBeLessThan(plain[4]);
});

test("an emphasized function word is accented too", () => {
  const plain = contour("bAd dog Is in, ok."), marked = contour("bAd dog Is in, ok.", { emphasis: [2] });
  expect(marked[2] - plain[2]).toBeGreaterThan(4);
});

test("a mood moves the whole voice and widens or narrows its range", () => {
  const range = (c: number[]) => Math.max(...c) - Math.min(...c.slice(0, -1));
  const neutral = contour("bAd dOg bIt mAd cAt, ok."), excited = contour("bAd dOg bIt mAd cAt, ok.", { mood: "excited" }), sad = contour("bAd dOg bIt mAd cAt, ok.", { mood: "sad" });
  expect(excited[0]).toBeGreaterThan(neutral[0] + 1.5);
  expect(sad[0]).toBeLessThan(neutral[0] - 1);
  expect(range(excited)).toBeGreaterThan(range(neutral));
  expect(range(sad)).toBeLessThan(range(neutral));
});

test("later phrases of a sentence start lower, and the same input gives the same contour", () => {
  const c = contour("bAd dOg, bAd dOg, bAd dOg.");
  expect(c[2]).toBeLessThan(c[0]);
  expect(c[4]).toBeLessThan(c[2] + 0.5);
  expect(contour("bAd dOg, bAd dOg, bAd dOg.")).toEqual(c);
});

test("a phrase with no vowels, or only function words, still plans", () => {
  expect(contour("it is.")).toHaveLength(2);
  const { phrases, plan, counts } = fake("shh.");
  expect(naturalPitch(phrases, plan, counts, { base: BASE }).filter((g) => g.label === "pitch")).toHaveLength(0);
});
