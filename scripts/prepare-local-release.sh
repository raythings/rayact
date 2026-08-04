#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The complete release matrix must be prepared on macOS." >&2
  exit 1
fi

if [[ -z "${RAYACT_RELEASE_PRIVATE_KEY:-}" ]]; then
  echo "RAYACT_RELEASE_PRIVATE_KEY is required." >&2
  exit 1
fi

if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ]]; then
  echo "Commit or remove all source-tree changes before preparing a release." >&2
  exit 1
fi

git -C "$ROOT" submodule foreach --quiet --recursive \
  'test -z "$(git status --porcelain --untracked-files=normal)"'

cd "$ROOT"
npm run build
npm test
npm run test:packages
npm run test:reproducibility
npm audit --audit-level=high
node scripts/build-prebuilts.mjs --target all
./scripts/verify-prebuilts.sh
node scripts/verify-release-versions.mjs
node scripts/verify-dev-app-modules.mjs --require-device-smoke
npm run verify:release
node scripts/verify-release-set.mjs release1 --require-signature
node scripts/verify-stable-gate.mjs release1
shasum -a 256 -c release1/SHA256SUMS

if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ]]; then
  echo "The release build changed source-controlled files. Review and commit them, then rerun." >&2
  exit 1
fi

echo "Local release is ready in $ROOT/release1."
