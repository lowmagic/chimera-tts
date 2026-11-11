# chimera-voice-chat

Talk to an LLM that answers in the voice of the
[Chimera Vocal Synth](https://github.com/jamesondh/chimera-vocal-synth), a physically modeled
vocal tract running as WebAssembly in your browser.

You talk (or type), a model replies, and Chimera says the reply sentence by sentence while the
model is still writing it. Chimera's wireframe head mouths the words, and a caption lights up each
word as it is spoken, because the voice is charming and not always easy to understand.

## How it works

```
mic → browser speech recognition → chat model (streamed) → sentences → Chimera → speakers
 └→ "is the user talking over it?" → stop                       ├→ caption, word by word
                                                                └→ the 3D head
```

- **Voice**: Chimera is a git submodule in `vendor/chimera`, pinned to a commit. Its Rust engine
  is built to wasm and runs in an AudioWorklet; its own text front end (CMUdict, letter-to-sound
  rules) turns words into gestures. Nothing in Chimera is patched.
- **Model**: any OpenAI-compatible streaming endpoint. The default is
  [OpenRouter](https://openrouter.ai), so the model is one setting. The API key is typed into
  Settings and stays in your browser's localStorage; the page sends it only to the endpoint.
- **Ears**: the browser's built-in speech recognition (Chrome, Edge, Safari). No key needed.
  Firefox has none, so there you type.
- **Head**: Chimera's own 3D renderer (three.js), driven by the engine's live state. Drag to turn
  it. It can be turned off in Settings on a slow phone.
- No server. The built site is static files, installable to a phone's home screen.

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
bun run test         # unit tests (text normalizing, sentence splitting, the talk-over detector)
bun run build        # typecheck and build to dist/
bun run e2e          # after a build: headless Chromium, mocked model and recognizer
```

`bun run e2e` needs Playwright with Chromium installed; it is not a dependency of this repo.

## Using it

- **Talk**: tap, speak, pause. Tap again to send early.
- While it is thinking or speaking the button is **Stop**: tapping it cuts the voice off and
  listens to you.
- With "Keep listening after each reply" on, a spoken turn reopens the mic when the reply ends.
- With "Interrupt it by talking" on, just start talking over it and it stops and listens. This
  watches the microphone for speech-like loudness while the voice speaks, relying on the browser's
  echo cancellation to keep the voice's own sound out. It works best with headphones; if it
  interrupts itself on speakers, turn it off. The first word or two of an interruption is lost
  while the recognizer starts.
- On a phone, use the browser's "Add to Home Screen" to install it. The screen stays on during a
  conversation.
- Settings has the voice (adult male, adult female, child), speed, pitch and the personality
  prompt.

## Using it with Hermes Agent

[Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) has an
OpenAI-compatible API server, so this app can be its voice and face while Hermes keeps the memory
and the tools. In `~/.hermes/.env`:

```sh
API_SERVER_ENABLED=true
API_SERVER_KEY=<a long random key>
API_SERVER_CORS_ORIGINS=<this app's origin, e.g. http://127.0.0.1:5327>
```

Run `hermes gateway`, then in this app's Settings set Endpoint to `http://127.0.0.1:8642/v1`, the
API key to that key, and Model to `hermes-agent`.

That key gives full access to the agent, terminal included. Keep the server on localhost, or reach
it from a phone over a private HTTPS tunnel (Tailscale's `tailscale serve`, for one), never the
open internet. Not tested against a real Hermes yet.

## Updating Chimera

```sh
git -C vendor/chimera fetch && git -C vendor/chimera checkout <commit>
bun run build && bun run e2e
git add vendor/chimera && git commit
```

## Not yet

Conversation memory between visits, a choice of speech recognizers, and dressing up the head.

## License

[MIT](LICENSE). Chimera is MIT, by Jameson Hodge. The CMU Pronouncing Dictionary is copied from
Chimera at build time under its own license (`public/data/CMUDICT-LICENSE.txt`).
