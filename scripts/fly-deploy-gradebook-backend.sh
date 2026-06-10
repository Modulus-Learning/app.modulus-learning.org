#!/usr/bin/env bash
set -euo pipefail

# Build (once) and deploy the BACKEND (admin + background jobs) gradebook app to Fly.io.
# DEPLOYMENT_MODE=admin / JOB_QUEUE_ENABLED=true come from fly-gradebook-backend.toml.
# Builds the shared image only if it isn't already present (REBUILD=1 forces); the
# frontend deploys the same image via fly-deploy-gradebook-frontend.sh.
# Extra args are forwarded to `fly deploy`. See docs/DEPLOYMENT.md.

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./fly-gradebook-image.sh
source "${SCRIPT_DIR}/fly-gradebook-image.sh"

build_image
deploy_app "${REPO_ROOT}/fly-gradebook-backend.toml" "$@"
