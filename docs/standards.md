# Coding standards

chimera-tts follows the [org standards](org-standards.md) and the org's standards for [Python](org-standards-python.md)
and [shell scripts](org-standards-shell.md), unchanged copies of
[lowmagic's](https://github.com/lowmagic/.github/tree/main/code-standards). `.org-standards` lists the topics it copies
beyond the general one. This file adds chimera-tts's own rules and examples. Where it differs from an org rule, it says
so, and it wins.

The org has no TypeScript standard. The TypeScript here follows the general standards, and `tsc` in strict mode is its
linter.

## Dependencies

- Chimera makes every sound. Before adding code that shapes the voice, check whether Chimera's planner or engine
  already takes it as an input.
- The trained model runs on arithmetic written in `src/trained.ts`. No ML runtime ships to the browser or to the
  command.

## Structure

- One way to plan speech: `planSpeech` in `src/plan.ts`. The page and the command both call it, so a reply sounds the
  same in both.
- The layers, and what each mustn't know:
  - `vendor/chimera` is the synth, used through its wasm exports and TypeScript facade. It is never patched (see
    [ADR-001](stack.md#adr-001-chimera-is-a-pinned-submodule-and-is-never-patched)).
  - The speech modules (`plan`, `prosody`, `trained`, `timing`, `articulation`, `reply`, `sentences`, `normalize`,
    `numbers`, `lexicon`) turn text into a speech plan. They don't touch the DOM, the network or storage, so they run
    the same in a browser, in Node and in Bun.
  - The page (`main`, `voice`, `head`, `listen`, `bargein`, `llm`, `sessions`, `settings`) owns the browser. It reaches
    the speech modules by calling them, never the other way round.
  - `tools/speak.ts` is the command. It knows the speech modules and Chimera's wasm exports, and nothing of the page
    but the default settings.
  - `training/` is Python. It reaches the rest only through two interfaces: the model file it writes
    (`prosody.json` and `prosody.bin`, read by `src/trained.ts`) and `speak.mjs --serve`, which it runs to hear the
    voice.
- The settings a browser saves are stored under `chimera-voice-chat:settings` and `chimera-voice-chat:conversation`.
  The keys keep that name whatever the project is called: renaming them would drop every saved setting.

## Testing

- The behaviors worth a test: what text becomes sayable (numbers, Markdown, names), where sentences split, the pitch
  contour's shape for a statement, a question and a comma, the trained model giving the same numbers in TypeScript as
  in Python, the command's files, flags, exit codes and `--serve` protocol, and that the voice starts and ends in
  silence.
- The command's WAV format, its flags and the `--serve` lines are interface, and `tests/speak.mjs` pins them.
- `bun run e2e` drives the page in headless Chromium against a mocked model and recognizer. It needs Playwright, so
  it runs by hand and isn't part of `make check`.

## Running it

- There's no install script. The built files are on branch `dist`, and the [README](../README.md) says how to use
  them.

## Privacy

- The docs name roles: "a home server", "the Hermes machine". An address in an example is a placeholder, such as
  `https://<machine>.<tailnet>.ts.net`.
- The page keeps the API key in the browser's localStorage and sends it only to the endpoint the user set. Nothing in
  the repo holds one.
- Training data, recordings and run output stay out of the repo (`training/data/`, `training/runs/`). The model files
  hold weights and a list of common words, and no audio or text from the corpus.

## Docs

- The [README](../README.md) is where the docs describe what a user can observe: the command's flags and protocol, and
  the page's settings.

## Known deviations

Where chimera-tts doesn't follow the org standards yet. These are debt to pay down, not overrides: each one should go.

- There's no `docs/SPEC.md` or `docs/ROADMAP.md` yet (see [Docs](org-standards.md#docs)).
- Python tooling: `training/` installs with pip from `requirements.txt`, which has no lockfile and no pinned Python.
  It has no `pyproject.toml`, so uv, hatchling, ruff and mypy aren't set up, and `make check` runs only its pytest
  (see [Tooling](org-standards-python.md#tooling)).
- Python layout: the packages sit in `training/prosody` and `training/clarity`, not `src/<package>/`, and are run as
  `python -m prosody.<step>`, not through `[project.scripts]` (see [Layout](org-standards-python.md#layout)).
- Python typing: the training code isn't fully annotated and has never been checked by mypy (see
  [Typing](org-standards-python.md#typing)).
- Pins: CI installs Node by major version, the Rust toolchain that the runner image carries, and unpinned Python
  packages. Bun and every JavaScript dependency are pinned exactly (see
  [Versions and pins](org-standards.md#versions-and-pins)).
- `src/markup.ts` holds the mood and emphasis parsing the speech modules use and also one function that builds the
  caption's DOM nodes, so the seam between the speech modules and the page runs through the middle of it.
- `make check` needs Rust, Bun, Node and the training tools' Python packages already installed, and the first build
  downloads Chimera's Rust dependencies.
