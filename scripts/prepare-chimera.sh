#!/usr/bin/env bash
# Build the Chimera engine to wasm inside the submodule (where its TypeScript facade imports it
# from) and copy the pronunciation dictionary into public/. Both outputs are gitignored.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
chimera="$root/vendor/chimera"
[ -f "$chimera/Cargo.toml" ] || { echo "vendor/chimera is empty: run 'git submodule update --init'" >&2; exit 1; }
(cd "$chimera" && cargo build -p chimera-wasm --release --target wasm32-unknown-unknown)
cp "$chimera/target/wasm32-unknown-unknown/release/chimera_wasm.wasm" "$chimera/src/wasm/chimera.wasm"
mkdir -p "$root/public/data"
cp "$chimera/public/data/cmudict.txt.gz" "$chimera/public/data/CMUDICT-LICENSE.txt" "$root/public/data/"
