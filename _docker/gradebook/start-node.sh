#!/bin/sh

# Starts the gradebook's Nitro server (TanStack Start). supervisord runs this
# and forwards TERM to Node, which drains background jobs and in-flight requests
# before exiting (see src/lib/shutdown.ts).

echo -e "\n==> Starting Node.js...."

# Exit on error, and echo commands to the log.
set -ex

# --max-old-space-size:
# Keep 768 if you want maximum performance and you've proven it never spikes near the ceiling.
# Use 704 as a "nearly the same, but safer" default.
# Use 640 if you want more safety margin against unknown client workloads / occasional SSR surprises.

cd /app/apps/gradebook
NODE_ENV=production \
PORT=3000 \
HOST=0.0.0.0 \
exec node --max-old-space-size="${NODE_MAX_OLD_SPACE_SIZE:-704}" .output/server/index.mjs
