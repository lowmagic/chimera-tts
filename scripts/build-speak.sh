#!/usr/bin/env bash
# Bundle tools/speak.ts for Node into dist/speak/speak.mjs, with everything it loads beside it: the
# engine, the pronunciation dictionary and the trained pitch model. Runs after `vite build`, which
# empties dist/. The facade's own way to find the engine (a Vite `?url` import) is left out of the
# bundle: speak.mjs hands it the wasm's bytes instead.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/dist/speak"
rm -rf "$out"
bun build "$root/tools/speak.ts" --target node --format esm --external '*?url' --outfile "$out/speak.mjs"
cp "$root/vendor/chimera/src/wasm/chimera.wasm" "$root/public/data/cmudict.txt.gz" "$root/public/data/CMUDICT-LICENSE.txt" \
  "$root/public/models/prosody.json" "$root/public/models/prosody.bin" "$out/"

# a sample of the voice as built, for the README's "hear a sample" link (dist/sample.wav on the site)
sample="$(mktemp)"
echo "[happy] Hello! I am a voice made from a model of a throat, a tongue and a pair of lips. I am still learning to talk, so thank you for listening closely." > "$sample"
node "$out/speak.mjs" "$sample" "$root/dist/sample.wav"
rm -f "$sample"
