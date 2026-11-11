"""Text → the syllables the pitch model sees, and their features.

The same features are computed in the browser (src/trained.ts) from Chimera's own plan, so this
file and that one must agree: `tests/fixtures/prosody-features.json`, written by
`python -m prosody.fixtures`, is checked by both sides' tests.

An utterance is a list of phrases; a phrase is its words (each a list of syllable stresses,
0 none, 1 main, 2 secondary) and how it ends: "comma" (more is coming), "final" (. or !) or
"question".
"""
from __future__ import annotations

import gzip
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_WORDS = json.loads((ROOT / "shared" / "prosody-words.json").read_text())
FUNCTION_WORDS: frozenset[str] = frozenset(_WORDS["function"])
WH_WORDS: frozenset[str] = frozenset(_WORDS["wh"])

ENDS = ("comma", "final", "question")
VOWELS = frozenset("AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW".split())

# categorical features, in this order (the sizes are the embedding tables' rows)
CATEGORICAL = (("word", None), ("stress", 3), ("syl_pos", 4), ("end", 3), ("prev", 4), ("function", 2), ("wh", 2))
N_NUMERIC = 8


@dataclass
class Word:
    text: str
    stresses: list[int]


@dataclass
class Phrase:
    words: list[Word]
    end: str = "final"


@dataclass
class Syllable:
    """One syllable's features: `cat` in CATEGORICAL's order (the word as text), then `num`."""
    cat: list
    num: list[float] = field(default_factory=list)


def load_cmudict(path: Path | None = None) -> dict[str, list[str]]:
    """Chimera's dictionary file ("word<TAB>PHONES", the first pronunciation of each word)."""
    path = path or ROOT / "vendor" / "chimera" / "public" / "data" / "cmudict.txt.gz"
    out: dict[str, list[str]] = {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            word, _, phones = line.rstrip("\n").partition("\t")
            if phones and word not in out:
                out[word] = phones.split()
    return out


def is_vowel(phone: str) -> bool:
    return phone.rstrip("012") in VOWELS


def stresses_of(phones: list[str]) -> list[int]:
    return [int(p[-1]) if p[-1] in "012" else 0 for p in phones if is_vowel(p)]


_PUNCT = ".!?;:,"


def split_phrases(text: str) -> list[tuple[list[str], str]]:
    """Words and endings, split the way Chimera's front end splits (english.rs `to_phrases`)."""
    text = text.replace("’", "'")
    out: list[tuple[list[str], str]] = []
    for part, delim in re.findall(rf"([^{re.escape(_PUNCT)}]*)([{re.escape(_PUNCT)}]+|$)", text):
        words = [w for w in re.split(r"[^a-z'-]+", part.lower()) if re.search(r"[a-z]", w)]
        if not words:
            continue
        end = "question" if "?" in delim else "final" if (not delim or re.search(r"[.!]", delim)) else "comma"
        out.append((words, end))
    return out


def to_utterance(text: str, cmudict: dict[str, list[str]]) -> list[Phrase] | None:
    """The utterance for a transcript, or None if a word isn't in the dictionary (or has no vowel)."""
    phrases: list[Phrase] = []
    for words, end in split_phrases(text):
        ws: list[Word] = []
        for w in words:
            phones = cmudict.get(w)
            if not phones or not any(is_vowel(p) for p in phones):
                return None
            ws.append(Word(w, stresses_of(phones)))
        phrases.append(Phrase(ws, end))
    # the browser can't tell a trailing comma from nothing: the last phrase always ends
    if phrases and phrases[-1].end == "comma":
        phrases[-1].end = "final"
    return phrases or None


def syllable_phones(phones: list[str]) -> int:
    return sum(is_vowel(p) for p in phones)


def featurize(utt: list[Phrase]) -> list[Syllable]:
    """Every syllable's features, in order. Mirrors `featurize` in src/trained.ts."""
    out: list[Syllable] = []
    prev = 0  # 0: the utterance starts here; else 1 + the class of the phrase before
    for pi, ph in enumerate(utt):
        n_syl = sum(len(w.stresses) for w in ph.words)
        wh = int(ph.words[0].text in WH_WORDS)
        # the last main-stressed syllable of a content word: where the phrase's pitch turns
        nuclear = -1
        k = 0
        for w in ph.words:
            for st in w.stresses:
                if st == 1 and w.text not in FUNCTION_WORDS:
                    nuclear = k
                k += 1
        k = 0
        for wi, w in enumerate(ph.words):
            function = int(w.text in FUNCTION_WORDS)
            for si, st in enumerate(w.stresses):
                n = len(w.stresses)
                syl_pos = 0 if n == 1 else 1 if si == 0 else 3 if si == n - 1 else 2
                out.append(Syllable(
                    cat=[w.text, 0 if function else st, syl_pos, ENDS.index(ph.end), prev, function, wh],
                    num=[
                        min(k, 30) / 10,
                        min(n_syl - 1 - k, 30) / 10,
                        min(n_syl, 40) / 20,
                        min(pi, 5) / 5,
                        min(len(ph.words) - 1 - wi, 20) / 10,
                        float(k == n_syl - 1),
                        float(k == nuclear),
                        float(nuclear >= 0 and k > nuclear),
                    ],
                ))
                k += 1
        prev = 1 + ENDS.index(ph.end)
    return out
