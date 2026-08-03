#!/usr/bin/env bash
# Drop and recreate a local Modulus development or test database.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      if [[ $# -lt 2 ]]; then
        echo "--env-file requires a path" >&2
        exit 1
      fi
      ENV_FILE="$2"
      shift 2
      ;;
    --env-file=*)
      ENV_FILE="${1#*=}"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

: "${ENV_FILE:=${SCRIPT_DIR}/../../.env}"
export ENV_FILE

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

echo "Recreating database '${POSTGRES_DATABASE}' on ${POSTGRES_HOSTNAME}:${POSTGRES_PORT}."
echo "psql may prompt for the '${POSTGRES_ADMIN_USER}' administrator password."

sed -e "s|\${db_name}|${POSTGRES_DATABASE}|" \
  -e "s|\${db_user}|${POSTGRES_USER}|" \
  -e "s|\${db_pass}|${POSTGRES_PASSWORD_ESC}|" \
  "${SCRIPT_DIR}/db-reset.sql.template" \
  | psql \
      --host "${POSTGRES_HOSTNAME}" \
      --port "${POSTGRES_PORT}" \
      --username "${POSTGRES_ADMIN_USER}" \
      --dbname postgres \
      --set ON_ERROR_STOP=1 \
      --quiet
