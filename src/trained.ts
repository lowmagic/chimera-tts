/**
 * Pitch from a trained model: the same job as `prosody.ts` (replace a plan's pitch gestures),
 * with each syllable's pitch predicted by a small network trained on recordings of a person
 * reading (training/README.md) instead of worked out by rules.
 *
 * The network is embeddings → a linear layer → a bidirectional GRU → a linear layer, small enough
 * to run here as plain arithmetic. `featurize` must compute exactly what training/prosody/text.py
 * computes; tests/unit/trained.test.ts holds both to the same fixture, and every exported model
 * carries a worked example that `PitchModel.from` checks itself against.
 */
import type { Gesture, Phrase, Plan } from "../vendor/chimera/src/wasm/types.ts";
import { MOODS } from "./markup.ts";
import { FUNCTION_WORDS, P, WH_WORDS, hold, hz, layout, type PhraseSpan, type PitchOptions } from "./prosody.ts";

const ENDS = ["comma", "final", "question"] as const;

export interface UttPhrase {
  /** each word and its syllables' stresses (0 none, 1 main, 2 secondary) */
  words: [text: string, stresses: number[]][];
  end: (typeof ENDS)[number];
}

export interface Features {
  /** the word, then stress, place in the word, the phrase's ending, what came before, function word, wh-phrase */
  cat: [string, ...number[]];
  num: number[];
}

/** Every syllable's features, in order. Mirrors `featurize` in training/prosody/text.py. */
export function featurize(utt: readonly UttPhrase[]): Features[] {
  const out: Features[] = [];
  let prev = 0;
  utt.forEach((ph, pi) => {
    const nSyl = ph.words.reduce((n, w) => n + w[1].length, 0);
    const wh = WH_WORDS.has(ph.words[0]?.[0] ?? "") ? 1 : 0;
    let nuclear = -1, k = 0;
    for (const [text, stresses] of ph.words) for (const st of stresses) {
      if (st === 1 && !FUNCTION_WORDS.has(text)) nuclear = k;
      k++;
    }
    k = 0;
    ph.words.forEach(([text, stresses], wi) => {
      const fn = FUNCTION_WORDS.has(text) ? 1 : 0, n = stresses.length;
      stresses.forEach((st, si) => {
        out.push({
          cat: [text, fn ? 0 : st, n === 1 ? 0 : si === 0 ? 1 : si === n - 1 ? 3 : 2, ENDS.indexOf(ph.end), prev, fn, wh],
          num: [
            Math.min(k, 30) / 10,
            Math.min(nSyl - 1 - k, 30) / 10,
            Math.min(nSyl, 40) / 20,
            Math.min(pi, 5) / 5,
            Math.min(ph.words.length - 1 - wi, 20) / 10,
            k === nSyl - 1 ? 1 : 0,
            k === nuclear ? 1 : 0,
            nuclear >= 0 && k > nuclear ? 1 : 0,
          ],
        });
        k++;
      });
    });
    prev = 1 + ENDS.indexOf(ph.end);
  });
  return out;
}

/** the JSON half of an exported model (training/prosody/export.py) */
export interface ModelFile {
  format: number;
  hidden: number;
  words: string[];
  scale: number;
  tensors: { name: string; shape: number[]; offset: number }[];
  check: { phrases: UttPhrase[]; y: number[][] };
  about?: Record<string, number>;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** y = W x + b, W row-major (rows × x.length) */
function affine(W: Float32Array, b: Float32Array | null, x: Float32Array, rows: number): Float32Array {
  const cols = x.length, y = new Float32Array(rows);
  for (let r = 0, at = 0; r < rows; r++) {
    let sum = b ? b[r] : 0;
    for (let c = 0; c < cols; c++) sum += W[at++] * x[c];
    y[r] = sum;
  }
  return y;
}

export class PitchModel {
  readonly scale: number;
  private readonly t = new Map<string, Float32Array>();
  private readonly vocab = new Map<string, number>();
  private readonly dims: number[] = [];

  private constructor(private readonly meta: ModelFile, weights: Float32Array) {
    for (const { name, shape, offset } of meta.tensors) this.t.set(name, weights.subarray(offset, offset + shape.reduce((a, b) => a * b, 1)));
    meta.words.forEach((w, i) => this.vocab.set(w, i));
    for (let i = 0; this.t.has(`embeddings.${i}.weight`); i++) this.dims.push(meta.tensors.find((t) => t.name === `embeddings.${i}.weight`)!.shape[1]);
    this.scale = meta.scale;
  }

  /** A model from its two files. Throws if it can't reproduce the example it was exported with. */
  static from(meta: ModelFile, bin: ArrayBuffer): PitchModel {
    if (meta.format !== 1) throw new Error(`pitch model format ${meta.format} is not one this app reads`);
    const model = new PitchModel(meta, new Float32Array(bin));
    const got = model.raw(meta.check.phrases);
    const worst = Math.max(...got.flatMap((row, i) => row.map((v, j) => Math.abs(v - meta.check.y[i][j]))));
    if (!(worst < 1e-3) || got.length !== meta.check.y.length) throw new Error(`pitch model fails its own check (off by ${worst})`);
    return model;
  }

  /** The model at a URL (its .bin beside it), or null if there is none or it is broken. */
  static async load(url: string): Promise<PitchModel | null> {
    try {
      const [meta, bin] = await Promise.all([fetch(url), fetch(url.replace(/\.json$/, ".bin"))]);
      if (!meta.ok || !bin.ok || !(meta.headers.get("content-type") ?? "").includes("json")) return null;
      return PitchModel.from(await meta.json(), await bin.arrayBuffer());
    } catch (e) {
      console.warn("trained pitch model not used:", e);
      return null;
    }
  }

  private get(name: string): Float32Array {
    const a = this.t.get(name);
    if (!a) throw new Error(`pitch model has no ${name}`);
    return a;
  }

  /** one direction of the GRU over the inputs (PyTorch's gate order: reset, update, new) */
  private gru(xs: Float32Array[], suffix: string, reverse: boolean): Float32Array[] {
    const H = this.meta.hidden;
    const Wi = this.get(`gru.weight_ih_l0${suffix}`), Wh = this.get(`gru.weight_hh_l0${suffix}`), bi = this.get(`gru.bias_ih_l0${suffix}`), bh = this.get(`gru.bias_hh_l0${suffix}`);
    const out = new Array<Float32Array>(xs.length);
    let h = new Float32Array(H);
    for (let s = 0; s < xs.length; s++) {
      const i = reverse ? xs.length - 1 - s : s;
      const a = affine(Wi, bi, xs[i], 3 * H), b = affine(Wh, bh, h, 3 * H), next = new Float32Array(H);
      for (let j = 0; j < H; j++) {
        const r = sigmoid(a[j] + b[j]), z = sigmoid(a[H + j] + b[H + j]), n = Math.tanh(a[2 * H + j] + r * b[2 * H + j]);
        next[j] = (1 - z) * n + z * h[j];
      }
      out[i] = h = next;
    }
    return out;
  }

  /** Each syllable's pitch early and late in its vowel, as the network gives it. */
  raw(utt: readonly UttPhrase[]): [number, number][] {
    const H = this.meta.hidden, width = this.dims.reduce((a, b) => a + b, 0);
    const xs = featurize(utt).map((f) => {
      const x = new Float32Array(width + f.num.length);
      let at = 0;
      this.dims.forEach((dim, i) => {
        const row = i === 0 ? (this.vocab.get(f.cat[0]) ?? 0) : (f.cat[i] as number);
        x.set(this.get(`embeddings.${i}.weight`).subarray(row * dim, (row + 1) * dim), at);
        at += dim;
      });
      x.set(f.num, at);
      return affine(this.get("inp.weight"), this.get("inp.bias"), x, H).map(Math.tanh);
    });
    const fwd = this.gru(xs, "", false), bwd = this.gru(xs, "_reverse", true);
    return xs.map((_, i) => {
      const h = new Float32Array(2 * H);
      h.set(fwd[i]), h.set(bwd[i], H);
      const y = affine(this.get("out.weight"), this.get("out.bias"), h, 2);
      return [y[0], y[1]];
    });
  }

  /** The same in semitones around the speaker's usual pitch, widened to a spoken range. */
  predict(utt: readonly UttPhrase[]): [number, number][] {
    return this.raw(utt).map(([a, b]) => [a * this.scale, b * this.scale]);
  }
}

/** The words and stresses of laid-out phrases, as the model was trained to see them. */
export function utteranceOf(spans: readonly PhraseSpan[], words: readonly string[]): UttPhrase[] {
  return spans.map((ph) => ({
    words: words.slice(ph.words[0], ph.words[1]).map((text, i): [string, number[]] => [text, ph.syllables.filter((s) => s.word === ph.words[0] + i).map((s) => s.stress)]),
    end: ph.kind === "question" || ph.kind === "wh-question" ? "question" : ph.kind === "continuation" ? "comma" : "final",
  }));
}

/** how far from the baseline the voice may be sent, whatever the model says (semitones) */
const LIMIT = [-9, 12];

/** The plan's gestures with its pitch replaced by the trained model's contour. */
export function trainedPitch(phrases: readonly Phrase[], plan: Plan, counts: readonly number[], model: PitchModel, o: PitchOptions): Gesture[] {
  const mood = MOODS[o.mood ?? "neutral"];
  const emphasized = new Set(o.emphasis ?? []);
  // a phrase with no vowel in it has no pitch to set, and the model never saw one
  const spans = layout(phrases, plan, counts).filter((ph) => ph.syllables.length);
  const syl = spans.flatMap((ph) => ph.syllables);
  const y = model.predict(utteranceOf(spans, phrases.flatMap((p) => p.words)));
  // an emphasized word (the chat model's *asterisks*) is lifted on its main stress, on top of
  // whatever the pitch model gave it: it read plain text and knows nothing of them
  const lift = new Array<number>(syl.length).fill(0);
  for (const w of emphasized) {
    const own = syl.map((s, i) => ({ s, i })).filter((x) => x.s.word === w);
    const main = own.find((x) => x.s.stress === 1) ?? own[0];
    if (main) lift[main.i] = P.emphasis * 0.6;
  }
  const pitch: Gesture[] = [];
  let i = 0;
  for (const ph of spans) {
    ph.syllables.forEach((s, k) => {
      const next = ph.syllables[k + 1];
      const until = next ? Math.max(s.t1, next.t0 - 0.03) : s.t1;
      const at = (st: number) => hz(o.base, mood.shift + Math.max(LIMIT[0], Math.min(LIMIT[1], st * mood.range + lift[i])));
      const [early, late] = y[i];
      if (s.t1 - s.t0 > 0.08) {
        const mid = (s.t0 + s.t1) / 2;
        pitch.push(hold(s.t0, mid, at(early)), hold(mid, until, at(late)));
      } else pitch.push(hold(s.t0, until, at((early + late) / 2)));
      i++;
    });
  }
  return [...plan.gestures.filter((g) => g.label !== "pitch"), ...pitch];
}
