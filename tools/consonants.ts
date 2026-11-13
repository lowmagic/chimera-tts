/**
 * Measures how the voice says its consonants, for tuning `src/articulation.ts`: how loud each
 * stop's burst is and how much voice there is under each voiced consonant, next to the vowels.
 *
 *   bun tools/consonants.ts [--plosives 1.5] [--voicing 1.5] [--wav out.wav] ["text"...]
 *
 * Prints, in dB relative to the vowels' level: "burst", the loudest 5 ms above 2 kHz around each
 * stop's release, and "voice", the level below 500 Hz through each voiced stop and fricative.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { initEngine, WasmVoice } from "../vendor/chimera/tests/harness.ts";
import { PRESETS, defaultF0 } from "../vendor/chimera/src/ui/body.ts";
import { withLexicon } from "../src/lexicon.ts";
import { planSpeech } from "../src/plan.ts";

const FS = 48000, LEAD = 0.03;
const TEXTS = ["A big dog did go by the garden.", "Put the top cat back in the kitchen.", "His voice was very easy, as they say.", "Bob paid Ted to keep quiet about the good game."];

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const plosive = +flag("--plosives", "1"), voicing = +flag("--voicing", "1"), wavPath = flag("--wav", "");
const texts = args.length ? args : TEXTS;

await initEngine();
const engine = await import("../vendor/chimera/src/wasm/engine.ts");
const g2p = new engine.EnglishG2P();
g2p.setDictionaryText(withLexicon(gunzipSync(readFileSync(new URL("../vendor/chimera/public/data/cmudict.txt.gz", import.meta.url))).toString()));

/** one-pole filters, enough to tell hiss from hum */
const lowpass = (x: Float32Array, hz: number) => { const a = 1 - Math.exp((-2 * Math.PI * hz) / FS), y = new Float32Array(x.length); let s = 0, s2 = 0; x.forEach((v, i) => { s += a * (v - s); s2 += a * (s - s2); y[i] = s2; }); return y; };
const highpass = (x: Float32Array, hz: number) => { const lo = lowpass(x, hz); return x.map((v, i) => v - lo[i]); };
const rms = (x: Float32Array, a: number, b: number) => { let s = 0; const i0 = Math.max(0, Math.round(a * FS)), i1 = Math.min(x.length, Math.round(b * FS)); for (let i = i0; i < i1; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
const db = (v: number, ref: number) => 20 * Math.log10(Math.max(v, 1e-9) / ref);

const STOPS = new Set(["p", "t", "k", "b", "d", "g", "pʰ", "tʰ", "kʰ", "t͡ʃ", "d͡ʒ"]);
const VOICED = new Set(["b", "d", "g", "v", "z", "ð", "ʒ", "d͡ʒ"]);
const rows = new Map<string, { burst: number[]; voice: number[] }>();
const all: Float32Array[] = [];

for (const text of texts) {
  const body = PRESETS.male, f0 = defaultF0(body);
  const phrases = g2p.toPhrases(text);
  const plan = planSpeech(engine, phrases, { body, rate: 1, f0, natural: true, plosives: plosive, voicing });
  const voice = new WasmVoice(FS);
  voice.setSource({ f0 });
  voice.setGate(1);
  voice.schedule(plan.gestures, LEAD, true);
  const audio = new Float32Array(Math.ceil((plan.end + LEAD + 0.1) * FS));
  for (let at = 0; at < audio.length; at += 480) audio.set(voice.render(Math.min(480, audio.length - at)), at);
  all.push(audio);
  const hi = highpass(audio, 2000), lo = lowpass(audio, 500);
  const vowels = plan.segments.filter((s) => s.kind === "vowel");
  const level = Math.sqrt(vowels.reduce((s, v) => s + rms(audio, v.t0 + LEAD, v.t1 + LEAD) ** 2, 0) / vowels.length);
  for (const s of plan.segments) {
    const ipa = s.ipa.replace("ʰ", "");
    const row = rows.get(ipa) ?? { burst: [], voice: [] };
    if (STOPS.has(s.ipa)) {
      let peak = 0;
      for (let t = s.t1 - 0.03; t < s.t1 + 0.06; t += 0.0025) peak = Math.max(peak, rms(hi, t + LEAD, t + LEAD + 0.005));
      row.burst.push(db(peak, level));
    }
    if (VOICED.has(s.ipa)) row.voice.push(db(rms(lo, s.t0 + LEAD + 0.01, s.t1 + LEAD - 0.01), level));
    if (row.burst.length || row.voice.length) rows.set(ipa, row);
  }
}

const mean = (v: number[]) => (v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1).padStart(6) : "      ");
console.log(`plosive ${plosive}, voicing ${voicing}\nsound   n   burst   voice   (dB re the vowels)`);
for (const [ipa, r] of [...rows].sort()) console.log(`${ipa.padEnd(5)} ${String(Math.max(r.burst.length, r.voice.length)).padStart(3)}  ${mean(r.burst)}  ${mean(r.voice)}`);
const every = [...rows.values()];
console.log(`all        ${mean(every.flatMap((r) => r.burst))}  ${mean(every.flatMap((r) => r.voice))}`);

if (wavPath) {
  const n = all.reduce((s, a) => s + a.length, 0), buf = Buffer.alloc(44 + 2 * n);
  buf.write("RIFF", 0), buf.writeUInt32LE(36 + 2 * n, 4), buf.write("WAVEfmt ", 8), buf.writeUInt32LE(16, 16), buf.writeUInt16LE(1, 20), buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(FS, 24), buf.writeUInt32LE(2 * FS, 28), buf.writeUInt16LE(2, 32), buf.writeUInt16LE(16, 34), buf.write("data", 36), buf.writeUInt32LE(2 * n, 40);
  let at = 44;
  for (const a of all) for (const v of a) buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, v))), at), (at += 2);
  writeFileSync(wavPath, buf);
}
