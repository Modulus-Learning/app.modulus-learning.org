#!/usr/bin/env bash
set -euo pipefail

# Build (once) and deploy the FRONTEND (learner / LTI) gradebook app to Fly.io.
# DEPLOYMENT_MODE=frontend / JOB_QUEUE_ENABLED=false come from fly-gradebook-frontend.toml.
# Builds the shared image (always; Docker's layer cache keeps unchanged rebuilds
# fast); the admin backend deploys the same image via fly-deploy-gradebook-backend.sh.
# Extra args are forwarded to `fly deploy`. See docs/DEPLOYMENT.md.

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./fly-gradebook-image.sh
source "${SCRIPT_DIR}/fly-gradebook-image.sh"

build_image
deploy_app "${REPO_ROOT}/fly-gradebook-frontend.toml" "$@"
