"""Audio from the app's speech command (`node dist/speak/speak.mjs --serve`, tools/speak.ts): the
same dictionary, pitch model and voice the page uses."""
from __future__ import annotations

import base64
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, Iterator

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SPEAK = ROOT / "dist" / "speak" / "speak.mjs"


def _serve(jobs: list[tuple[str, str]], done: Callable[[], None], options: dict | None = None) -> list[tuple[str, int, np.ndarray]]:
    """One speech server saying its share: (id, sample rate, samples in -1..1) each."""
    proc = subprocess.Popen(["node", str(SPEAK), "--serve"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    out = []
    try:
        for id_, text in jobs:
            proc.stdin.write(json.dumps({"id": id_, "text": text, **({"options": options} if options else {})}) + "\n")
            proc.stdin.flush()
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError("the speech command stopped; run `node dist/speak/speak.mjs --serve` by hand to see why")
            answer = json.loads(line)
            if "error" in answer:
                raise RuntimeError(f"the speech command could not say {text!r}: {answer['error']}")
            pcm = np.frombuffer(base64.b64decode(answer["pcm"]), dtype="<i2").astype(np.float32) / 32768.0
            out.append((id_, int(answer["rate"]), pcm))
            done()
    finally:
        proc.stdin.close()
        proc.wait()
    return out


def say_all(jobs: list[tuple[str, str]], workers: int, done: Callable[[], None] = lambda: None, options: dict | None = None) -> Iterator[tuple[str, int, np.ndarray]]:
    """Every (id, text) said, split over `workers` speech servers; order within a server is kept.
    `options` are voice settings to say them with instead of the app's defaults (tools/speak.ts)."""
    if not SPEAK.exists():
        raise SystemExit(f"{SPEAK} is missing: run `bun install && bun run build` in the repository root first")
    workers = max(1, min(workers, len(jobs)))
    with ThreadPoolExecutor(workers) as pool:
        for part in pool.map(lambda k: _serve(jobs[k::workers], done, options), range(workers)):
            yield from part
