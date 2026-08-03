#!/usr/bin/env bash

# Shared configuration and safety checks for local database lifecycle scripts.
# Callers may set ENV_FILE before sourcing this file.

check_conf_var() {
  if [[ -z "${!1:-}" ]]; then
    echo "$1 not defined" >&2
    CONF_BAD=true
  fi
}

urldecode() {
  local encoded="$1"
  if [[ "${encoded}" =~ %([^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|[0-9A-Fa-f]?$) ]]; then
    echo "Malformed percent escape in PostgreSQL connection string" >&2
    return 1
  fi
  encoded="${encoded//\\/\\\\}"
  printf '%b' "${encoded//%/\\x}"
}

parse_pg_url() {
  local url="$1"
  if [[ "${url}" != postgres://* && "${url}" != postgresql://* ]]; then
    echo "POSTGRES_CONNECTION_STRING must start with postgres:// or postgresql://" >&2
    CONF_BAD=true
    return
  fi

  local rest="${url#*://}"
  if [[ "${rest}" != *@* ]]; then
    echo "POSTGRES_CONNECTION_STRING must contain user:password@" >&2
    CONF_BAD=true
    return
  fi

  # Split on the last @ so a percent-decoded password may contain @.
  local userinfo="${rest%@*}"
  local hostpart="${rest##*@}"
  if [[ "${userinfo}" != *:* || "${hostpart}" != */* ]]; then
    echo "POSTGRES_CONNECTION_STRING must contain user:password@host/database" >&2
    CONF_BAD=true
    return
  fi

  POSTGRES_USER="$(urldecode "${userinfo%%:*}")" || { CONF_BAD=true; return; }
  POSTGRES_PASSWORD="$(urldecode "${userinfo#*:}")" || { CONF_BAD=true; return; }

  local hostport="${hostpart%%/*}"
  local dbpath="${hostpart#*/}"
  if [[ "${hostport}" == *:* ]]; then
    POSTGRES_HOSTNAME="${hostport%%:*}"
    POSTGRES_PORT="${hostport#*:}"
  else
    POSTGRES_HOSTNAME="${hostport}"
    POSTGRES_PORT=5432
  fi
  POSTGRES_DATABASE="${dbpath%%\?*}"
}

check_safe_database_name() {
  if [[ "${POSTGRES_DATABASE}" != *_dev && "${POSTGRES_DATABASE}" != *_test ]]; then
    echo "Refusing to operate on database '${POSTGRES_DATABASE}'." >&2
    echo "Database lifecycle scripts only accept names ending in '_dev' or '_test'." >&2
    CONF_BAD=true
  fi
}

check_identifier() {
  local label="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "${label} must be a simple PostgreSQL identifier: '${value}'" >&2
    CONF_BAD=true
  fi
}

: "${ENV_FILE:=../../.env}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
else
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

CONF_BAD=false
check_conf_var POSTGRES_CONNECTION_STRING
if ${CONF_BAD}; then exit 1; fi

parse_pg_url "${POSTGRES_CONNECTION_STRING}"
if ${CONF_BAD}; then exit 1; fi

check_conf_var POSTGRES_USER
check_conf_var POSTGRES_PASSWORD
check_conf_var POSTGRES_HOSTNAME
check_conf_var POSTGRES_PORT
check_conf_var POSTGRES_DATABASE
check_safe_database_name
check_identifier POSTGRES_USER "${POSTGRES_USER}"
check_identifier POSTGRES_DATABASE "${POSTGRES_DATABASE}"
if ${CONF_BAD}; then exit 1; fi

POSTGRES_ADMIN_USER="${POSTGRES_ADMIN_USER:-postgres}"
check_identifier POSTGRES_ADMIN_USER "${POSTGRES_ADMIN_USER}"
if ${CONF_BAD}; then exit 1; fi

# Escape the password first as a PostgreSQL string literal, then for a sed
# replacement delimited by `|`. Identifiers are restricted to safe characters.
POSTGRES_PASSWORD_ESC=$(printf '%s' "${POSTGRES_PASSWORD}" | sed -e "s/'/''/g" -e 's/[\\&|]/\\&/g')
