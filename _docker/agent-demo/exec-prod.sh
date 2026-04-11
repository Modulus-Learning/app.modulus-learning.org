#!/bin/bash
docker compose --project-directory . --file _docker/agent-demo/production/docker-compose.yml --project-name modulus-agent-demo "$@"
