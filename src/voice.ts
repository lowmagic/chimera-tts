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

type Speech = typeof import("../vendor/chimera/src/ui/speech.ts");
type Audio = typeof import("../vendor/chimera/src/audio/AudioEngine.ts");
type SpokenPlan = import("../vendor/chimera/src/ui/speech.ts").SpokenPlan;

export type { BodyName };

export interface VoiceSettings {
  body: BodyName;
  /** speaking-rate multiplier (1 = Chimera's default) */
  rate: number;
  /** pitch multiplier on the body's default pitch */
  pitch: number;
}

export interface Caption {
  words: string[];
  /** index of the word being said, or -1 between words */
  at: number;
}

interface Current {
  plan: SpokenPlan;
  /** performance.now() when the worklet took the plan (null until it confirms) */
  startedAt: number | null;
  done: ReturnType<typeof setTimeout> | null;
}

export class Voice {
  settings: VoiceSettings = { body: "male", rate: 1, pitch: 1 };
  onCaption: (c: Caption | null) => void = () => {};
  /** true while there is something being said or waiting to be said */
  onSpeaking: (speaking: boolean) => void = () => {};

  private speech: Speech | null = null;
  private audio: Audio | null = null;
  private queue: string[] = [];
  private current: Current | null = null;
  private busy = false;
  /** a sentence is being planned (it is not `current` yet): sentences arriving meanwhile wait */
  private planning = false;
  private raf = 0;
  private lastAt = -2;

  /** Load the engine and the pronunciation dictionary. Needs no user gesture. */
  async load(): Promise<void> {
    await initChimera();
    [this.speech, this.audio] = await Promise.all([import("../vendor/chimera/src/ui/speech.ts"), import("../vendor/chimera/src/audio/AudioEngine.ts")]);
    // without the dictionary the engine falls back to letter-to-sound rules: worse, but it talks
    await this.speech.g2p.load(`${import.meta.env.BASE_URL}data/cmudict.txt.gz`).catch((e) => console.warn("dictionary:", e));
    this.speech.onPlan((p) => {
      const c = this.current;
      if (c && p && p.id === c.plan.id && p.offset !== null && c.startedAt === null) this.started(c);
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

  say(text: string): void {
    if (!text.trim()) return;
    this.queue.push(text);
    this.setBusy(true);
    if (!this.current && !this.planning) void this.next();
  }

  /** Stop mid-word and drop everything queued. */
  stop(): void {
    this.queue = [];
    if (this.current?.done) clearTimeout(this.current.done);
    this.current = null;
    this.speech?.stopSpeaking();
    this.caption(null);
    this.setBusy(false);
  }

  private async next(): Promise<void> {
    const text = this.queue.shift();
    if (text === undefined) {
      this.current = null;
      this.caption(null);
      this.setBusy(false);
      return;
    }
    const { speech, audio } = this, s = this.settings;
    if (!speech || !audio) return;
    const body = PRESETS[s.body];
    audio.engine.setBody(body);
    this.planning = true;
    let plan: SpokenPlan | null;
    try {
      plan = await speech.speakText(text, { ipa: false, body, rate: s.rate, f0: defaultF0(body) * s.pitch });
    } finally {
      this.planning = false;
    }
    if (!plan) return void this.next(); // nothing sayable in it (only symbols)
    if (!this.busy) return speech.stopSpeaking(); // stopped while planning
    const c: Current = { plan, startedAt: null, done: null };
    this.current = c;
    // the worklet confirms within a few ms; if the message is lost, don't hang the queue
    c.done = setTimeout(() => this.current === c && c.startedAt === null && this.started(c), 400);
  }

  private started(c: Current): void {
    if (c.done) clearTimeout(c.done);
    c.startedAt = performance.now();
    c.done = setTimeout(() => this.current === c && void this.next(), c.plan.plan.end * 1000);
    this.lastAt = -2;
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (this.current !== c || c.startedAt === null) return;
      const t = (performance.now() - c.startedAt) / 1000;
      const at = c.plan.words.findIndex((w) => t >= w.t0 && t < w.t1 + 0.05);
      if (at !== this.lastAt) {
        this.lastAt = at;
        this.caption({ words: c.plan.words.map((w) => w.text), at });
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
