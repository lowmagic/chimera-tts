"""Whisper, writing down what it hears. Greedy, so the same audio always gives the same words."""
from __future__ import annotations

import numpy as np
from scipy.signal import resample_poly


def to16k(x: np.ndarray, rate: int) -> np.ndarray:
    return x if rate == 16000 else resample_poly(x, 16000, rate).astype(np.float32)


class Whisper:
    def __init__(self, name: str = "openai/whisper-small.en", device: str | None = None):
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor

        self.torch = torch
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.processor = WhisperProcessor.from_pretrained(name)
        self.model = WhisperForConditionalGeneration.from_pretrained(name).to(self.device).eval()

    def __call__(self, clips: list[np.ndarray]) -> list[str]:
        """Transcripts of 16 kHz clips (each under 30 s)."""
        feats = self.processor(clips, sampling_rate=16000, return_tensors="pt").input_features.to(self.device)
        with self.torch.no_grad():
            ids = self.model.generate(feats, max_new_tokens=32, do_sample=False, num_beams=1)
        return [t.strip() for t in self.processor.batch_decode(ids, skip_special_tokens=True)]
