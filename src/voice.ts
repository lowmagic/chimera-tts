/**
 * The Chimera voice: a queue of sentences spoken one after another through the engine's
 * AudioWorklet, with the word being said reported for captions.
 *
 * Chimera's facade (`engine.ts`) calls into the wasm at import, so everything that reaches it is
 * imported only after `initChimera()` has resolved.
 */
import { initChimera } from "../vendor/chimera/src/wasm/chimera.ts";
import { PRESETS, defaultF0 } from "../vendor/chimera/src/ui/body.ts";
import type { BodyName } from "../vendor/chimera/src/worklet/protocol.ts";

import type { Plan } from "../vendor/chimera/src/wasm/types.ts";
import { wordsOf, type Mood, type Sayable } from "./markup.ts";
import { fetchDictionary, withLexicon, wordsIn } from "./lexicon.ts";
import { setKnownWords } from "./normalize.ts";
import { planSpeech } from "./plan.ts";
import type { PitchModel } from "./trained.ts";

type Speech = typeof import("../vendor/chimera/src/ui/speech.ts");
type Audio = typeof import("../vendor/chimera/src/audio/AudioEngine.ts");
type Engine = typeof import("../vendor/chimera/src/wasm/engine.ts");
type Words = typeof import("../vendor/chimera/src/ui/words.ts");

export type { BodyName };

export interface VoiceSettings {
  body: BodyName;
  /** speaking-rate multiplier (1 = Chimera's default) */
  rate: number;
  /** pitch multiplier on the body's default pitch */
  pitch: number;
  /** natural pitch (`prosody.ts`) or Chimera's own */
  natural: boolean;
  /** a trained pitch model to use with natural pitch (`trained.ts`), if one is loaded and wanted */
  model?: PitchModel | null;
}

export interface Caption {
  words: string[];
  /** index of the word being said, or -1 between words */
  at: number;
}

interface Current {
  /** the schedule request's id (the worklet answers with it) */
  id: number;
  plan: Plan;
  /** each word's span in the plan (s) */
  words: { text: string; t0: number; t1: number }[];
  /** performance.now() when the worklet took the plan (null until it confirms) */
  startedAt: number | null;
  done: ReturnType<typeof setTimeout> | null;
}

export class Voice {
  settings: VoiceSettings = { body: "male", rate: 1, pitch: 1, natural: true };
  onCaption: (c: Caption | null) => void = () => {};
  /** true while there is something being said or waiting to be said */
  onSpeaking: (speaking: boolean) => void = () => {};

  private speech: Speech | null = null;
  private audio: Audio | null = null;
  private engine: Engine | null = null;
  private wordSpans: Words["wordSpans"] | null = null;
  private queue: Sayable[] = [];
  /** the mood the reply is in (a tag sets it for the sentences after it too) */
  private mood: Mood = "neutral";
  private current: Current | null = null;
  private busy = false;
  private raf = 0;
  private lastAt = -2;

  /** Load the engine and the pronunciation dictionary. Needs no user gesture. */
  async load(): Promise<void> {
    await initChimera();
    const [speech, audio, engine, words] = await Promise.all([
      import("../vendor/chimera/src/ui/speech.ts"),
      import("../vendor/chimera/src/audio/AudioEngine.ts"),
      import("../vendor/chimera/src/wasm/engine.ts"),
      import("../vendor/chimera/src/ui/words.ts"),
    ]);
    [this.speech, this.audio, this.engine, this.wordSpans] = [speech, audio, engine, words.wordSpans];
    // without the dictionary the engine falls back to letter-to-sound rules: worse, but it talks
    // (fetched here, not by the engine's own loader, to add this app's pronunciations to it)
    await fetchDictionary(`${import.meta.env.BASE_URL}data/cmudict.txt.gz`)
      .then((text) => {
        const dictionary = withLexicon(text), words = wordsIn(dictionary);
        speech.g2p.setDictionaryText(dictionary);
        setKnownWords((w) => words.has(w));
      })
      .catch((e) => console.warn("dictionary:", e));
    // the worklet confirms each plan it takes: that is when its words start
    audio.engine.onPlanned((m) => {
      const c = this.current;
      if (c && m.id === c.id && c.startedAt === null) this.started(c);
    });
  }

  get loaded(): boolean {
    return this.speech !== null;
  }

  /** Start audio output. Browsers only allow this from a tap or a key press. */
  async unlock(): Promise<void> {
    await this.audio!.engine.start();
  }

  get speaking(): boolean {
    return this.busy;
  }

  /** Output level right now (RMS, 0..1), for the meter and the tests. */
  level(): number {
    const a = this.audio?.engine.analyserFast;
    if (!a) return 0;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  }

  /** A new reply starts: its mood is its own. */
  newReply(): void {
    this.mood = "neutral";
  }

  /** The voice's pitch right now (Hz), or null when it isn't voicing. */
  pitch(): number | null {
    const t = this.audio?.engine.latest?.t;
    return t && t.voicing > 0.5 ? t.f0 : null;
  }

  say(s: Sayable | string): void {
    if (typeof s === "string") s = { text: s, emphasis: [], mood: null };
    if (s.mood) this.mood = s.mood;
    if (!s.text.trim()) return;
    this.queue.push({ ...s, mood: this.mood });
    this.setBusy(true);
    if (!this.current) this.next();
  }

  /** Stop mid-word and drop everything queued. */
  stop(): void {
    this.queue = [];
    if (this.current?.done) clearTimeout(this.current.done);
    this.current = null;
    this.audio?.engine.stopSpeech();
    this.caption(null);
    this.setBusy(false);
  }

  private next(): void {
    const item = this.queue.shift();
    if (item === undefined) {
      this.current = null;
      this.caption(null);
      this.setBusy(false);
      return;
    }
    const { speech, audio, engine, wordSpans } = this, s = this.settings;
    if (!speech || !audio || !engine || !wordSpans) return;
    const body = PRESETS[s.body], f0 = defaultF0(body) * s.pitch;
    const phrases = speech.g2p.toPhrases(item.text);
    if (!phrases.length) return this.next(); // nothing sayable in it (only symbols)
    const plan = planSpeech(engine, phrases, { body, rate: s.rate, f0, natural: s.natural, model: s.model, emphasis: item.emphasis, wordCount: wordsOf(item.text).length, mood: item.mood ?? "neutral" });
    audio.engine.setBody(body);
    // between pitch gestures the voice relaxes to its own pitch: make that this baseline
    audio.engine.setSource({ f0 });
    const id = audio.engine.schedule({ gestures: plan.gestures.map((g) => ({ ...g, targets: { ...g.targets } })), segments: plan.segments, end: plan.end });
    const c: Current = { id, plan, words: wordSpans(phrases, plan), startedAt: null, done: null };
    this.current = c;
    // the worklet confirms within a few ms; if the message is lost, don't hang the queue
    c.done = setTimeout(() => this.current === c && c.startedAt === null && this.started(c), 400);
  }

  private started(c: Current): void {
    if (c.done) clearTimeout(c.done);
    c.startedAt = performance.now();
    c.done = setTimeout(() => this.current === c && this.next(), c.plan.end * 1000);
    this.lastAt = -2;
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (this.current !== c || c.startedAt === null) return;
      const t = (performance.now() - c.startedAt) / 1000;
      const at = c.words.findIndex((w) => t >= w.t0 && t < w.t1 + 0.05);
      if (at !== this.lastAt) {
        this.lastAt = at;
        this.caption({ words: c.words.map((w) => w.text), at });
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  private caption(c: Caption | null): void {
    this.onCaption(c);
  }

  private setBusy(b: boolean): void {
    if (b === this.busy) return;
    this.busy = b;
    this.onSpeaking(b);
  }
}
