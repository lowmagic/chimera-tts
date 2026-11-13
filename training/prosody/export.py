"""A trained checkpoint → the two files the app loads.

    python -m prosody.export --checkpoint runs/ljspeech.pt

Writes public/models/prosody.json (the vocabulary, the layers' shapes, and one worked example
the browser checks itself against) and public/models/prosody.bin (the weights, float32). Commit
both and the deployed app uses them: Settings → "Trained pitch model".
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch

from .model import DUR_UNIT, PitchModel, encode
from .text import CATEGORICAL, N_NUMERIC, ROOT, Phrase, Word, featurize

# 1: pitch only (two outputs). 2: a third output, each syllable's length, and a "duration" entry.
# the example every export carries: the browser must compute the same numbers from the same words
EXAMPLE = [
    Phrase([Word("well", [1]), Word("that", [1]), Word("depends", [0, 1])], "comma"),
    Phrase([Word("do", [1]), Word("you", [1]), Word("really", [1, 0]), Word("want", [1]), Word("to", [1]), Word("know", [1])], "question"),
]


def export(model: PitchModel, words: list[str], out_dir: Path, name: str = "prosody", scale: float = 1.0, about: dict | None = None, dur_scale: float = 1.0) -> Path:
    model = model.cpu().eval()
    tensors, blobs, offset = [], [], 0
    for key, value in model.state_dict().items():
        a = value.detach().numpy().astype("<f4")
        tensors.append({"name": key, "shape": list(a.shape), "offset": offset})
        blobs.append(a.tobytes())
        offset += a.size
    utt = EXAMPLE
    cat, num = encode(featurize(utt), {w: i for i, w in enumerate(words)})
    with torch.no_grad():
        y = model(cat[None], num[None])[0]
    timed = model.config.get("n_out", 2) > 2
    meta = {
        "format": 2 if timed else 1,
        "features": {"categorical": [n for n, _ in CATEGORICAL], "numeric": N_NUMERIC},
        "hidden": model.config["hidden"],
        "words": words,
        # predictions are averages, so flatter than speech: the app multiplies them by this
        "scale": round(scale, 3),
        "about": about or {},
        "tensors": tensors,
        "check": {
            "phrases": [{"words": [[w.text, w.stresses] for w in p.words], "end": p.end} for p in utt],
            "y": [[round(float(v), 5) for v in row] for row in y],
        },
    }
    if timed:
        # the third output times `unit` is the log of how much longer than Chimera's own a syllable
        # is; like pitch, predictions are flatter than speech, and the app multiplies them by `scale`
        meta["duration"] = {"unit": DUR_UNIT, "scale": round(dur_scale, 3)}
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{name}.bin").write_bytes(b"".join(blobs))
    path = out_dir / f"{name}.json"
    path.write_text(json.dumps(meta, separators=(",", ":")))
    return path


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--checkpoint", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=ROOT / "public" / "models")
    ap.add_argument("--name", default="prosody")
    args = ap.parse_args(argv)

    ck = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    model = PitchModel(**ck["config"])
    model.load_state_dict(ck["state"])
    m = ck["metrics"]
    scale = float(np.clip(m["true_sd"] / max(m["pred_sd"], 1e-6), 1.0, 1.8))
    about = {"heldOutErrorSemitones": round(m["mae"], 3), "correlation": round(m["corr"], 3), "speakerMedianHz": round(2 ** (ck["ref"] / 12), 1)}
    d = m.get("dur")
    dur_scale = float(np.clip(d["true_sd"] / max(d["pred_sd"], 1e-6), 1.0, 1.5)) if d else 1.0
    if d:
        about |= {"lengthErrorLog": round(d["mae"], 3), "chimeraLengthErrorLog": round(d["chimera"], 3), "lengthCorrelation": round(d["corr"], 3)}
    path = export(model, ck["words"], args.out, args.name, scale, about, dur_scale)
    size = path.with_suffix(".bin").stat().st_size
    print(f"wrote {path} and {path.with_suffix('.bin').name} ({size / 1024:.0f} KB), liveliness scale {scale:.2f}" + (f", with timing (scale {dur_scale:.2f})" if d else ""))
    print('hear it: bun tools/render.ts out --model public/models/prosody.json "Well, that depends. Do you really want to know?"')


if __name__ == "__main__":
    main()
