// Check of the built speak command (tools/speak.ts) as Hermes Agent runs it: `bun run build`, then
// `node tests/speak.mjs` (`bun run e2e` runs it first). dist/speak/ is copied away from the repo
// and run from there, so it must find everything it needs beside itself. Then `--serve`, as a speech
// server runs it: requests on stdin, answers on stdout.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};
const check = (ok, msg) => (ok ? console.log("ok  ", msg) : fail(msg));

const dir = mkdtempSync(join(tmpdir(), "chimera-speak-"));
cpSync(join(import.meta.dirname, "..", "dist", "speak"), join(dir, "speak"), { recursive: true });
const speak = (...args) => spawnSync(process.execPath, [join(dir, "speak", "speak.mjs"), ...args], { cwd: dir, encoding: "utf8" });

const text = join(dir, "reply.md"), out = join(dir, "reply.wav");
writeFileSync(text, "[happy] Hello! Here is a *short* reply.\n\n- with a [link](https://example.com)\n- and some `code` 🎉\n");
const t0 = performance.now();
const ok = speak(text, out);
check(ok.status === 0 && ok.stderr === "", `a short reply is spoken and it exits 0 (${ok.status === 0 ? `in ${((performance.now() - t0) / 1000).toFixed(1)} s` : `exit ${ok.status}: ${ok.stderr.trim()}`})`);
if (ok.status === 0) {
  const wav = readFileSync(out);
  const rate = wav.readUInt32LE(24), n = wav.readUInt32LE(40) / 2;
  check(
    wav.toString("ascii", 0, 4) === "RIFF" && wav.toString("ascii", 8, 16) === "WAVEfmt " && wav.readUInt32LE(4) === wav.length - 8 &&
      wav.readUInt16LE(20) === 1 && wav.readUInt16LE(22) === 1 && wav.readUInt16LE(34) === 16 && wav.toString("ascii", 36, 40) === "data" && 44 + 2 * n === wav.length,
    "it writes a 16-bit mono PCM WAV",
  );
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (wav.readInt16LE(44 + 2 * i) / 32768) ** 2;
  const secs = n / rate, rms = Math.sqrt(sum / n);
  check(secs > 1.5 && secs < 10 && rms > 0.01, `and it is speech: ${secs.toFixed(1)} s, RMS ${rms.toFixed(3)}`);
}

const missing = speak(join(dir, "no-such-reply.txt"), join(dir, "missing.wav"));
const lines = missing.stderr.split("\n").filter(Boolean);
check(missing.status !== 0 && lines.length === 1 && lines[0].startsWith("speak: "), `an unreadable input exits non-zero with one line on stderr (exit ${missing.status}: ${missing.stderr.trim()})`);
check(speak(text).status !== 0, "so does a missing argument");

// --serve: two requests and a bad one between them, answered in order, then stdin closes
const sentences = { a: "Hello there, this is the first of two sentences.", b: "[sad] And this is the second one." };
const requests = [JSON.stringify({ id: "a", text: sentences.a }), "{not json", JSON.stringify({ id: "b", text: sentences.b })];
const t1 = performance.now();
const served = spawnSync(process.execPath, [join(dir, "speak", "speak.mjs"), "--serve"], { cwd: dir, encoding: "utf8", input: requests.join("\n") + "\n", maxBuffer: 1 << 28 });
const secs1 = ((performance.now() - t1) / 1000).toFixed(1);
check(served.status === 0, `--serve exits 0 when stdin closes (exit ${served.status}${served.status ? `: ${served.stderr.trim()}` : `, in ${secs1} s`})`);
const answers = served.stdout.split("\n").filter(Boolean).map((l) => {
  try {
    return JSON.parse(l);
  } catch {
    return { unparsed: l };
  }
});
check(answers.length === 3 && answers.map((a) => a.id).join() === "a,,b", `it answers each request with one JSON line, in order (ids ${JSON.stringify(answers.map((a) => a.id))})`);
for (const a of answers.filter((a) => a.id)) {
  const n = a.pcm ? Buffer.from(a.pcm, "base64").length / 2 : 0, secs = n / a.rate;
  check(a.rate === 48000 && n > 0 && Number.isInteger(n) && secs > 1 && secs < 8, `"${a.id}" is ${secs.toFixed(1)} s of 48 kHz 16-bit PCM`);
}
const bad = answers[1] ?? {};
check(typeof bad.error === "string" && bad.error.length > 0 && !bad.error.includes("\n") && !("pcm" in bad), `a bad request gets an error line (${JSON.stringify(bad.error)})`);
