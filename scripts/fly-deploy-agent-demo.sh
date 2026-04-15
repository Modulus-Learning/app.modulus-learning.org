#!/usr/bin/env bash
set -euo pipefail

# This script builds the Docker image locally (with --network=host for reliable
# package downloads) and then deploys the pre-built image to Fly.io.
# It supports additional fly deploy flags via "$@".

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT="${SCRIPT_DIR}/.."

# 1. Read Version
VERSION_FILE="${REPO_ROOT}/VERSION"
if [[ -f "${VERSION_FILE}" ]]; then
  VERSION=$(cat "${VERSION_FILE}")
else
  VERSION="unknown"
fi

# 2. Build Docker image locally
# Using --network=host ensures reliable connectivity to registries
# (avoids ETIMEDOUT errors in Docker's default bridge network).
FLY_CONFIG="${REPO_ROOT}/fly-agent-demo.toml"
APP_NAME=$(grep -m1 "^app " "${FLY_CONFIG}" | sed "s/^app[[:space:]]*=[[:space:]]*//;s/['\"]//g")
if [[ -z "${APP_NAME}" ]]; then
  echo "Error: Could not read app name from ${FLY_CONFIG}" >&2
  exit 1
fi
IMAGE_TAG="registry.fly.io/${APP_NAME}:deployment-${VERSION}"

cd "${REPO_ROOT}"

echo "🔨 Building image: ${IMAGE_TAG}"

# Default to linux/amd64 for Fly deploy; override with DOCKER_PLATFORM for local testing
PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
echo "Building for platform: $PLATFORM"

DOCKER_BUILDKIT=1 docker build \
  --platform="$PLATFORM" \
  --network=host \
  --file _docker/agent-demo/production/Dockerfile \
  --tag "${IMAGE_TAG}" \
  .

# 3. Deploy pre-built image to Fly.io
echo "🚀 Deploying version: ${VERSION}"

exec fly deploy \
  --config fly-agent-demo.toml \
  --local-only \
  --wait-timeout 1000 \
  --image "${IMAGE_TAG}" \
  "$@"