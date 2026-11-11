"""DailyTalk → the layout `prosody.prep` reads.

    python -m prosody.dailytalk --src /data/DailyTalk --out /data/dailytalk-lj
    python -m prosody.prep --ljspeech /data/dailytalk-lj --textgrids /data/DailyTalk-TextGrid --out data/dailytalk.jsonl

DailyTalk (https://github.com/keonlee9420/DailyTalk, CC BY-SA 4.0) is 20 hours of two people
acting everyday dialogues. Its recordings are named <utterance>_<speaker>_d<dialogue>.wav, each
with its transcript in a .txt beside it or in a metadata.json; its authors also publish Montreal
Forced Aligner TextGrids under the same names, which is what `--textgrids` wants.

This writes metadata.csv, speakers.json and wavs/ (links to the recordings, or copies where links
aren't allowed). Not yet run against the real download: it finds recordings by that name pattern
wherever they are under --src, and says what it could not match.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from pathlib import Path

NAME = re.compile(r"^(\d+)_(\d+)_d(\d+)$")


def transcripts_from_metadata(src: Path) -> dict[str, str]:
    """{recording name: text} from a metadata.json of {dialogue: {utterance: {"text", "speaker", ...}}}."""
    out: dict[str, str] = {}
    for path in src.rglob("metadata.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for d, turns in data.items() if isinstance(data, dict) else []:
            for u, turn in turns.items() if isinstance(turns, dict) else []:
                if isinstance(turn, dict) and "text" in turn and "speaker" in turn:
                    out[f"{u}_{turn['speaker']}_d{d}"] = str(turn["text"])
    return out


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, required=True, help="the unpacked DailyTalk folder")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)

    from_metadata = transcripts_from_metadata(args.src)
    (args.out / "wavs").mkdir(parents=True, exist_ok=True)
    lines, speakers, missing = [], {}, 0
    for wav in sorted(args.src.rglob("*.wav")):
        m = NAME.match(wav.stem)
        if not m:
            continue
        txt = wav.with_suffix(".txt")
        text = txt.read_text(encoding="utf-8").strip() if txt.exists() else from_metadata.get(wav.stem, "")
        text = " ".join(text.split()).replace("|", " ")
        if not text:
            missing += 1
            continue
        dest = args.out / "wavs" / wav.name
        if not dest.exists():
            try:
                os.symlink(wav.resolve(), dest)
            except OSError:
                shutil.copyfile(wav, dest)
        lines.append(f"{wav.stem}|{text}|{text}")
        speakers[wav.stem] = m.group(2)
    if not lines:
        raise SystemExit(f"no recordings named <utterance>_<speaker>_d<dialogue>.wav with a transcript under {args.src}")
    (args.out / "metadata.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (args.out / "speakers.json").write_text(json.dumps(speakers))
    print(f"{len(lines)} recordings, speakers {sorted(set(speakers.values()))} → {args.out}" + (f" ({missing} had no transcript)" if missing else ""))


if __name__ == "__main__":
    main()
