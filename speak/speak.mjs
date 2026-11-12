var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn(fn = 0);
    } catch (e) {
      err = [e];
    }
  if (err)
    throw err[0];
  return res;
};

// vendor/chimera/src/wasm/chimera.ts
function initChimera(source) {
  if (loading)
    return loading;
  loading = (async () => {
    let mod;
    if (source && typeof source !== "string")
      mod = await WebAssembly.compile(source);
    else {
      const url = source ?? (await import("./chimera.wasm?url")).default;
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`engine: ${url}: HTTP ${res.status}`);
      mod = await WebAssembly.compile(await res.arrayBuffer());
    }
    if (WebAssembly.Module.imports(mod).length)
      throw new Error("engine: the wasm module must not have imports");
    exports = (await WebAssembly.instantiate(mod, {})).exports;
    module = mod;
  })();
  loading.catch(() => loading = null);
  return loading;
}
function chimeraModule() {
  if (!module)
    throw new Error("engine not loaded (await initChimera())");
  return module;
}
function x() {
  if (!exports)
    throw new Error("engine not loaded (await initChimera())");
  return exports;
}
function call(fn, args = {}) {
  const e = x();
  const bytes = enc.encode(JSON.stringify({ fn, ...args }));
  const p = e.chimera_alloc(bytes.length);
  new Uint8Array(e.memory.buffer, p, bytes.length).set(bytes);
  const status = e.chimera_call(p, bytes.length);
  e.chimera_free(p, bytes.length);
  const out = dec.decode(new Uint8Array(e.memory.buffer, e.chimera_result_ptr(), e.chimera_result_len()));
  const v = JSON.parse(out);
  if (status !== 0)
    throw new Error(`engine ${fn}: ${v.error}`);
  return v;
}
var module = null, exports = null, loading = null, enc, dec;
var init_chimera = __esm(() => {
  enc = new TextEncoder;
  dec = new TextDecoder;
});

// vendor/chimera/src/ui/creatureVisuals.ts
var CREATURE_VISUALS;
var init_creatureVisuals = __esm(() => {
  CREATURE_VISUALS = {
    songbird: {
      view: { x0: -4, x1: 14, y0: -6, y1: 8 },
      silhouette: [[-3.2, -1.2], [-1.6, -3.4], [1.6, -4.6], [5.2, -4.4], [7.8, -2.6], [9, -0.4], [9.6, 1.8], [10.4, 2.4], [12.8, 2.6], [10.6, 3], [9.8, 3.6], [9.2, 4.6], [7.6, 5.2], [6, 4.6], [4.2, 2.8], [2, 2], [-0.2, 1.6], [-3.6, 1.4], [-3.4, 0.2]],
      parts: [{ shade: 0.2, pts: [[8.6, 4], [8.95, 4.3], [9.2, 4], [8.95, 3.7]] }],
      tubes: [
        { tube: "bronchusL", path: [[3.4, -1.9], [4.4, -1.4]], label: "Left bronchus", inView: false },
        { tube: "bronchusR", path: [[3.4, -0.9], [4.4, -1.2]], label: "Right bronchus", inView: false },
        { tube: "trachea", path: [[4.4, -1.3], [5.6, -0.4], [6.8, 0.8], [7.8, 1.9], [8.6, 2.5]], label: "Trachea" },
        { tube: "beak", path: [[9.4, 2.75], [10.6, 2.75], [12.4, 2.7]], label: "Beak" }
      ],
      tubeScale: 1.6,
      sources: [{ key: "left", at: [4.2, -1.6], label: "Left voice" }, { key: "right", at: [4.2, -1], label: "Right voice" }]
    },
    seal: {
      view: { x0: -60, x1: 60, y0: -30, y1: 30 },
      silhouette: [[-58, -2], [-50, -8], [-30, -14], [-5, -16], [20, -14], [38, -10], [48, -6], [55, -3], [58, 1], [56, 5], [50, 8], [42, 10], [30, 11], [10, 13], [-15, 13], [-35, 10], [-50, 6], [-56, 3], [-62, 8], [-64, 4], [-60, 0], [-64, -4], [-62, -8]],
      parts: [{ shade: 0.15, pts: [[47, 4], [48.5, 5], [50, 4], [48.5, 3]] }],
      tubes: [
        { tube: "trachea", path: [[8, -4], [20, -3], [30, -2]], label: "Trachea" },
        { tube: "pharynx", path: [[30, -2], [38, 0], [44, 1.5]], label: "Pharynx" },
        { tube: "oral", path: [[44, 1.5], [50, 0.5], [57, -0.5]], label: "Mouth" }
      ],
      tubeScale: 1.3,
      sources: [{ key: "glottis", at: [30, -2], label: "Larynx" }]
    },
    alligator: {
      view: { x0: -120, x1: 120, y0: -40, y1: 40 },
      silhouette: [[-118, 2], [-90, -4], [-60, -8], [-30, -14], [0, -16], [30, -14], [50, -10], [70, -8], [95, -5], [114, -3], [118, 0], [115, 3], [98, 5], [75, 7], [52, 9], [40, 12], [20, 14], [-10, 14], [-40, 11], [-70, 7], [-100, 4]],
      parts: [{ shade: 0.15, pts: [[54, 9], [56, 11], [58, 9], [56, 8]] }],
      tubes: [
        { tube: "trachea", path: [[0, -6], [18, -5], [36, -4]], label: "Trachea" },
        { tube: "pharynx", path: [[36, -4], [46, -2], [54, 0]], label: "Pharynx" },
        { tube: "oral", path: [[54, 0], [80, -1], [112, -1]], label: "Mouth" },
        { tube: "nasal", path: [[54, 2], [80, 4], [113, 2]], label: "Nostrils" }
      ],
      tubeScale: 1.05,
      sources: [{ key: "glottis", at: [36, -4], label: "Larynx" }]
    },
    elephant: {
      view: { x0: -170, x1: 170, y0: -170, y1: 130 },
      silhouette: [[-160, 20], [-150, 70], [-110, 105], [-40, 118], [30, 115], [70, 100], [95, 112], [120, 108], [140, 85], [148, 55], [146, 25], [140, 5], [132, -20], [128, -60], [122, -110], [118, -150], [108, -152], [112, -100], [110, -50], [104, -20], [96, -5], [80, 0], [70, -10], [66, -90], [40, -95], [44, -30], [-90, -30], [-95, -95], [-125, -95], [-122, -10], [-150, -5]],
      parts: [{ shade: 0.15, pts: [[118, 62], [122, 66], [126, 62], [122, 58]] }, { shade: 0.62, pts: [[70, 100], [40, 60], [55, 25], [85, 40], [95, 80]] }],
      tubes: [
        { tube: "trachea", path: [[40, 20], [70, 30], [95, 38]], label: "Trachea" },
        { tube: "pharynx", path: [[95, 38], [112, 50], [124, 58]], label: "Pharynx" },
        { tube: "oral", path: [[124, 58], [130, 42], [134, 30]], label: "Mouth" },
        { tube: "trunk", path: [[136, 70], [142, 40], [136, 0], [128, -50], [120, -100], [113, -148]], label: "Trunk" }
      ],
      tubeScale: 3,
      sources: [{ key: "glottis", at: [95, 38], label: "Vocal folds" }, { key: "lips", at: [136, 70], label: "Trunk valve" }]
    }
  };
});

// vendor/chimera/src/wasm/engine.ts
var exports_engine = {};
__export(exports_engine, {
  ARTIC_KEYS: () => ARTIC_KEYS,
  ARTIC_SPECS: () => ARTIC_SPECS,
  BASS_NOTE: () => BASS_NOTE,
  BEAT_PRESETS: () => BEAT_PRESETS,
  BEAT_SOUNDS: () => BEAT_SOUNDS,
  BODY_CHILD: () => BODY_CHILD,
  BODY_FEMALE: () => BODY_FEMALE,
  BODY_MALE: () => BODY_MALE,
  CREATURES: () => CREATURES,
  DEFAULT_SOURCE: () => DEFAULT_SOURCE,
  DEMO_SONGS: () => DEMO_SONGS,
  EXHALE_LABEL: () => EXHALE_LABEL,
  EnglishG2P: () => EnglishG2P,
  NEUTRAL: () => NEUTRAL,
  TractMap: () => TractMap,
  VOWELS: () => VOWELS,
  VOWEL_TARGETS: () => VOWEL_TARGETS,
  activation: () => activation,
  airwayAreas: () => airwayAreas,
  airwayFrame: () => airwayFrame,
  airwayModel: () => airwayModel,
  airwayTransfer: () => airwayTransfer,
  beatReady: () => beatReady,
  creatureById: () => creatureById,
  creaturePreview: () => creaturePreview,
  dropAirwayModel: () => dropAirwayModel,
  formatBeat: () => formatBeat,
  lyricsToSyllables: () => lyricsToSyllables,
  parseBeat: () => parseBeat,
  planMelisma: () => planMelisma,
  planNoteOff: () => planNoteOff,
  planNoteOn: () => planNoteOn,
  planPhrases: () => planPhrases,
  planSong: () => planSong,
  planUtterance: () => planUtterance,
  plannedCounts: () => plannedCounts,
  restTip: () => restTip,
  tokenizeIpa: () => tokenizeIpa
});
function tokenizeIpa(text) {
  return call("tokenizeIpa", { text });
}

class EnglishG2P {
  loading = null;
  isLoaded = false;
  get loaded() {
    return this.isLoaded;
  }
  load(url = "/data/cmudict.txt.gz") {
    if (this.isLoaded)
      return Promise.resolve();
    if (this.loading)
      return this.loading;
    this.loading = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok)
          throw new Error(`dictionary ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        let text;
        if (bytes[0] === 31 && bytes[1] === 139) {
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
          text = await new Response(stream).text();
        } else
          text = new TextDecoder().decode(bytes);
        this.setDictionaryText(text);
      } catch (e) {
        this.loading = null;
        throw e;
      }
    })();
    return this.loading;
  }
  setDictionaryText(text) {
    call("g2pLoad", { text });
    this.isLoaded = true;
  }
  toPhrases(text) {
    return call("g2pPhrases", { text });
  }
  word(w, reduce = true) {
    return call("g2pWord", { word: w, reduce });
  }
}
function lyricsToSyllables(text) {
  return call("lyricsToSyllables", { text });
}
function planUtterance(segments, options) {
  return call("planUtterance", { segments, options });
}
function plannedCounts(ipa) {
  return call("plannedCounts", { ipa });
}
function planPhrases(phrases, options) {
  return call("planPhrases", { phrases: phrases.map((p) => ({ segments: p.segments, intonation: p.intonation, pause: p.pause })), options });
}
function planSong(notes, options) {
  return call("planSong", { notes, options });
}
function planNoteOn(syl, midi, options) {
  return call("planNoteOn", { syl, midi, options });
}
function planMelisma(midi, options) {
  return call("planMelisma", { midi, options });
}
function planNoteOff(syl, midi, body) {
  return call("planNoteOff", { syl, midi, body });
}
function activation(g, t) {
  if (t <= g.t0 - g.rampIn || t >= g.t1 + g.rampOut)
    return 0;
  if (t < g.t0)
    return 0.5 - 0.5 * Math.cos(Math.PI * (t - (g.t0 - g.rampIn)) / Math.max(0.000001, g.rampIn));
  if (t > g.t1)
    return 0.5 + 0.5 * Math.cos(Math.PI * (t - g.t1) / Math.max(0.000001, g.rampOut));
  return 1;
}
function parseBeat(text) {
  return call("parseBeat", { text });
}
function formatBeat(steps) {
  return call("formatBeat", { steps });
}
function beatReady(body) {
  return call("beatReady", { body });
}
function restTip(jaw, tbX, tbY) {
  return call("restTip", { jaw, tbX, tbY });
}

class TractMap {
  scale;
  ph;
  constructor(body) {
    this.scale = body.scale;
    this.ph = body.pharynx;
  }
  P(x, y) {
    const k = this.scale;
    const xx = x > 0.5 ? 0.5 + (x - 0.5) * 0.86 : x;
    const yy = y < 7 ? 7 - (7 - y) * this.ph : y;
    return { x: xx * k, y: yy * k };
  }
  unP(x, y) {
    const k = this.scale;
    let xx = x / k, yy = y / k;
    if (xx > 0.5)
      xx = 0.5 + (xx - 0.5) / 0.86;
    if (yy < 7)
      yy = 7 - (7 - yy) / this.ph;
    return { x: xx, y: yy };
  }
}
function airwayModel(body, sampleRate) {
  return call("model", { body, sampleRate });
}
function dropAirwayModel(m) {
  call("dropModel", { model: m.model });
}
function airwayFrame(m, artic) {
  return call("frame", { model: m.model, artic });
}
function airwayAreas(m, artic) {
  return call("apply", { model: m.model, artic });
}
function airwayTransfer(m, artic) {
  return call("transfer", { model: m.model, artic });
}
function creaturePreview(id, params) {
  return call("creaturePreview", { id, params: params ?? {} });
}
var CATALOG, NEUTRAL, BODY_MALE, BODY_FEMALE, BODY_CHILD, ARTIC_KEYS, ARTIC_SPECS, DEFAULT_SOURCE, EXHALE_LABEL, BASS_NOTE, BEAT_SOUNDS, BEAT_PRESETS, VOWEL_TARGETS, DEMO_SONGS, VOWELS, CREATURES, creatureById = (id) => CREATURES.find((c) => c.id === id);
var init_engine = __esm(() => {
  init_chimera();
  init_creatureVisuals();
  CATALOG = call("catalog");
  NEUTRAL = CATALOG.neutral;
  BODY_MALE = CATALOG.bodies.male;
  BODY_FEMALE = CATALOG.bodies.female;
  BODY_CHILD = CATALOG.bodies.child;
  ARTIC_KEYS = CATALOG.articKeys;
  ARTIC_SPECS = CATALOG.articSpecs;
  DEFAULT_SOURCE = CATALOG.defaultSource;
  EXHALE_LABEL = CATALOG.exhaleLabel;
  BASS_NOTE = CATALOG.bassNote;
  BEAT_SOUNDS = CATALOG.beatSounds;
  BEAT_PRESETS = CATALOG.beatPresets;
  VOWEL_TARGETS = CATALOG.vowelTargets;
  DEMO_SONGS = CATALOG.demoSongs;
  VOWELS = CATALOG.vowels;
  CREATURES = CATALOG.creatures.map((c) => ({ ...c, visual: CREATURE_VISUALS[c.id] }));
});

// tools/speak.ts
init_chimera();
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { gunzipSync } from "node:zlib";

// vendor/chimera/src/wasm/wire.ts
var GESTURE_RECORD = 272;
var CONTROL_KEYS = [
  "jaw",
  "tbX",
  "tbY",
  "ttX",
  "ttY",
  "ttCurl",
  "root",
  "lipAp",
  "lipProt",
  "lipWidth",
  "labiodental",
  "velum",
  "larynx",
  "epilarynx",
  "ventricular",
  "lateral",
  "dorsum",
  "abduction",
  "closure",
  "breath",
  "f0",
  "vibrato"
];
var KEY_INDEX = Object.fromEntries(CONTROL_KEYS.map((k, i) => [k, i]));
var LABEL_CAP = 24;
function utf8(s) {
  const out = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 128)
      out.push(c);
    else if (c < 2048)
      out.push(192 | c >> 6, 128 | c & 63);
    else if (c < 65536)
      out.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
    else
      out.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
  }
  return out;
}
function writeGestures(buf, at, gestures, max) {
  const n = Math.min(gestures.length, max);
  const dv = new DataView(buf, at, n * GESTURE_RECORD);
  const bytes = new Uint8Array(buf, at, n * GESTURE_RECORD);
  for (let i = 0;i < n; i++) {
    const g = gestures[i];
    const o = i * GESTURE_RECORD;
    const head = [g.t0, g.t1, g.rampIn, g.rampOut, g.strength, g.speed ?? NaN, g.releaseHold ?? NaN, g.tag ?? NaN];
    for (let j = 0;j < 8; j++)
      dv.setFloat64(o + j * 8, head[j], true);
    for (let k = 0;k < CONTROL_KEYS.length; k++)
      dv.setFloat64(o + 64 + k * 8, NaN, true);
    for (const [key, value] of Object.entries(g.targets)) {
      const k = KEY_INDEX[key];
      if (k !== undefined && value !== undefined)
        dv.setFloat64(o + 64 + k * 8, value, true);
    }
    if (g.label === undefined)
      bytes[o + 240] = 255;
    else {
      let b = utf8(g.label);
      if (b.length > LABEL_CAP) {
        let n = LABEL_CAP;
        while (n > 0 && (b[n] & 192) === 128)
          n--;
        b = b.slice(0, n);
      }
      bytes[o + 240] = b.length;
      bytes.set(b, o + 241);
    }
  }
  return n;
}

// vendor/chimera/src/ui/body.ts
var PRESETS = {
  male: { female: 0, child: 0 },
  female: { female: 1, child: 0 },
  child: { female: 0, child: 1 }
};
var clamp01 = (x) => Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
function bodyWeights(b) {
  const f = clamp01(b.female), c = clamp01(b.child);
  return [
    ["male", (1 - c) * (1 - f)],
    ["female", (1 - c) * f],
    ["child", c]
  ];
}
function presetOf(b) {
  return bodyWeights(b).find(([, w]) => w === 1)?.[0] ?? null;
}
function blendLog(b, of) {
  const p = presetOf(b);
  if (p)
    return of[p];
  return Math.exp(bodyWeights(b).reduce((s, [n, w]) => s + w * Math.log(of[n]), 0));
}
var defaultF0 = (b) => blendLog(b, { male: 110, female: 205, child: 260 });

// src/numbers.ts
var ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
var TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
var SCALES = [[1000000000000, "trillion"], [1e9, "billion"], [1e6, "million"], [1000, "thousand"]];
function cardinal(n) {
  n = Math.floor(Math.abs(n));
  if (n < 20)
    return ONES[n];
  if (n < 100)
    return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000)
    return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + cardinal(n % 100) : "");
  for (const [size, name] of SCALES) {
    if (n >= size)
      return cardinal(Math.floor(n / size)) + " " + name + (n % size ? " " + cardinal(n % size) : "");
  }
  return String(n);
}
var IRREGULAR = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
function ordinal(n) {
  const words = cardinal(n).split(" ");
  const last = words[words.length - 1];
  words[words.length - 1] = IRREGULAR[last] ?? (last.endsWith("y") ? last.slice(0, -1) + "ieth" : last + "th");
  return words.join(" ");
}
var digits = (s) => [...s].map((d) => ONES[Number(d)]).join(" ");
function spoken(n) {
  if (n >= 1100 && n <= 2099 && (n < 2000 || n > 2009) && n % 100 !== 0) {
    const lo = n % 100;
    return `${cardinal(Math.floor(n / 100))} ${lo < 10 ? "oh " + cardinal(lo) : cardinal(lo)}`;
  }
  return cardinal(n);
}

// src/normalize.ts
var ABBREVIATIONS = [
  [/\be\.g\.,?/gi, "for example,"],
  [/\bi\.e\.,?/gi, "that is,"],
  [/\betc\.?/gi, "et cetera"],
  [/\bvs\.?/gi, "versus"],
  [/\bapprox\.?/gi, "approximately"],
  [/\bMr\./g, "Mister"],
  [/\bMrs\./g, "Missus"],
  [/\bMs\./g, "Miz"],
  [/\bDr\./g, "Doctor"],
  [/\bSt\./g, "Saint"]
];
var LETTERS = {
  a: "ay",
  b: "bee",
  c: "see",
  d: "dee",
  e: "ee",
  f: "f",
  g: "gee",
  h: "h",
  i: "eye",
  j: "jay",
  k: "kay",
  l: "el",
  m: "em",
  n: "en",
  o: "oh",
  p: "pee",
  q: "cue",
  r: "r",
  s: "ess",
  t: "tee",
  u: "u",
  v: "vee",
  w: "w",
  x: "ex",
  y: "why",
  z: "zee"
};
var ALWAYS_LETTERS = new Set(["US", "ID", "OS", "UN", "PM", "QA", "TA", "AR", "VR"]);
var known = null;
function setKnownWords(has) {
  known = has;
}
var spell = (letters) => [...letters.toLowerCase()].map((ch) => LETTERS[ch] ?? ch).join(" ");
function names(text) {
  const isWord = (w) => !!known?.(w.toLowerCase());
  const initials = (w) => ALWAYS_LETTERS.has(w) || (known ? !isWord(w) : !/[AEIOUY]/.test(w));
  return text.replace(/(?<!\p{L})\p{L}{2,}(?!\p{L})/gu, (word) => {
    if (!/[A-Z]/.test(word.slice(1)) || !/^[A-Za-z]+$/.test(word))
      return word;
    if (/^[A-Z]{2,6}s?$/.test(word)) {
      const caps = word.replace(/s$/, "");
      if (!initials(caps))
        return word;
      return ` ${spell(caps)}${word.endsWith("s") ? "'s" : ""} `;
    }
    if (isWord(word))
      return word;
    const parts = word.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(" ");
    if (parts.length === 1)
      return word;
    return parts.map((p) => /^[A-Z]{2,6}$/.test(p) && initials(p) ? spell(p) : p).join(" ");
  });
}
var plural = (n, word) => `${cardinal(n)} ${word}${n === 1 ? "" : "s"}`;
function money(_, whole, cents) {
  const d = Number(whole.replace(/,/g, "")), c = cents ? Number(cents.padEnd(2, "0").slice(0, 2)) : 0;
  if (!c)
    return plural(d, "dollar");
  if (!d)
    return plural(c, "cent");
  return `${plural(d, "dollar")} and ${plural(c, "cent")}`;
}
function clock(_, h, m) {
  const mm = Number(m);
  return `${cardinal(Number(h))} ${mm === 0 ? "o'clock" : mm < 10 ? "oh " + cardinal(mm) : cardinal(mm)}`;
}
var meridiem = (x) => `${x.toLowerCase() === "a" ? "ay" : "pee"} em`;
function toSpeakable(text) {
  let s = text;
  s = s.replace(/```[\s\S]*?```/g, " code block. ");
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/<?https?:\/\/[^\s<>]*[^\s<>.,;:!?'")\]]>?/g, " link ");
  s = s.replace(/^\s{0,3}(#{1,6}|[-*+]|\d+[.)])\s+/gm, "");
  s = s.replace(/[*_`~#>|]/g, " ");
  s = s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " ");
  for (const [re, to] of ABBREVIATIONS)
    s = s.replace(re, to);
  s = names(s);
  s = s.replace(/\$\s?(\d[\d,]*)(?:\.(\d{1,2}))?/g, money);
  s = s.replace(/(\d)\s?([ap])\.?m\b\.?/gi, (_, d, x) => `${d} ${meridiem(x)}`);
  s = s.replace(/\b([ap])\.m\.?/gi, (_, x) => meridiem(x));
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, clock);
  s = s.replace(/(\d)\s?%/g, "$1 percent");
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, n) => ordinal(Number(n)));
  s = s.replace(/\b(\d[\d,]*)\.(\d+)\b/g, (_, a, b) => `${a.replace(/,/g, "")} point ${digits(b)}`);
  s = s.replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (m) => m.replace(/,/g, ""));
  s = s.replace(/\d+/g, (m) => ` ${m.length > 15 ? digits(m) : spoken(Number(m))} `);
  s = s.replace(/&/g, " and ").replace(/\+/g, " plus ").replace(/=/g, " equals ").replace(/@/g, " at ").replace(/°/g, " degrees ");
  s = s.replace(/(\w)\/(\w)/g, "$1 slash $2");
  s = s.replace(/\s[–—-]+\s|[–—]/g, ", ").replace(/[()[\]{}:;]/g, ", ");
  s = s.replace(/[^\p{L}\p{N}\s.,!?'’-]/gu, " ");
  s = s.replace(/\s+([.,!?])/g, "$1").replace(/,(\s*,)+/g, ",").replace(/,+([.!?])/g, "$1");
  return s.replace(/^[\s,]+|[\s,]+$/g, "").replace(/\s+/g, " ");
}

// src/markup.ts
var MOODS = {
  neutral: { shift: 0, range: 1, rate: 1 },
  happy: { shift: 1, range: 1.25, rate: 1.03 },
  excited: { shift: 2, range: 1.45, rate: 1.08 },
  curious: { shift: 1, range: 1.2, rate: 1 },
  calm: { shift: -0.5, range: 0.8, rate: 0.95 },
  serious: { shift: -1, range: 0.85, rate: 0.96 },
  sad: { shift: -1.5, range: 0.6, rate: 0.9 }
};
var MARKUP_PROMPT = "Your voice follows two marks, which are never read aloud. " + `Start a reply with a mood in square brackets when one fits: ${Object.keys(MOODS).filter((m) => m !== "neutral").map((m) => `[${m}]`).join(", ")}. ` + "Put asterisks around the one word in a sentence you would stress if you said it aloud, like: I said *tomorrow*, not today. " + "Stress at most one word per sentence, and only where a person would.";
var MOOD_TAG = new RegExp(`\\[\\s*(${Object.keys(MOODS).join("|")})\\s*\\]`, "gi");
var EMPHASIS = /(\*\*|\*|(?<![\p{L}\p{N}])_)(?=\S)([^*_\n]+?)(?<=\S)\1(?![\p{L}\p{N}])/gu;
var MAX_EMPHASIS_WORDS = 3;
var MARK = "zzemphzz";
var wordsOf = (text) => text.toLowerCase().split(/[^a-z'-]+/).filter((w) => /[a-z]/.test(w));
function toSayable(sentence) {
  let mood = null;
  let s = sentence.replace(MOOD_TAG, (_, m) => {
    mood = m.toLowerCase();
    return " ";
  });
  s = s.replace(EMPHASIS, (whole, _mark, inner) => {
    const words = inner.trim().split(/\s+/);
    return words.length > MAX_EMPHASIS_WORDS ? whole : words.map((w) => `${MARK} ${w}`).join(" ");
  });
  const emphasis = [];
  let n = 0, marked = false;
  for (const w of wordsOf(toSpeakable(s))) {
    if (w === MARK)
      marked = true;
    else {
      if (marked)
        emphasis.push(n);
      marked = false;
      n++;
    }
  }
  const text = toSpeakable(s.replaceAll(MARK, " "));
  return { text, emphasis, mood };
}

// src/lexicon.ts
var LEXICON = {
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
  wasm: "W AA1 Z AH0 M"
};
function withLexicon(dictionary) {
  return `${dictionary.replace(/\n*$/, `
`)}${Object.entries(LEXICON).map(([w, p]) => `${w}	${p}`).join(`
`)}
`;
}
function wordsIn(dictionary) {
  const words = new Set;
  for (let at = 0;at < dictionary.length; ) {
    const tab = dictionary.indexOf("\t", at), end = dictionary.indexOf(`
`, at);
    const stop = end < 0 ? dictionary.length : end;
    if (tab > at && tab < stop)
      words.add(dictionary.slice(at, tab));
    at = stop + 1;
  }
  return words;
}
// shared/prosody-words.json
var prosody_words_default = {
  _: "Shared by src/prosody.ts and training/prosody/text.py: the two must agree on these, or a trained model sees different features in the browser than it was trained on.",
  function: [
    "a",
    "about",
    "after",
    "also",
    "although",
    "am",
    "an",
    "and",
    "any",
    "are",
    "aren't",
    "as",
    "at",
    "be",
    "because",
    "been",
    "before",
    "being",
    "between",
    "but",
    "by",
    "can",
    "can't",
    "could",
    "couldn't",
    "did",
    "didn't",
    "do",
    "does",
    "doesn't",
    "don't",
    "during",
    "for",
    "from",
    "had",
    "hadn't",
    "has",
    "hasn't",
    "have",
    "haven't",
    "he",
    "he'd",
    "he'll",
    "he's",
    "her",
    "here",
    "him",
    "his",
    "i",
    "i'd",
    "i'll",
    "i'm",
    "i've",
    "if",
    "in",
    "into",
    "is",
    "isn't",
    "it",
    "it's",
    "its",
    "just",
    "let's",
    "may",
    "me",
    "might",
    "must",
    "my",
    "myself",
    "n't",
    "no",
    "nor",
    "not",
    "of",
    "off",
    "on",
    "onto",
    "or",
    "our",
    "out",
    "over",
    "shall",
    "she",
    "she'd",
    "she'll",
    "she's",
    "should",
    "shouldn't",
    "so",
    "some",
    "than",
    "that",
    "that's",
    "the",
    "their",
    "them",
    "then",
    "there",
    "there's",
    "these",
    "they",
    "they'd",
    "they'll",
    "they're",
    "they've",
    "this",
    "those",
    "though",
    "through",
    "to",
    "too",
    "under",
    "up",
    "us",
    "very",
    "was",
    "wasn't",
    "we",
    "we'd",
    "we'll",
    "we're",
    "we've",
    "were",
    "weren't",
    "what's",
    "which",
    "while",
    "who",
    "whom",
    "whose",
    "will",
    "with",
    "within",
    "without",
    "won't",
    "would",
    "wouldn't",
    "yet",
    "you",
    "you'd",
    "you'll",
    "you're",
    "you've",
    "your",
    "yourself"
  ],
  wh: [
    "who",
    "whom",
    "whose",
    "what",
    "which",
    "when",
    "where",
    "why",
    "how",
    "what's",
    "who's",
    "where's",
    "how's"
  ]
};

// src/prosody.ts
var FUNCTION_WORDS = new Set(prosody_words_default.function);
var WH_WORDS = new Set(prosody_words_default.wh);
var P = {
  declPerSec: 1.1,
  declMax: 3,
  resetFirst: 1.5,
  resetStep: 0.7,
  resetFloor: 0,
  accent: 3.2,
  downstep: 0.86,
  weakAccent: 0.7,
  secondary: 0.9,
  preDip: -0.6,
  emphasis: 6.5,
  postFocus: 0.35,
  preFocus: 0.6,
  low: -4.5,
  continuationRise: 2.2,
  questionHigh: 7,
  questionLow: -1.5,
  jitter: 0.35
};
var hz = (base, semitones) => base * 2 ** (semitones / 12);
function layout(phrases, plan, counts) {
  const out = [];
  let k = 0, j = 0, word = 0;
  phrases.forEach((p, pi) => {
    const syllables = [];
    const firstWord = word;
    let first, last;
    p.segments.forEach((s, i) => {
      const n = counts[k++];
      const a = plan.segments[j], b = plan.segments[j + n - 1];
      j += n;
      if (a && b) {
        first ??= a;
        last = b;
        if (a.kind === "vowel")
          syllables.push({ t0: a.t0, t1: b.t1, stress: s.stress ?? 0, word });
      }
      if (s.wordEnd || i === p.segments.length - 1)
        word++;
    });
    if (!first || !last)
      return;
    const lastInUtterance = pi === phrases.length - 1;
    const kind = p.intonation === "question" ? WH_WORDS.has(p.words[0] ?? "") ? "wh-question" : "question" : p.pause < 0.3 && !lastInUtterance ? "continuation" : "statement";
    out.push({ syllables, words: [firstWord, word], t0: first.t0, t1: last.t1, kind });
  });
  return out;
}
function wobble(word, n) {
  let h = 2166136261 ^ n;
  for (let i = 0;i < word.length; i++)
    h = Math.imul(h ^ word.charCodeAt(i), 16777619);
  return (h >>> 0) % 2001 / 1000 - 1;
}
function hold(t0, t1, f0) {
  const r = Math.max(0.02, Math.min(0.06, 0.5 * (t1 - t0)));
  return { t0, t1, rampIn: r, rampOut: r, strength: 1, targets: { f0 }, label: "pitch" };
}
function naturalPitch(phrases, plan, counts, o) {
  const mood = MOODS[o.mood ?? "neutral"];
  const emphasized = new Set(o.emphasis ?? []);
  const words = phrases.flatMap((p) => p.words);
  const pitch = [];
  layout(phrases, plan, counts).forEach((ph, pi) => {
    const syl = ph.syllables;
    if (!syl.length)
      return;
    const dur = Math.max(0.05, ph.t1 - ph.t0);
    const start = Math.max(P.resetFloor, P.resetFirst - P.resetStep * pi);
    const decl = Math.min(P.declMax, P.declPerSec * dur);
    const baseline = (t) => start - decl * ((t - ph.t0) / dur);
    const accentOf = new Map;
    for (let w = ph.words[0];w < ph.words[1]; w++) {
      if (FUNCTION_WORDS.has(words[w]) && !emphasized.has(w))
        continue;
      const own = syl.map((s, i) => ({ s, i })).filter((x) => x.s.word === w);
      const main = own.find((x) => x.s.stress === 1) ?? (emphasized.has(w) ? own[0] : undefined);
      if (main)
        accentOf.set(w, main.i);
    }
    if (!accentOf.size) {
      const i = syl.findLastIndex((s) => s.stress === 1);
      accentOf.set(syl[i < 0 ? syl.length - 1 : i].word, i < 0 ? syl.length - 1 : i);
    }
    const accents = [...accentOf.values()].sort((a, b) => a - b);
    const focus = accents.findLast((i) => emphasized.has(syl[i].word));
    const nucleus = focus ?? accents[accents.length - 1];
    const height = new Array(syl.length).fill(0);
    let size = P.accent, n = 0;
    for (const i of accents) {
      const isFocus = emphasized.has(syl[i].word);
      let a = isFocus ? P.emphasis : i === nucleus ? Math.max(size, P.accent * 0.8) : size * (n % 2 ? P.weakAccent : 1);
      if (focus !== undefined && i !== focus)
        a *= i > focus ? P.postFocus : P.preFocus;
      height[i] = a;
      if (i > 0 && height[i - 1] === 0)
        height[i - 1] = P.preDip;
      size *= P.downstep;
      n++;
    }
    syl.forEach((s, i) => {
      if (height[i] === 0 && s.stress === 2)
        height[i] = P.secondary;
      height[i] += P.jitter * wobble(words[s.word] ?? "", i);
    });
    const tail = syl.length - 1 - nucleus;
    const moving = new Map;
    const end = { statement: P.low, "wh-question": P.low, continuation: P.continuationRise, question: P.questionHigh }[ph.kind];
    const absolute = new Map;
    if (ph.kind === "question") {
      if (tail === 0)
        moving.set(nucleus, [[0, P.questionLow], [0.45, end]]);
      else {
        absolute.set(nucleus, P.questionLow);
        for (let i = nucleus + 1;i < syl.length; i++)
          absolute.set(i, P.questionLow + (end - P.questionLow) * ((i - nucleus) / tail) ** 0.8);
      }
    } else if (ph.kind === "continuation") {
      if (tail === 0)
        moving.set(nucleus, [[0, baseline(syl[nucleus].t0) + height[nucleus] * mood.range], [0.55, baseline(ph.t1) + end * mood.range]]);
      else {
        for (let i = nucleus + 1;i < syl.length - 1; i++)
          height[i] = -0.8;
        absolute.set(syl.length - 1, baseline(ph.t1) + end * mood.range);
      }
    } else {
      const peak = baseline(syl[nucleus].t0) + height[nucleus] * mood.range;
      if (tail === 0)
        moving.set(nucleus, [[0, peak], [0.5, end]]);
      else
        for (let i = nucleus + 1;i < syl.length; i++)
          absolute.set(i, peak + (end - peak) * ((i - nucleus) / tail) ** 0.6);
    }
    syl.forEach((s, i) => {
      const until = i < syl.length - 1 ? Math.max(s.t1, syl[i + 1].t0 - 0.03) : s.t1;
      const steps = moving.get(i);
      if (steps && s.t1 - s.t0 > 0.08) {
        steps.forEach(([at, st], k) => {
          const a = s.t0 + at * (s.t1 - s.t0), b = k < steps.length - 1 ? s.t0 + (steps[k + 1][0] - 0.2) * (s.t1 - s.t0) : until;
          pitch.push(hold(a, Math.max(a + 0.02, b), hz(o.base, mood.shift + st)));
        });
        return;
      }
      const st = steps ? steps[steps.length - 1][1] : absolute.get(i) ?? baseline(s.t0) + height[i] * mood.range;
      pitch.push(hold(s.t0, until, hz(o.base, mood.shift + st)));
    });
  });
  return [...plan.gestures.filter((g) => g.label !== "pitch"), ...pitch];
}

// src/trained.ts
var ENDS = ["comma", "final", "question"];
function featurize(utt) {
  const out = [];
  let prev = 0;
  utt.forEach((ph, pi) => {
    const nSyl = ph.words.reduce((n, w) => n + w[1].length, 0);
    const wh = WH_WORDS.has(ph.words[0]?.[0] ?? "") ? 1 : 0;
    let nuclear = -1, k = 0;
    for (const [text, stresses] of ph.words)
      for (const st of stresses) {
        if (st === 1 && !FUNCTION_WORDS.has(text))
          nuclear = k;
        k++;
      }
    k = 0;
    ph.words.forEach(([text, stresses], wi) => {
      const fn = FUNCTION_WORDS.has(text) ? 1 : 0, n = stresses.length;
      stresses.forEach((st, si) => {
        out.push({
          cat: [text, fn ? 0 : st, n === 1 ? 0 : si === 0 ? 1 : si === n - 1 ? 3 : 2, ENDS.indexOf(ph.end), prev, fn, wh],
          num: [
            Math.min(k, 30) / 10,
            Math.min(nSyl - 1 - k, 30) / 10,
            Math.min(nSyl, 40) / 20,
            Math.min(pi, 5) / 5,
            Math.min(ph.words.length - 1 - wi, 20) / 10,
            k === nSyl - 1 ? 1 : 0,
            k === nuclear ? 1 : 0,
            nuclear >= 0 && k > nuclear ? 1 : 0
          ]
        });
        k++;
      });
    });
    prev = 1 + ENDS.indexOf(ph.end);
  });
  return out;
}
var sigmoid = (x) => 1 / (1 + Math.exp(-x));
function affine(W, b, x, rows) {
  const cols = x.length, y = new Float32Array(rows);
  for (let r = 0, at = 0;r < rows; r++) {
    let sum = b ? b[r] : 0;
    for (let c = 0;c < cols; c++)
      sum += W[at++] * x[c];
    y[r] = sum;
  }
  return y;
}

class PitchModel {
  meta;
  scale;
  t = new Map;
  vocab = new Map;
  dims = [];
  constructor(meta, weights) {
    this.meta = meta;
    for (const { name, shape, offset } of meta.tensors)
      this.t.set(name, weights.subarray(offset, offset + shape.reduce((a, b) => a * b, 1)));
    meta.words.forEach((w, i) => this.vocab.set(w, i));
    for (let i = 0;this.t.has(`embeddings.${i}.weight`); i++)
      this.dims.push(meta.tensors.find((t) => t.name === `embeddings.${i}.weight`).shape[1]);
    this.scale = meta.scale;
  }
  static from(meta, bin) {
    if (meta.format !== 1)
      throw new Error(`pitch model format ${meta.format} is not one this app reads`);
    const model = new PitchModel(meta, new Float32Array(bin));
    const got = model.raw(meta.check.phrases);
    const worst = Math.max(...got.flatMap((row, i) => row.map((v, j) => Math.abs(v - meta.check.y[i][j]))));
    if (!(worst < 0.001) || got.length !== meta.check.y.length)
      throw new Error(`pitch model fails its own check (off by ${worst})`);
    return model;
  }
  static async load(url) {
    try {
      const [meta, bin] = await Promise.all([fetch(url), fetch(url.replace(/\.json$/, ".bin"))]);
      if (!meta.ok || !bin.ok || !(meta.headers.get("content-type") ?? "").includes("json"))
        return null;
      return PitchModel.from(await meta.json(), await bin.arrayBuffer());
    } catch (e) {
      console.warn("trained pitch model not used:", e);
      return null;
    }
  }
  get(name) {
    const a = this.t.get(name);
    if (!a)
      throw new Error(`pitch model has no ${name}`);
    return a;
  }
  gru(xs, suffix, reverse) {
    const H = this.meta.hidden;
    const Wi = this.get(`gru.weight_ih_l0${suffix}`), Wh = this.get(`gru.weight_hh_l0${suffix}`), bi = this.get(`gru.bias_ih_l0${suffix}`), bh = this.get(`gru.bias_hh_l0${suffix}`);
    const out = new Array(xs.length);
    let h = new Float32Array(H);
    for (let s = 0;s < xs.length; s++) {
      const i = reverse ? xs.length - 1 - s : s;
      const a = affine(Wi, bi, xs[i], 3 * H), b = affine(Wh, bh, h, 3 * H), next = new Float32Array(H);
      for (let j = 0;j < H; j++) {
        const r = sigmoid(a[j] + b[j]), z = sigmoid(a[H + j] + b[H + j]), n = Math.tanh(a[2 * H + j] + r * b[2 * H + j]);
        next[j] = (1 - z) * n + z * h[j];
      }
      out[i] = h = next;
    }
    return out;
  }
  raw(utt) {
    const H = this.meta.hidden, width = this.dims.reduce((a, b) => a + b, 0);
    const xs = featurize(utt).map((f) => {
      const x = new Float32Array(width + f.num.length);
      let at = 0;
      this.dims.forEach((dim, i) => {
        const row = i === 0 ? this.vocab.get(f.cat[0]) ?? 0 : f.cat[i];
        x.set(this.get(`embeddings.${i}.weight`).subarray(row * dim, (row + 1) * dim), at);
        at += dim;
      });
      x.set(f.num, at);
      return affine(this.get("inp.weight"), this.get("inp.bias"), x, H).map(Math.tanh);
    });
    const fwd = this.gru(xs, "", false), bwd = this.gru(xs, "_reverse", true);
    return xs.map((_, i) => {
      const h = new Float32Array(2 * H);
      h.set(fwd[i]), h.set(bwd[i], H);
      const y = affine(this.get("out.weight"), this.get("out.bias"), h, 2);
      return [y[0], y[1]];
    });
  }
  predict(utt) {
    return this.raw(utt).map(([a, b]) => [a * this.scale, b * this.scale]);
  }
}
function utteranceOf(spans, words) {
  return spans.map((ph) => ({
    words: words.slice(ph.words[0], ph.words[1]).map((text, i) => [text, ph.syllables.filter((s) => s.word === ph.words[0] + i).map((s) => s.stress)]),
    end: ph.kind === "question" || ph.kind === "wh-question" ? "question" : ph.kind === "continuation" ? "comma" : "final"
  }));
}
var LIMIT = [-9, 12];
function trainedPitch(phrases, plan, counts, model, o) {
  const mood = MOODS[o.mood ?? "neutral"];
  const emphasized = new Set(o.emphasis ?? []);
  const spans = layout(phrases, plan, counts).filter((ph) => ph.syllables.length);
  const syl = spans.flatMap((ph) => ph.syllables);
  const y = model.predict(utteranceOf(spans, phrases.flatMap((p) => p.words)));
  const lift = new Array(syl.length).fill(0);
  for (const w of emphasized) {
    const own = syl.map((s, i) => ({ s, i })).filter((x) => x.s.word === w);
    const main = own.find((x) => x.s.stress === 1) ?? own[0];
    if (main)
      lift[main.i] = P.emphasis * 0.6;
  }
  const pitch = [];
  let i = 0;
  for (const ph of spans) {
    ph.syllables.forEach((s, k) => {
      const next = ph.syllables[k + 1];
      const until = next ? Math.max(s.t1, next.t0 - 0.03) : s.t1;
      const at = (st) => hz(o.base, mood.shift + Math.max(LIMIT[0], Math.min(LIMIT[1], st * mood.range + lift[i])));
      const [early, late] = y[i];
      if (s.t1 - s.t0 > 0.08) {
        const mid = (s.t0 + s.t1) / 2;
        pitch.push(hold(s.t0, mid, at(early)), hold(mid, until, at(late)));
      } else
        pitch.push(hold(s.t0, until, at((early + late) / 2)));
      i++;
    });
  }
  return [...plan.gestures.filter((g) => g.label !== "pitch"), ...pitch];
}

// src/plan.ts
function planSpeech(api, phrases, o) {
  if (!o.natural)
    return api.planPhrases(phrases, { body: o.body, t0: 0, rate: o.rate, f0: o.f0 });
  const mood = MOODS[o.mood ?? "neutral"];
  const plan = api.planPhrases(phrases, { body: o.body, t0: 0, rate: o.rate * mood.rate, f0: o.f0 });
  const counts = api.plannedCounts(phrases.flatMap((p) => p.segments.map((s) => s.ipa)));
  const said = phrases.reduce((n, p) => n + p.words.length, 0);
  const emphasis = o.emphasis && (o.wordCount ?? said) === said ? o.emphasis : [];
  const pitch = { base: o.f0, emphasis, mood: o.mood };
  return { ...plan, gestures: o.model ? trainedPitch(phrases, plan, counts, o.model, pitch) : naturalPitch(phrases, plan, counts, pitch) };
}

// src/sentences.ts
var NOT_AN_END = /(?:\b(?:Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e|approx|No)|\b[A-Z])\.$/;
var MIN_CHARS = 24;

class SentenceStream {
  buf = "";
  push(delta) {
    this.buf += delta;
    const out = [];
    let from = 0;
    const re = /[.!?]+["')\]]*(?=\s)|\n+/g;
    let m;
    while (m = re.exec(this.buf)) {
      const end = m.index + m[0].length;
      const piece = this.buf.slice(from, end);
      const newline = m[0].startsWith(`
`);
      if (!newline && (NOT_AN_END.test(piece) || piece.trim().length < MIN_CHARS))
        continue;
      if (piece.trim())
        out.push(piece.trim());
      from = end;
    }
    this.buf = this.buf.slice(from);
    return out;
  }
  flush() {
    const rest = this.buf.trim();
    this.buf = "";
    return rest ? [rest] : [];
  }
}

// src/reply.ts
var FENCE = /^\s{0,3}(`{3,}|~{3,})/;
var RULE = /^\s{0,3}(?:([-*_])(?:\s*\1){2,}|=+)\s*$/;
var DEFINITION = /^\s{0,3}\[[^\]]+\]:\s/;
var TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$|^\s*\|\s*:?-+:?\s*\|\s*$/;
var TASK_BOX = /^((?:[-*+]|\d+[.)])\s+)\[[ xX]\]\s+/;
var HTML_TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>\n]*)?\/?>/gi;
function sayableLines(markdown) {
  const lines = markdown.replace(/\r\n?/g, `
`).split(`
`);
  const out = [];
  let fence = null;
  let table = false;
  lines.forEach((line, i) => {
    const f = line.match(FENCE)?.[1];
    if (fence) {
      if (f && f[0] === fence[0] && f.length >= fence.length && line.trim() === f)
        fence = null;
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
    table = line.includes("|") && (table || TABLE_DELIMITER.test(lines[i + 1] ?? "") || /^\s*\|.*\|\s*$/.test(line));
    if (table) {
      out.push(line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim()).filter(Boolean).join(", "));
      return;
    }
    if (RULE.test(line) || DEFINITION.test(line)) {
      out.push("");
      return;
    }
    out.push(line.trim().replace(TASK_BOX, "$1").replace(/\[\^[^\]]+\]/g, "").replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1").replace(HTML_TAG, " "));
  });
  return out;
}
function replySentences(markdown) {
  const stream = new SentenceStream;
  return [...stream.push(sayableLines(markdown).join(`
`)), ...stream.flush()];
}

// src/settings.ts
var DEFAULT_PROMPT = "You are a voice assistant. Everything you write is spoken aloud by a quirky, robotic physical-model voice synthesizer that is hard to understand, so: " + "reply in one to three short sentences unless asked for more. Use plain, common words. " + "Never use markdown, lists, emoji, symbols or abbreviations, and write numbers the way they are said. " + "Be warm, direct and a little funny.";
var DEFAULTS = {
  backend: "openrouter",
  connections: {},
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "nousresearch/hermes-4-70b",
  zdr: true,
  reasoning: "off",
  systemPrompt: DEFAULT_PROMPT,
  body: "male",
  rate: 1,
  pitch: 1,
  handsFree: true,
  naturalPitch: true,
  trainedPitch: true,
  bargeIn: true,
  showHead: true
};

// tools/speak.ts
var FS = 48000;
var LEAD = 0.03;
var MAX_GESTURES = 4000;
function pcm16(samples) {
  const buf = Buffer.alloc(2 * samples.length);
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, v))), 2 * i));
  return buf;
}
function wav(samples) {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0), head.writeUInt32LE(36 + 2 * samples.length, 4), head.write("WAVEfmt ", 8), head.writeUInt32LE(16, 16), head.writeUInt16LE(1, 20), head.writeUInt16LE(1, 22);
  head.writeUInt32LE(FS, 24), head.writeUInt32LE(2 * FS, 28), head.writeUInt16LE(2, 32), head.writeUInt16LE(16, 34), head.write("data", 36), head.writeUInt32LE(2 * samples.length, 40);
  return Buffer.concat([head, pcm16(samples)]);
}
async function load() {
  const asset = (name) => readFileSync(new URL(name, import.meta.url));
  await initChimera(asset("chimera.wasm"));
  const engine = await Promise.resolve().then(() => (init_engine(), exports_engine));
  const g2p = new engine.EnglishG2P;
  const dictionary = withLexicon(gunzipSync(asset("cmudict.txt.gz")).toString()), known = wordsIn(dictionary);
  g2p.setDictionaryText(dictionary);
  setKnownWords((w) => known.has(w));
  const settings = DEFAULTS;
  const model = settings.trainedPitch ? PitchModel.from(JSON.parse(asset("prosody.json").toString()), new Uint8Array(asset("prosody.bin")).buffer) : null;
  const body = PRESETS[settings.body], f0 = defaultF0(body) * settings.pitch;
  return (text) => {
    const plans = [];
    let mood = "neutral";
    for (const sentence of replySentences(text)) {
      const s = toSayable(sentence);
      mood = s.mood ?? mood;
      const phrases = g2p.toPhrases(s.text);
      if (phrases.length)
        plans.push(planSpeech(engine, phrases, { body, rate: settings.rate, f0, natural: settings.naturalPitch, model, emphasis: s.emphasis, wordCount: wordsOf(s.text).length, mood }));
    }
    const x = new WebAssembly.Instance(chimeraModule(), {}).exports;
    const h = x.engine_new(FS);
    x.engine_set_body(h, body.female, body.child);
    new Float64Array(x.memory.buffer, x.engine_values(h), 32).fill(NaN)[0] = f0;
    x.engine_set_source(h);
    x.engine_set_gate(h, 1);
    const lengths = plans.map((p) => Math.ceil((p.end + LEAD) * FS));
    const audio = new Float32Array(lengths.reduce((a, b) => a + b, 0) || Math.round(0.25 * FS));
    let at = 0;
    plans.forEach((plan, i) => {
      x.engine_schedule(h, writeGestures(x.memory.buffer, x.engine_records(h), plan.gestures, MAX_GESTURES), LEAD, 1);
      for (let m = 0, end = at + lengths[i];at < end; at += m) {
        m = Math.min(128, end - at);
        audio.set(new Float32Array(x.memory.buffer, x.engine_render(h, m), m), at);
      }
    });
    return audio;
  };
}
var oneLine = (e) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim();
async function serve() {
  const say = await load();
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!line.trim())
      continue;
    let id = "";
    let answer;
    try {
      const req = JSON.parse(line);
      if (typeof req?.id === "string")
        id = req.id;
      if (typeof req?.id !== "string" || typeof req.text !== "string")
        throw new Error('a request is {"id": "<string>", "text": "<string>"}');
      answer = { id, rate: FS, pcm: pcm16(say(req.text)).toString("base64") };
    } catch (e) {
      console.error(`speak: ${id ? `${id}: ` : ""}${oneLine(e)}`);
      answer = { id, error: oneLine(e) };
    }
    process.stdout.write(JSON.stringify(answer) + `
`);
  }
}
var args = process.argv.slice(2);
try {
  if (args.length === 1 && args[0] === "--serve")
    await serve();
  else {
    if (args.length !== 2)
      throw new Error("usage: node speak.mjs <text file> <out.wav> | node speak.mjs --serve");
    const [textPath, outPath] = args;
    const text = readFileSync(textPath, "utf8");
    writeFileSync(outPath, wav((await load())(text)));
  }
} catch (e) {
  console.error(`speak: ${oneLine(e)}`);
  process.exit(1);
}
