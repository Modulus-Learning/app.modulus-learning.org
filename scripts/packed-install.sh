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
# Server-only code the fixture reaches only through packaged server functions
# and handlers: the host config loader, core's env mapping, native hashing.
if grep -rlE "SESSION_SECRET|loadCoreConfigFromEnv|argon2" .output/public; then
  echo "server-only code found in client assets" >&2
  exit 1
fi

echo "── fixture environment"
# A complete synthetic all-in-one environment from the packaged mode fixture.
node --input-type=module -e "
  import { envForMode } from '@modulus-learning/host-tanstack-start/config/fixtures/mode-env'
  const env = {
    ...envForMode('all-in-one'),
    JOB_QUEUE_ENABLED: 'false',
    NODE_ENV: 'production',
    // Never a developer database: core startup is not exercised here yet.
    POSTGRES_CONNECTION_STRING: 'postgres://none:none@127.0.0.1:1/fixture_test',
  }
  console.log(Object.entries(env).map(([k, v]) => k + '=' + v).join('\\n'))
" > .env.fixture

echo "── boot"
PORT="$PORT" node --env-file=.env.fixture .output/server/index.mjs >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -sf "localhost:${PORT}/routes/elb-status" >/dev/null && break
  sleep 0.5
done

echo "── packaged handlers"
curl -sf "localhost:${PORT}/routes/elb-status" | grep -q '"mode":"all-in-one"' \
  || { echo "packaged elb-status handlers failed" >&2; exit 1; }

echo "── packaged server function (SSR)"
SITE_NAME="$(grep '^VITE_SITE_NAME=' .env.fixture | cut -d= -f2-)"
curl -sf "localhost:${PORT}/" | grep -q "$SITE_NAME" \
  || { echo "home page did not render the server function result" >&2; exit 1; }
curl -sf "localhost:${PORT}/" | grep -q 'gradient-glow' \
  || { echo "home page did not render the packaged component" >&2; exit 1; }

echo "── packaged server function (RPC)"
# The client bundle carries one stub per reachable server function; the root
# config function is the one whose result names the site.
RPC_OK=0
for FN_ID in $(grep -ohE '[a-f0-9]{64}' .output/public/assets/*.js | sort -u); do
  for METHOD in GET POST; do
    if curl -sf -X "$METHOD" "localhost:${PORT}/_serverFn/${FN_ID}" \
      -H "origin: http://localhost:${PORT}" -H 'sec-fetch-site: same-origin' \
      -H 'x-tsr-serverFn: true' -H 'accept: application/json' | grep -q 'siteName'; then
      RPC_OK=1
      break 2
    fi
  done
done
[ "$RPC_OK" -eq 1 ] || { echo "server function RPC failed" >&2; exit 1; }

echo "packed install passed"
