import { expect, test } from "bun:test";
import { A, articulate } from "../../src/articulation.ts";
import type { Gesture, Plan } from "../../vendor/chimera/src/wasm/types.ts";

const g = (label: string, t0: number, t1: number, targets: Gesture["targets"]): Gesture => ({ t0, t1, rampIn: 0.03, rampOut: 0.03, strength: 6, targets, label });
// "pa", "ba", "za" as the planner lays them out
const plan: Plan = {
  end: 1,
  segments: [
    { ipa: "pʰ", kind: "stop", t0: 0.1, t1: 0.18 }, { ipa: "ɑ", kind: "vowel", t0: 0.18, t1: 0.3 },
    { ipa: "b", kind: "stop", t0: 0.3, t1: 0.38 }, { ipa: "ɑ", kind: "vowel", t0: 0.38, t1: 0.5 },
    { ipa: "z", kind: "fricative", t0: 0.5, t1: 0.6 }, { ipa: "ɑ", kind: "vowel", t0: 0.6, t1: 0.8 },
  ],
  gestures: [g("aspiration", 0.12, 0.2, { abduction: 0.36 }), g("voiced frication", 0.5, 0.6, { abduction: 0.035 }), g("pitch", 0.18, 0.3, { f0: 110 }), g("breath", 0.04, 1, { breath: 1 })],
};
const added = (out: Gesture[], label: string) => out.filter((x) => x.label === label);

test("at 1 the plan is Chimera's own", () => {
  expect(articulate(plan, { plosives: 1, voicing: 1 })).toBe(plan.gestures);
});

test("plosives: more breath behind every stop's release and a bigger puff, nothing else touched", () => {
  const out = articulate(plan, { plosives: 2, voicing: 1 });
  const bursts = added(out, "burst");
  expect(bursts.map((b) => [b.t0, b.t1])).toEqual([[0.18 - A.burstFrom, 0.18 + A.burstUntil], [0.38 - A.burstFrom, 0.38 + A.burstUntil]]);
  expect(bursts.every((b) => b.targets.breath === A.burstBreath)).toBe(true);
  const puff = added(out, "aspiration")[0];
  expect(puff.targets.abduction).toBeCloseTo(0.36 * A.aspiration);
  expect(puff.t1).toBeCloseTo(0.2 + A.aspirationLonger);
  expect(added(out, "voice bar")).toEqual([]);
  expect(added(out, "voiced frication")).toEqual(added(plan.gestures, "voiced frication"));
  expect(added(out, "pitch")).toEqual(added(plan.gestures, "pitch"));
});

test("voicing: the larynx drops under voiced stops only, and voiced fricatives open less", () => {
  const out = articulate(plan, { plosives: 1, voicing: 1.5 });
  const bars = added(out, "voice bar");
  expect(bars.length).toBe(2); // both on the b, none on the p
  expect(bars.every((b) => b.t0 > 0.28 && b.t1 <= 0.38)).toBe(true);
  expect(bars.map((b) => b.targets)).toEqual([{ larynx: A.larynx / 2 }, { abduction: A.adduction / 2 }]);
  expect(added(out, "voiced frication")[0].targets.abduction).toBeCloseTo(0.0175);
  expect(added(out, "burst")).toEqual([]);
});

test("settings past the ends are held to them, and the plan itself is never changed", () => {
  const before = JSON.stringify(plan);
  expect(articulate(plan, { plosives: 9, voicing: 9 })).toEqual(articulate(plan, { plosives: 2, voicing: 2 }));
  expect(articulate(plan, { plosives: 0, voicing: -1 })).toBe(plan.gestures);
  expect(JSON.stringify(plan)).toBe(before);
});
