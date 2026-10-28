#!/usr/bin/env bash
#
# packed-install.sh — install the packed Modulus packages into the minimal host
# fixture outside the workspace, build it, boot it, and check what a downstream
# would receive. The seed of the packed-install smoke test described in
# specs/2026-10-28-modulus-packaging-and-distribution-spec.md.
#
# Usage: ./scripts/packed-install.sh [port]
#
set -euo pipefail

PORT="${1:-3199}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PACKED="${REPO_ROOT}/.packed"
FIXTURE="${REPO_ROOT}/fixtures/host-minimal"

mkdir -p "$PACKED"
rm -f "$PACKED"/*.tgz

echo "── build and pack"
pnpm -F @modulus-learning/host-tanstack-start build
(cd "${REPO_ROOT}/packages/host-tanstack-start" && pnpm pack --pack-destination "$PACKED" >/dev/null)

for tgz in "$PACKED"/*.tgz; do
  if tar -xzO -f "$tgz" package/package.json | grep -q '"workspace:'; then
    echo "WORKSPACE LEAK in $(basename "$tgz")" >&2
    exit 1
  fi
done

echo "── install and build the fixture"
cd "$FIXTURE"
rm -rf .output
pnpm install --force --prefer-offline >/dev/null
pnpm build >/dev/null

echo "── client isolation"
if grep -rl "MODULUS_SPIKE_SERVER_ONLY_MARKER" .output/public; then
  echo "server-only code found in client assets" >&2
  exit 1
fi

echo "── boot"
PORT="$PORT" node .output/server/index.mjs >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -sf "localhost:${PORT}/routes/spike-status" >/dev/null && break
  sleep 0.5
done
curl -sf "localhost:${PORT}/routes/spike-status" | grep -q '"status":"okay"' \
  || { echo "status route failed" >&2; exit 1; }

echo "packed install passed"
