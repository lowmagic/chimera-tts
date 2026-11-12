"""What was heard against what was said: per word, and per sound."""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from difflib import SequenceMatcher

# Whisper writes small numbers as digits
DIGITS = dict(zip("0 1 2 3 4 5 6 7 8 9 10 11 12".split(),
                  "zero one two three four five six seven eight nine ten eleven twelve".split()))

# the word goes where the {} is: once inside a sentence and once at its end, and in neither can
# the listener guess it from the words around it
CARRIERS = ("Say {} again.", "The word is {}.")


def words(text: str) -> list[str]:
    """Lower-case words of a transcript, as the dictionary spells them."""
    text = re.sub(r"[^a-z0-9' ]+", " ", text.lower().replace("’", "'"))
    return [DIGITS.get(w, w) for w in (w.strip("'") for w in text.split()) if w]


def sounds(phones: list[str]) -> tuple[str, ...]:
    """A pronunciation without its stress marks."""
    return tuple(p.rstrip("012") for p in phones)


def same_sound(a: str, b: str, cmudict: dict[str, list[str]]) -> bool:
    """The same word, or one that is said the same ("two", "too")."""
    if a == b:
        return True
    pa, pb = cmudict.get(a), cmudict.get(b)
    return bool(pa and pb and sounds(pa) == sounds(pb))


def heard_as(word: str, carrier: str, transcript: str, cmudict: dict[str, list[str]]) -> tuple[bool, str]:
    """Whether the word was heard in the transcript of `carrier` said with it, and what stood in
    its place if not ("" when nothing did)."""
    ref = words(carrier.format(word))
    hyp = words(transcript)
    if any(same_sound(word, h, cmudict) for h in hyp):
        return True, word
    at = ref.index(word) if word in ref else words(carrier.format("zzz")).index("zzz")
    for op, i0, i1, j0, j1 in SequenceMatcher(a=ref, b=hyp, autojunk=False).get_opcodes():
        if op != "equal" and i0 <= at < i1:
            return False, " ".join(hyp[j0:j1])
    return False, ""


def by_sound(results: dict[str, dict], cmudict: dict[str, list[str]], min_words: int = 20) -> list[dict]:
    """How often words with each sound were heard, by where the sound is in the word: "first",
    "last" or "any". Worst first; sounds in fewer than `min_words` words are left out."""
    tally: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0, 0])
    for word, r in results.items():
        ph = sounds(cmudict[word])
        keys = {(p, "any") for p in ph} | {(ph[0], "first"), (ph[-1], "last")}
        for key in keys:
            tally[key][0] += r["heard"] / r["of"]
            tally[key][1] += 1
    rows = [{"sound": p, "where": where, "heard": round(100 * s / n, 1), "words": n}
            for (p, where), (s, n) in tally.items() if n >= min_words]
    return sorted(rows, key=lambda r: (r["heard"], -r["words"]))


def confusions(results: dict[str, dict], top: int = 30) -> list[tuple[str, str, int]]:
    """The commonest (said, heard) pairs."""
    c = Counter((w, a) for w, r in results.items() for a in r["as"] if a)
    return [(w, a, n) for (w, a), n in c.most_common(top)]
