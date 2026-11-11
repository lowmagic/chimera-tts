# Training the pitch model

The app's "natural pitch" is a set of rules (`src/prosody.ts`). These tools replace the rules with
a small network that has learned, from recordings of a person reading, what pitch each syllable
gets. Chimera still makes every sound; the model only decides the melody.

What it learns: for every syllable, the pitch early and late in its vowel, from the words, their
stress, where the syllable sits in its phrase and how the phrase ends. It is pitch only: timing
stays Chimera's. The chat model's `*emphasis*` and `[mood]` marks still work on top of it.

You need Python 3.10 or later and, for the two slow steps, a GPU. Any recent NVIDIA card is far
more than enough: the network has about 100,000 weights.

## Set up

```sh
cd training
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install torch            # Windows: use the CUDA command from https://pytorch.org/get-started/locally/
pip install -r requirements.txt
python -c "import torch; print(torch.cuda.is_available())"   # should print True
pytest                       # optional: the tools' own tests, a minute on CPU
```

The repository's submodule must be checked out (`git submodule update --init`): the tools read
the pronunciation dictionary from `vendor/chimera`.

## Practice run (two minutes, nothing to download)

This makes a small corpus out of Chimera itself speaking with the rule-based pitch, and trains on
it. The model should learn the rules back. It needs [Bun](https://bun.sh) and Rust, as the app does.

```sh
bun install && bun run prepare-chimera               # in the repository root, once
bun tools/synth-corpus.ts /tmp/synth 400             # about a minute of rendering per 60 sentences
cd training
python -m prosody.prep --ljspeech /tmp/synth --alignments /tmp/synth/alignments.json --out data/synth.jsonl
python -m prosody.train --data data/synth.jsonl --out runs/synth.pt
```

## The real run

1. Download [LJSpeech](https://keithito.com/LJ-Speech-Dataset/) (2.6 GB, 24 hours of one woman
   reading, public domain) and unpack it.

2. Prepare it. This times every syllable with wav2vec 2.0 (fetched from Hugging Face the first
   time, 360 MB) and measures its pitch with Praat's pitch tracker. Try 200 clips first.

   ```sh
   python -m prosody.prep --ljspeech /data/LJSpeech-1.1 --out data/try.jsonl --limit 200
   python -m prosody.prep --ljspeech /data/LJSpeech-1.1 --out data/ljspeech.jsonl
   ```

   It says how many clips it kept and why it dropped the rest. Expect to lose some to words the
   dictionary lacks.

3. Train. A few minutes.

   ```sh
   python -m prosody.train --data data/ljspeech.jsonl --out runs/ljspeech.pt
   ```

   Each epoch prints how far off the model is on clips it hasn't seen, in semitones, beside the
   error of always guessing the average pitch. It should end clearly under that. Don't expect it
   near zero: the same sentence can be said many ways, so a correlation around 0.5 to 0.7 is a
   good result for this kind of model.

4. Export, and listen before you publish.

   ```sh
   python -m prosody.export --checkpoint runs/ljspeech.pt
   cd .. && bun tools/render.ts out --model public/models/prosody.json "Well, that depends. Do you really want to know?"
   ```

   `out/` gets each text three ways: `classic` (Chimera's own pitch), `natural` (the rules) and
   `trained`.

5. Publish: commit `public/models/prosody.json` and `public/models/prosody.bin` (about 300 KB)
   and push. The app finds them and Settings gains a "Trained pitch model" switch, on by default.
   Delete the two files to go back to the rules.

## Other recordings: conversation instead of narration

LJSpeech is someone reading books aloud, and the model will learn that way of speaking. Use it
once to see the tools work on real audio, then train on speech closer to a conversation.

**DailyTalk** ([repository](https://github.com/keonlee9420/DailyTalk), 20 hours, two people acting
everyday dialogues, CC BY-SA 4.0) is the first one to try. Download the dataset and the authors'
TextGrid alignments from the links in its README, then:

```sh
python -m prosody.dailytalk --src /data/DailyTalk --out /data/dailytalk-lj
python -m prosody.prep --ljspeech /data/dailytalk-lj --textgrids /data/DailyTalk-TextGrid --out data/dailytalk.jsonl
python -m prosody.train --data data/dailytalk.jsonl --out runs/dailytalk.pt
```

The converter has not been run against the real download. If it finds nothing, look at how the
recordings are named and tell it apart from `<utterance>_<speaker>_d<dialogue>.wav`.

**Any other corpus** needs the LJSpeech layout: `metadata.csv` (`id|text|text`), `wavs/<id>.wav`,
and, with more than one speaker, `speakers.json` (`{id: speaker}`). Things to know:

- **Speakers.** Pitch is learned relative to each speaker's own median, so a high voice and a low
  one teach the same melody. That only works if `speakers.json` says who is who.
- **Alignments.** `--textgrids` takes Montreal Forced Aligner output (`<id>.TextGrid` with an
  ARPAbet `phones` tier, which the `english_us_arpa` models give). These are real phoneme times
  and much better than the built-in letter-based guess. Better alignments help more than more data.
- **Mixing.** `--data` takes several sets: `--data data/dailytalk.jsonl data/ljspeech.jsonl`.
- **Spontaneous speech** (real conversations with machine transcripts) is a harder fit: the
  transcripts have errors, and people say "um" and restart, which the chat model never writes.
  Clips whose words or syllable counts don't match are dropped, so expect to lose many.
- **Licences.** A model trained on a noncommercial corpus shouldn't be published on a public
  site. LJSpeech is public domain; DailyTalk is CC BY-SA.

Judge by ear, on things the assistant would say: `bun tools/render.ts out --model …` with a few
replies, each model in turn. A lower error number does not mean it sounds more human.

## If it sounds wrong

- **Flat.** A model like this predicts the average way of saying something, which is flatter than
  any one reading. The export measures that and stores a `scale` in `prosody.json` to widen it
  again (limited to 1.8). You can edit the number by hand.
- **Jumpy or random.** Probably the syllable timing. `nuclei` in `prosody/align.py` guesses where
  a word's vowels are from where its letters were heard, which is rough. Better timings from the
  Montreal Forced Aligner can be passed with `--alignments` ({clip id: [[start, end] per syllable]}).
- **Like someone reading a book aloud.** That is what LJSpeech is. Any single-speaker corpus laid
  out the same way (`metadata.csv` with `id|text|text`, and `wavs/`) will do; for a low male
  voice add `--pitch-floor 50 --pitch-ceiling 300`.

## What is where

| File | Job |
| --- | --- |
| `prosody/text.py` | text → syllables and their features (the browser's copy is `src/trained.ts`) |
| `prosody/align.py` | where each syllable is in a recording |
| `prosody/f0.py` | a recording's pitch, and each syllable's two targets |
| `prosody/prep.py` | corpus → `data/*.jsonl` |
| `prosody/dailytalk.py` | DailyTalk → the layout `prep` reads |
| `prosody/model.py`, `train.py` | the network and its training |
| `prosody/export.py` | checkpoint → `public/models/prosody.{json,bin}` |
| `prosody/fixtures.py` | regenerates `tests/fixtures/`, which hold the Python and TypeScript halves to the same answers; run it and commit if you change the features or the layers |
