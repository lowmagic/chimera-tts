import { expect, test } from "bun:test";
import { toSayable } from "../../src/markup.ts";
import { replySentences, sayableLines } from "../../src/reply.ts";

/** what is said of a reply, sentence by sentence (a sentence with nothing sayable is skipped) */
const said = (markdown: string) => replySentences(markdown).map((s) => toSayable(s).text).filter(Boolean);

test("a Markdown reply, as Hermes writes one, becomes what can be said", () => {
  const reply = [
    "[happy] Here's what I found! 🎉",
    "",
    "## Steps",
    "",
    "1. Install it with `npm install chimera`.",
    "2. Read [the guide](https://example.com/guide) before you *start*.",
    "    1. Nested items are lists too.",
    "- [x] A task that is done",
    "",
    "```python",
    'print("hello")',
    "```",
    "",
    "| City | Population |",
    "|------|-----------:|",
    "| Paris | 2,100,000 |",
    "",
    "---",
    "",
    "More at https://example.com/docs.<br>",
    "See the [docs][1] too.[^1]",
    "",
    "[1]: https://example.com/docs",
    "[^1]: A footnote.",
  ].join("\n");
  expect(said(reply)).toEqual([
    "Here's what I found!",
    "Steps",
    "Install it with npm install chimera.",
    "Read the guide before you start.",
    "Nested items are lists too.",
    "A task that is done",
    "Code block.",
    "City, Population",
    "Paris, two million one hundred thousand",
    "More at link.",
    "See the docs too.",
  ]);
  // the mood and the stressed word are still marks, not words
  const sentences = replySentences(reply);
  expect(toSayable(sentences[0]).mood).toBe("happy");
  expect(toSayable(sentences.find((s) => s.includes("guide"))!).emphasis).toEqual([5]);
});

test("a code block is one line however long, closed or not", () => {
  expect(sayableLines("Try this:\n~~~\na = 1\n\nb = 2\n~~~\nDone.")).toEqual(["Try this:", "Code block.", "Done."]);
  // a shorter fence inside doesn't close it
  expect(sayableLines("````md\n```\nx\n```\n````\nAfter.")).toEqual(["Code block.", "After."]);
  // a reply cut off inside one
  expect(sayableLines("Here:\n```js\nlet x")).toEqual(["Here:", "Code block."]);
});

test("a table's rows are its cells, with or without the outer pipes", () => {
  expect(sayableLines("Name | Age\n--- | ---\nAnn | 30\nBo | 4\nThat's all.")).toEqual(["Name, Age", "Ann, 30", "Bo, 4", "That's all."]);
  // a line with a pipe in it is not a table on its own
  expect(sayableLines("Pick a | b.")).toEqual(["Pick a | b."]);
});
