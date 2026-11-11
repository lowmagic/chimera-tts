import numpy as np
import pytest

from prosody.align import ctc_align, nuclei


def log_probs(frames: list[int], vocab: int = 5) -> np.ndarray:
    """A CTC output that is nearly sure of one token per frame."""
    p = np.full((len(frames), vocab), 0.01)
    p[np.arange(len(frames)), frames] = 1.0
    return np.log(p / p.sum(axis=1, keepdims=True))


def test_tokens_land_on_their_frames():
    #          0  1  2  3  4  5  6  7  8  9
    frames = [0, 0, 1, 1, 0, 2, 0, 0, 3, 3]
    assert ctc_align(log_probs(frames), [1, 2, 3]) == [(2, 4), (5, 6), (8, 10)]


def test_a_doubled_letter_is_two_tokens():
    frames = [1, 1, 0, 1, 0, 2]
    assert ctc_align(log_probs(frames), [1, 1, 2]) == [(0, 2), (3, 4), (5, 6)]


def test_too_few_frames_is_an_error():
    with pytest.raises(ValueError):
        ctc_align(log_probs([1, 2]), [1, 2, 3])


def letters(n: int, each: float = 0.1) -> list[tuple[float, float]]:
    return [(i * each, i * each + 0.02) for i in range(n)]


def test_vowels_are_timed_from_their_letters():
    # b-a-n-a-n-a: each vowel runs from its letter to the next consonant's
    spans = nuclei("banana", "B AH0 N AE1 N AH0".split(), letters(6))
    assert [round(a, 2) for a, _ in spans] == [0.1, 0.3, 0.5]
    assert [round(b, 2) for _, b in spans[:2]] == [0.2, 0.4]


def test_a_silent_e_is_not_a_vowel():
    spans = nuclei("make", "M EY1 K".split(), letters(4))
    assert len(spans) == 1 and round(spans[0][0], 2) == 0.1 and round(spans[0][1], 2) == 0.2


def test_awkward_spellings_share_the_word_out_by_sound():
    spans = nuclei("idea", "AY0 D IY1 AH0".split(), letters(4))
    assert len(spans) == 3
    assert all(b > a for a, b in spans) and spans[0][0] == 0.0 and spans[-1][1] <= 0.33
