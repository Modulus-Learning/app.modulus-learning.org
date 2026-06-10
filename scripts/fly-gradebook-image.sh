#!/usr/bin/env bash
# Shared build/deploy helpers for the Modulus gradebook Fly.io deploys.
# Sourced by fly-deploy-gradebook-{frontend,backend}.sh and fly-deploy-gradebook.sh
# -- not meant to be run directly.
#
# Build-once / deploy-twice: the frontend (DEPLOYMENT_MODE=frontend) and backend
# (DEPLOYMENT_MODE=admin) apps run the SAME image; the mode is purely a runtime env
# switch (see docs/DEPLOYMENT.md). build_image() builds a single local image and is
# a no-op if that image already exists, so running the two per-app scripts in
# sequence still builds only once (set REBUILD=1 to force a fresh build). Each
# deploy just retags that identical local image into the target app's Fly registry
# namespace and releases it -- no rebuild per app.

# Resolve repo root from this file's location (works whether sourced or executed).
_FLY_LIB_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "${_FLY_LIB_DIR}/.." && pwd)

# Read the release version (used in the image tag).
VERSION_FILE="${REPO_ROOT}/VERSION"
if [[ -f "${VERSION_FILE}" ]]; then
  VERSION=$(cat "${VERSION_FILE}")
else
  VERSION="unknown"
fi

# Single, app-agnostic local image tag shared by both deploys.
IMAGE_TAG="modulus-gradebook:deployment-${VERSION}"

# Build the shared image once. No-op if it already exists locally (REBUILD=1 forces).
# Using --network=host ensures reliable connectivity to registries
# (avoids ETIMEDOUT errors in Docker's default bridge network).
build_image() {
  if [[ "${REBUILD:-0}" != "1" ]] && docker image inspect "${IMAGE_TAG}" >/dev/null 2>&1; then
    echo "✅ Reusing existing image ${IMAGE_TAG} (set REBUILD=1 to force a rebuild)"
    return 0
  fi

  # Default to linux/amd64 for Fly deploy; override with DOCKER_PLATFORM for local testing.
  local platform="${DOCKER_PLATFORM:-linux/amd64}"
  echo "🔨 Building image: ${IMAGE_TAG} (platform ${platform})"

  ( cd "${REPO_ROOT}" && DOCKER_BUILDKIT=1 docker build \
      --platform="${platform}" \
      --network=host \
      --file _docker/gradebook/production/Dockerfile \
      --build-arg APP_VOLUME=/app/storage \
      --build-arg VERSION="${VERSION}" \
      --build-arg IMAGE_VOLUME=/app/apps/gradebook/.next/cache/images \
      --tag "${IMAGE_TAG}" \
      . )
}

# Deploy the already-built shared image to one app, identified by a fly toml.
# Reads the app name from the toml, retags the shared image into that app's
# registry namespace, and releases it. Extra args are forwarded to `fly deploy`.
deploy_app() {
  local config="$1"; shift

  local app_name
  app_name=$(grep -m1 "^app " "${config}" | sed "s/^app[[:space:]]*=[[:space:]]*//;s/['\"]//g")
  if [[ -z "${app_name}" ]]; then
    echo "Error: Could not read app name from ${config}" >&2
    return 1
  fi

  local app_tag="registry.fly.io/${app_name}:deployment-${VERSION}"
  echo "🏷  Tagging ${IMAGE_TAG} -> ${app_tag}"
  docker tag "${IMAGE_TAG}" "${app_tag}"

  echo "🚀 Deploying ${app_name} from $(basename "${config}") (version ${VERSION})"
  ( cd "${REPO_ROOT}" && fly deploy \
      --config "${config}" \
      --image "${app_tag}" \
      --local-only \
      --wait-timeout 1000 \
      "$@" )
}
