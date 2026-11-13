"""Recordings → the training set: each utterance's words and each syllable's measured pitch.

    python -m prosody.prep --ljspeech /data/LJSpeech-1.1 --out data/ljspeech.jsonl

The corpus is a folder in LJSpeech's layout: `metadata.csv` ("id|text|normalised text" per line)
and `wavs/<id>.wav`. Any single-speaker corpus laid out that way works.

Syllable times come from, in order of preference:
- `--textgrids DIR`: Montreal Forced Aligner TextGrids (`<id>.TextGrid` anywhere under DIR, with
  an ARPAbet "phones" tier). Real phoneme alignments: the best labels you can give it.
- `--alignments file.json` ({id: [[start, end] per syllable]}), which is how the practice corpus
  rendered by Chimera supplies them.
- otherwise wav2vec 2.0 forced alignment (downloaded from Hugging Face on first use, about
  360 MB), which times letters and guesses the vowels from them: rougher.

A corpus with several speakers has a `speakers.json` ({id: speaker}) beside metadata.csv. Pitch
is learned relative to each speaker's own usual pitch, so the speaker must be known.

With `--textgrids` and `--timing file.json` (Chimera's own length for every syllable of every
utterance, written by `bun tools/timing.ts`), each syllable's real length is recorded against
Chimera's, and the model can learn timing too.

One line of JSON is written per utterance kept ("dur" only with --timing: the log of real length
over Chimera's per syllable, null where it couldn't be measured):
  {"id", "phrases": [{"words": [[text, [stress per syllable]]...], "end"}], "y": [[early, late]
   per syllable, semitones above 1 Hz], "ok": [voiced enough to trust, per syllable], "speaker",
   "dur": [...]}
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import numpy as np

from .align import textgrid_nuclei, textgrid_rhythm
from .f0 import pitch_track, syllable_targets
from .text import Phrase, load_cmudict, syllable_phones, to_utterance


def read_metadata(root: Path) -> list[tuple[str, str]]:
    rows = []
    for line in (root / "metadata.csv").read_text(encoding="utf-8").splitlines():
        parts = line.split("|")
        if len(parts) >= 2 and parts[0]:
            rows.append((parts[0], parts[-1]))
    return rows


def to_16k(wave: np.ndarray, rate: int) -> np.ndarray:
    if rate == 16000:
        return wave.astype(np.float32)
    from math import gcd

    from scipy.signal import resample_poly

    g = gcd(16000, rate)
    return resample_poly(wave, 16000 // g, rate // g).astype(np.float32)


def utterance_json(utt: list[Phrase]) -> list[dict]:
    return [{"words": [[w.text, w.stresses] for w in p.words], "end": p.end} for p in utt]


def relative_lengths(real: list[float], chimera: list[float] | None, n: int) -> list[float | None] | None:
    """log(real / Chimera's) per syllable, or None if either counts its syllables differently.
    A syllable too short or too long to be a real measurement is None."""
    if chimera is None or len(real) != n or len(chimera) != n:
        return None
    return [round(float(np.log(r / c)), 4) if 0.02 <= r <= 1.5 and c > 0.01 else None for r, c in zip(real, chimera)]


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ljspeech", type=Path, required=True, help="corpus folder (metadata.csv and wavs/)")
    ap.add_argument("--out", type=Path, default=Path("data/ljspeech.jsonl"))
    ap.add_argument("--textgrids", type=Path, help="folder of MFA TextGrids to take syllable times from")
    ap.add_argument("--tier", default="phones", help="the TextGrids' phone tier")
    ap.add_argument("--alignments", type=Path, help="syllable times to use instead of aligning")
    ap.add_argument("--timing", type=Path, help="Chimera's syllable lengths (bun tools/timing.ts), to learn timing against; needs --textgrids")
    ap.add_argument("--limit", type=int, help="only the first N utterances (for a quick try)")
    ap.add_argument("--device", default=None, help="cuda or cpu for the aligner (default: cuda if there is one)")
    ap.add_argument("--pitch-floor", type=float, default=70.0, help="lowest pitch to look for, Hz (a low male voice: 50)")
    ap.add_argument("--pitch-ceiling", type=float, default=500.0)
    ap.add_argument("--min-voiced", type=float, default=0.6, help="drop an utterance with fewer of its syllables voiced")
    args = ap.parse_args(argv)

    import soundfile as sf
    from tqdm import tqdm

    cmudict = load_cmudict()
    rows = read_metadata(args.ljspeech)[: args.limit]
    given = json.loads(args.alignments.read_text()) if args.alignments else None
    speakers_file = args.ljspeech / "speakers.json"
    speakers = json.loads(speakers_file.read_text()) if speakers_file.exists() else {}
    grids = {p.stem: p for p in args.textgrids.rglob("*.TextGrid")} if args.textgrids else None
    if grids is not None:
        print(f"{len(grids)} TextGrids under {args.textgrids}")
    if args.timing and grids is None:
        raise SystemExit("--timing needs --textgrids: only real phoneme alignments say how long a syllable was")
    timing = json.loads(args.timing.read_text()) if args.timing else None
    timed = 0
    aligner = None
    if given is None and grids is None:
        import torch

        from .align import Wav2Vec2Aligner, nuclei

        device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
        print(f"aligning with wav2vec 2.0 on {device}")
        aligner = Wav2Vec2Aligner(device)

    dropped: Counter[str] = Counter()
    kept = syllables = 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as out:
        for uid, text in tqdm(rows, unit="utt"):
            utt = to_utterance(text, cmudict)
            if utt is None:
                dropped["a word not in the dictionary"] += 1
                continue
            words = [w for p in utt for w in p.words]
            n = sum(len(w.stresses) for w in words)
            try:
                wave, rate = sf.read(args.ljspeech / "wavs" / f"{uid}.wav", dtype="float32", always_2d=False)
            except Exception:
                dropped["no recording"] += 1
                continue
            if wave.ndim > 1:
                wave = wave.mean(axis=1)
            dur = None
            if grids is not None:
                if uid not in grids:
                    dropped["no TextGrid"] += 1
                    continue
                try:
                    grid = grids[uid].read_text(encoding="utf-8")
                    spans = textgrid_nuclei(grid, args.tier)
                    if timing is not None:
                        dur = relative_lengths(textgrid_rhythm(grid, args.tier), timing.get(uid), n)
                except ValueError:
                    dropped["TextGrid has no phone tier"] += 1
                    continue
                if len(spans) != n:
                    dropped["syllable count differs from the TextGrid"] += 1
                    continue
            elif given is not None:
                spans = [tuple(s) for s in given.get(uid, [])]
                if len(spans) != n:
                    dropped["syllable count differs from the alignment"] += 1
                    continue
            else:
                try:
                    letters = aligner.align(to_16k(wave, rate), [w.text for w in words])
                except ValueError:
                    dropped["could not align"] += 1
                    continue
                spans = [s for w, ls in zip(words, letters) for s in nuclei(w.text, cmudict[w.text], ls)]
                assert len(spans) == sum(syllable_phones(cmudict[w.text]) for w in words)
            track = pitch_track(wave, rate, args.pitch_floor, args.pitch_ceiling)
            y, ok = syllable_targets(track, spans, 1.0)
            if sum(ok) < args.min_voiced * n:
                dropped["too little of it voiced"] += 1
                continue
            row = {"id": uid, "phrases": utterance_json(utt), "y": [[round(v, 3) for v in t] for t in y], "ok": ok, "speaker": str(speakers.get(uid, ""))}
            if dur is not None:
                row["dur"] = dur
                timed += 1
            out.write(json.dumps(row) + "\n")
            kept += 1
            syllables += n

    print(f"kept {kept} of {len(rows)} utterances ({syllables} syllables) → {args.out}")
    if timing is not None:
        print(f"  {timed} of them with syllable lengths against Chimera's (the rest: Chimera split them into a different number of syllables)")
    for why, count in dropped.most_common():
        print(f"  dropped {count}: {why}")
    if kept == 0:
        raise SystemExit("nothing kept")


if __name__ == "__main__":
    main()
