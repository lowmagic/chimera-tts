import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Phrase, Plan } from "../../vendor/chimera/src/wasm/types.ts";
import { PitchModel, featurize, trainedPitch, utteranceOf, type Features, type ModelFile, type UttPhrase } from "../../src/trained.ts";
import { layout } from "../../src/prosody.ts";

const fixture = (name: string) => new URL(`../fixtures/${name}`, import.meta.url);
const meta: ModelFile = JSON.parse(readFileSync(fixture("prosody-tiny.json"), "utf8"));
const bin = () => new Uint8Array(readFileSync(fixture("prosody-tiny.bin"))).buffer;

test("the features match the training code's, sentence by sentence", () => {
  const cases: { text: string; phrases: UttPhrase[]; features: Features[] }[] = JSON.parse(readFileSync(fixture("prosody-features.json"), "utf8"));
  expect(cases.length).toBeGreaterThan(4);
  for (const c of cases) {
    const got = featurize(c.phrases);
    expect(got.map((f) => f.cat)).toEqual(c.features.map((f) => f.cat));
    got.forEach((f, i) => f.num.forEach((v, j) => expect(v).toBeCloseTo(c.features[i].num[j], 5)));
  }
});

test("the network's arithmetic matches PyTorch's on the exported example", () => {
  const model = PitchModel.from(meta, bin());
  const y = model.raw(meta.check.phrases);
  expect(y).toHaveLength(meta.check.y.length);
  y.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(meta.check.y[i][j], 3)));
  expect(model.predict(meta.check.phrases)[0][0]).toBeCloseTo(y[0][0] * meta.scale, 5);
});

test("a model whose weights don't give its example is refused", () => {
  const broken = new Float32Array(bin());
  broken.fill(0.5, 0, 40);
  expect(() => PitchModel.from(meta, broken.buffer)).toThrow(/check/);
});

/** "the bad dog, sat?" as the engine would hand it over: one segment a letter, 0.1 s each */
function fake(): { phrases: Phrase[]; plan: Plan; counts: number[] } {
  const VOWELS = "aeiou";
  const spec: [string[], string][] = [[["the", "bAd", "dOg"], ","], [["sAt"], "?"]];
  const phrases: Phrase[] = [], segments: Plan["segments"] = [];
  let t = 0;
  for (const [words, end] of spec) {
    const p: Phrase = {
      words: words.map((w) => w.toLowerCase()),
      intonation: end === "?" ? "question" : "statement",
      pause: end === "," ? 0.18 : 0.35,
      segments: words.flatMap((w) => [...w].map((ch, i) => ({ ipa: ch.toLowerCase(), stress: ch !== ch.toLowerCase() ? 1 : 0, wordEnd: i === w.length - 1 }))),
    };
    phrases.push(p);
    for (const s of p.segments) segments.push({ ipa: s.ipa, t0: t, t1: (t += 0.1), stress: s.stress, kind: VOWELS.includes(s.ipa) ? "vowel" : "stop" });
    t += p.pause;
  }
  const other = { t0: 0, t1: 1, rampIn: 0.01, rampOut: 0.01, strength: 1, targets: { jaw: 0.5 }, label: "a" };
  const old = { t0: 0, t1: 1, rampIn: 0.06, rampOut: 0.06, strength: 1, targets: { f0: 999 }, label: "pitch" };
  return { phrases, plan: { segments, end: t, gestures: [old, other] }, counts: segments.map(() => 1) };
}

test("the engine's phrases become the utterance the model was trained on", () => {
  const { phrases, plan, counts } = fake();
  expect(utteranceOf(layout(phrases, plan, counts), phrases.flatMap((p) => p.words))).toEqual([
    { words: [["the", [0]], ["bad", [1]], ["dog", [1]]], end: "comma" },
    { words: [["sat", [1]]], end: "question" },
  ]);
});

test("the plan's pitch is replaced by the model's, two targets to a long vowel, and emphasis lifts a word", () => {
  const { phrases, plan, counts } = fake();
  const model = PitchModel.from(meta, bin());
  const out = trainedPitch(phrases, plan, counts, model, { base: 100 });
  const pitch = out.filter((g) => g.label === "pitch");
  expect(out.filter((g) => g.label === "a")).toHaveLength(1);
  expect(pitch.some((g) => g.targets.f0 === 999)).toBe(false);
  expect(pitch).toHaveLength(8); // four vowels of 0.1 s
  for (const g of pitch) {
    expect(g.t1).toBeGreaterThan(g.t0);
    expect(Number.isFinite(g.targets.f0!)).toBe(true);
  }
  const want = model.predict(utteranceOf(layout(phrases, plan, counts), phrases.flatMap((p) => p.words)));
  expect(12 * Math.log2(pitch[0].targets.f0! / 100)).toBeCloseTo(Math.max(-9, Math.min(12, want[0][0])), 4);
  const loud = trainedPitch(phrases, plan, counts, model, { base: 100, emphasis: [2] }).filter((g) => g.label === "pitch");
  expect(loud[4].targets.f0!).toBeGreaterThan(pitch[4].targets.f0!);
  expect(loud[0].targets.f0!).toBeCloseTo(pitch[0].targets.f0!, 6);
});
