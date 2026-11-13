# Stack and decisions

| Layer | Choice |
| --- | --- |
| Synth | Chimera Vocal Synth (Rust, built to wasm), a git submodule |
| Language | TypeScript for the page and the command, Python for training |
| Page | Static files built by Vite, three.js for the head |
| Command | One file bundled by Bun, run by Node |
| Model | A small bidirectional GRU, trained in PyTorch, run by `src/trained.ts` |
| Publishing | GitHub Pages for the site, branch `dist` for the built files |
| Development | Bun, `tsc`, pytest |
| License | MIT for the code, CC BY-SA 4.0 for the trained model files |

## ADR-001: Chimera is a pinned submodule and is never patched

Chimera is someone else's project and still moving. The repo pins it to a commit in `vendor/chimera` and changes
nothing inside it, so updating is a checkout and a test run. What this project adds to the voice goes in before
Chimera plans a sentence (text, pronunciations, per-segment pitch and length) or adjusts the finished plan
(`src/articulation.ts`). A fault inside the synth itself, such as a weak consonant, can't be fixed here. Fixing one
means sending the change to Chimera or reversing this decision.

## ADR-002: TypeScript, Bun and Vite

The voice has to run in a browser, and Chimera ships a TypeScript facade over its wasm. Writing the rest in TypeScript
lets the page import that facade directly, and lets the command reuse the page's modules. Bun runs the tests and
bundles the command. Vite builds the page, which needs a bundler for the AudioWorklet and three.js. Node runs the
command where it is installed, because an agent's host is more likely to have Node than Bun.

## ADR-003: One planning path for the page and the command

`tools/speak.ts` imports the same modules the page uses, with the page's default settings. A reply then sounds the
same wherever it is said, and a fix to pronunciation or pitch lands in both at once. The price is that the speech
modules can't use anything only a browser has.

## ADR-004: No server

The page is static files, and the command is a process that reads text and writes audio. The chat model is whatever
OpenAI-compatible endpoint the user names, called from the browser with a key the browser keeps. There is nothing to
host, secure or keep running, and no account. The price is that anything needing a server, such as shared settings
or speech recognition of our own, is out of reach.

## ADR-005: Builds are published on branch dist

Building needs Rust, Bun and the submodule. Someone who wants the voice for their agent shouldn't need any of them,
so CI commits each build of `main` to branch `dist`, one commit per source commit, named for it. A host clones the
branch and runs the files as they are. A deployment pins a commit of `dist`.

## ADR-006: Pitch and timing from a small trained model, run by hand-written code

Rules for pitch sound mechanical, and Chimera's own timing is even. A recurrent network with about 100,000 weights,
trained on recordings of people talking, predicts each syllable's pitch and length. Training needs PyTorch and a GPU
for under an hour. Running it needs neither: the weights ship as one binary file, and `src/trained.ts` runs the
network in about 200 lines, so no ML runtime ships to the browser or the command. When the model file is missing,
the rules in `src/prosody.ts` set the pitch and Chimera sets the timing.

## ADR-007: The model files carry their corpus's license

The model was trained on DailyTalk, which is CC BY-SA 4.0. Whether weights are a derivative of their training data
isn't settled, so the two model files are shared under the same license and the code stays MIT. The
[README](../README.md#license) says which files are which.
