"""The clarity measurement: scoring, and the whole run with a listener that hears what it's told."""
from pathlib import Path

import numpy as np
import pytest

from clarity import score, speak
from clarity.__main__ import measure
from clarity.listen import to16k
from prosody.text import load_cmudict

CMU = load_cmudict()
SAY, WORD = score.CARRIERS


def test_a_word_is_heard_as_itself_or_a_homophone_wherever_it_lands():
    assert score.heard_as("two", SAY, "Say 2 again.", CMU) == (True, "two")
    assert score.heard_as("hundred", WORD, "The word is 100.", CMU) == (True, "hundred")
    assert score.heard_as("two", SAY, "Say too again", CMU) == (True, "two")
    assert score.heard_as("cat", WORD, "The word is, cat!", CMU) == (True, "cat")
    assert score.heard_as("don't", SAY, "Say don’t again.", CMU) == (True, "don't")


def test_a_missed_word_reports_what_stood_in_its_place():
    assert score.heard_as("cat", SAY, "Say cap again.", CMU) == (False, "cap")
    assert score.heard_as("cat", WORD, "The word is get.", CMU) == (False, "get")
    assert score.heard_as("paper", SAY, "Say pay per again.", CMU) == (False, "pay per")
    assert score.heard_as("cat", SAY, "Say again.", CMU) == (False, "")
    # the carrier misheard too: the word is still found, or not, on its own
    assert score.heard_as("cat", SAY, "They cat a gain.", CMU)[0]


def test_sounds_are_ranked_by_how_often_their_words_were_heard():
    results = {"cat": {"heard": 0, "of": 2, "as": ["cap", "cap"]}, "cap": {"heard": 2, "of": 2, "as": []}, "tack": {"heard": 1, "of": 2, "as": ["tag"]}}
    rows = score.by_sound(results, CMU, min_words=1)
    get = lambda s, where: next(r for r in rows if (r["sound"], r["where"]) == (s, where))
    assert get("T", "last") == {"sound": "T", "where": "last", "heard": 0.0, "words": 1}
    assert get("K", "first")["heard"] == 50.0 and get("K", "first")["words"] == 2
    assert get("AE", "any") == {"sound": "AE", "where": "any", "heard": 50.0, "words": 3}
    assert rows[0]["heard"] <= rows[-1]["heard"]
    assert score.confusions(results)[0] == ("cat", "cap", 2)


def test_resampling_keeps_the_length_in_seconds():
    assert len(to16k(np.zeros(48000, np.float32), 48000)) == 16000


def test_the_whole_measurement_with_a_stand_in_for_the_voice_and_the_listener(monkeypatch, tmp_path):
    said: dict[int, str] = {}

    def say_all(jobs, workers, done=lambda: None):
        for n, (id_, text) in enumerate(jobs):
            said[n] = text
            done()
            yield id_, 48000, np.full(4800, n, np.float32)  # the clip carries which job it is

    monkeypatch.setattr(speak, "say_all", say_all)
    # hears everything but "ship", which it takes for "sip"
    listen = lambda clips: [said[int(round(float(c[len(c) // 2])))].replace("ship", "sip") for c in clips]
    report = measure(["cat", "ship", "tree"], CMU, listen, batch=4, audio_dir=tmp_path / "missed")
    assert report["missed"] == ["ship"]
    assert report["heard"] == pytest.approx(66.7) and report["by_carrier"] == [pytest.approx(66.7)] * 2
    assert report["words"]["ship"]["ok"] == [False, False] and report["words"]["cat"]["ok"] == [True, True]
    assert report["words"]["ship"]["as"] == ["sip", "sip"]
    assert report["confusions"][0] == ["ship", "sip", 2]
    assert [p.name for p in (tmp_path / "missed").iterdir()] == ["ship.wav"]


@pytest.mark.skipif(not speak.SPEAK.exists(), reason="needs `bun run build`")
def test_the_real_speech_command_says_what_it_is_asked():
    out = list(speak.say_all([("a", "Say cat again."), ("b", "The word is cat."), ("c", "Say tree again.")], workers=2))
    assert sorted(i for i, _, _ in out) == ["a", "b", "c"]
    assert all(rate == 48000 and 0.5 < len(pcm) / rate < 3 and np.abs(pcm).max() > 0.01 for _, rate, pcm in out)
