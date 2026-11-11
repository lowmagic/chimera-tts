"""Where each syllable falls in a recording.

`ctc_align` is forced alignment of a known character sequence to a CTC model's output (the
standard Viterbi trellis). `Wav2Vec2Aligner` runs it with wav2vec 2.0 to time every letter of a
transcript, and `nuclei` turns a word's letter times into its vowels' times.
"""
from __future__ import annotations

import re

import numpy as np

from .text import is_vowel


def ctc_align(log_probs: np.ndarray, tokens: list[int], blank: int = 0) -> list[tuple[int, int]]:
    """Frames [start, end) of each token: the most likely path of `tokens` (with optional blanks
    between them) through `log_probs` (frames × vocabulary)."""
    T, L = log_probs.shape[0], len(tokens)
    if L == 0:
        return []
    if T < L:
        raise ValueError(f"{T} frames can't hold {L} tokens")
    # trellis[t, j]: best score with tokens[:j] emitted by frame t
    trellis = np.full((T + 1, L + 1), -np.inf)
    trellis[0, 0] = 0.0
    trellis[1:, 0] = np.cumsum(log_probs[:, blank])
    for t in range(T):
        stay = trellis[t, 1:] + log_probs[t, blank]
        # a token may also be repeated (CTC collapses repeats), which is "stay" on its own frame
        hold = trellis[t, 1:] + log_probs[t, tokens]
        move = trellis[t, :-1] + log_probs[t, tokens]
        trellis[t + 1, 1:] = np.maximum(np.maximum(stay, hold), move)
    # backtrack: the frames on which each token was emitted
    spans: list[list[int]] = [[] for _ in range(L)]
    j = L
    for t in range(T - 1, -1, -1):
        if j == 0:
            break
        move = trellis[t, j - 1] + log_probs[t, tokens[j - 1]]
        hold = trellis[t, j] + log_probs[t, tokens[j - 1]]
        stay = trellis[t, j] + log_probs[t, blank]
        best = max(move, hold, stay)
        if best == stay and stay > -np.inf:
            continue
        spans[j - 1].append(t)
        if best == move and move >= hold:
            j -= 1
    if j != 0 or any(not s for s in spans):
        raise ValueError("alignment failed")
    return [(min(s), max(s) + 1) for s in spans]


class Wav2Vec2Aligner:
    """Letter times from wav2vec 2.0 (facebook/wav2vec2-base-960h: letters, 20 ms frames)."""

    def __init__(self, device: str = "cuda", name: str = "facebook/wav2vec2-base-960h"):
        import torch
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

        self.torch = torch
        self.device = device
        self.processor = Wav2Vec2Processor.from_pretrained(name)
        self.model = Wav2Vec2ForCTC.from_pretrained(name).to(device).eval()
        self.vocab = self.processor.tokenizer.get_vocab()
        self.blank = self.vocab[self.processor.tokenizer.pad_token]
        self.sep = self.vocab["|"]

    def align(self, wave16k: np.ndarray, words: list[str]) -> list[list[tuple[float, float]]]:
        """Per word, the (start, end) seconds of each of its letters. Raises if it can't."""
        torch = self.torch
        tokens: list[int] = []
        owner: list[tuple[int, int] | None] = []  # (word, letter) of each token; None for a separator
        for wi, w in enumerate(words):
            if wi:
                tokens.append(self.sep)
                owner.append(None)
            for li, ch in enumerate(w.upper()):
                if ch not in self.vocab:
                    raise ValueError(f"no token for {ch!r}")
                tokens.append(self.vocab[ch])
                owner.append((wi, li))
        with torch.inference_mode():
            x = self.processor(wave16k, sampling_rate=16000, return_tensors="pt").input_values.to(self.device)
            log_probs = torch.log_softmax(self.model(x).logits[0], dim=-1).cpu().numpy()
        frame = len(wave16k) / 16000 / log_probs.shape[0]
        out: list[list[tuple[float, float]]] = [[(0.0, 0.0)] * len(w) for w in words]
        for (a, b), who in zip(ctc_align(log_probs, tokens, self.blank), owner):
            if who:
                out[who[0]][who[1]] = (a * frame, b * frame)
        return out


# rough relative lengths, for sharing a word's time among its sounds when its letters don't help
_VOWEL_LEN, _CONSONANT_LEN = 1.6, 1.0


def nuclei(word: str, phones: list[str], letters: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """The (start, end) of each vowel of `word`, given its letters' times.

    CTC marks where a letter is recognised, not how long it lasts, so a vowel's time is taken
    from its letters' starts: from its first vowel letter to the start of the next consonant
    letter. That works when the spelling has one group of vowel letters per vowel sound
    ("to-mor-row"); otherwise ("people", "idea") the word's time is shared out by sound.
    """
    n = sum(is_vowel(p) for p in phones)
    t0, t1 = letters[0][0], max(letters[-1][1], letters[0][0] + 0.02)
    spelled = word.lower()
    groups = [(m.start(), m.end()) for m in re.finditer(r"[aeiouy]+", spelled)]
    # a final silent e ("make", "people") is not a vowel sound of its own
    if len(groups) > n and spelled.endswith("e") and groups[-1] == (len(spelled) - 1, len(spelled)):
        groups.pop()
    if len(groups) == n and len(letters) == len(spelled):
        out = []
        for a, b in groups:
            start = letters[a][0]
            end = letters[b][0] if b < len(letters) else t1
            out.append((start, max(end, start + 0.03)))
        return out
    lens = [_VOWEL_LEN if is_vowel(p) else _CONSONANT_LEN for p in phones]
    total, at, out = sum(lens), 0.0, []
    for p, ln in zip(phones, lens):
        if is_vowel(p):
            out.append((t0 + (t1 - t0) * at / total, t0 + (t1 - t0) * (at + ln) / total))
        at += ln
    return out


# ---- alignments made elsewhere: Montreal Forced Aligner TextGrids

_INTERVAL = re.compile(r'xmin\s*=\s*([\d.eE+-]+)\s*xmax\s*=\s*([\d.eE+-]+)\s*text\s*=\s*"((?:[^"]|"")*)"')
_SHORT = re.compile(r'^([\d.eE+-]+)\s*\n([\d.eE+-]+)\s*\n"((?:[^"]|"")*)"\s*$', re.M)


def textgrid_tier(text: str, name: str = "phones") -> list[tuple[float, float, str]]:
    """The (start, end, label) intervals of one tier of a Praat TextGrid, long or short format."""
    long = re.split(r"\n\s*item\s*\[\d+\]\s*:", text)
    if len(long) > 1:
        for block in long[1:]:
            m = re.search(r'name\s*=\s*"([^"]*)"', block)
            if m and m.group(1) == name:
                return [(float(a), float(b), t) for a, b, t in _INTERVAL.findall(block)]
        raise ValueError(f"no tier named {name!r}")
    # short format: "IntervalTier", the name, the tier's span and size, then start/end/label triples
    parts = re.split(r'"IntervalTier"\s*\n', text)
    for block in parts[1:]:
        if block.startswith(f'"{name}"'):
            return [(float(a), float(b), t) for a, b, t in _SHORT.findall(block)]
    raise ValueError(f"no tier named {name!r}")


def textgrid_nuclei(text: str, tier: str = "phones") -> list[tuple[float, float]]:
    """Each vowel's (start, end) from a TextGrid's phone tier (ARPAbet labels, as MFA's
    english_us_arpa models and the LibriSpeech lexicon give: "AH0", "IY1")."""
    return [(a, b) for a, b, label in textgrid_tier(text, tier) if is_vowel(label.strip().upper())]
