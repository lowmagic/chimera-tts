/**
 * A whole reply as an agent writes it (Markdown: lists, code, links, tables, emoji) → the sentences
 * to say, each as `toSayable` makes them. For a reply that arrives whole (`tools/speak.ts`, which
 * speaks for Hermes Agent) rather than streamed to the page.
 *
 * Only what spans lines is handled here, since `SentenceStream` hands on one line at a time: a
 * fenced code block is said as "code block", a table row as its cells, and a rule, a link
 * definition or a footnote not at all. Everything within a line (links, URLs, emphasis, emoji,
 * numbers) is left to `toSayable`, as on the page.
 */
import { SentenceStream } from "./sentences.ts";

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
/** ---, ***, ___ (also with spaces) and a setext heading's underline */
const RULE = /^\s{0,3}(?:([-*_])(?:\s*\1){2,}|=+)\s*$/;
/** [ref]: https://… and [^note]: … */
const DEFINITION = /^\s{0,3}\[[^\]]+\]:\s/;
/** a table's line under its header: |---|:--:| (always with a pipe, unlike a rule) */
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$|^\s*\|\s*:?-+:?\s*\|\s*$/;
/** a task list's box, after the item's marker */
const TASK_BOX = /^((?:[-*+]|\d+[.)])\s+)\[[ xX]\]\s+/;
/** an HTML tag (<br>, </details>), not an autolink (<https://…>) */
const HTML_TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>\n]*)?\/?>/gi;

/** The reply, line by line, with its block structure turned into lines that can be said. */
export function sayableLines(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let table = false;
  lines.forEach((line, i) => {
    const f = line.match(FENCE)?.[1];
    if (fence) {
      // a fence closes with at least as many of the same mark and nothing after it
      if (f && f[0] === fence[0] && f.length >= fence.length && line.trim() === f) fence = null;
      return;
    }
    if (f) {
      fence = f;
      out.push("Code block.");
      return;
    }
    if (TABLE_DELIMITER.test(line)) {
      table = true;
      return;
    }
    // a table runs from its header (the line above its delimiter) to the first line with no pipe
    table = line.includes("|") && (table || TABLE_DELIMITER.test(lines[i + 1] ?? "") || /^\s*\|.*\|\s*$/.test(line));
    if (table) {
      // its cells as a list: "Paris, France, two million"
      out.push(line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim()).filter(Boolean).join(", "));
      return;
    }
    if (RULE.test(line) || DEFINITION.test(line)) {
      out.push("");
      return;
    }
    out.push(
      line
        .trim() // a nested list item's indent, so its marker is seen as one
        .replace(TASK_BOX, "$1")
        .replace(/\[\^[^\]]+\]/g, "") // a footnote mark
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1") // a reference link: its text
        .replace(HTML_TAG, " "),
    );
  });
  return out;
}

/** The reply's sentences, split as the page splits a streamed reply. */
export function replySentences(markdown: string): string[] {
  const stream = new SentenceStream();
  return [...stream.push(sayableLines(markdown).join("\n")), ...stream.flush()];
}
