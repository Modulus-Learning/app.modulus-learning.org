#!/bin/sh

# https://github.com/Supervisor/supervisor/issues/122#issuecomment-1019548776
# Hacky - but we want to give the node process above time to start, as well as
# retrieve the AWS AZ in the start-node.sh script

echo -e "\n==> Starting nginx wrapper..."

# Wait for local Node.js to respond on port 3000
echo "Waiting for Node.js to accept connections..."
# Wait up to 30 seconds (60 * 0.5s) then fail fast.
attempt=0
until nc -z 127.0.0.1 3000; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Node.js did not become ready on 127.0.0.1:3000 within 30s; exiting." >&2
    exit 1
  fi
  sleep 0.5
done
echo "Node.js is up. Starting Nginx."

nginx -g "daemon off;"