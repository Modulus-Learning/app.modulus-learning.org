---
title: "Migrating the Production Database"
path: "database-migration"
summary: "Move the gradebook database between Neon projects with a rehearsed restore, a maintenance window for both Fly apps, private production backups, verified data, and a single background worker."
---

# Migrating the Production Database

Use this recipe when moving the gradebook database to another Neon project.
Both Fly apps share `POSTGRES_CONNECTION_STRING`, so you must switch the learner
frontend and administrative backend together.

## Assumptions

You have authenticated Neon and Fly CLIs, PostgreSQL 18 client tools, and an
approved maintenance window. Use a direct Neon endpoint for administrative
commands and the application connection. A direct hostname omits `-pooler`.

The backend runs the [score-submission worker](./LTI-SCORE-SUBMISSION.md).
Keep exactly one backend machine; frontend machines must have
`JOB_QUEUE_ENABLED=false`. See [Deployment](./DEPLOYMENT.md) for the runtime modes.

Production backups belong in the ignored `postgres/backups/` directory. Keep
credentials in private files or a password manager, outside command history and
tracked documentation. The active URL in `apps/gradebook/.env` can remain the
local Docker database; label production URLs as comments for reference.

## Prepare and Rehearse

1. Inventory both Fly apps, saving their machine configurations, image names,
   original states, autostart settings and secret digests in a private directory.
   Include stopped frontend machines: they can start when traffic arrives.

   ```sh
   umask 077
   mkdir -p postgres/backups
   chmod 700 postgres/backups
   neon projects list
   neon branches list --project-id "$SOURCE_PROJECT"
   neon databases list --project-id "$SOURCE_PROJECT" --branch "$SOURCE_BRANCH"
   fly status --app "$FRONTEND_APP" --json > "$PRIVATE_DIR/frontend-before.json"
   fly status --app "$BACKEND_APP" --json > "$PRIVATE_DIR/backend-before.json"
   ```

   The uppercase variables in these commands refer to your deployment inventory.
   Save each machine's `config` object separately for `--machine-config` later.
   Retrieve URLs with `neon connection-string`, redirecting them to private files.

2. Create a dedicated login role through SQL on the destination project, with
   `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. Generate a
   fresh password privately. SQL-created roles avoid the elevated membership
   given to roles created through the Neon management API.

   ```sh
   neon databases create --project-id "$TARGET_PROJECT" \
     --branch "$TARGET_BRANCH" --name "$TARGET_DATABASE" \
     --owner-name "$TARGET_ROLE"
   ```

   As the database owner, run `REVOKE CONNECT, TEMPORARY ON DATABASE` for the new
   database `FROM PUBLIC`. Check that the role can connect only to its intended
   application database among the agency databases. Other agency databases must
   also revoke public connection privileges for this isolation to hold.

3. Rehearse a custom-format dump and restore into the new, unused database.
   Supply `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` and
   `PGSSLMODE=require` privately for each command.

   ```sh
   # Source connection environment.
   pg_dump --format=custom --no-owner --no-acl --file="$REHEARSAL_DUMP"
   # Destination connection environment.
   pg_restore --no-owner --no-acl --exit-on-error --single-transaction \
     --dbname="$TARGET_DATABASE" "$REHEARSAL_DUMP"
   ```

   Compare every application table's row count and content fingerprint, sequence
   definitions and values, schema, constraints and object owners. Include the
   `drizzle` schema as well as `public`. For a changing source, hold an exported
   PostgreSQL snapshot open and use the same snapshot for the dump and table
   fingerprints; sequence values require a quiet source for exact comparison.
   Record aggregate results, never learner records, in the migration report.

## Copy During Maintenance

1. Disable autostart on every frontend machine and stop them. Preserve the
   backend's existing disabled-autostart setting. Wait for pending submissions
   and active leases to drain before stopping the single backend machine.

   ```sh
   fly machine update "$MACHINE_ID" --app "$FRONTEND_APP" \
     --autostart=false --skip-start --yes
   fly machine stop "$MACHINE_ID" --app "$FRONTEND_APP" --timeout 30
   ```

   Repeat for each frontend machine, including stopped standbys. Check the queue
   using aggregate counts only:

   ```sql
   SELECT
     count(*) FILTER (WHERE submission_lease_expires_at > now()) AS active_leases,
     count(*) FILTER (
       WHERE dead_at IS NULL AND submittable_progress > submitted_progress
     ) AS pending
   FROM lti_lineitems;
   ```

   If the queue does not drain, investigate before proceeding. Confirm all
   machines are stopped with autostart disabled.

2. Set the source login role's `default_transaction_read_only` to `on`, then
   terminate its remaining sessions in the source database. This is a recovery
   guard, not a security boundary: a session can override the default. Verify a
   new connection reports `SHOW default_transaction_read_only` as `on`.

3. Take the final dump, with a timestamp in the filename, and save its checksum.
   Run these commands with the source connection environment:

   ```sh
   BACKUP="postgres/backups/modulus_gradebook_production_$(date +%Y%m%d_%H%M%S).dump"
   pg_dump --format=custom --no-owner --no-acl --file="$BACKUP"
   chmod 600 "$BACKUP"
   shasum -a 256 "$BACKUP" > "$BACKUP.sha256"
   ```

4. Restore over the disposable rehearsal copy, using the destination connection
   environment. This command replaces objects in that destination database;
   confirm `PGHOST` and `PGDATABASE` identify the new gradebook database first.

   ```sh
   pg_restore --clean --if-exists --no-owner --no-acl \
     --exit-on-error --single-transaction --dbname="$TARGET_DATABASE" "$BACKUP"
   psql -X -v ON_ERROR_STOP=1 -c 'ANALYZE;'
   ```

   Repeat the data, sequence and schema comparisons before starting either app.
   Save the verification evidence next to the backup in an ignored directory.

## Switch Both Apps

Stage `POSTGRES_CONNECTION_STRING` in **both** Fly apps through standard input.
A private file containing the new URL avoids putting its password in arguments:

```sh
python3 - "$TARGET_URL_FILE" <<'PY' | fly secrets import --app "$APP" --stage
import sys
from pathlib import Path
print('POSTGRES_CONNECTION_STRING=' + Path(sys.argv[1]).read_text().strip())
PY
```

Repeat for the frontend and backend. Restore each machine's saved configuration
with `fly machine update --machine-config`, preserving its image, runtime mode,
job setting and original autostart behaviour. Apply the secret to stopped standby
machines too. Start the single backend and the previously running frontend.
Restoring frontend autostart can itself allow requests to start a machine, so do
this only after final data verification and secret staging.

```sh
fly machine update "$MACHINE_ID" --app "$APP" \
  --machine-config "$SAVED_CONFIG" --skip-start --yes
fly machine start "$MACHINE_ID" --app "$APP"
fly secrets deploy --app "$APP"
fly secrets list --app "$APP"
```

Finalise staged secrets for both apps and check the status is `Deployed`.
`fly secrets deploy` can restart machines; recheck their states afterwards.
Keep the backend at exactly one running machine. Preserve the frontend's
original standby behaviour. A database move does not require rebuilding images.

## Verify and Retain Recovery Data

Confirm each running app reports the new host, database and role without
printing the password. Check `/routes/elb-status` on both services, the public
homepage and sign-in page, and the admin sign-in redirect. Verify the backend
worker started and frontend workers remain disabled. Recheck the queue, database
connections and other applications sharing the Neon compute.

Keep the old project and final dump until you have completed acceptance checks.
Set the old endpoint's idle timeout and suspend it once no application uses it:

```sh
neon api "/projects/$SOURCE_PROJECT/endpoints/$SOURCE_ENDPOINT" \
  -X PATCH -F endpoint.suspend_timeout_seconds=300
neon api "/projects/$SOURCE_PROJECT/endpoints/$SOURCE_ENDPOINT/suspend" -X POST
```

Confirm the endpoint becomes idle. Reconnecting to the old database wakes it.
These checks do not establish that an authenticated Learning Tools
Interoperability (LTI) launch or real grade passback succeeded; record those as
separate acceptance checks when you have a suitable test account and activity.

## Recovery

If failure occurs before either app writes to the destination, keep both apps
stopped, restore their source secrets and original configurations, reset the
source role's read-only default, and restart the original machines. To reset
that default, connect with `PGOPTIONS='-c default_transaction_read_only=off'`
and run `ALTER ROLE` for the source role with `RESET default_transaction_read_only`.

After destination writes begin, switching back to the old URL would discard new
work. Stop both apps and reconcile or copy those writes before changing secrets.
Keep the final backup, checksums, original machine configurations and migration
record private; the repository is public.

## Where to go next

- [Deployment](./DEPLOYMENT.md) explains the frontend and backend runtime modes.
- [LTI Score Submission](./LTI-SCORE-SUBMISSION.md) describes the grade-passback worker.
- [Security & Privacy](./SECURITY-AND-PRIVACY.md) explains the data-handling boundaries.
