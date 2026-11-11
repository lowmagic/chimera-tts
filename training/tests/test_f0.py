import numpy as np

from prosody.f0 import pitch_track, syllable_targets

RATE = 22050


def glide(f_from: float, f_to: float, seconds: float) -> np.ndarray:
    """A buzzy tone (a few harmonics) whose pitch slides from one frequency to another."""
    f = np.linspace(f_from, f_to, int(seconds * RATE))
    phase = 2 * np.pi * np.cumsum(f) / RATE
    return sum(np.sin(k * phase) / k for k in range(1, 6)) * 0.2


def test_a_glide_is_tracked_and_read_early_and_late():
    wave = np.concatenate([np.zeros(RATE // 5), glide(110, 165, 0.6), np.zeros(RATE // 5)])
    track = pitch_track(wave, RATE)
    assert track[10] == 0  # the silence before it
    mid = track[int(0.5 / 0.005)]
    assert 130 < mid < 145
    (y,), (ok,) = syllable_targets(track, [(0.25, 0.75)], ref=110.0)
    assert ok
    early, late = y
    assert 0.5 < early < 3.5 and 3.5 < late < 7 and late - early > 2  # the whole glide is 7 semitones


def test_silence_and_noise_are_not_trusted():
    rng = np.random.default_rng(0)
    wave = np.concatenate([np.zeros(RATE // 2), rng.normal(0, 0.05, RATE // 2), glide(120, 120, 0.5)])
    track = pitch_track(wave, RATE)
    y, ok = syllable_targets(track, [(0.1, 0.4), (0.6, 0.9), (1.1, 1.4)], ref=120.0)
    assert ok == [False, False, True]
    assert abs(y[2][0]) < 0.3 and abs(y[2][1]) < 0.3


def test_an_octave_error_is_dropped():
    track = np.full(200, 120.0)
    track[100:110] = 240.0  # ten readings an octave up
    (y,), (ok,) = syllable_targets(track, [(0.45, 0.6)], ref=120.0)
    assert ok and abs(y[0]) < 0.01 and abs(y[1]) < 0.01
