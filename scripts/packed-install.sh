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
for pkg in core host-tanstack-start; do
  pnpm -F "@modulus-learning/${pkg}" build >/dev/null
  (cd "${REPO_ROOT}/packages/${pkg}" && pnpm pack --pack-destination "$PACKED" >/dev/null)
done

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

echo "── packaged styles"
# `.gradient-glow` comes from a CSS file a packaged component imports; `flex-1`
# appears only in packaged components, so it proves Tailwind scanned the package.
for selector in '.gradient-glow' '.flex-1'; do
  grep -q -- "$selector" .output/public/assets/*.css \
    || { echo "missing $selector in the client CSS" >&2; exit 1; }
done

echo "── client isolation"
if grep -rlE "argon2|loadCoreConfigFromEnv" .output/public; then
  echo "server-only code found in client assets" >&2
  exit 1
fi

echo "── boot"
PORT="$PORT" node .output/server/index.mjs >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -sf "localhost:${PORT}/routes/elb-status" >/dev/null && break
  sleep 0.5
done
curl -sf "localhost:${PORT}/routes/elb-status" | grep -q '"status":"okay"' \
  || { echo "status route failed" >&2; exit 1; }
curl -sf "localhost:${PORT}/" | grep -q 'gradient-glow' \
  || { echo "home page did not render the packaged component" >&2; exit 1; }

echo "packed install passed"
