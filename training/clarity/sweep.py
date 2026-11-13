"""usage: python -m clarity.sweep --out data/sweep [--top 600] [--only NAME ...]

Measures the same words under several voice settings, one after another, and prints a table:
which settings get more words across than the app's defaults. Whisper is loaded once. Each
setting's full report is written to <out>/<name>/clarity.json and the table to <out>/sweep.json.

"gained" and "lost" count the sayings heard with the setting but not without it, and the other
way round: with a few hundred words a difference of a point or two in the share is noise, and a
setting that helps gains clearly more than it loses.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from prosody.text import load_cmudict

from .__main__ import common_words, measure

# name → the settings (tools/speak.ts takes them per request); the first is the app as it is
SETTINGS: dict[str, dict] = {
    "defaults": {},
    "chimera-timing": {"timing": False},
    "slower-0.85": {"rate": 0.85},
    "slower-0.75": {"rate": 0.75},
    "word-ends-1.3": {"wordEnds": 1.3},
    "word-ends-1.6": {"wordEnds": 1.6},
    "plosives-1.5": {"plosives": 1.5},
    "plosives-2": {"plosives": 2.0},
    "voicing-1.5": {"voicing": 1.5},
    "voicing-2": {"voicing": 2.0},
    "plosives-2+voicing-2": {"plosives": 2.0, "voicing": 2.0},
    "slower-0.85+word-ends-1.3": {"rate": 0.85, "wordEnds": 1.3},
    # second round, after the first showed speed to be what matters: finer speeds, and speed with
    # the consonant sliders where they helped (1.5)
    "slower-0.8": {"rate": 0.8},
    "slower-0.7": {"rate": 0.7},
    "slower-0.65": {"rate": 0.65},
    "slower-0.85+consonants-1.5": {"rate": 0.85, "plosives": 1.5, "voicing": 1.5},
    "slower-0.75+consonants-1.5": {"rate": 0.75, "plosives": 1.5, "voicing": 1.5},
    "consonants-1.5": {"plosives": 1.5, "voicing": 1.5},
}


def compare(base: dict, other: dict) -> tuple[int, int]:
    """Sayings heard in `other` but not in `base`, and in `base` but not in `other`."""
    gained = lost = 0
    for w, r in base["words"].items():
        for a, b in zip(r["ok"], other["words"][w]["ok"]):
            gained += (not a) and b
            lost += a and (not b)
    return gained, lost


def table(reports: dict[str, dict]) -> list[dict]:
    base = next(iter(reports.values()))
    rows = []
    for name, r in reports.items():
        gained, lost = compare(base, r)
        rows.append({"name": name, "settings": r.get("settings", {}), "heard": r["heard"], "by_carrier": r["by_carrier"], "gained": gained, "lost": lost})
    return rows


def show(rows: list[dict], carriers: list[str]) -> str:
    head = f"{'setting':28s} heard   " + "   ".join(c.format("…") for c in carriers) + "   gained  lost"
    lines = [head]
    for r in rows:
        shares = "   ".join(f"{v:5.1f} %".ljust(len(c.format("…"))) for v, c in zip(r["by_carrier"], carriers))
        lines.append(f"{r['name']:28s} {r['heard']:5.1f} %  {shares}   {r['gained']:6d} {r['lost']:5d}")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--top", type=int, default=600)
    ap.add_argument("--only", nargs="+", choices=list(SETTINGS)[1:], help="just these settings (the defaults are always measured)")
    ap.add_argument("--whisper", default="openai/whisper-small.en")
    ap.add_argument("--device")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    a = ap.parse_args()

    from .listen import Whisper

    cmudict = load_cmudict()
    words = common_words(a.top, cmudict)
    transcribe = Whisper(a.whisper, a.device)
    names = ["defaults"] + [n for n in SETTINGS if n != "defaults" and (not a.only or n in a.only)]
    reports: dict[str, dict] = {}
    for name in names:
        print(f"{name} ({len(reports) + 1} of {len(names)}) …", flush=True)
        reports[name] = measure(words, cmudict, transcribe, a.workers, options=SETTINGS[name])
        (a.out / name).mkdir(parents=True, exist_ok=True)
        (a.out / name / "clarity.json").write_text(json.dumps(reports[name], indent=1))
        rows = table(reports)
        (a.out / "sweep.json").write_text(json.dumps(rows, indent=1))
        print(show(rows[-1:], reports[name]["carriers"]).split("\n")[1], flush=True)
    print(f"\n{len(words)} words\n" + show(table(reports), reports["defaults"]["carriers"]))


if __name__ == "__main__":
    main()
