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
- **Consonants**: two sliders in Settings, both off (1.00×) to start. "Harder p, t, k, b, d, g" pushes more
  breath behind each stop and widens its puff; "More voice in b, d, g, v, z" keeps the voice going
  under them. They adjust Chimera's finished speech plan (`src/articulation.ts`);
  `bun tools/consonants.ts --plosives 2 --voicing 2 --wav out.wav` measures and renders a setting.
- **Names and initials**: words the dictionary lacks would be sounded out letter by letter,
  badly ("ChatGPT" as "chat-ch-p-t"). `src/lexicon.ts` holds pronunciations for such names: add
  a line whenever the voice mangles one. Initials it doesn't know are said as letters ("GPT"), and
  joined names are split ("DailyTalk").
- **Head**: Chimera's own 3D renderer (three.js), driven by the engine's live state. Drag to turn
  it. It can be turned off in Settings on a slow phone.
- No server. The built site is static files, installable to a phone's home screen. Every push to
  `main` is also published ready-built on branch `dist` (below).

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
bun run test         # unit tests (text, Markdown replies, sentences, pitch contours, the talk-over detector, Hermes's API)
bun run build        # typecheck and build to dist/ (with the speak command in dist/speak/)
bun run e2e          # after a build: the speak command, then headless Chromium, mocked model and recognizer
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
OpenAI-compatible API server, so this app can be its voice and face while Hermes keeps the memory,
the tools and the conversations. In `~/.hermes/.env`:

```sh
API_SERVER_ENABLED=true
API_SERVER_KEY=<a long random key>
```

and run `hermes gateway`. Then either serve this app from Hermes's own address, or use it from
another site.

### Served from Hermes's address

This is how it runs on a home server, for a phone anywhere on the tailnet. Branch `dist` holds the
built site: CI commits the build of every push to `main` to it, one commit each, whose message
names the source commit's full SHA, with `index.html` at the root. The server pins a commit of
`dist` and serves its files as they are (nothing is built there) from the Tailscale node that also
passes `/v1/` and `/api/` to Hermes's API server (`http://127.0.0.1:8642/v1` and `/api`): the app
and Hermes on one address, `https://<machine>.<tailnet>.ts.net/`. Next to `index.html` it puts a
`deploy.json`:

```json
{"backend": "hermes", "baseUrl": "/v1"}
```

At startup the app reads it, and until you save other settings it talks to Hermes at that
address's `/v1` (a relative `baseUrl` is resolved against the page). The API key still comes from
you: paste the `API_SERVER_KEY` in Settings, once on each device. The page and Hermes share one
origin, so Hermes needs no `API_SERVER_CORS_ORIGINS` and nothing else needs `tailscale serve` by
hand. The public site has no deploy.json, so nothing changes there.

### From another site

Add `API_SERVER_CORS_ORIGINS=<this app's origin, e.g. https://www.example.com>` to Hermes's
`.env`. In this app's Settings choose **Chat with: Hermes Agent** and paste the key. The choice
fills in the endpoint (`http://127.0.0.1:8642/v1`) and model (`hermes-agent`), shows the exact
origin to put in `API_SERVER_CORS_ORIGINS`, and keeps Hermes's key apart from OpenRouter's, so
switching between them is one tap.

- **Same computer, Chrome, Edge or Firefox**: `http://127.0.0.1:8642/v1` works from the HTTPS
  site. Chrome may ask once for permission to reach devices on your local network.
- **Phone, another computer, or Safari**: browsers block an HTTPS page from calling plain HTTP on
  another machine, so Hermes needs an HTTPS address. On a Tailscale network, `tailscale serve --bg
  8642` on the Hermes machine gives one (`https://<machine>.<tailnet>.ts.net`); use that plus
  `/v1` as the Endpoint. Hermes can stay bound to 127.0.0.1.

### With Hermes chosen

- Conversations live in Hermes, one Hermes session each. **Chats** lists them (Hermes's title, or
  the first words you said, and when), opens one with its earlier turns, starts a new one, renames
  and deletes them. A new conversation becomes a session with its first turn
  (`POST /api/sessions`). Each turn names it in `X-Hermes-Session-Id` and carries only the system
  prompt and the new turn, since Hermes takes the earlier ones from the session. Any device with
  the key can open a conversation and carry on with its context, and each device reopens the one it
  had open last.
- Only conversations started through Hermes's API server are listed: Hermes won't let this API
  carry on a CLI, desktop or messaging-app session.
- While the agent runs a tool the status line says what it is doing ("🔍 web_search: weather in
  Paris…") until the tool has finished. Tool output is never spoken.
- The app still sends its personality prompt and the mood and emphasis instructions, which Hermes
  layers on top of its own prompt.
- If your Hermes refuses the session header (an older one), the app notices and carries on without
  it, sending the whole conversation each turn.

That key gives full access to the agent, terminal included. Never put the server on the open
internet. Not tested against a real Hermes yet: the app's side is tested against a stand-in written
from Hermes v0.23.1's source and documentation.

### Hermes's own voice

Hermes can say its replies in Chimera's voice wherever it speaks (its apps' voice mode and Read
Aloud, voice messages), not only through this page. The build has a command for that,
`dist/speak/speak.mjs`, published on `dist` with the site, with everything it loads beside it: the
engine, the pronunciation dictionary and the trained pitch model. It needs only Node: no network,
no `node_modules`, nothing written but its output.

```sh
node dist/speak/speak.mjs reply.txt reply.wav
```

reads the text (UTF-8) and writes one WAV of all of it (16-bit mono, 48 kHz), said as this page says
a reply with its default settings: the same sentences, mood and emphasis marks, trained pitch and
voice (adult male). Markdown is made sayable first (`src/reply.ts`): a link is its text, a bare URL
is "link", a code block is "code block", a table row is its cells, emoji are dropped. If it can't,
it prints one line to stderr and exits 1. It runs on one core at a little over a quarter of the
audio's length: a 600-character reply (34 s of speech) takes 9 s on an Apple M4.

Hermes runs it as a command TTS provider, in `config.yaml`:

```yaml
tts:
  provider: chimera
  providers:
    chimera:
      type: command
      command: node /srv/chimera/speak/speak.mjs {text_path} {output_path}
      format: wav
      timeout: 600 # seconds without output; a long reply on a slow machine takes a while
```

where `/srv/chimera` is a commit of `dist`. The voice is the page's with its default settings; the
page's sliders are flags on that command, anywhere on the line, and what you leave out stays at its
default:

| Flag | Default | The page's setting |
| --- | --- | --- |
| `--rate` | 0.85 | Speed |
| `--pitch` | 1 | Pitch |
| `--body` | male | Voice (`male`, `female`, `child`) |
| `--plosives` | 1.5 | Harder p, t, k, b, d, g (1 to 2) |
| `--voicing` | 1.5 | More voice in b, d, g, v, z (1 to 2) |
| `--word-ends` | 1 | longer last syllable of each word (no slider on the page) |
| `--timing` | on | Trained timing (`on` or `off`) |

```yaml
      command: node /srv/chimera/speak/speak.mjs --rate 0.8 --pitch 1.1 {text_path} {output_path}
```

Hermes reads the command for each reply, so a change takes effect on the next one. The same flags
before `--serve` set what a served request gets when it doesn't say otherwise. Hermes cleans the text before it hands it over
(Markdown, emoji and emphasis asterisks go; a mood tag stays) and converts the WAV as it needs.

A speech server that says many replies keeps one running instead, so the engine, dictionary and
pitch model load once:

```sh
node dist/speak/speak.mjs --serve
```

reads one JSON request per line on stdin, `{"id": "1", "text": "Hello there."}`, and answers each,
in order, with one line on stdout: `{"id": "1", "rate": 48000, "pcm": "<base64>"}`, the whole text
as 16-bit little-endian mono PCM said as above, or `{"id": "1", "error": "<one line>"}` (a line that
isn't a request is answered with an empty id). Nothing else goes to stdout; diagnostics go to
stderr. It exits 0 when stdin closes. Loading takes about 0.16 s on an Apple M4, so a 10-word
sentence takes 0.84 s served against 1.0 s as a command; the rest is the engine saying it.

## Updating Chimera

```sh
git -C vendor/chimera fetch && git -C vendor/chimera checkout <commit>
bun run build && bun run e2e
git add vendor/chimera && git commit
```

## Not yet

Conversation memory between visits without Hermes, a choice of speech recognizers, and dressing up
the head.

## License

[MIT](LICENSE). Chimera is MIT, by Jameson Hodge. The CMU Pronouncing Dictionary is copied from
Chimera at build time under its own license (`public/data/CMUDICT-LICENSE.txt`).

The trained pitch model in `public/models/` (`prosody.json`, `prosody.bin`) was trained on
[DailyTalk](https://github.com/keonlee9420/DailyTalk) (Lee, Park and Kim, "DailyTalk: Spoken
Dialogue Dataset for Conversational Text-to-Speech", ICASSP 2023), which is licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Those two files are shared under
the same license. They hold no audio or text from the dataset beyond a list of its commonest words.
