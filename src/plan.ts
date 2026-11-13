/**
 * Text → a Chimera speech plan, with the pitch contour chosen here. Shared by the page
 * (`voice.ts`) and the offline renderer (`tools/render.ts`), so a clip rendered for comparison is
 * what the page would say.
 */
import type { BodyMix, Phrase, Plan } from "../vendor/chimera/src/wasm/types.ts";
import { MOODS, type Mood } from "./markup.ts";
import { articulate } from "./articulation.ts";
import { layout, naturalPitch } from "./prosody.ts";
import { stretched, syllableTiming } from "./timing.ts";
import { trainedPitch, utteranceOf, type PitchModel } from "./trained.ts";

/** the parts of Chimera's engine facade this needs (imported only after the wasm has loaded) */
export interface PlannerApi {
  planPhrases(phrases: Phrase[], options: { body: BodyMix; t0: number; rate?: number; f0?: number }): Plan;
  plannedCounts(ipa: string[]): number[];
}

export interface SpeechOptions {
  body: BodyMix;
  /** speaking-rate multiplier */
  rate: number;
  /** baseline pitch (Hz) */
  f0: number;
  /** natural pitch (`prosody.ts`), or the planner's own */
  natural: boolean;
  /** with natural pitch: a trained model to take the contour from, instead of the rules */
  model?: PitchModel | null;
  /** with a model that has them: its syllable lengths too (`timing.ts`); on unless false */
  timing?: boolean;
  emphasis?: readonly number[];
  /** how many words the emphasis indices were counted over */
  wordCount?: number;
  mood?: Mood;
  /** harder stops and more voice under voiced consonants (`articulation.ts`): 1, Chimera's own, to 2 */
  plosives?: number;
  voicing?: number;
}

export function planSpeech(api: PlannerApi, phrases: Phrase[], o: SpeechOptions): Plan {
  const plan = pitched(api, phrases, o);
  return { ...plan, gestures: articulate(plan, { plosives: o.plosives ?? 1, voicing: o.voicing ?? 1 }) };
}

function pitched(api: PlannerApi, phrases: Phrase[], o: SpeechOptions): Plan {
  if (!o.natural) return api.planPhrases(phrases, { body: o.body, t0: 0, rate: o.rate, f0: o.f0 });
  const mood = MOODS[o.mood ?? "neutral"];
  const rate = o.rate * mood.rate;
  let plan = api.planPhrases(phrases, { body: o.body, t0: 0, rate, f0: o.f0 });
  const counts = api.plannedCounts(phrases.flatMap((p) => p.segments.map((s) => s.ipa)));
  // the emphasis marks count words as the text was split here; if the engine split it another
  // way (it shouldn't), they would land on the wrong words, so they are dropped
  const said = phrases.reduce((n, p) => n + p.words.length, 0);
  const emphasis = o.emphasis && (o.wordCount ?? said) === said ? o.emphasis : [];
  const pitch = { base: o.f0, emphasis, mood: o.mood };
  if (o.model?.timed && o.timing !== false) {
    // the model's syllable lengths: read off Chimera's own plan, stretched, and planned again
    const spans = layout(phrases, plan, counts).filter((ph) => ph.syllables.length);
    const stretch = o.model.stretch(utteranceOf(spans, phrases.flatMap((p) => p.words)));
    phrases = stretched(phrases, syllableTiming(phrases, plan, counts), stretch, rate);
    plan = api.planPhrases(phrases, { body: o.body, t0: 0, rate, f0: o.f0 });
  }
  return { ...plan, gestures: o.model ? trainedPitch(phrases, plan, counts, o.model, pitch) : naturalPitch(phrases, plan, counts, pitch) };
}
