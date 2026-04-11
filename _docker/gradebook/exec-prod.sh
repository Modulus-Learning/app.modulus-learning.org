#!/bin/bash
docker compose --project-directory . --file ./_docker/gradebook/production/docker-compose.yml --project-name modulus-app "$@"
