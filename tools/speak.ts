/**
 * Says a reply into a WAV file the way the page says it with its default settings: the same
 * sentences, marks, speech plans, trained pitch model and voice, through the wasm engine offline
 * (as `tools/render.ts` does). The reply may be Markdown (`src/reply.ts`). Hermes Agent runs this as
 * its text-to-speech command (README, "Hermes's own voice"):
 *
 *   node dist/speak/speak.mjs <text file> <out.wav>
 *
 * Reads the text as UTF-8 and writes one 16-bit mono WAV of all of it, then exits 0; if it can't,
 * it prints one line to stderr and exits 1. `bun run build` bundles it for Node into dist/speak/
 * with what it loads beside it (`scripts/build-speak.sh`), so it runs from there and only there.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { chimeraModule, initChimera } from "../vendor/chimera/src/wasm/chimera.ts";
import { writeGestures } from "../vendor/chimera/src/wasm/wire.ts";
import { PRESETS, defaultF0 } from "../vendor/chimera/src/ui/body.ts";
import { toSayable, wordsOf, type Mood } from "../src/markup.ts";
import { planSpeech } from "../src/plan.ts";
import { replySentences } from "../src/reply.ts";
import { DEFAULTS } from "../src/settings.ts";
import { PitchModel } from "../src/trained.ts";
import type { Plan } from "../vendor/chimera/src/wasm/types.ts";

const FS = 48000;
/** as the page schedules each sentence: this long after the last one ends */
const LEAD = 0.03;
/** gestures taken from one sentence (the AudioWorklet's limit) */
const MAX_GESTURES = 4000;

type Fn = (...a: number[]) => number;
type AudioExports = { memory: WebAssembly.Memory } & Record<string, Fn>;

function wav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + 2 * samples.length);
  buf.write("RIFF", 0), buf.writeUInt32LE(36 + 2 * samples.length, 4), buf.write("WAVEfmt ", 8), buf.writeUInt32LE(16, 16), buf.writeUInt16LE(1, 20), buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(FS, 24), buf.writeUInt32LE(2 * FS, 28), buf.writeUInt16LE(2, 32), buf.writeUInt16LE(16, 34), buf.write("data", 36), buf.writeUInt32LE(2 * samples.length, 40);
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, v))), 44 + 2 * i));
  return buf;
}

async function speak(textPath: string, outPath: string): Promise<void> {
  const text = readFileSync(textPath, "utf8");
  const asset = (name: string) => readFileSync(new URL(name, import.meta.url));
  await initChimera(asset("chimera.wasm"));
  // the facade calls into the wasm as it is imported, so only now that it has loaded
  const engine = await import("../vendor/chimera/src/wasm/engine.ts");
  const g2p = new engine.EnglishG2P();
  g2p.setDictionaryText(gunzipSync(asset("cmudict.txt.gz")).toString());
  const settings = DEFAULTS;
  const model = settings.trainedPitch ? PitchModel.from(JSON.parse(asset("prosody.json").toString()), new Uint8Array(asset("prosody.bin")).buffer) : null;
  const body = PRESETS[settings.body], f0 = defaultF0(body) * settings.pitch;

  const plans: Plan[] = [];
  let mood: Mood = "neutral";
  for (const sentence of replySentences(text)) {
    const s = toSayable(sentence);
    mood = s.mood ?? mood; // a tag sets the mood for the sentences after it too
    const phrases = g2p.toPhrases(s.text);
    if (phrases.length) plans.push(planSpeech(engine, phrases, { body, rate: settings.rate, f0, natural: settings.naturalPitch, model, emphasis: s.emphasis, wordCount: wordsOf(s.text).length, mood }));
  }

  // the engine as the AudioWorklet runs it: its own instance, told the body, the pitch and the plans
  const x = new WebAssembly.Instance(chimeraModule(), {}).exports as unknown as AudioExports;
  const h = x.engine_new(FS);
  x.engine_set_body(h, body.female, body.child);
  new Float64Array(x.memory.buffer, x.engine_values(h), 32).fill(NaN)[0] = f0; // the source's f0
  x.engine_set_source(h);
  x.engine_set_gate(h, 1);

  // each sentence after the one before, as the page queues them; nothing sayable at all (only
  // emoji, say) is a moment of silence, still a WAV
  const lengths = plans.map((p) => Math.ceil((p.end + LEAD) * FS));
  const audio = new Float32Array(lengths.reduce((a, b) => a + b, 0) || Math.round(0.25 * FS));
  let at = 0;
  plans.forEach((plan, i) => {
    x.engine_schedule(h, writeGestures(x.memory.buffer, x.engine_records(h), plan.gestures, MAX_GESTURES), LEAD, 1);
    for (let m = 0, end = at + lengths[i]; at < end; at += m) {
      m = Math.min(128, end - at);
      audio.set(new Float32Array(x.memory.buffer, x.engine_render(h, m), m), at);
    }
  });
  writeFileSync(outPath, wav(audio));
}

const [textPath, outPath, ...extra] = process.argv.slice(2);
try {
  if (!textPath || !outPath || extra.length) throw new Error("usage: node speak.mjs <text file> <out.wav>");
  await speak(textPath, outPath);
} catch (e) {
  console.error(`speak: ${(e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ")}`);
  process.exit(1);
}
