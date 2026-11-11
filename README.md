# chimera-voice-chat

Talk to an LLM that answers in the voice of the
[Chimera Vocal Synth](https://github.com/jamesondh/chimera-vocal-synth), a physically modeled
vocal tract running as WebAssembly in your browser.

You talk (or type), a model replies, and Chimera says the reply sentence by sentence while the
model is still writing it. A caption lights up each word as it is spoken, because the voice is
charming and not always easy to understand.

## How it works

```
mic → browser speech recognition → chat model (streamed) → sentences → Chimera → speakers
                                                                └→ caption, word by word
```

- **Voice**: Chimera is a git submodule in `vendor/chimera`, pinned to a commit. Its Rust engine
  is built to wasm and runs in an AudioWorklet; its own text front end (CMUdict, letter-to-sound
  rules) turns words into gestures. Nothing in Chimera is patched.
- **Model**: any OpenAI-compatible streaming endpoint. The default is
  [OpenRouter](https://openrouter.ai), so the model is one setting. The API key is typed into
  Settings and stays in your browser's localStorage; the page sends it only to the endpoint.
- **Ears**: the browser's built-in speech recognition (Chrome, Edge, Safari). No key needed.
  Firefox has none, so there you type.
- No server. The built site is static files.

## Run it

Needs Rust with the `wasm32-unknown-unknown` target, and [Bun](https://bun.sh).

```sh
git clone --recurse-submodules https://github.com/nathancurry/chimera-voice-chat
cd chimera-voice-chat
bun install
bun run dev          # builds the engine, then serves http://127.0.0.1:5327
```

Open Settings, paste an API key, pick a model, then tap **Talk**.

The microphone and the audio engine need a secure context: `localhost` or HTTPS.

```sh
bun run test         # unit tests (text normalizing, sentence splitting)
bun run build        # typecheck and build to dist/
bun run e2e          # after a build: headless Chromium, mocked model and recognizer
```

`bun run e2e` needs Playwright with Chromium installed; it is not a dependency of this repo.

## Using it

- **Talk**: tap, speak, pause. Tap again to send early.
- While it is thinking or speaking the button is **Stop**: tapping it cuts the voice off and
  listens to you.
- With "Keep listening after each reply" on, a spoken turn reopens the mic when the reply ends.
  It is half duplex: the mic is closed while the voice speaks, so it doesn't hear itself.
- Settings has the voice (adult male, adult female, child), speed, pitch and the personality
  prompt.

## Updating Chimera

```sh
git -C vendor/chimera fetch && git -C vendor/chimera checkout <commit>
bun run build && bun run e2e
git add vendor/chimera && git commit
```

## Not yet

Interrupting by just talking, the animated head, a phone install (PWA), and conversation memory.

## License

[MIT](LICENSE). Chimera is MIT, by Jameson Hodge. The CMU Pronouncing Dictionary is copied from
Chimera at build time under its own license (`public/data/CMUDICT-LICENSE.txt`).
