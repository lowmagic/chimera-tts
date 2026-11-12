/**
 * Says a reply into a WAV file the way the page says it with its default settings: the same
 * sentences, marks, speech plans, trained pitch model and voice, through the wasm engine offline
 * (as `tools/render.ts` does). The reply may be Markdown (`src/reply.ts`). Hermes Agent runs this as
 * its text-to-speech command (README, "Hermes's own voice"):
 *
 *   node dist/speak/speak.mjs <text file> <out.wav>
 *
 * Reads the text as UTF-8 and writes one 16-bit mono WAV of all of it, then exits 0; if it can't,
 * it prints one line to stderr and exits 1. A speech server keeps it running instead:
 *
 *   node dist/speak/speak.mjs --serve
 *
 * loads everything once, then reads one JSON request per line on stdin, `{"id": "…", "text": "…"}`,
 * and answers each in order with one line on stdout, `{"id": "…", "rate": 48000, "pcm": "<base64
 * of 16-bit little-endian mono PCM>"}` or `{"id": "…", "error": "<one line>"}`. Diagnostics go to
 * stderr; it exits 0 when stdin closes. `bun run build` bundles it for Node into dist/speak/
 * with what it loads beside it (`scripts/build-speak.sh`), so it runs from there and only there.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { gunzipSync } from "node:zlib";
import { chimeraModule, initChimera } from "../vendor/chimera/src/wasm/chimera.ts";
import { writeGestures } from "../vendor/chimera/src/wasm/wire.ts";
import { PRESETS, defaultF0 } from "../vendor/chimera/src/ui/body.ts";
import { toSayable, wordsOf, type Mood } from "../src/markup.ts";
import { withLexicon, wordsIn } from "../src/lexicon.ts";
import { setKnownWords } from "../src/normalize.ts";
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

/** 16-bit little-endian PCM of the samples */
function pcm16(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(2 * samples.length);
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, v))), 2 * i));
  return buf;
}

function wav(samples: Float32Array): Buffer {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0), head.writeUInt32LE(36 + 2 * samples.length, 4), head.write("WAVEfmt ", 8), head.writeUInt32LE(16, 16), head.writeUInt16LE(1, 20), head.writeUInt16LE(1, 22);
  head.writeUInt32LE(FS, 24), head.writeUInt32LE(2 * FS, 28), head.writeUInt16LE(2, 32), head.writeUInt16LE(16, 34), head.write("data", 36), head.writeUInt32LE(2 * samples.length, 40);
  return Buffer.concat([head, pcm16(samples)]);
}

/** Loads the engine, the dictionary and the pitch model, and returns what says a reply with them. */
async function load(): Promise<(text: string) => Float32Array> {
  const asset = (name: string) => readFileSync(new URL(name, import.meta.url));
  await initChimera(asset("chimera.wasm"));
  // the facade calls into the wasm as it is imported, so only now that it has loaded
  const engine = await import("../vendor/chimera/src/wasm/engine.ts");
  const g2p = new engine.EnglishG2P();
  const dictionary = withLexicon(gunzipSync(asset("cmudict.txt.gz")).toString()), known = wordsIn(dictionary);
  g2p.setDictionaryText(dictionary);
  setKnownWords((w) => known.has(w));
  const settings = DEFAULTS;
  const model = settings.trainedPitch ? PitchModel.from(JSON.parse(asset("prosody.json").toString()), new Uint8Array(asset("prosody.bin")).buffer) : null;
  const body = PRESETS[settings.body], f0 = defaultF0(body) * settings.pitch;

  return (text) => {
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
    // emoji, say) is a moment of silence, still audio
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
    return audio;
  };
}

const oneLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim();

/** `--serve`: one JSON request per stdin line, one JSON answer per stdout line, in order. */
async function serve(): Promise<void> {
  const say = await load();
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    let id = "";
    let answer: object;
    try {
      const req = JSON.parse(line);
      if (typeof req?.id === "string") id = req.id;
      if (typeof req?.id !== "string" || typeof req.text !== "string") throw new Error('a request is {"id": "<string>", "text": "<string>"}');
      answer = { id, rate: FS, pcm: pcm16(say(req.text)).toString("base64") };
    } catch (e) {
      console.error(`speak: ${id ? `${id}: ` : ""}${oneLine(e)}`);
      answer = { id, error: oneLine(e) };
    }
    process.stdout.write(JSON.stringify(answer) + "\n");
  }
}

const args = process.argv.slice(2);
try {
  if (args.length === 1 && args[0] === "--serve") await serve();
  else {
    if (args.length !== 2) throw new Error("usage: node speak.mjs <text file> <out.wav> | node speak.mjs --serve");
    const [textPath, outPath] = args;
    const text = readFileSync(textPath, "utf8");
    writeFileSync(outPath, wav((await load())(text)));
  }
} catch (e) {
  console.error(`speak: ${oneLine(e)}`);
  process.exit(1);
}
