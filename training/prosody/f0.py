"""Pitch of a recording, and each syllable's pitch as the model's two targets."""
from __future__ import annotations

import numpy as np

STEP = 0.005  # seconds between pitch readings


def pitch_track(wave: np.ndarray, rate: int, floor: float = 70.0, ceiling: float = 500.0) -> np.ndarray:
    """Pitch in Hz every STEP seconds (0 where unvoiced), by Praat's autocorrelation method."""
    import parselmouth

    snd = parselmouth.Sound(wave.astype(np.float64), sampling_frequency=rate)
    pitch = snd.to_pitch_ac(time_step=STEP, pitch_floor=floor, pitch_ceiling=ceiling)
    # Praat's first frame is not at 0: put its readings on a grid that starts there
    hz = pitch.selected_array["frequency"]
    out = np.zeros(int(np.ceil(len(wave) / rate / STEP)) + 1)
    idx = np.round(pitch.xs() / STEP).astype(int)
    keep = idx < len(out)
    out[idx[keep]] = hz[keep]
    return out


def semitones(hz: np.ndarray, ref: float) -> np.ndarray:
    with np.errstate(divide="ignore"):
        return np.where(hz > 0, 12 * np.log2(np.maximum(hz, 1e-9) / ref), np.nan)


def syllable_targets(track_hz: np.ndarray, spans: list[tuple[float, float]], ref: float, max_jump: float = 14.0) -> tuple[list[list[float]], list[bool]]:
    """Per syllable: its pitch early and late in the vowel (semitones from `ref`), and whether it
    was voiced enough to trust. Readings more than `max_jump` semitones from the recording's own
    median are octave errors and are dropped."""
    st = semitones(track_hz, ref)
    voiced = st[~np.isnan(st)]
    if len(voiced) == 0:
        return [[0.0, 0.0] for _ in spans], [False] * len(spans)
    med = float(np.median(voiced))
    st = np.where(np.abs(st - med) > max_jump, np.nan, st)
    ys: list[list[float]] = []
    ok: list[bool] = []
    for t0, t1 in spans:
        a, b = int(round(t0 / STEP)), max(int(round(t1 / STEP)), int(round(t0 / STEP)) + 2)
        seg = st[a:b]
        mid = len(seg) // 2
        early, late = seg[:mid][~np.isnan(seg[:mid])], seg[mid:][~np.isnan(seg[mid:])]
        both = seg[~np.isnan(seg)]
        if len(both) < 2:
            ys.append([0.0, 0.0])
            ok.append(False)
            continue
        e = float(np.median(early)) if len(early) else float(np.median(both))
        l = float(np.median(late)) if len(late) else float(np.median(both))
        ys.append([e, l])
        ok.append(True)
    return ys, ok
