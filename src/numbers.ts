/** Integers as English words, for the bits of text the engine's own number reader doesn't cover. */
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];

export function cardinal(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + cardinal(n % 100) : "");
  for (const [size, name] of SCALES) {
    if (n >= size) return cardinal(Math.floor(n / size)) + " " + name + (n % size ? " " + cardinal(n % size) : "");
  }
  return String(n);
}

const IRREGULAR: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };

export function ordinal(n: number): string {
  const words = cardinal(n).split(" ");
  const last = words[words.length - 1];
  words[words.length - 1] = IRREGULAR[last] ?? (last.endsWith("y") ? last.slice(0, -1) + "ieth" : last + "th");
  return words.join(" ");
}

/** Digits read one by one ("4 0 4" → "four zero four"). */
export const digits = (s: string) => [...s].map((d) => ONES[Number(d)]).join(" ");

/** A whole number the way it is said: a year in pairs ("twenty twenty six"), anything else in full. */
export function spoken(n: number): string {
  if (n >= 1100 && n <= 2099 && (n < 2000 || n > 2009) && n % 100 !== 0) {
    const lo = n % 100;
    return `${cardinal(Math.floor(n / 100))} ${lo < 10 ? "oh " + cardinal(lo) : cardinal(lo)}`;
  }
  return cardinal(n);
}
