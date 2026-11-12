/**
 * Pronunciations the dictionary lacks or has wrong, mostly the names a chat about computers is
 * full of. Without an entry a word goes through Chimera's letter-to-sound rules, which turn
 * "ChatGPT" into something like "chat-ch-p-t".
 *
 * Entries are ARPAbet as in the CMU dictionary (stress digits on vowels: 1 main, 2 secondary,
 * 0 none) and are added to the end of the dictionary text, where they win over its own entries.
 * Add a line here whenever the voice mangles a name.
 */
export const LEXICON: Record<string, string> = {
  ai: "EY2 AY1",
  airbnb: "EH2 R B IY2 EH2 N B IY1",
  anthropic: "AE0 N TH R AA1 P IH0 K",
  chatgpt: "CH AE2 T JH IY2 P IY2 T IY1",
  chimera: "K AY0 M IH1 R AH0",
  covid: "K OW1 V IH0 D",
  emoji: "IH0 M OW1 JH IY0",
  emojis: "IH0 M OW1 JH IY0 Z",
  json: "JH EY1 S AH0 N",
  kubernetes: "K UW2 B ER0 N EH1 T IY0 Z",
  lyft: "L IH1 F T",
  macos: "M AE2 K OW2 EH1 S",
  nous: "N UW1 S",
  ollama: "OW0 L AA1 M AH0",
  openai: "OW2 P AH0 N EY2 AY1",
  openrouter: "OW1 P AH0 N R AW2 T ER0",
  pytorch: "P AY1 T AO2 R CH",
  qwen: "K W EH1 N",
  synth: "S IH1 N TH",
  tiktok: "T IH1 K T AA2 K",
  typescript: "T AY1 P S K R IH2 P T",
  venmo: "V EH1 N M OW0",
  wasm: "W AA1 Z AH0 M",
};

/** The dictionary text ("word<TAB>PHONES" lines) with the lexicon's entries added. */
export function withLexicon(dictionary: string): string {
  return `${dictionary.replace(/\n*$/, "\n")}${Object.entries(LEXICON).map(([w, p]) => `${w}\t${p}`).join("\n")}\n`;
}

/** Every word a dictionary text has a pronunciation for. */
export function wordsIn(dictionary: string): Set<string> {
  const words = new Set<string>();
  for (let at = 0; at < dictionary.length; ) {
    const tab = dictionary.indexOf("\t", at), end = dictionary.indexOf("\n", at);
    const stop = end < 0 ? dictionary.length : end;
    if (tab > at && tab < stop) words.add(dictionary.slice(at, tab));
    at = stop + 1;
  }
  return words;
}

/** A dictionary file's text, whether the server sent it gzipped or already inflated. */
export async function fetchDictionary(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dictionary ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
