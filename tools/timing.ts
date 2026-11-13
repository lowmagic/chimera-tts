/**
 * Chimera's own length for every syllable of every utterance of a corpus, for training the model's
 * timing against (training/README.md, "Timing"):
 *
 *   bun tools/timing.ts <corpus dir> > training/data/<name>-chimera.json
 *
 * The corpus is in LJSpeech's layout (metadata.csv: "id|text|text"). Writes {id: [seconds per
 * syllable]}, each syllable measured as `src/timing.ts` does, at the default speed. Nothing is
 * rendered, so it takes seconds. Needs the engine built (`bun run prepare-chimera`).
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { initEngine } from "../vendor/chimera/tests/harness.ts";
import { PRESETS } from "../vendor/chimera/src/ui/body.ts";
import { syllableTiming } from "../src/timing.ts";

const [dir] = process.argv.slice(2);
if (!dir) {
  console.error("usage: bun tools/timing.ts <corpus dir> > chimera.json");
  process.exit(1);
}
await initEngine();
const engine = await import("../vendor/chimera/src/wasm/engine.ts");
const g2p = new engine.EnglishG2P();
// the dictionary as the training code reads it (no additions), so both count the same syllables
g2p.setDictionaryText(gunzipSync(readFileSync(new URL("../vendor/chimera/public/data/cmudict.txt.gz", import.meta.url))).toString());

const out: Record<string, number[]> = {};
let n = 0;
for (const line of readFileSync(join(dir, "metadata.csv"), "utf8").split("\n")) {
  const parts = line.split("|");
  if (parts.length < 2 || !parts[0]) continue;
  const phrases = g2p.toPhrases(parts[parts.length - 1].replaceAll("’", "'"));
  if (!phrases.length) continue;
  const plan = engine.planPhrases(phrases, { body: PRESETS.male, t0: 0 });
  const counts = engine.plannedCounts(phrases.flatMap((p) => p.segments.map((s) => s.ipa)));
  out[parts[0]] = syllableTiming(phrases, plan, counts).lengths.map((v) => Math.round(v * 1e4) / 1e4);
  if (++n % 5000 === 0) console.error(`${n} utterances`);
}
console.error(`${n} utterances`);
process.stdout.write(JSON.stringify(out));
