"""The whole of prepare → train → export on a made-up set where pitch is a simple rule."""
import json
import random
import struct

import numpy as np
import torch

from prosody import export as export_mod
from prosody import train as train_mod
from prosody.model import PitchModel, encode
from prosody.text import Phrase, Word, featurize

WORDS = [("the", [1]), ("banana", [0, 1, 0]), ("robot", [1, 0]), ("of", [1]), ("sat", [1]), ("tomorrow", [0, 1, 2]), ("why", [1])]


def made_up(n: int, seed: int = 0) -> list[dict]:
    """Stressed syllables of content words are 4 semitones up, and a question's last syllable 6."""
    rng = random.Random(seed)
    rows = []
    for i in range(n):
        phrases = [Phrase([Word(*rng.choice(WORDS)) for _ in range(rng.randint(2, 6))], rng.choice(["comma", "final", "question"])) for _ in range(rng.randint(1, 2))]
        feats = featurize(phrases)
        y = []
        for s, f in zip(range(len(feats)), feats):
            v = 80.0 + 4.0 * (f.cat[1] == 1) + 6.0 * (f.cat[3] == 2 and f.num[5] == 1)
            y.append([v, v + 0.5])
        rows.append({"id": str(i), "phrases": [{"words": [[w.text, w.stresses] for w in p.words], "end": p.end} for p in phrases], "y": y, "ok": [rng.random() > 0.1 for _ in y]})
    return rows


def test_train_then_export(tmp_path):
    data = tmp_path / "set.jsonl"
    data.write_text("\n".join(json.dumps(r) for r in made_up(300)) + "\n")
    ck = tmp_path / "run.pt"
    train_mod.main(["--data", str(data), "--out", str(ck), "--epochs", "30", "--batch", "16", "--hidden", "16", "--min-count", "1", "--device", "cpu"])
    saved = torch.load(ck, weights_only=True)
    assert saved["metrics"]["mae"] < 0.6 and saved["metrics"]["corr"] > 0.9  # the rule is learnable
    assert abs(saved["ref"] - 80.0) < 1.0

    export_mod.main(["--checkpoint", str(ck), "--out", str(tmp_path / "models")])
    meta = json.loads((tmp_path / "models" / "prosody.json").read_text())
    raw = (tmp_path / "models" / "prosody.bin").read_bytes()
    assert meta["format"] == 1 and meta["words"][0] == "" and 1.0 <= meta["scale"] <= 1.8
    last = meta["tensors"][-1]
    assert len(raw) == 4 * (last["offset"] + int(np.prod(last["shape"])))
    # the file's numbers are the model's
    model = PitchModel(**saved["config"])
    model.load_state_dict(saved["state"])
    t = next(t for t in meta["tensors"] if t["name"] == "out.bias")
    assert np.allclose(struct.unpack_from("<2f", raw, 4 * t["offset"]), model.out.bias.detach().numpy())
    # and the worked example is what the model says for those words
    utt = [Phrase([Word(w, st) for w, st in p["words"]], p["end"]) for p in meta["check"]["phrases"]]
    cat, num = encode(featurize(utt), {w: i for i, w in enumerate(meta["words"])})
    with torch.no_grad():
        assert np.allclose(model(cat[None], num[None])[0].numpy(), np.array(meta["check"]["y"]), atol=1e-4)


def test_padding_does_not_change_an_utterances_answer():
    torch.manual_seed(0)
    model = PitchModel(5, hidden=8).eval()
    cat = torch.randint(0, 2, (2, 6, 7))
    num = torch.rand(2, 6, 8)
    with torch.no_grad():
        alone = model(cat[:1, :4], num[:1, :4])
        padded = model(cat, num, torch.tensor([4, 6]))
    assert torch.allclose(alone[0], padded[0, :4], atol=1e-5)
