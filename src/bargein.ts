/**
 * Hears the user start talking while the voice is speaking, so they can interrupt it by just
 * talking. The microphone is opened with the browser's echo cancellation, which takes most of the
 * synth's own sound back out of it; what is left is watched for speech-like loudness.
 *
 * It is a loudness detector, not a recognizer: it only says "someone started talking". The mic is
 * released before the recognizer starts (phones don't share it).
 */
export interface DetectorOptions {
  /** the level must be this far above the running noise floor (dB) */
  aboveFloor: number;
  /** and above this absolute level (dBFS), however quiet the room */
  minLevel: number;
  /** for this many of the last `window` frames */
  need: number;
  window: number;
  /** frames at the start that only measure the floor (the synth is already talking by then, so
   *  whatever echo cancellation leaves of it is part of the floor) */
  warmup: number;
}

export const DETECTOR: DetectorOptions = { aboveFloor: 14, minLevel: -42, need: 9, window: 12, warmup: 25 };

/**
 * The decision, apart from the microphone: feed it one level (dBFS) per frame; it returns true
 * when speech has started. The floor rises with sound that is not loud enough to be a voice and
 * falls slowly (the synth pauses between sentences, and its residue is back a moment later), so
 * steady noise raises it and a voice does not.
 */
export class SpeechOnset {
  private floor: number | null = null;
  private recent: boolean[] = [];
  private seen = 0;

  constructor(private readonly o: DetectorOptions = DETECTOR) {}

  push(db: number): boolean {
    if (!Number.isFinite(db)) db = -100;
    if (this.floor === null) this.floor = db;
    if (this.seen++ < this.o.warmup) {
      this.floor += (db - this.floor) * 0.2;
      return false;
    }
    const loud = db > this.floor + this.o.aboveFloor && db > this.o.minLevel;
    this.floor += (db - this.floor) * (db < this.floor ? 0.01 : loud ? 0.002 : 0.05);
    this.recent.push(loud);
    if (this.recent.length > this.o.window) this.recent.shift();
    return this.recent.filter(Boolean).length >= this.o.need;
  }
}

/** ms between level readings (one frame) */
const FRAME_MS = 20;

export class BargeIn {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** bumped by every arm and disarm: a microphone that opens late for an old one is closed again */
  private generation = 0;

  constructor(private readonly onSpeech: () => void) {}

  static get supported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  get armed(): boolean {
    return this.timer !== null;
  }

  /** Start watching the microphone. Resolves false if the microphone can't be opened. */
  async arm(): Promise<boolean> {
    if (this.timer || !BargeIn.supported) return this.armed;
    const gen = ++this.generation;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      return false;
    }
    if (gen !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    // speech sits between these; the rumble below and the hiss above only confuse the level
    const high = new BiquadFilterNode(ctx, { type: "highpass", frequency: 180 });
    const low = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 3800 });
    ctx.createMediaStreamSource(stream).connect(high).connect(low).connect(analyser);
    void ctx.resume();
    const buf = new Float32Array(analyser.fftSize);
    const onset = new SpeechOnset();
    this.stream = stream;
    this.ctx = ctx;
    this.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      if (onset.push(10 * Math.log10(sum / buf.length + 1e-12))) {
        this.disarm();
        this.onSpeech();
      }
    }, FRAME_MS);
    return true;
  }

  /** Stop watching and give the microphone back. */
  disarm(): void {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
