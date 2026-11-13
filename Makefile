.PHONY: check standards sync-standards
SHELL := bash
ORG = https://github.com/lowmagic/.github

# Offline once `bun install`, the Rust wasm target and the training tools' Python packages are in place
# (the README's "Build it yourself", and training/README.md).
check:
	bun run test
	bun run build
	node tests/speak.mjs
	cd training && python3 -m pytest -q -rs
	@# Every tracked script: a .sh name, or a shell on its shebang line. The submodule is a directory, not a file.
	git ls-files -z -- . ':!vendor/chimera' | LC_ALL=C xargs -0 awk 'FNR == 1 { if (FILENAME ~ /\.sh$$/ || /^#!.*[\/ ](ba|da|z)?sh$$/) print FILENAME; nextfile }' | \
		xargs uvx --from shellcheck-py==0.11.0.1 shellcheck

standards:
	@tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && \
	git clone -q --depth 1 --branch main $(ORG) "$$tmp" && \
	"$$tmp/code-standards/sync.sh" check "$$tmp"

sync-standards:
	@tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && \
	git clone -q --depth 1 --branch main $(ORG) "$$tmp" && \
	"$$tmp/code-standards/sync.sh" sync "$$tmp" "$$(git -C "$$tmp" rev-parse HEAD)"
