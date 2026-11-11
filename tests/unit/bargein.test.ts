import { expect, test } from "bun:test";
import { SpeechOnset } from "../../src/bargein.ts";

/** frames (20 ms each) until the detector fires, or -1 */
function firesAt(levels: number[]): number {
  const d = new SpeechOnset();
  return levels.findIndex((db) => d.push(db));
}
const frames = (n: number, db: (i: number) => number) => Array.from({ length: n }, (_, i) => db(i));
/** a deterministic wobble of ±amp dB */
const wobble = (i: number, amp: number) => amp * Math.sin(i * 1.7) * Math.cos(i * 0.31);

test("a quiet room never fires", () => {
  expect(firesAt(frames(1500, (i) => -62 + wobble(i, 4)))).toBe(-1);
});

test("a voice over a quiet room fires within a quarter of a second", () => {
  const at = firesAt([...frames(100, (i) => -60 + wobble(i, 3)), ...frames(50, (i) => -24 + wobble(i, 5))]);
  expect(at).toBeGreaterThanOrEqual(100 + 8);
  expect(at).toBeLessThan(100 + 13);
});

test("steady noise that sets in (the synth's residue, a fan) is absorbed, and a voice over it still fires", () => {
  const noise = frames(1000, (i) => -50 + wobble(i, 4));
  expect(firesAt([...frames(50, () => -65), ...noise])).toBe(-1);
  const at = firesAt([...frames(50, () => -65), ...noise, ...frames(50, (i) => -26 + wobble(i, 4))]);
  expect(at).toBeGreaterThanOrEqual(1050);
  expect(at).toBeLessThan(1065);
});

test("noise already there when it starts listening is the floor, however loud", () => {
  expect(firesAt(frames(1000, (i) => -30 + wobble(i, 4)))).toBe(-1);
  // and the first frame being silent (the mic opening) doesn't make the rest look like a voice
  expect(firesAt([-100, -100, ...frames(1000, (i) => -35 + wobble(i, 4))])).toBe(-1);
});

test("a click or a cough (a few loud frames) does not fire", () => {
  expect(firesAt([...frames(100, () => -60), ...frames(5, () => -15), ...frames(200, () => -60)])).toBe(-1);
});

test("sound that is far above the floor but still very quiet does not fire", () => {
  expect(firesAt([...frames(100, () => -90), ...frames(100, () => -55)])).toBe(-1);
});
