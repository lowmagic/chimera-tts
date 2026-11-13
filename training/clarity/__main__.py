"""usage: python -m clarity --out data/clarity [--top 3000 | --words file.txt]

Says each word in two carrier sentences with the app's voice, transcribes them with Whisper and
writes, in --out:
  clarity.json   every word: how many of its sayings were heard, and what was heard instead;
                 and every sound: how often the words with it were heard
  missed.txt     the words never heard, commonest first
  missed/        their audio, to hear for yourself (unless --no-audio)
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Callable

import numpy as np

from prosody.text import FUNCTION_WORDS, is_vowel, load_cmudict

from . import score, speak
from .listen import to16k


def common_words(top: int, cmudict: dict[str, list[str]]) -> list[str]:
    """The commonest English words the voice can be asked to say alone: in the dictionary, with a
    vowel, and not function words (said in passing, they are unclear in anyone's mouth, and a
    chat model can't do without them)."""
    from wordfreq import top_n_list

    out = []
    for w in top_n_list("en", 4 * top + 500):
        if len(out) == top:
            break
        if w.isascii() and w.isalpha() and len(w) > 1 and w not in FUNCTION_WORDS and any(map(is_vowel, cmudict.get(w, []))):
            out.append(w)
    return out


def measure(words: list[str], cmudict: dict[str, list[str]], transcribe: Callable[[list[np.ndarray]], list[str]],
            workers: int = 4, batch: int = 32, audio_dir: Path | None = None, progress: Callable[[str, int], None] = lambda *_: None) -> dict:
    """The report for these words (all must be in `cmudict`)."""
    jobs = [(f"{i}:{c}", carrier.format(w)) for i, w in enumerate(words) for c, carrier in enumerate(score.CARRIERS)]
    clips: dict[str, np.ndarray] = {}
    for id_, rate, pcm in speak.say_all(jobs, workers, lambda: progress("say", len(jobs))):
        clips[id_] = to16k(pcm, rate)
    heard: dict[str, str] = {}
    ids = [j[0] for j in jobs]
    for k in range(0, len(ids), batch):
        part = ids[k:k + batch]
        for id_, text in zip(part, transcribe([clips[i] for i in part])):
            heard[id_] = text
            progress("listen", len(ids))

    results: dict[str, dict] = {}
    for i, w in enumerate(words):
        r = {"heard": 0, "of": len(score.CARRIERS), "ok": [], "as": [], "transcripts": []}
        for c, carrier in enumerate(score.CARRIERS):
            ok, what = score.heard_as(w, carrier, heard[f"{i}:{c}"], cmudict)
            r["heard"] += ok
            r["ok"].append(ok)
            r["transcripts"].append(heard[f"{i}:{c}"])
            if not ok:
                r["as"].append(what)
        results[w] = r
        if audio_dir is not None and r["heard"] == 0:
            import soundfile as sf

            audio_dir.mkdir(parents=True, exist_ok=True)
            sf.write(audio_dir / f"{w}.wav", np.concatenate([clips[f"{i}:{c}"] for c in range(len(score.CARRIERS))]), 16000)
    n = sum(r["of"] for r in results.values())
    return {
        "carriers": list(score.CARRIERS),
        "heard": round(100 * sum(r["heard"] for r in results.values()) / max(1, n), 1),
        # a carrier far below the others is itself being misheard: judge by the better one
        "by_carrier": [round(100 * sum(r["ok"][c] for r in results.values()) / max(1, len(results)), 1) for c in range(len(score.CARRIERS))],
        "missed": [w for w in words if results[w]["heard"] == 0],
        "sounds": score.by_sound(results, cmudict),
        "confusions": [list(c) for c in score.confusions(results)],
        "words": results,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--top", type=int, default=3000, help="how many of the commonest English words (needs `pip install wordfreq`)")
    ap.add_argument("--words", type=Path, help="a file of words to measure instead, one per line, commonest first")
    ap.add_argument("--whisper", default="openai/whisper-small.en", help="the Hugging Face name of a Whisper model")
    ap.add_argument("--device", help="cuda or cpu (default: cuda if there is one)")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1), help="speech commands run at once")
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--no-audio", action="store_true", help="don't keep the missed words' audio")
    a = ap.parse_args()

    cmudict = load_cmudict()
    if a.words:
        asked = [w.strip().lower() for w in a.words.read_text().split()]
        words = [w for w in dict.fromkeys(asked) if any(map(is_vowel, cmudict.get(w, [])))]
        if len(words) < len(set(asked)):
            print(f"left out {len(set(asked)) - len(words)} words the dictionary lacks")
    else:
        words = common_words(a.top, cmudict)
    print(f"{len(words)} words, {len(score.CARRIERS)} sentences each")

    from tqdm import tqdm

    from .listen import Whisper

    transcribe = Whisper(a.whisper, a.device)
    bars: dict[str, tqdm] = {}

    def progress(step: str, total: int) -> None:
        if step not in bars:
            for b in bars.values():
                b.close()
            bars[step] = tqdm(total=total, desc={"say": "speaking", "listen": "listening"}[step])
        bars[step].update()

    report = measure(words, cmudict, transcribe, a.workers, a.batch, None if a.no_audio else a.out / "missed", progress)
    for b in bars.values():
        b.close()
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "clarity.json").write_text(json.dumps(report, indent=1))
    (a.out / "missed.txt").write_text("".join(w + "\n" for w in report["missed"]))

    print(f"\nheard {report['heard']} % of the sayings; {len(report['missed'])} of {len(words)} words never heard ({a.out / 'missed.txt'})")
    for carrier, share in zip(report["carriers"], report["by_carrier"]):
        print(f"  in {carrier.format('…')!r}: {share} %")
    print("\nhardest sounds (share heard of the words that have the sound there):")
    for r in report["sounds"][:15]:
        print(f"  {r['sound']:3s} {r['where']:5s} {r['heard']:5.1f} %  of {r['words']} words")
    print("\ncommonest mishearings:")
    for said, got, n in report["confusions"][:15]:
        print(f"  {said} → {got}" + (f"  (x{n})" if n > 1 else ""))


if __name__ == "__main__":
    main()
