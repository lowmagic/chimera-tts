import { expect, test } from "bun:test";
import { toSpeakable } from "../../src/normalize.ts";
import { cardinal, ordinal } from "../../src/numbers.ts";

test("numbers as words", () => {
  expect(cardinal(0)).toBe("zero");
  expect(cardinal(21)).toBe("twenty one");
  expect(cardinal(400)).toBe("four hundred");
  expect(cardinal(1234)).toBe("one thousand two hundred thirty four");
  expect(ordinal(1)).toBe("first");
  expect(ordinal(22)).toBe("twenty second");
  expect(ordinal(30)).toBe("thirtieth");
});

test("markdown is stripped", () => {
  expect(toSpeakable("**Sure!** Here's a `thing`:\n- one\n- two")).toBe("Sure! Here's a thing, one two");
  expect(toSpeakable("See [the docs](https://example.com/a?b=1) now.")).toBe("See the docs now.");
  expect(toSpeakable("# Title\nBody")).toBe("Title Body");
});

test("money, times, percentages and decimals are spelled out", () => {
  expect(toSpeakable("It costs $3.50.")).toBe("It costs three dollars and fifty cents.");
  expect(toSpeakable("$1")).toBe("one dollar");
  expect(toSpeakable("$1,200")).toBe("one thousand two hundred dollars");
  expect(toSpeakable("Meet at 10:30 AM")).toBe("Meet at ten thirty ay em");
  expect(toSpeakable("at 9:05")).toBe("at nine oh five");
  expect(toSpeakable("at 7pm or 8 a.m.")).toBe("at 7 pee em or 8 ay em");
  expect(toSpeakable("I am here. Who am I?")).toBe("I am here. Who am I?");
  expect(toSpeakable("50% off")).toBe("50 percent off");
  expect(toSpeakable("pi is 3.14")).toBe("pi is 3 point one four");
  expect(toSpeakable("the 1st and 3rd")).toBe("the first and third");
  expect(toSpeakable("1,000,000 people")).toBe("1000000 people");
});

test("abbreviations, symbols and emoji", () => {
  expect(toSpeakable("Use fruit, e.g. apples & pears 🍐")).toBe("Use fruit, for example, apples and pears");
  expect(toSpeakable("Dr. Smith vs. Mr. Jones")).toBe("Doctor Smith versus Mister Jones");
  expect(toSpeakable("yes/no")).toBe("yes slash no");
  expect(toSpeakable("wait — what (really)?")).toBe("wait, what, really?");
});

test("the engine keeps its sentence punctuation", () => {
  expect(toSpeakable("Is it? Yes. Great!")).toBe("Is it? Yes. Great!");
  expect(toSpeakable("don't stop")).toBe("don't stop");
});
