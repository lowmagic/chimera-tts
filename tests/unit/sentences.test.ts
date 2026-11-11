import { expect, test } from "bun:test";
import { SentenceStream } from "../../src/sentences.ts";

const feed = (chunks: string[]) => {
  const s = new SentenceStream();
  return [...chunks.flatMap((c) => s.push(c)), ...s.flush()];
};

test("sentences come out as they complete, however the stream is cut", () => {
  const text = "The capital of Australia is Canberra. It was chosen as a compromise! Did you know that?";
  const want = ["The capital of Australia is Canberra.", "It was chosen as a compromise!", "Did you know that?"];
  expect(feed([text])).toEqual(want);
  expect(feed([...text])).toEqual(want);
  expect(feed(text.split(/(?<= )/))).toEqual(want);
});

test("nothing is emitted until a sentence is over", () => {
  const s = new SentenceStream();
  expect(s.push("The capital of Australia is Canberra.")).toEqual([]); // no following space yet
  expect(s.push(" It")).toEqual(["The capital of Australia is Canberra."]);
});

test("a short opener joins the next sentence", () => {
  expect(feed(["Sure. Preheat the oven to four hundred degrees. Then wait."])).toEqual(["Sure. Preheat the oven to four hundred degrees.", "Then wait."]);
});

test("abbreviations, initials and decimals don't end a sentence", () => {
  expect(feed(["I asked Dr. Smith about the 3.5 percent rate today. He said J. K. Rowling wrote it, etc. and left."])).toEqual(["I asked Dr. Smith about the 3.5 percent rate today.", "He said J. K. Rowling wrote it, etc. and left."]);
});

test("a line break ends a sentence", () => {
  expect(feed(["First line without a stop\nSecond line"])).toEqual(["First line without a stop", "Second line"]);
});
