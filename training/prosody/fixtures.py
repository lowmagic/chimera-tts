"""Writes the files that keep the browser's copy of the features and the model honest.

    python -m prosody.fixtures

- tests/fixtures/prosody-features.json: sentences and the features this code computes for them;
  tests/unit/trained.test.ts computes them again in TypeScript.
- tests/fixtures/prosody-tiny.{json,bin}: a small model with random weights and PyTorch's answer
  for one utterance; the same test runs the browser's arithmetic against it.

Run it again, and commit the result, whenever text.py's features or the model's layers change.
"""
from __future__ import annotations

import json

import torch

from .export import export
from .model import PitchModel
from .text import ROOT, featurize, load_cmudict, to_utterance

SENTENCES = [
    "Hello there.",
    "Well, that depends. Do you really want to know?",
    "What time is it?",
    "The quick brown fox jumps over the lazy dog, and nobody noticed; remarkable.",
    "It is.",
    "I didn't say tomorrow, I said the day after, unfortunately!",
    "Is anybody absolutely certain about the refrigerator?",
]


def main() -> None:
    out = ROOT / "tests" / "fixtures"
    out.mkdir(parents=True, exist_ok=True)
    cmudict = load_cmudict()
    cases = []
    for text in SENTENCES:
        utt = to_utterance(text, cmudict)
        assert utt, text
        cases.append({
            "text": text,
            "phrases": [{"words": [[w.text, w.stresses] for w in p.words], "end": p.end} for p in utt],
            "features": [{"cat": s.cat, "num": [round(v, 6) for v in s.num]} for s in featurize(utt)],
        })
    (out / "prosody-features.json").write_text("[\n" + ",\n".join(json.dumps(c) for c in cases) + "\n]\n")

    torch.manual_seed(7)
    words = ["", "that", "you", "know", "really"]
    model = PitchModel(len(words), hidden=6, word_dim=5)
    export(model, words, out, "prosody-tiny", scale=1.25)
    print(f"wrote {out}/prosody-features.json and prosody-tiny.json/.bin")


if __name__ == "__main__":
    main()
