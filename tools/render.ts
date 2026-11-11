/**
 * Renders text to WAV files through the wasm engine, offline, the way the page would say it:
 * once with Chimera's own pitch and once with natural pitch, for comparing by ear; and, given a
 * trained pitch model (training/README.md), once with that.
 *
 *   bun tools/render.ts <outdir> [--model public/models/prosody.json] [male|female|child] "A sentence. *Marked* up like a reply."...
 *
 * Writes <n>-classic.wav, <n>-natural.wav and <n>-trained.wav per text, and prints each one's pitch range.
 * Needs the engine built (`bun run prepare-chimera`).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { initEngine, WasmVoice } from "../vendor/chimera/tests/harness.ts";
import { PRESETS, defaultF0 } from "../vendor/chimera/src/ui/body.ts";
import type { BodyName } from "../vendor/chimera/src/worklet/protocol.ts";
import { toSayable, wordsOf, type Mood } from "../src/markup.ts";
import { planSpeech } from "../src/plan.ts";
import { SentenceStream } from "../src/sentences.ts";
import { PitchModel } from "../src/trained.ts";

const FS = 48000;
const [outdir, ...rest] = process.argv.slice(2);
let model: PitchModel | null = null;
if (rest[0] === "--model") {
  const path = rest[1];
  rest.splice(0, 2);
  model = PitchModel.from(JSON.parse(readFileSync(path, "utf8")), new Uint8Array(readFileSync(path.replace(/\.json$/, ".bin"))).buffer);
}
if (!outdir || !rest.length) {
  console.error('usage: bun tools/render.ts <outdir> [--model prosody.json] [male|female|child] "text"...');
  process.exit(1);
}
const bodyName: BodyName = rest[0] in PRESETS ? (rest.shift() as BodyName) : "male";
mkdirSync(outdir, { recursive: true });

await initEngine();
const engine = await import("../vendor/chimera/src/wasm/engine.ts");
const g2p = new engine.EnglishG2P();
g2p.setDictionaryText(gunzipSync(readFileSync(new URL("../vendor/chimera/public/data/cmudict.txt.gz", import.meta.url))).toString());

function wav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + 2 * samples.length);
  buf.write("RIFF", 0), buf.writeUInt32LE(36 + 2 * samples.length, 4), buf.write("WAVEfmt ", 8), buf.writeUInt32LE(16, 16), buf.writeUInt16LE(1, 20), buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(FS, 24), buf.writeUInt32LE(2 * FS, 28), buf.writeUInt16LE(2, 32), buf.writeUInt16LE(16, 34), buf.write("data", 36), buf.writeUInt32LE(2 * samples.length, 40);
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, v))), 44 + 2 * i));
  return buf;
}

type Mode = "classic" | "natural" | "trained";

/** One reply, sentence by sentence as the page queues them; returns the audio and the voiced pitches. */
function render(text: string, mode: Mode): { audio: Float32Array; f0: number[] } {
  const body = PRESETS[bodyName], f0 = defaultF0(body);
  const voice = new WasmVoice(FS);
  voice.setSource({ f0 });
  voice.setGate(1);
  const chunks: Float32Array[] = [], pitches: number[] = [];
  const stream = new SentenceStream();
  let mood: Mood = "neutral";
  for (const sentence of [...stream.push(text), ...stream.flush()]) {
    const s = toSayable(sentence);
    mood = s.mood ?? mood;
    const phrases = g2p.toPhrases(s.text);
    if (!phrases.length) continue;
    const plan = planSpeech(engine, phrases, { body, rate: 1, f0, natural: mode !== "classic", model: mode === "trained" ? model : null, emphasis: s.emphasis, wordCount: wordsOf(s.text).length, mood });
    voice.schedule(plan.gestures, 0.03, true);
    // 10 ms at a time, reading the pitch where the voice is voiced
    for (let n = Math.ceil((plan.end + 0.03) * FS); n > 0; n -= 480) {
      chunks.push(voice.render(Math.min(480, n)));
      const st = voice.state();
      if (st.voicing > 0.5) pitches.push(st.f0);
    }
  }
  const audio = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) audio.set(c, at), (at += c.length);
  return { audio, f0: pitches };
}

const semitones = (a: number, b: number) => 12 * Math.log2(a / b);
rest.forEach((text, i) => {
  for (const mode of ["classic", "natural", ...(model ? ["trained"] : [])] as Mode[]) {
    const { audio, f0 } = render(text, mode);
    const name = `${String(i + 1).padStart(2, "0")}-${mode}.wav`;
    writeFileSync(join(outdir, name), wav(audio));
    const sorted = [...f0].sort((a, b) => a - b), lo = sorted[Math.floor(0.05 * sorted.length)], hi = sorted[Math.floor(0.95 * sorted.length)];
    const mean = Math.exp(f0.reduce((s, v) => s + Math.log(v), 0) / f0.length);
    const sd = Math.sqrt(f0.reduce((s, v) => s + semitones(v, mean) ** 2, 0) / f0.length);
    console.log(`${name}  ${(audio.length / FS).toFixed(1)} s  pitch ${lo.toFixed(0)}-${hi.toFixed(0)} Hz (5th-95th), spread ${sd.toFixed(1)} semitones`);
  }
});
