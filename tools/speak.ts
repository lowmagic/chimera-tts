/**
 * Says a reply into a WAV file the way the page says it with its default settings: the same
 * sentences, marks, speech plans, trained pitch model and voice, through the wasm engine offline
 * (as `tools/render.ts` does). The reply may be Markdown (`src/reply.ts`). Hermes Agent runs this as
 * its text-to-speech command (README, "Hermes's own voice"):
 *
 *   node dist/speak/speak.mjs <text file> <out.wav>
 *
 * Reads the text as UTF-8 and writes one 16-bit mono WAV of all of it, then exits 0; if it can't,
 * it prints one line to stderr and exits 1. The page's voice sliders are flags, anywhere on the
 * line, for either way of running it (what isn't given is the page's default):
 *
 *   --rate 0.85  --pitch 1  --body male  --plosives 1.5  --voicing 1.5  --word-ends 1  --timing on
 *
 * A speech server keeps it running instead:
 *
 *   node dist/speak/speak.mjs --serve
 *
 * loads everything once, then reads one JSON request per line on stdin, `{"id": "…", "text": "…"}`
 * (and optionally `"options": {"rate": 0.9, "plosives": 1.5, "voicing": 1.5, "wordEnds": 1.3, "timing": false}`
 * to say that one request with other settings than the defaults),
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
/** after the last sentence: the voice takes this long to fade out, and a cut before then is a click */
const TAIL = 0.15;
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

/** what a `--serve` request may set for itself, for measuring settings (training/clarity) */
interface Overrides {
  rate?: number;
  plosives?: number;
  voicing?: number;
  timing?: boolean;
  wordEnds?: number;
}

/** what the command line may set for every reply: a request's settings, the pitch and the body */
interface Voice extends Overrides {
  pitch?: number;
  body?: keyof typeof PRESETS;
}

/** Loads the engine, the dictionary and the pitch model, and returns what says a reply with them. */
async function load(voice: Voice = {}): Promise<(text: string, o?: Overrides) => Float32Array> {
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
  const body = PRESETS[voice.body ?? settings.body], f0 = defaultF0(body) * (voice.pitch ?? settings.pitch);

  return (text, request = {}) => {
    const o = { ...voice, ...request };
    const plans: Plan[] = [];
    let mood: Mood = "neutral";
    for (const sentence of replySentences(text)) {
      const s = toSayable(sentence);
      mood = s.mood ?? mood; // a tag sets the mood for the sentences after it too
      const phrases = g2p.toPhrases(s.text);
      if (phrases.length) plans.push(planSpeech(engine, phrases, { body, rate: o.rate ?? settings.rate, f0, natural: settings.naturalPitch, model, timing: o.timing ?? settings.trainedTiming, plosives: o.plosives ?? settings.plosives, voicing: o.voicing ?? settings.voicing, wordEnds: o.wordEnds, emphasis: s.emphasis, wordCount: wordsOf(s.text).length, mood }));
    }

    // the engine as the AudioWorklet runs it: its own instance, told the body, the pitch and the plans
    const x = new WebAssembly.Instance(chimeraModule(), {}).exports as unknown as AudioExports;
    const h = x.engine_new(FS);
    x.engine_set_body(h, body.female, body.child);
    new Float64Array(x.memory.buffer, x.engine_values(h), 32).fill(NaN)[0] = f0; // the source's f0
    x.engine_set_source(h);
    // the gate stays shut, as on the page: a plan brings its own breath. Open, the voice would hum
    // a vowel before the first word, between sentences and after the last (heard as "but …", "…ed")
    x.engine_set_gate(h, 0);

    // each sentence after the one before, as the page queues them; nothing sayable at all (only
    // emoji, say) is a moment of silence, still audio
    const lengths = plans.map((p, i) => Math.ceil((p.end + LEAD + (i === plans.length - 1 ? TAIL : 0)) * FS));
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

/** a request's "options", checked: numbers for the sliders, true or false for timing */
function overrides(o: unknown): Overrides {
  if (o === undefined) return {};
  if (!o || typeof o !== "object") throw new Error('"options" is an object, like {"rate": 0.9}');
  const out: Overrides = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "timing" && typeof v === "boolean") out.timing = v;
    else if ((k === "rate" || k === "plosives" || k === "voicing" || k === "wordEnds") && typeof v === "number" && v > 0 && v < 10) out[k] = v;
    else throw new Error(`option ${JSON.stringify(k)}: ${JSON.stringify(v)} is not something this takes (rate, plosives, voicing, wordEnds: numbers; timing: true or false)`);
  }
  return out;
}

const FLAGS = { "--rate": "rate", "--pitch": "pitch", "--plosives": "plosives", "--voicing": "voicing", "--word-ends": "wordEnds" } as const;
const USAGE = "usage: node speak.mjs [flags] <text file> <out.wav> | node speak.mjs [flags] --serve (flags: --rate, --pitch, --plosives, --voicing, --word-ends <number>; --body <name>; --timing on|off)";

/** The command line: the flags as a voice, and what is left (`--name value` or `--name=value`). */
function flags(args: string[]): { voice: Voice; rest: string[] } {
  const voice: Voice = {}, rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const [name, inline] = args[i].split(/=(.*)/s, 2);
    if (!name.startsWith("--") || name === "--serve") {
      rest.push(args[i]);
      continue;
    }
    const value = inline ?? args[++i];
    if (value === undefined) throw new Error(`${name} needs a value. ${USAGE}`);
    const n = Number(value);
    if (name in FLAGS) {
      if (!(n > 0 && n < 10)) throw new Error(`${name} takes a number, like 0.85, not ${JSON.stringify(value)}`);
      voice[FLAGS[name as keyof typeof FLAGS]] = n;
    } else if (name === "--timing") {
      if (value !== "on" && value !== "off") throw new Error(`--timing is on or off, not ${JSON.stringify(value)}`);
      voice.timing = value === "on";
    } else if (name === "--body") {
      if (!Object.hasOwn(PRESETS, value)) throw new Error(`--body is one of ${Object.keys(PRESETS).join(", ")}, not ${JSON.stringify(value)}`);
      voice.body = value as keyof typeof PRESETS;
    } else throw new Error(`${name} is not a flag. ${USAGE}`);
  }
  return { voice, rest };
}

/** `--serve`: one JSON request per stdin line, one JSON answer per stdout line, in order. */
async function serve(voice: Voice): Promise<void> {
  const say = await load(voice);
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    let id = "";
    let answer: object;
    try {
      const req = JSON.parse(line);
      if (typeof req?.id === "string") id = req.id;
      if (typeof req?.id !== "string" || typeof req.text !== "string") throw new Error('a request is {"id": "<string>", "text": "<string>"}');
      answer = { id, rate: FS, pcm: pcm16(say(req.text, overrides(req.options))).toString("base64") };
    } catch (e) {
      console.error(`speak: ${id ? `${id}: ` : ""}${oneLine(e)}`);
      answer = { id, error: oneLine(e) };
    }
    process.stdout.write(JSON.stringify(answer) + "\n");
  }
}

try {
  const { voice, rest: args } = flags(process.argv.slice(2));
  if (args.length === 1 && args[0] === "--serve") await serve(voice);
  else {
    if (args.length !== 2 || args.includes("--serve")) throw new Error(USAGE);
    const [textPath, outPath] = args;
    const text = readFileSync(textPath, "utf8");
    writeFileSync(outPath, wav((await load(voice))(text)));
  }
} catch (e) {
  console.error(`speak: ${oneLine(e)}`);
  process.exit(1);
}
