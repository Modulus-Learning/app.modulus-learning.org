#!/usr/bin/env bash
# Recreate the dedicated integration-test database using packages/core/.env.test.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/db_init.sh" --env-file "${SCRIPT_DIR}/../../.env.test" "$@"
