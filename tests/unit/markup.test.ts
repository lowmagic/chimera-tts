import { expect, test } from "bun:test";
import { toSayable, wordsOf } from "../../src/markup.ts";

test("plain text passes through with no marks", () => {
  expect(toSayable("Hello there.")).toEqual({ text: "Hello there.", emphasis: [], mood: null });
});

test("a mood tag is taken out and reported", () => {
  expect(toSayable("[excited] Wow, that worked!")).toEqual({ text: "Wow, that worked!", emphasis: [], mood: "excited" });
  expect(toSayable("[ Sad ] Oh no.").mood).toBe("sad");
  // not a mood: read as written (the brackets are pauses)
  expect(toSayable("[citation needed] Maybe.")).toEqual({ text: "citation needed, Maybe.", emphasis: [], mood: null });
});

test("emphasis is taken out and its word's place reported", () => {
  expect(toSayable("I said *tomorrow*, not today.")).toEqual({ text: "I said tomorrow, not today.", emphasis: [2], mood: null });
  expect(toSayable("That is **really** good and _very_ cheap.")).toEqual({ text: "That is really good and very cheap.", emphasis: [2, 5], mood: null });
  expect(toSayable("*No.*")).toEqual({ text: "No.", emphasis: [0], mood: null });
});

test("the word's place is counted in the words as spoken, after numbers and symbols are spelled out", () => {
  const s = toSayable("It costs $3.50 & that is *cheap* for 2026.");
  expect(s.text).toBe("It costs three dollars and fifty cents and that is cheap for twenty twenty six.");
  expect(wordsOf(s.text)[s.emphasis[0]]).toBe("cheap");
  // an emphasized number is its first word
  const n = toSayable("You have *42* of them.");
  expect(wordsOf(n.text)[n.emphasis[0]]).toBe("forty");
});

test("long spans, snake_case and stray asterisks are not emphasis", () => {
  expect(toSayable("**This whole heading is bold**").emphasis).toEqual([]);
  expect(toSayable("**This whole heading is bold**").text).toBe("This whole heading is bold");
  expect(toSayable("the my_var_name thing").emphasis).toEqual([]);
  expect(toSayable("two * three * four").emphasis).toEqual([]);
});
