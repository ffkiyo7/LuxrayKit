#!/usr/bin/env bash
#
# Run the mobile visual-regression suite inside the official Playwright image.
#
# Why a container: screenshot bytes depend on the OS font stack and the exact
# Chromium build. Running on the host makes baselines machine-specific (the old
# ones were win32-only and could never be verified anywhere else). The image tag
# is derived from the installed @playwright/test version, so the browser and the
# fonts move only when package-lock.json moves.
#
# CI-ONLY. Development happens on macOS, which cannot produce Linux baselines at
# all, and Playwright's snapshot filenames carry the platform but NOT the CPU
# architecture — an arm64 container would silently overwrite CI's amd64 PNGs
# under identical names. So both entry points live in GitHub Actions:
#
#   verify  -> the `visual` job in .github/workflows/ci.yml (blocking gate)
#   rebuild -> .github/workflows/visual-baseline.yml (manual workflow_dispatch)
#
# Running it by hand is supported only on an amd64 Linux host with Docker.
# Any extra arguments are forwarded to `playwright test`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -d node_modules/@playwright/test ]; then
  echo "error: node_modules/@playwright/test is missing — run 'npm ci' first." >&2
  exit 1
fi

# Pin the image to the installed library version; a mismatch means the container
# would screenshot with a different Chromium than the one we claim to pin.
PW_VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"

if ! docker info >/dev/null 2>&1; then
  echo "error: cannot talk to the Docker daemon." >&2
  echo "  This script is CI-only; a macOS dev box is not expected to run it." >&2
  echo "  - to verify baselines:  open a PR — the 'visual' CI job is the gate." >&2
  echo "  - to rebuild baselines: run the 'Rebuild visual baselines' workflow" >&2
  echo "      gh workflow run visual-baseline.yml --ref \"\$(git branch --show-current)\"" >&2
  echo "  See docs/DEVELOPER_GUIDE.md §8 (visual regression)." >&2
  exit 1
fi

# --ipc=host: Chromium crashes on the default 64MB /dev/shm.
# --user: keep generated files (baselines, dist/, test-results/) owned by you
#   instead of root. HOME must then point somewhere writable inside the image.
exec docker run --rm --init --ipc=host \
  --user "$(id -u):$(id -g)" \
  --volume "$REPO_ROOT:/work" \
  --workdir /work \
  --env HOME=/tmp \
  "$IMAGE" \
  npx playwright test --project=visual-mobile-390 "$@"
