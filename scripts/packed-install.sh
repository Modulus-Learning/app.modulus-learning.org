#!/usr/bin/env bash
#
# packed-install.sh — install the packed Modulus packages into the minimal host
# fixture outside the workspace, build it, boot it, and check what a downstream
# would receive. See specs/2026-10-28-modulus-packaging-and-distribution-spec.md.
#
# Usage: ./scripts/packed-install.sh [port]
#
# Set FIXTURE_DATABASE_URL to an empty PostgreSQL database whose name ends in
# `_test` to also check real core startup: `modulus db init` from the packed
# core, then an `admin` instance with background jobs and the enforced schema
# check. Without it, the fixture's database is unreachable and core startup is
# skipped.
#
set -euo pipefail

PORT="${1:-3199}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PACKED="${REPO_ROOT}/.packed"
FIXTURE="${REPO_ROOT}/fixtures/host-minimal"
SERVER_PID=""
LOG="$(mktemp)"

stop_server() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}
trap 'stop_server; rm -f "$LOG"' EXIT

fail() {
  echo "$*" >&2
  exit 1
}

mkdir -p "$PACKED"
rm -f "$PACKED"/*.tgz

echo "── build and pack"
for pkg in lti lms-canvas core host-tanstack-start; do
  pnpm -F "@modulus-learning/${pkg}" build >/dev/null
  (cd "${REPO_ROOT}/packages/${pkg}" && pnpm pack --pack-destination "$PACKED" >/dev/null)
done

for tgz in "$PACKED"/*.tgz; do
  if tar -xzO -f "$tgz" package/package.json | grep -q '"workspace:'; then
    fail "WORKSPACE LEAK in $(basename "$tgz")"
  fi
done

# The fixture depends on version-less tarball names, so a version bump never
# requires editing it.
for tgz in "$PACKED"/*-[0-9]*.tgz; do
  cp "$tgz" "$(echo "$tgz" | sed -E 's/-[0-9][^/]*\.tgz$/.tgz/')"
done

echo "── install and build the fixture"
cd "$FIXTURE"
rm -rf .output
pnpm install --force --prefer-offline >/dev/null
pnpm build > "$LOG" 2>&1 || { cat "$LOG" >&2; fail "fixture build failed"; }

echo "── packaged styles"
# `.gradient-glow` comes from a CSS file a packaged component imports; `flex-1`
# appears only in packaged components, so it proves Tailwind scanned the package.
for selector in '.gradient-glow' '.flex-1'; do
  grep -q -- "$selector" .output/public/assets/*.css || fail "missing $selector in the client CSS"
done

echo "── client isolation"
# Server-only code the fixture reaches only through packaged server functions,
# handlers and entry helpers: the host config loader, core's env mapping,
# native hashing, the CSP policy.
if grep -rlE "SESSION_SECRET|loadCoreConfigFromEnv|argon2|frame-ancestors" .output/public; then
  fail "server-only code found in client assets"
fi

# A complete synthetic environment for one deployment mode, from the packaged
# mode fixture, with optional overrides as KEY=VALUE arguments.
write_env() {
  local mode="$1"
  shift
  node --input-type=module -e "
    // Repository test support (not published); Node strips the TypeScript types.
    import { envForMode } from '${REPO_ROOT}/packages/host-tanstack-start/src/config/fixtures/mode-env.ts'
    const overrides = Object.fromEntries(process.argv.slice(1).map((pair) => {
      const at = pair.indexOf('=')
      return [pair.slice(0, at), pair.slice(at + 1)]
    }))
    const env = {
      ...envForMode('${mode}'),
      JOB_QUEUE_ENABLED: 'false',
      NODE_ENV: 'production',
      // Never a developer database unless one is passed explicitly. Without
      // one, core's schema check is off so the gating sections can boot.
      POSTGRES_CONNECTION_STRING: 'postgres://none:none@127.0.0.1:1/fixture_test',
      MODULUS_SCHEMA_CHECK: 'off',
      ...overrides,
    }
    console.log(Object.entries(env).map(([k, v]) => k + '=' + v).join('\\n'))
  " "$@" > .env.fixture
}

boot() {
  stop_server
  : > "$LOG"
  PORT="$PORT" node --env-file=.env.fixture .output/server/index.mjs > "$LOG" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do
    curl -sf "localhost:${PORT}/routes/elb-status" >/dev/null && return 0
    sleep 0.5
  done
  cat "$LOG" >&2
  fail "the fixture did not boot"
}

status_of() {
  curl -s -o /dev/null -w '%{http_code}' "localhost:${PORT}$1"
}

# POST status for every server function stub in the client bundle.
server_fn_statuses() {
  for id in $(grep -ohE '[a-f0-9]{64}' .output/public/assets/*.js | sort -u); do
    echo "$id $(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:${PORT}/_serverFn/${id}" \
      -H "origin: http://localhost:${PORT}" -H 'sec-fetch-site: same-origin' \
      -H 'x-tsr-serverFn: true' -H 'accept: application/json')"
  done
}

echo "── all-in-one: packaged handlers, server functions and pages"
write_env all-in-one
boot
curl -sf "localhost:${PORT}/routes/elb-status" | grep -q '"mode":"all-in-one"' \
  || fail "packaged elb-status handlers failed"
SITE_NAME="$(grep '^VITE_SITE_NAME=' .env.fixture | cut -d= -f2-)"
HOME_HTML="$(curl -sf "localhost:${PORT}/")"
echo "$HOME_HTML" | grep -q "$SITE_NAME" || fail "home page did not render the server function result"
echo "$HOME_HTML" | grep -q 'gradient-glow' || fail "home page did not render the packaged component"
[ "$(status_of /admin/sign-in)" = 200 ] || fail "packaged admin sign-in page did not render"

# The root config function is the stub whose result names the site; it is a
# GET function, so try both methods.
RPC_OK=0
for id in $(grep -ohE '[a-f0-9]{64}' .output/public/assets/*.js | sort -u); do
  for method in GET POST; do
    if curl -sf -X "$method" "localhost:${PORT}/_serverFn/${id}" \
      -H "origin: http://localhost:${PORT}" -H 'sec-fetch-site: same-origin' \
      -H 'x-tsr-serverFn: true' -H 'accept: application/json' | grep -q 'siteName'; then
      RPC_OK=1
      break 2
    fi
  done
done
[ "$RPC_OK" -eq 1 ] || fail "server function RPC failed"
server_fn_statuses > "$LOG.all-in-one"

echo "── frontend: admin surface denied"
write_env frontend
boot
[ "$(status_of /admin/sign-in)" = 404 ] || fail "frontend instance served an admin page"
[ "$(status_of /)" = 200 ] || fail "frontend instance did not serve the home page"
server_fn_statuses > "$LOG.frontend"
# An admin-gated function answers (with anything but 404) in all-in-one and
# is refused with 404 on a frontend instance.
DENIED="$(join "$LOG.all-in-one" "$LOG.frontend" | awk '$2 != 404 && $3 == 404' | wc -l)"
[ "$DENIED" -gt 0 ] || fail "no admin server function was refused on a frontend instance"
rm -f "$LOG.all-in-one" "$LOG.frontend"

echo "── admin: frontend surface denied"
write_env admin
boot
# An admin instance sends the apex to its sign-in page instead of serving it.
APEX="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "localhost:${PORT}/")"
case "$APEX" in
  "307 "*"/admin/sign-in") ;;
  *) fail "admin instance did not redirect the apex to /admin/sign-in (got: $APEX)" ;;
esac
[ "$(status_of /admin/sign-in)" = 200 ] || fail "admin instance did not serve the admin sign-in page"
curl -sf "localhost:${PORT}/routes/elb-status" | grep -q '"jobs":false' \
  || fail "admin instance reported background jobs with JOB_QUEUE_ENABLED=false"

echo "── enforced schema check against an unreachable database: no boot"
# Core initialises at boot in every mode, so a production instance that cannot
# pass the schema check must exit, never answer healthy (frontend included).
for mode in frontend admin; do
  write_env "$mode" MODULUS_SCHEMA_CHECK=enforce
  stop_server
  : > "$LOG"
  PORT="$PORT" node --env-file=.env.fixture .output/server/index.mjs > "$LOG" 2>&1 &
  SERVER_PID=$!
  HEALTHY=0
  for _ in $(seq 1 40); do
    kill -0 "$SERVER_PID" 2>/dev/null || break
    curl -sf "localhost:${PORT}/routes/elb-status" >/dev/null 2>&1 && HEALTHY=1
    sleep 0.5
  done
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    cat "$LOG" >&2
    fail "a $mode instance kept running despite failing the schema check"
  fi
  wait "$SERVER_PID" && fail "a $mode instance exited cleanly despite failing the schema check"
  SERVER_PID=""
  [ "$HEALTHY" -eq 0 ] || fail "a $mode instance answered healthy despite failing the schema check"
  grep -q 'core failed to initialise' "$LOG" || { cat "$LOG" >&2; fail "no fatal log from the $mode instance"; }
done

if [ -n "${FIXTURE_DATABASE_URL:-}" ]; then
  echo "── core startup against a fresh database"
  case "$FIXTURE_DATABASE_URL" in
    *_test) ;;
    *) fail "FIXTURE_DATABASE_URL must name a database ending in _test" ;;
  esac
  pnpm exec modulus db init --database-url "$FIXTURE_DATABASE_URL" >/dev/null
  pnpm exec modulus db status --database-url "$FIXTURE_DATABASE_URL" >/dev/null \
    || fail "schema not current after db init"
  write_env admin \
    "POSTGRES_CONNECTION_STRING=${FIXTURE_DATABASE_URL}" \
    JOB_QUEUE_ENABLED=true \
    MODULUS_SCHEMA_CHECK=enforce
  boot
  for _ in $(seq 1 40); do
    grep -q 'housekeeping: pass complete' "$LOG" && break
    grep -q 'background jobs failed to start' "$LOG" && break
    sleep 0.5
  done
  grep -q 'housekeeping: pass complete' "$LOG" || { cat "$LOG" >&2; fail "core did not start"; }
  curl -sf "localhost:${PORT}/routes/elb-status" | grep -q '"jobs":true' \
    || fail "admin instance with jobs did not report them"
else
  echo "── core startup skipped (set FIXTURE_DATABASE_URL to an empty *_test database)"
fi

stop_server
echo "packed install passed"
