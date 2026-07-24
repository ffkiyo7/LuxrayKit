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
#   ./scripts/visual-docker.sh                     # verify against baselines
#   ./scripts/visual-docker.sh --update-snapshots  # rebuild baselines
#
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
  echo "  - not installed?  see docs/DEVELOPER_GUIDE.md (visual regression)" >&2
  echo "  - just added yourself to the 'docker' group? that needs a new login:" >&2
  echo "      newgrp docker    # or restart WSL: wsl.exe --shutdown" >&2
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
