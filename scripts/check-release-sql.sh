#!/usr/bin/env bash
# Compare released SQL paths and bytes, treating a rename as a deletion.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: bash scripts/check-release-sql.sh <previous-release-tag>" >&2
  exit 2
fi
cd "$(git rev-parse --show-toplevel)"
git rev-parse --verify "${1}^{commit}" >/dev/null
git diff --no-renames --exit-code --diff-filter=MDT "$1" -- \
  'packages/core/src/database/sql/[0-9]*.sql'
