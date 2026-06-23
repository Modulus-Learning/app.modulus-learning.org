#!/usr/bin/env bash
#
# Reset learner activity-state (progress, progress events, page state) for the
# demo activities so a manual end-to-end run starts from a clean slate.
#
# The reset is scoped by activity URL prefix, so the seeded load-test / Ximera
# data is left untouched.  By default it targets the agent-demo origin
# (http://localhost:5173/), which covers all calculus-1 lessons and the index.
#
# Usage:
#   ./postgres/reset-demo-progress.sh [url-prefix]
#
# Examples:
#   ./postgres/reset-demo-progress.sh
#   ./postgres/reset-demo-progress.sh http://localhost:5173/calculus-1/lesson-01
#
# Env overrides: MODULUS_PG_CONTAINER, POSTGRES_DATABASE, POSTGRES_USER,
# POSTGRES_PASSWORD.

set -euo pipefail

URL_PREFIX="${1:-http://localhost:5173/}"
CONTAINER="${MODULUS_PG_CONTAINER:-modulus_postgres}"
DB="${POSTGRES_DATABASE:-modulus_dev}"
DB_USER="${POSTGRES_USER:-modulus}"
DB_PASSWORD="${POSTGRES_PASSWORD:-modulus}"

echo "Resetting activity-state for activities matching: ${URL_PREFIX}%"

docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER" \
  psql -U "$DB_USER" -d "$DB" -v ON_ERROR_STOP=1 -v prefix="${URL_PREFIX}%" <<'SQL'
BEGIN;

DELETE FROM progress_events
 WHERE activity_id IN (SELECT id FROM activities WHERE url LIKE :'prefix');

DELETE FROM page_state
 WHERE activity_id IN (SELECT id FROM activities WHERE url LIKE :'prefix');

DELETE FROM progress
 WHERE activity_id IN (SELECT id FROM activities WHERE url LIKE :'prefix');

COMMIT;

SELECT a.url,
       (SELECT count(*) FROM progress p WHERE p.activity_id = a.id)        AS progress,
       (SELECT count(*) FROM progress_events e WHERE e.activity_id = a.id) AS events,
       (SELECT count(*) FROM page_state s WHERE s.activity_id = a.id)      AS page_state
  FROM activities a
 WHERE a.url LIKE :'prefix'
 ORDER BY a.url;
SQL

echo "Done."
