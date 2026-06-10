#!/usr/bin/env bash
# Shared build/deploy helpers for the Modulus gradebook Fly.io deploys.
# Sourced by fly-deploy-gradebook-{frontend,backend}.sh and fly-deploy-gradebook.sh
# -- not meant to be run directly.
#
# Build-once / deploy-twice: the frontend (DEPLOYMENT_MODE=frontend) and backend
# (DEPLOYMENT_MODE=admin) apps run the SAME image; the mode is purely a runtime env
# switch (see docs/DEPLOYMENT.md). build_image() builds a single local image; both
# deploys retag that identical image into each app's Fly registry namespace and
# release it -- no per-app rebuild. Within one invocation build_image is called
# once, so the two-app deploy still builds only once. build_image always runs
# `docker build` and relies on Docker's layer cache to keep an unchanged rebuild
# fast, so a deploy can never ship stale code under the reused image tag.

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

# Build the shared image. Always runs `docker build`; Docker's layer cache keeps a
# rebuild with no source changes cheap, while guaranteeing a deploy never ships
# stale code under the reused "${IMAGE_TAG}" tag.
# Using --network=host ensures reliable connectivity to registries
# (avoids ETIMEDOUT errors in Docker's default bridge network).
build_image() {
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
