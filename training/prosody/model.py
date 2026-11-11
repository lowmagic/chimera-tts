"""The pitch model: each syllable's features → its pitch early and late in the vowel.

Small on purpose: embeddings, one linear layer, one bidirectional GRU, one linear layer. The
browser runs it with a few dozen lines of arithmetic (src/trained.ts), with no ML runtime.
"""
from __future__ import annotations

import torch
from torch import nn

from .text import CATEGORICAL, N_NUMERIC, Syllable

UNK = 0  # the word table's row for every word not in the vocabulary
SMALL_DIM = 4  # embedding size of the small categorical features


class PitchModel(nn.Module):
    def __init__(self, n_words: int, hidden: int = 64, word_dim: int = 24):
        super().__init__()
        self.config = {"n_words": n_words, "hidden": hidden, "word_dim": word_dim}
        self.embeddings = nn.ModuleList(
            nn.Embedding(n_words if size is None else size, word_dim if size is None else SMALL_DIM) for _, size in CATEGORICAL
        )
        width = sum(e.embedding_dim for e in self.embeddings) + N_NUMERIC
        self.inp = nn.Linear(width, hidden)
        self.gru = nn.GRU(hidden, hidden, batch_first=True, bidirectional=True)
        self.out = nn.Linear(2 * hidden, 2)

    def forward(self, cat: torch.Tensor, num: torch.Tensor, lengths: torch.Tensor | None = None) -> torch.Tensor:
        """cat: batch × syllables × len(CATEGORICAL) ids; num: batch × syllables × N_NUMERIC."""
        x = torch.cat([e(cat[..., i]) for i, e in enumerate(self.embeddings)] + [num], dim=-1)
        x = torch.tanh(self.inp(x))
        if lengths is not None:
            packed = nn.utils.rnn.pack_padded_sequence(x, lengths.cpu(), batch_first=True, enforce_sorted=False)
            h, _ = self.gru(packed)
            h, _ = nn.utils.rnn.pad_packed_sequence(h, batch_first=True, total_length=x.shape[1])
        else:
            h, _ = self.gru(x)
        return self.out(h)


def encode(syllables: list[Syllable], vocab: dict[str, int]) -> tuple[torch.Tensor, torch.Tensor]:
    """Features as tensors (syllables × …), words looked up in `vocab` (word → row)."""
    cat = torch.tensor([[vocab.get(s.cat[0], UNK), *s.cat[1:]] for s in syllables], dtype=torch.long)
    num = torch.tensor([s.num for s in syllables], dtype=torch.float32)
    return cat, num
