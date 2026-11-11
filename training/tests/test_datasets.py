"""Alignments from TextGrids, several speakers, and the DailyTalk converter."""
import json

import numpy as np
import pytest
import soundfile as sf

from prosody import dailytalk, prep
from prosody import train as train_mod
from prosody.align import textgrid_nuclei, textgrid_tier

# "hello there": HH AH0 L OW1 | DH EH1 R, with a pause between
PHONES = [(0.0, 0.1, ""), (0.1, 0.15, "HH"), (0.15, 0.25, "AH0"), (0.25, 0.3, "L"), (0.3, 0.5, "OW1"), (0.5, 0.6, "sp"), (0.6, 0.65, "DH"), (0.65, 0.85, "EH1"), (0.85, 0.95, "R"), (0.95, 1.2, "")]
VOWELS = [(0.15, 0.25), (0.3, 0.5), (0.65, 0.85)]


def long_grid(phones=PHONES) -> str:
    tier = lambda name, ivs: f'    item [{1 if name == "words" else 2}]:\n        class = "IntervalTier"\n        name = "{name}"\n        xmin = 0\n        xmax = 1.2\n        intervals: size = {len(ivs)}\n' + "".join(
        f'        intervals [{i + 1}]:\n            xmin = {a}\n            xmax = {b}\n            text = "{t}"\n' for i, (a, b, t) in enumerate(ivs))
    return 'File type = "ooTextFile"\nObject class = "TextGrid"\n\nxmin = 0\nxmax = 1.2\ntiers? <exists>\nsize = 2\nitem []:\n' + tier("words", [(0.1, 0.5, "hello"), (0.6, 0.95, "there")]) + tier("phones", phones)


def short_grid() -> str:
    tier = lambda name, ivs: f'"IntervalTier"\n"{name}"\n0\n1.2\n{len(ivs)}\n' + "".join(f'{a}\n{b}\n"{t}"\n' for a, b, t in ivs)
    return 'File type = "ooTextFile"\nObject class = "TextGrid"\n\n0\n1.2\n<exists>\n2\n' + tier("words", [(0.1, 0.5, "hello"), (0.6, 0.95, "there")]) + tier("phones", PHONES)


def test_vowel_times_come_from_the_phone_tier_in_either_format():
    assert textgrid_nuclei(long_grid()) == VOWELS
    assert textgrid_nuclei(short_grid()) == VOWELS
    assert [t for _, _, t in textgrid_tier(long_grid(), "words")] == ["hello", "there"]
    with pytest.raises(ValueError):
        textgrid_tier(long_grid(), "syllables")


def buzz(hz: float, seconds: float = 1.2, rate: int = 16000) -> np.ndarray:
    t = np.arange(int(seconds * rate)) / rate
    return (0.2 * sum(np.sin(2 * np.pi * k * hz * t) / k for k in range(1, 6))).astype(np.float32)


def test_dailytalk_to_a_training_set_with_two_speakers(tmp_path):
    # two recordings named as DailyTalk names them, one voice an octave above the other
    src = tmp_path / "DailyTalk" / "data" / "0"
    src.mkdir(parents=True)
    for name, hz in [("0_1_d0", 110.0), ("1_2_d0", 220.0)]:
        sf.write(src / f"{name}.wav", buzz(hz), 16000)
        (tmp_path / "grids" / name.split("_")[1]).mkdir(parents=True, exist_ok=True)
        (tmp_path / "grids" / name.split("_")[1] / f"{name}.TextGrid").write_text(long_grid())
    (src / "0_1_d0.txt").write_text("Hello there.\n")
    (src.parent.parent / "metadata.json").write_text(json.dumps({"0": {"1": {"text": "Hello there?", "speaker": 2, "emotion": "none"}}}))

    lj = tmp_path / "lj"
    dailytalk.main(["--src", str(tmp_path / "DailyTalk"), "--out", str(lj)])
    assert (lj / "metadata.csv").read_text().splitlines() == ["0_1_d0|Hello there.|Hello there.", "1_2_d0|Hello there?|Hello there?"]
    assert json.loads((lj / "speakers.json").read_text()) == {"0_1_d0": "1", "1_2_d0": "2"}

    out = tmp_path / "set.jsonl"
    prep.main(["--ljspeech", str(lj), "--textgrids", str(tmp_path / "grids"), "--out", str(out)])
    rows = [json.loads(line) for line in out.read_text().splitlines()]
    assert [r["speaker"] for r in rows] == ["1", "2"] and all(all(r["ok"]) and len(r["y"]) == 3 for r in rows)
    # an octave apart as recorded...
    assert abs((rows[1]["y"][0][0] - rows[0]["y"][0][0]) - 12) < 0.3
    # ...and the same once each is measured from their own speaker's median
    loaded = train_mod.load(out)
    refs = train_mod.speaker_medians(loaded)
    assert set(refs) == {"set:1", "set:2"} and abs(refs["set:2"] - refs["set:1"] - 12) < 0.3
    a, b = (t[2] for t in train_mod.tensors(loaded, {"": 0}, refs))
    assert float(abs(a - b).max()) < 0.3 and float(abs(a).max()) < 0.3


def test_a_textgrid_that_disagrees_with_the_words_is_dropped(tmp_path):
    lj = tmp_path / "lj"
    (lj / "wavs").mkdir(parents=True)
    sf.write(lj / "wavs" / "a.wav", buzz(120.0), 16000)
    sf.write(lj / "wavs" / "b.wav", buzz(120.0), 16000)
    (lj / "metadata.csv").write_text("a|Hello there.|Hello there.\nb|Hello.|Hello.\n")
    (tmp_path / "grids").mkdir()
    (tmp_path / "grids" / "a.TextGrid").write_text(long_grid())
    (tmp_path / "grids" / "b.TextGrid").write_text(long_grid())  # three vowels for a two-vowel word
    out = tmp_path / "set.jsonl"
    prep.main(["--ljspeech", str(lj), "--textgrids", str(tmp_path / "grids"), "--out", str(out)])
    assert [json.loads(line)["id"] for line in out.read_text().splitlines()] == ["a"]
