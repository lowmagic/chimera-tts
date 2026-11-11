/**
 * Natural pitch: replaces the pitch gestures of a Chimera speech plan with a contour shaped the
 * way English is spoken. Chimera's planner gives every stressed vowel the same bump and ends every
 * phrase, even one before a comma, with a full fall, which is much of why it sounds like a robot
 * reading a list.
 *
 * The contour here, per phrase (a stretch between punctuation marks):
 * - a baseline that drifts down, starting a little lower in each later phrase of a sentence;
 * - a pitch accent (a rise onto the stressed vowel) on content words only, each a little lower
 *   than the last; function words ("the", "of", "is") ride the baseline;
 * - an emphasized word (the model's *asterisks*) gets a much bigger accent, and what follows it
 *   in the phrase is flattened, as people do;
 * - the end depends on what comes next: a fall to the bottom of the voice at a full stop, a small
 *   rise before a comma (more is coming), a climb at a yes/no question, a fall at a wh-question.
 *
 * Everything is in semitones around the baseline, so it suits any body and pitch setting. It only
 * builds gestures on the F0 control: the planner's timing and articulation are untouched, and a
 * trained pitch model could later supply the same thing.
 */
import type { Gesture, Phrase, Plan, PlannedSegment } from "../vendor/chimera/src/wasm/types.ts";
import { MOODS, type Mood } from "./markup.ts";

/** words that carry no pitch accent unless emphasized */
const FUNCTION_WORDS = new Set(
  ("a an the this that these those my your his her its our their some any no " +
    "i me you he him she it we us they them myself yourself " +
    "am is are was were be been being do does did have has had will would shall should can could may might must " +
    "and or but nor so yet if as than because while although though that which who whom whose " +
    "of to in on at by for with from into onto about over under after before between through during without within up out off " +
    "not n't there here then just very too also " +
    "i'm you're he's she's it's we're they're i've you've we've they've i'll you'll he'll she'll we'll they'll i'd you'd he'd she'd we'd they'd " +
    "isn't aren't wasn't weren't don't doesn't didn't haven't hasn't hadn't won't wouldn't can't couldn't shouldn't that's there's what's let's").split(" "),
);
const WH_WORDS = new Set(["who", "whom", "whose", "what", "which", "when", "where", "why", "how", "what's", "who's", "where's", "how's"]);

/** the contour's sizes, in semitones */
const P = {
  /** how far the baseline drifts down over a phrase, per second, and at most */
  declPerSec: 1.1,
  declMax: 3,
  /** where each phrase's baseline starts: the first, then lower for each later one, down to a floor */
  resetFirst: 1.5,
  resetStep: 0.7,
  resetFloor: 0,
  accent: 3.2,
  /** each later accent in a phrase is this fraction of the one before */
  downstep: 0.86,
  /** every second accent is smaller, so a row of content words doesn't hammer */
  weakAccent: 0.7,
  secondary: 0.9,
  /** the syllable before an accent dips, which makes the accent a rise */
  preDip: -0.6,
  emphasis: 6.5,
  /** accents after an emphasized word shrink to this, and those before it to this */
  postFocus: 0.35,
  preFocus: 0.6,
  /** the bottom of the voice, where a statement ends */
  low: -4.5,
  continuationRise: 2.2,
  questionHigh: 7,
  questionLow: -1.5,
  /** a deterministic wobble per syllable, so equal words don't get equal pitches */
  jitter: 0.35,
};

const hz = (base: number, semitones: number) => base * 2 ** (semitones / 12);

/** a syllable: its vowel's time in the plan (a diphthong's two halves as one) */
interface Syllable {
  t0: number;
  t1: number;
  stress: number;
  word: number;
}

interface PhraseSpan {
  syllables: Syllable[];
  /** [first word, one past the last) among the utterance's words */
  words: [number, number];
  t0: number;
  t1: number;
  kind: "statement" | "continuation" | "question" | "wh-question";
}

export interface PitchOptions {
  /** baseline pitch (Hz) */
  base: number;
  /** indices of emphasized words, counted across the phrases */
  emphasis?: readonly number[];
  mood?: Mood;
}

/**
 * Where the phrases' syllables fall in the plan. `counts[i]` is how many planned segments input
 * segment i became (Chimera's `plannedCounts`: a diphthong is two).
 */
function layout(phrases: readonly Phrase[], plan: Plan, counts: readonly number[]): PhraseSpan[] {
  const out: PhraseSpan[] = [];
  let k = 0, j = 0, word = 0;
  phrases.forEach((p, pi) => {
    const syllables: Syllable[] = [];
    const firstWord = word;
    let first: PlannedSegment | undefined, last: PlannedSegment | undefined;
    p.segments.forEach((s, i) => {
      const n = counts[k++];
      const a = plan.segments[j], b = plan.segments[j + n - 1];
      j += n;
      if (a && b) {
        first ??= a;
        last = b;
        if (a.kind === "vowel") syllables.push({ t0: a.t0, t1: b.t1, stress: s.stress ?? 0, word });
      }
      if (s.wordEnd || i === p.segments.length - 1) word++;
    });
    if (!first || !last) return;
    const lastInUtterance = pi === phrases.length - 1;
    const kind: PhraseSpan["kind"] =
      p.intonation === "question" ? (WH_WORDS.has(p.words[0] ?? "") ? "wh-question" : "question")
      : p.pause < 0.3 && !lastInUtterance ? "continuation"
      : "statement";
    out.push({ syllables, words: [firstWord, word], t0: first.t0, t1: last.t1, kind });
  });
  return out;
}

/** a number in -1..1 from a word and a position, the same every time */
function wobble(word: string, n: number): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

/** One pitch target held from t0 to t1 (the planner's own pitch gestures have this shape). */
function hold(t0: number, t1: number, f0: number): Gesture {
  const r = Math.max(0.02, Math.min(0.06, 0.5 * (t1 - t0)));
  return { t0, t1, rampIn: r, rampOut: r, strength: 1, targets: { f0 }, label: "pitch" };
}

/** The plan's gestures with its pitch replaced by the natural contour. */
export function naturalPitch(phrases: readonly Phrase[], plan: Plan, counts: readonly number[], o: PitchOptions): Gesture[] {
  const mood = MOODS[o.mood ?? "neutral"];
  const emphasized = new Set(o.emphasis ?? []);
  const words = phrases.flatMap((p) => p.words);
  const pitch: Gesture[] = [];

  layout(phrases, plan, counts).forEach((ph, pi) => {
    const syl = ph.syllables;
    if (!syl.length) return;
    const dur = Math.max(0.05, ph.t1 - ph.t0);
    const start = Math.max(P.resetFloor, P.resetFirst - P.resetStep * pi);
    const decl = Math.min(P.declMax, P.declPerSec * dur);
    const baseline = (t: number) => start - decl * ((t - ph.t0) / dur);

    // ---- which syllables are accented: the main stress of each content or emphasized word
    const accentOf = new Map<number, number>(); // word → syllable index
    for (let w = ph.words[0]; w < ph.words[1]; w++) {
      if (FUNCTION_WORDS.has(words[w]) && !emphasized.has(w)) continue;
      const own = syl.map((s, i) => ({ s, i })).filter((x) => x.s.word === w);
      const main = own.find((x) => x.s.stress === 1) ?? (emphasized.has(w) ? own[0] : undefined);
      if (main) accentOf.set(w, main.i);
    }
    // a phrase of function words only ("it is.") still needs somewhere to turn: its last stressed
    // syllable, or its last
    if (!accentOf.size) {
      const i = syl.findLastIndex((s) => s.stress === 1);
      accentOf.set(syl[i < 0 ? syl.length - 1 : i].word, i < 0 ? syl.length - 1 : i);
    }
    const accents = [...accentOf.values()].sort((a, b) => a - b);
    // the nucleus: the emphasized word if there is one, else the last accent
    const focus = accents.findLast((i) => emphasized.has(syl[i].word));
    const nucleus = focus ?? accents[accents.length - 1];

    // ---- each syllable's height above the baseline (semitones, before the mood's range)
    const height = new Array<number>(syl.length).fill(0);
    let size = P.accent, n = 0;
    for (const i of accents) {
      const isFocus = emphasized.has(syl[i].word);
      let a = isFocus ? P.emphasis : i === nucleus ? Math.max(size, P.accent * 0.8) : size * (n % 2 ? P.weakAccent : 1);
      if (focus !== undefined && i !== focus) a *= i > focus ? P.postFocus : P.preFocus;
      height[i] = a;
      if (i > 0 && height[i - 1] === 0) height[i - 1] = P.preDip;
      size *= P.downstep;
      n++;
    }
    syl.forEach((s, i) => {
      if (height[i] === 0 && s.stress === 2) height[i] = P.secondary;
      height[i] += P.jitter * wobble(words[s.word] ?? "", i);
    });

    // ---- the phrase's ending, from the nucleus on
    const tail = syl.length - 1 - nucleus; // syllables after the nucleus
    /** [fraction of the way through the vowel, semitones] for a pitch that moves within a syllable */
    const moving = new Map<number, [number, number][]>();
    const end = { statement: P.low, "wh-question": P.low, continuation: P.continuationRise, question: P.questionHigh }[ph.kind];
    const absolute = new Map<number, number>(); // syllables whose pitch is set outright, not on the baseline
    if (ph.kind === "question") {
      // low on the nucleus, then up and up to the end
      if (tail === 0) moving.set(nucleus, [[0, P.questionLow], [0.45, end]]);
      else {
        absolute.set(nucleus, P.questionLow);
        for (let i = nucleus + 1; i < syl.length; i++) absolute.set(i, P.questionLow + (end - P.questionLow) * ((i - nucleus) / tail) ** 0.8);
      }
    } else if (ph.kind === "continuation") {
      // down a little after the nucleus, then a small rise on the last syllable: more is coming
      if (tail === 0) moving.set(nucleus, [[0, baseline(syl[nucleus].t0) + height[nucleus] * mood.range], [0.55, baseline(ph.t1) + end * mood.range]]);
      else {
        for (let i = nucleus + 1; i < syl.length - 1; i++) height[i] = -0.8;
        absolute.set(syl.length - 1, baseline(ph.t1) + end * mood.range);
      }
    } else {
      // a statement (or a wh-question): from the nucleus's peak down to the bottom of the voice
      const peak = baseline(syl[nucleus].t0) + height[nucleus] * mood.range;
      if (tail === 0) moving.set(nucleus, [[0, peak], [0.5, end]]);
      else for (let i = nucleus + 1; i < syl.length; i++) absolute.set(i, peak + (end - peak) * ((i - nucleus) / tail) ** 0.6);
    }

    // ---- gestures: each target holds through the consonants to the next vowel
    syl.forEach((s, i) => {
      const until = i < syl.length - 1 ? Math.max(s.t1, syl[i + 1].t0 - 0.03) : s.t1;
      const steps = moving.get(i);
      if (steps && s.t1 - s.t0 > 0.08) {
        steps.forEach(([at, st], k) => {
          const a = s.t0 + at * (s.t1 - s.t0), b = k < steps.length - 1 ? s.t0 + (steps[k + 1][0] - 0.2) * (s.t1 - s.t0) : until;
          pitch.push(hold(a, Math.max(a + 0.02, b), hz(o.base, mood.shift + st)));
        });
        return;
      }
      // too short a vowel to move within: it takes where the movement ends
      const st = steps ? steps[steps.length - 1][1] : (absolute.get(i) ?? baseline(s.t0) + height[i] * mood.range);
      pitch.push(hold(s.t0, until, hz(o.base, mood.shift + st)));
    });
  });

  return [...plan.gestures.filter((g) => g.label !== "pitch"), ...pitch];
}
