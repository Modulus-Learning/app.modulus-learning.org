#!/bin/sh

# This file is how Fly starts the server (configured in fly.toml). Before starting
# the server though, we need to run any prisma migrations that haven't yet been
# run, which is why this file exists in the first place.
# Learn more: https://community.fly.io/t/sqlite-not-getting-setup-properly/4386

# migrate deploy will apply migrations
# npx prisma migrate deploy
# migrate reset will apply migrations and seeds

echo -e "\n==> Starting Node.js...."

# allow non-zero return values - the bash script will not exit on error
# set +e
# Grab an IMDSv2 token
# TOKEN=`curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"`
# Using that token, get the AZ.  Note the use of back ticks to call curl, and the variable name
# INSTANCE_AZ=`curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/availability-zone`
# echo $INSTANCE_AZ

# echo $ECS_CONTAINER_METADATA_FILE

# return to exit on error (non-zero exit value) and debug to show our app logs?
set -ex

# standard flags:
# --max-old-space-size
# Keep 768 if you want maximum performance and you’ve proven it never spikes near the ceiling.
# Use 704 as a “nearly the same, but safer” default.
# Use 640 if you want more safety margin against unknown client workloads / occasional SSR surprises.

cd /app/apps/gradebook
NEW_RELIC_APP_NAME='Modulus Gradebook' \
NODE_ENV=production \
PORT=3000 \
HOSTNAME=0.0.0.0 \
exec node --max-old-space-size="${NODE_MAX_OLD_SPACE_SIZE:-704}" server.js
# exec node --max-old-space-size="${NODE_MAX_OLD_SPACE_SIZE:-704}" -r newrelic server.js
