#!/usr/bin/env bash
#
# check-packages.sh — pack every package in the lockstep publish set
# (`fixed[0]` in .changeset/config.json) and check each tarball as a consumer
# receives it: publint for manifest/exports/files problems, and
# arethetypeswrong for type resolution (ESM-only: these packages ship no CJS).
# Expects the packages to be built.
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

DIRS="$(node -e "
const fs = require('fs'), path = require('path')
const fixed = JSON.parse(fs.readFileSync('.changeset/config.json', 'utf8')).fixed[0]
for (const root of ['packages', 'apps']) for (const d of fs.readdirSync(root)) {
  const pj = path.join(root, d, 'package.json')
  if (fs.existsSync(pj) && fixed.includes(require(path.resolve(pj)).name)) console.log(path.join(root, d))
}")"

for dir in $DIRS; do
  (cd "$dir" && pnpm pack --pack-destination "$OUT" >/dev/null)
done

# Entry points with no types by design: the agent's `./browser` build is a
# standalone script for a <script> tag, and the host's `./styles.css` is a
# stylesheet; neither is a JavaScript import.
attw_args() {
  case "$(basename "$1")" in
    modulus-learning-agent-*) echo "--exclude-entrypoints ./browser" ;;
    modulus-learning-host-tanstack-start-*) echo "--exclude-entrypoints ./styles.css" ;;
  esac
}

# Repository-only files that must never ship: tests, test support, fixtures,
# and the development seeds (which delete data).
FORBIDDEN='\.(test|itest)(\.node)?\.(js|d\.ts)|/test-support/|/fixtures/|/database/seeds/'

status=0
for tgz in "$OUT"/*.tgz; do
  echo "── $(basename "$tgz")"
  if tar -tzf "$tgz" | grep -qE "$FORBIDDEN"; then
    echo "repository-only files in the archive:"
    tar -tzf "$tgz" | grep -E "$FORBIDDEN" | head -20
    status=1
  fi
  pnpm exec publint run "$tgz" --level warning | tail -n +4 || status=1
  # shellcheck disable=SC2046
  if pnpm exec attw "$tgz" --profile esm-only $(attw_args "$tgz") >/dev/null 2>&1; then
    echo "types resolve"
  else
    pnpm exec attw "$tgz" --profile esm-only $(attw_args "$tgz")
    status=1
  fi
done
exit "$status"
