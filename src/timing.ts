/**
 * Timing from a trained model: Chimera times every sound by rule (Klatt's), which is even and a
 * little mechanical. A model trained with syllable lengths (training/README.md, "Timing") says,
 * for each syllable, how much longer or shorter than Chimera's own a person would make it, and
 * the phrases are planned again with every sound of the syllable stretched by that much.
 *
 * A syllable here runs from its vowel's start to the next vowel's start, pauses left out; the
 * consonants before an utterance's first vowel go with the first syllable. The training code
 * measures recordings the same way (`textgrid_rhythm` in training/prosody/align.py).
 */
import type { Phrase, Plan } from "../vendor/chimera/src/wasm/types.ts";

export interface Timing {
  /** per phrase, per segment it was given: how long the plan made it (s) and which syllable it is in */
  segments: { dur: number; syllable: number }[][];
  /** each syllable's length in the plan (s) */
  lengths: number[];
}

/** `counts[i]` is how many planned segments input segment i became (a diphthong is two). */
export function syllableTiming(phrases: readonly Phrase[], plan: Plan, counts: readonly number[]): Timing {
  const lengths: number[] = [];
  let k = 0, j = 0;
  const segments = phrases.map((p) => p.segments.map(() => {
    const n = counts[k++] ?? 1;
    const a = plan.segments[j], b = plan.segments[j + n - 1];
    j += n;
    const dur = a && b ? b.t1 - a.t0 : 0;
    if (a?.kind === "vowel") lengths.push(0);
    if (lengths.length) lengths[lengths.length - 1] += dur;
    return { dur, syllable: Math.max(0, lengths.length - 1) };
  }));
  return { segments, lengths };
}

/**
 * The phrases with every segment's length set: what the plan gave it (made at speed `rate`),
 * times its syllable's `stretch`. Planned again at the same rate, they come out that long.
 */
export function stretched(phrases: readonly Phrase[], timing: Timing, stretch: readonly number[], rate: number): Phrase[] {
  return phrases.map((p, pi) => ({
    ...p,
    segments: p.segments.map((s, si) => {
      const t = timing.segments[pi][si];
      return t.dur > 0 ? { ...s, dur: t.dur * rate * (stretch[t.syllable] ?? 1) } : s;
    }),
  }));
}
