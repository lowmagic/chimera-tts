# Working on chimera-tts

A text-to-speech voice for AI agents, made with the Chimera Vocal Synth: a command that turns text into a WAV file,
and a voice chat page.

Read before changing behavior:

- [README](README.md): what chimera-tts does and how to run it
- [Coding standards](docs/standards.md): how the code should read, on top of the org's
  [principles](https://github.com/lowmagic/.github/blob/main/PRINCIPLES.md) and standards (`docs/org-standards*.md`)
- [Stack and decisions](docs/stack.md): tools and the decisions behind them
- [Training the pitch model](training/README.md): the Python tools that train the model and measure clarity

Docs live in `docs/` and change with behavior. Never commit hostnames, tokens, or deployment config (see
[Privacy](docs/standards.md#privacy)).

Run `make check` before committing. It runs everything CI runs, except the org standards check: `make standards`
(needs the network).
