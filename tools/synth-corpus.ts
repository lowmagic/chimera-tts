/**
 * A practice corpus for the pitch-training tools: sentences said by Chimera itself with the
 * rule-based natural pitch, laid out like LJSpeech (metadata.csv, wavs/), plus where every
 * syllable is (alignments.json). Training on it should teach a model the rules back, which
 * checks the whole pipeline (pitch tracking, features, training, export, the browser's copy of
 * the network) in a couple of minutes, with nothing to download.
 *
 *   bun tools/synth-corpus.ts <outdir> [count=300]
 *   cd training && python -m prosody.prep --ljspeech <outdir> --alignments <outdir>/alignments.json --out data/synth.jsonl
 *
 * Needs the engine built (`bun run prepare-chimera`).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { initEngine, WasmVoice } from "../vendor/chimera/tests/harness.ts";
import { PRESETS, defaultF0 } from "../vendor/chimera/src/ui/body.ts";
import { planSpeech } from "../src/plan.ts";
import { layout } from "../src/prosody.ts";

const FS = 24000, LEAD = 0.03;
const [outdir, countArg] = process.argv.slice(2);
if (!outdir) {
  console.error("usage: bun tools/synth-corpus.ts <outdir> [count]");
  process.exit(1);
}
const count = Number(countArg ?? 300);
mkdirSync(join(outdir, "wavs"), { recursive: true });

// a seeded generator, so the corpus is the same every time
let seed = 12345;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

const W = {
  det: ["the", "a", "my", "your", "this", "that", "every", "our"],
  adj: ["little", "yellow", "quiet", "broken", "wonderful", "angry", "ordinary", "enormous", "tired", "clever", "old", "new", "expensive", "ridiculous"],
  noun: ["robot", "teacher", "garden", "computer", "window", "banana", "neighbor", "river", "telephone", "morning", "dog", "family", "president", "umbrella", "story", "machine", "kitchen", "doctor"],
  verb: ["remembers", "follows", "repairs", "watches", "forgets", "believes", "carries", "discovers", "wants", "understands", "ignores", "likes"],
  past: ["remembered", "followed", "repaired", "watched", "forgot", "believed", "carried", "discovered", "wanted", "understood", "ignored", "liked"],
  base: ["remember", "follow", "repair", "watch", "forget", "believe", "carry", "discover", "want", "understand", "ignore", "like"],
  adv: ["today", "yesterday", "again", "slowly", "tomorrow", "already", "completely", "sometimes"],
  place: ["in the kitchen", "under the table", "at the station", "near the river", "on the mountain", "in the city"],
  lead: ["well", "honestly", "after dinner", "in the morning", "of course", "by the way", "however", "on the other hand"],
  wh: ["what", "where", "why", "when", "how", "who"],
};
const np = () => `${pick(W.det)} ${rand() < 0.6 ? pick(W.adj) + " " : ""}${pick(W.noun)}`;
const clause = () => `${np()} ${pick([...W.verb, ...W.past])} ${np()}${rand() < 0.4 ? " " + pick([...W.adv, ...W.place]) : ""}`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const MAKERS: (() => string)[] = [
  () => `${cap(clause())}.`,
  () => `${cap(clause())}.`,
  () => `${cap(pick(W.lead))}, ${clause()}.`,
  () => `${cap(clause())}, and ${clause()}.`,
  () => `${cap(clause())}, but ${np()} ${pick(W.past)} it ${pick(W.adv)}.`,
  () => `${cap(pick(["does", "did", "can", "will", "should"]))} ${np()} ${pick(W.base)} ${np()}?`,
  () => `${cap(pick(["is", "was"]))} ${np()} ${pick(W.place)}?`,
  () => `${cap(pick(W.wh))} did ${np()} ${pick(W.base)}${rand() < 0.5 ? " " + pick(W.adv) : ""}?`,
  () => `${cap(pick(W.lead))}, ${pick(["does", "did", "can"])} ${np()} ${pick(W.base)} ${np()}?`,
  () => `${cap(np())}!`,
  () => `${cap(clause())}. ${cap(clause())}.`,
];

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

const body = PRESETS.male, f0 = defaultF0(body);
const metadata: string[] = [], alignments: Record<string, [number, number][]> = {};
const started = Date.now();
let seconds = 0;
for (let n = 0; n < count; n++) {
  const text = MAKERS[n % MAKERS.length](), id = `SYN-${String(n + 1).padStart(4, "0")}`;
  const phrases = g2p.toPhrases(text);
  const plan = planSpeech(engine, phrases, { body, rate: 1, f0, natural: true });
  const counts = engine.plannedCounts(phrases.flatMap((p) => p.segments.map((s) => s.ipa)));
  const voice = new WasmVoice(FS);
  voice.setSource({ f0 });
  voice.setGate(1);
  voice.schedule(plan.gestures, LEAD, true);
  const audio = voice.render(Math.ceil((plan.end + LEAD + 0.1) * FS));
  writeFileSync(join(outdir, "wavs", `${id}.wav`), wav(audio));
  metadata.push(`${id}|${text}|${text}`);
  alignments[id] = layout(phrases, plan, counts).flatMap((ph) => ph.syllables.map((s): [number, number] => [+(s.t0 + LEAD).toFixed(4), +(s.t1 + LEAD).toFixed(4)]));
  seconds += audio.length / FS;
}
writeFileSync(join(outdir, "metadata.csv"), metadata.join("\n") + "\n");
writeFileSync(join(outdir, "alignments.json"), JSON.stringify(alignments));
console.log(`${count} sentences, ${(seconds / 60).toFixed(1)} minutes of speech, rendered in ${((Date.now() - started) / 1000).toFixed(0)} s → ${outdir}`);
