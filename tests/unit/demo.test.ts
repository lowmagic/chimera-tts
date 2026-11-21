import { expect, test } from "bun:test";
import { FUNNY_LINES, MOCK_TURN, PRESETS, SAMPLE, spokenText, streamChunks } from "../../src/demo.ts";

test("the prefilled sample and presets turn into clean speakable sentences", () => {
  expect(spokenText(SAMPLE)).toContain("physical model of a throat");
  expect(spokenText(PRESETS.prose)).toContain("Can you hear the difference?");
  expect(spokenText(FUNNY_LINES[0])).toContain("I cannot drink Coca Cola because I'm a robot.");
  for (const line of FUNNY_LINES) expect(spokenText(line).length).toBeGreaterThan(30);
  expect(spokenText(PRESETS.markdown)).toBe(
    "Here's how Markdown sounds once cleaned up. " +
      "Run bun run test on all twelve checks. " +
      "Read the voice guide, for example, three dollars and fifty cents and ninety five percent speed. " +
      "Full source at link.",
  );
  expect(spokenText(MOCK_TURN.reply)).toBe(
    "As tokens arrive, each finished sentence goes straight to the vocal tract. " +
      "Markdown like wasm and links is cleaned on the fly. " +
      "You hear the first line while the rest is still streaming!",
  );
});

test("the mock reply streamer yields the whole text in small pieces and stops on abort", async () => {
  const pieces: string[] = [];
  for await (const d of streamChunks(MOCK_TURN.reply, 0)) pieces.push(d);
  expect(pieces.length).toBeGreaterThan(10);
  expect(pieces.join("")).toBe(MOCK_TURN.reply);

  const ctl = new AbortController();
  const cut: string[] = [];
  for await (const d of streamChunks(MOCK_TURN.reply, 5, ctl.signal)) {
    cut.push(d);
    if (cut.length === 2) ctl.abort();
  }
  expect(cut.length).toBe(2);
});
