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
  On OpenRouter the request asks for the fastest provider and no reasoning pass, and with
  "Zero data retention" on (the default) only for providers that keep nothing. OpenRouter's
  self-serve accounts still allow "safety retention" providers under that flag: to rule those out
  too, choose "ZDR only" in your OpenRouter privacy settings. If a model has no such provider the
  request fails and says so. The model is told which model and endpoint it is running on, so you
  can ask it, and the log notes it whenever that changes.
- **Ears**: the browser's built-in speech recognition (Chrome, Edge, Safari). No key needed.
  Firefox has none, so there you type.
- **Pitch**: with "Natural pitch" on, Chimera's own pitch gestures (the same bump on every
  stressed vowel, a full fall at every comma) are replaced with a contour shaped like spoken
  English: accents on content words only, a small rise before a comma, a climb at a yes/no
  question, a fall at a full stop. The model is asked to start a reply with a mood (`[excited]`)
  and to put asterisks round a word it would stress; both shape the pitch and neither is read
  aloud. By default it is rules (`src/prosody.ts`), and it only touches pitch: timing and
  articulation are Chimera's. The rules can be replaced by a small model trained on recordings
  of a person reading: [training/README.md](training/README.md) has the steps (an NVIDIA GPU and
  under an hour). If `public/models/prosody.json` exists the app uses it, with a switch in Settings.
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
bun run test         # unit tests (text, sentences, pitch contours, the talk-over detector)
bun run build        # typecheck and build to dist/
bun run e2e          # after a build: headless Chromium, mocked model and recognizer
```

`bun run e2e` needs Playwright with Chromium installed; it is not a dependency of this repo.

To compare the two pitch modes by ear without the page, render a reply both ways to WAV files:

```sh
bun tools/render.ts out female "[happy] Hello! This is *really* how I sound. Do you like it?"
```

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
API_SERVER_CORS_ORIGINS=<this app's origin, e.g. https://www.example.com>
```

Run `hermes gateway`. In this app's Settings choose **Chat with: Hermes Agent** and paste that key.
The choice fills in the endpoint (`http://127.0.0.1:8642/v1`) and model (`hermes-agent`), shows
the exact origin to put in `API_SERVER_CORS_ORIGINS`, and keeps Hermes's key apart from
OpenRouter's, so switching between them is one tap.

With Hermes chosen the app:

- sends an `X-Hermes-Session-Id`, new on each visit, so a chat is one Hermes session (if your
  Hermes refuses the header, the app notices and carries on without it);
- shows "using web_search…" while the agent runs a tool, and never speaks tool output;
- still sends its personality prompt and the mood and emphasis instructions, which Hermes layers
  on top of its own prompt.

Where it works:

- **Same computer, Chrome, Edge or Firefox**: `http://127.0.0.1:8642/v1` works from the HTTPS
  site. Chrome may ask once for permission to reach devices on your local network.
- **Phone, another computer, or Safari**: browsers block an HTTPS page from calling plain HTTP on
  another machine, so Hermes needs an HTTPS address. On a Tailscale network, `tailscale serve --bg
  8642` on the Hermes machine gives one (`https://<machine>.<tailnet>.ts.net`); use that plus
  `/v1` as the Endpoint. Hermes can stay bound to 127.0.0.1.

That key gives full access to the agent, terminal included. Never put the server on the open
internet. Not tested against a real Hermes yet: the app's side is tested against a stand-in that
follows Hermes's documentation.

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
