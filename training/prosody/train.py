"""Trains the pitch model on a prepared set.

    python -m prosody.train --data data/ljspeech.jsonl --out runs/ljspeech.pt
    python -m prosody.train --data data/dailytalk.jsonl data/ljspeech.jsonl --out runs/mixed.pt

Several sets can be given and are mixed. Each speaker's pitch is measured from their own median,
so voices of different heights teach the same melody.

Takes a few minutes on a GPU (the model is tiny; LJSpeech is about 300,000 syllables). Prints,
per epoch, the error on held-out utterances in semitones next to the error of always guessing
the average pitch, and how well the predicted contour follows the real one (correlation, 1 is
perfect). The best epoch is kept.
"""
from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from torch import nn

from .model import DUR_UNIT, UNK, PitchModel, encode
from .text import Phrase, Word, featurize


def load(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            # a speaker is a speaker of one set: two sets may both have a "1"
            r["speaker"] = f"{path.stem}:{r.get('speaker', '')}"
            r["utt"] = [Phrase([Word(t, st) for t, st in p["words"]], p["end"]) for p in r["phrases"]]
            rows.append(r)
    return rows


def build_vocab(rows: list[dict], size: int, min_count: int) -> list[str]:
    """Row → word; row 0 is every other word."""
    counts = Counter(w.text for r in rows for p in r["utt"] for w in p.words)
    return [""] + [w for w, c in counts.most_common(size - 1) if c >= min_count]


def speaker_medians(rows: list[dict]) -> dict[str, float]:
    """Each speaker's usual pitch: the median of all their trusted readings (semitones above 1 Hz)."""
    by: dict[str, list[float]] = {}
    for r in rows:
        by.setdefault(r["speaker"], []).extend(v for t, ok in zip(r["y"], r["ok"]) if ok for v in t)
    return {s: float(np.median(v)) for s, v in by.items() if v}


def speaker_paces(rows: list[dict]) -> dict[str, float]:
    """How much slower than Chimera each speaker usually is: the median of their syllables' log
    length ratios. Timing is learned around it, so the app's speed setting stays the speed."""
    by: dict[str, list[float]] = {}
    for r in rows:
        by.setdefault(r["speaker"], []).extend(v for v in r.get("dur") or [] if v is not None)
    return {s: float(np.median(v)) for s, v in by.items() if v}


def tensors(rows: list[dict], vocab: dict[str, int], refs: dict[str, float], paces: dict[str, float] | None = None):
    """Per utterance: features, targets and which targets to trust. With `paces`, a third target
    column is the syllable's length (DUR_UNITs around the speaker's pace)."""
    items = []
    for r in rows:
        cat, num = encode(featurize(r["utt"]), vocab)
        y = torch.tensor(r["y"], dtype=torch.float32) - refs[r["speaker"]]
        ok = torch.tensor(r["ok"], dtype=torch.bool)
        if len(cat) != len(y):
            raise SystemExit(f"{r['id']}: {len(cat)} syllables but {len(y)} pitch targets; prepare the data again")
        ok = ok[:, None].expand(-1, 2)
        if paces is not None:
            dur = r.get("dur") if r["speaker"] in paces else None
            dur = dur if dur is not None and len(dur) == len(y) else [None] * len(y)
            d = torch.tensor([0.0 if v is None else (v - paces[r["speaker"]]) / DUR_UNIT for v in dur], dtype=torch.float32)
            y = torch.cat([y, d[:, None]], dim=1)
            ok = torch.cat([ok, torch.tensor([v is not None for v in dur])[:, None]], dim=1)
        items.append((cat, num, y, ok.clone()))
    return items


def batches(items, size: int, shuffle: bool):
    order = list(range(len(items)))
    if shuffle:
        random.shuffle(order)
    for i in range(0, len(order), size):
        chunk = [items[j] for j in order[i : i + size]]
        lengths = torch.tensor([len(c[0]) for c in chunk])
        pad = lambda k: nn.utils.rnn.pad_sequence([c[k] for c in chunk], batch_first=True)
        yield pad(0), pad(1), pad(2), pad(3), lengths


@torch.no_grad()
def evaluate(model: PitchModel, items, device: str) -> dict:
    model.eval()
    pred, true, mask = [], [], []
    for cat, num, y, ok, lengths in batches(items, 256, False):
        pred.append(model(cat.to(device), num.to(device), lengths).cpu().flatten(0, 1))
        true.append(y.flatten(0, 1))
        mask.append(ok.flatten(0, 1))
    pred, true, mask = torch.cat(pred), torch.cat(true), torch.cat(mask)

    def stats(cols: slice) -> tuple[np.ndarray, np.ndarray]:
        return pred[:, cols][mask[:, cols]].numpy(), true[:, cols][mask[:, cols]].numpy()

    p, t = stats(slice(0, 2))
    m = {
        "mae": float(np.abs(p - t).mean()),
        "corr": float(np.corrcoef(p, t)[0, 1]) if p.std() > 0 else 0.0,
        "pred_sd": float(p.std()),
        "true_sd": float(t.std()),
    }
    p, t = stats(slice(2, 3))
    if len(t):
        # in log units; "chimera" is the error of leaving Chimera's timing as it is
        m["dur"] = {"mae": float(np.abs(p - t).mean() * DUR_UNIT), "chimera": float(np.abs(t).mean() * DUR_UNIT), "corr": float(np.corrcoef(p, t)[0, 1]) if p.std() > 0 else 0.0,
                    "pred_sd": float(p.std() * DUR_UNIT), "true_sd": float(t.std() * DUR_UNIT)}
    return m


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, required=True, nargs="+", help="one or more prepared sets")
    ap.add_argument("--out", type=Path, default=Path("runs/pitch.pt"))
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--hidden", type=int, default=64)
    ap.add_argument("--vocab", type=int, default=1500, help="how many of the commonest words get their own embedding")
    ap.add_argument("--min-count", type=int, default=5)
    ap.add_argument("--word-dropout", type=float, default=0.15, help="how often a known word is hidden, so unknown words work")
    ap.add_argument("--holdout", type=float, default=0.05)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--device", default=None)
    args = ap.parse_args(argv)

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")

    rows = [r for path in args.data for r in load(path)]
    refs = speaker_medians(rows)
    rows = [r for r in rows if r["speaker"] in refs]
    random.shuffle(rows)
    n_val = max(1, int(len(rows) * args.holdout))
    val_rows, train_rows = rows[:n_val], rows[n_val:]
    words = build_vocab(train_rows, args.vocab, args.min_count)
    vocab = {w: i for i, w in enumerate(words)}
    # pitch is learned relative to each speaker's usual pitch
    ref = float(np.median(list(refs.values())))
    paces = speaker_paces(rows) or None
    train, val = tensors(train_rows, vocab, refs, paces), tensors(val_rows, vocab, refs, paces)
    voices = ", ".join(f"{s.rstrip(':') or 'the speaker'} {2 ** (v / 12):.0f} Hz" for s, v in sorted(refs.items())[:8]) + (" …" if len(refs) > 8 else "")
    print(f"{len(train)} utterances to train on, {len(val)} held out, {len(words)} words, {len(refs)} speaker(s) with median pitch {voices}, on {device}")

    if paces:
        timed = sum(1 for r in rows if r.get("dur") is not None)
        print(f"timing too: {timed} utterances have syllable lengths; the speakers run at " + ", ".join(f"{np.exp(v):.2f}×" for _, v in sorted(paces.items())[:8]) + " of Chimera's syllable length")
    model = PitchModel(len(words), args.hidden, n_out=3 if paces else 2).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-2)
    steps = args.epochs * ((len(train) + args.batch - 1) // args.batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.1)
    loss_fn = nn.SmoothL1Loss()

    true = torch.cat([y[:, :2][ok[:, :2]] for _, _, y, ok in val]).flatten()
    print(f"always guessing the average: off by {float((true - true.mean()).abs().mean()):.2f} semitones")
    best = None
    for epoch in range(1, args.epochs + 1):
        model.train()
        total = n = 0
        for cat, num, y, ok, lengths in batches(train, args.batch, True):
            hide = (torch.rand(cat.shape[:2]) < args.word_dropout)
            cat[..., 0] = cat[..., 0].masked_fill(hide, UNK)
            pred = model(cat.to(device), num.to(device), lengths)
            ok = ok.to(device)
            loss = loss_fn(pred[ok], y.to(device)[ok])
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            total += loss.item() * int(ok.sum())
            n += int(ok.sum())
        m = evaluate(model, val, device)
        mark = ""
        if best is None or m["mae"] < best["mae"]:
            best = {**m, "epoch": epoch}
            args.out.parent.mkdir(parents=True, exist_ok=True)
            torch.save({"state": model.state_dict(), "config": model.config, "words": words, "ref": ref, "metrics": best}, args.out)
            mark = "  (kept)"
        d = m.get("dur")
        timing = f"; lengths off by {100 * (np.exp(d['mae']) - 1):.0f} % (Chimera's own: {100 * (np.exp(d['chimera']) - 1):.0f} %), correlation {d['corr']:.2f}" if d else ""
        print(f"epoch {epoch:3d}  loss {total / max(n, 1):.3f}  held out: off by {m['mae']:.2f} semitones, correlation {m['corr']:.2f}{timing}{mark}")

    print(f"best: epoch {best['epoch']}, off by {best['mae']:.2f} semitones, correlation {best['corr']:.2f} → {args.out}")
    print(f"next: python -m prosody.export --checkpoint {args.out}")


if __name__ == "__main__":
    main()
