/**
 * Harder stops and more voice under voiced consonants, by adjusting a finished Chimera speech
 * plan (the planner itself is untouched). Both are multipliers from 1 (Chimera's own) to 2.
 *
 * `plosives`: the breath pushes harder behind each stop's closure, so more pressure is let go at
 * its release, and an aspirated stop's puff ("p" in "pat") is wider and a little longer.
 *
 * `voicing`: Chimera's /b d g/ fall nearly silent while closed, and its /v z/ hiss more than they
 * hum. For the stops the larynx is lowered through the closure and the folds held closer, which
 * is how people keep their voice going behind one (the lowering makes room for the air); the
 * voiced fricatives get less of the opening that makes their hiss.
 *
 * `tools/consonants.ts` measures what these do. The harder breath also makes the vowel after a
 * stop a little louder (about 2 dB overall at 2). What sounds best is for ears to say.
 */
import type { Gesture, Plan } from "../vendor/chimera/src/wasm/types.ts";

export interface Articulation {
  plosives: number;
  voicing: number;
}

const VOICED_STOPS = new Set(["b", "d", "g", "d͡ʒ"]);

/** the sizes at a setting of 2 */
export const A = {
  /** breath pressure behind a stop (1 is the phrase's own), from this long before its release */
  burstBreath: 2.5,
  burstFrom: 0.08,
  burstUntil: 0.02,
  /** an aspirated release: this much wider, and this much longer (s) */
  aspiration: 1.3,
  aspirationLonger: 0.02,
  /** a voiced stop's closure: the larynx this far down (cm), the folds this much closer (cm²) */
  larynx: -1,
  adduction: -0.05,
};

const amount = (v: number) => Math.max(0, Math.min(1, v - 1));

/** The plan's gestures with the stops and the voiced consonants adjusted. */
export function articulate(plan: Plan, a: Articulation): Gesture[] {
  const p = amount(a.plosives), v = amount(a.voicing);
  if (!p && !v) return plan.gestures;
  const out = plan.gestures.map((g): Gesture => {
    if (p && g.label === "aspiration" && g.targets.abduction !== undefined) return { ...g, t1: g.t1 + A.aspirationLonger * p, targets: { abduction: g.targets.abduction * (1 + (A.aspiration - 1) * p) } };
    if (v && g.label === "voiced frication" && g.targets.abduction !== undefined) return { ...g, targets: { abduction: g.targets.abduction * (1 - v) } };
    return g;
  });
  for (const s of plan.segments) {
    if (s.kind !== "stop" && s.kind !== "affricate") continue;
    if (p) out.push({ t0: s.t1 - A.burstFrom, t1: s.t1 + A.burstUntil, rampIn: 0.02, rampOut: 0.02, strength: 10, targets: { breath: 1 + (A.burstBreath - 1) * p }, label: "burst" });
    if (v && VOICED_STOPS.has(s.ipa)) {
      out.push({ t0: s.t0 - 0.01, t1: s.t1 - 0.01, rampIn: 0.03, rampOut: 0.02, strength: 6, targets: { larynx: A.larynx * v }, label: "voice bar" });
      out.push({ t0: s.t0 - 0.01, t1: s.t1, rampIn: 0.02, rampOut: 0.02, strength: 6, targets: { abduction: A.adduction * v }, label: "voice bar" });
    }
  }
  return out;
}
