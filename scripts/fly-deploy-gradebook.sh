#!/usr/bin/env bash
set -euo pipefail

# Build the gradebook image ONCE and deploy it to BOTH Fly apps -- the frontend
# (DEPLOYMENT_MODE=frontend) and the backend (DEPLOYMENT_MODE=admin). Both run the
# identical image; the mode is a runtime env switch (see docs/DEPLOYMENT.md).
# Extra args are forwarded to each `fly deploy` (e.g. --build-only is NOT useful
# here; use the per-app scripts to deploy a single app). REBUILD=1 forces a rebuild.

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./fly-gradebook-image.sh
source "${SCRIPT_DIR}/fly-gradebook-image.sh"

build_image
deploy_app "${REPO_ROOT}/fly-gradebook-frontend.toml" "$@"
deploy_app "${REPO_ROOT}/fly-gradebook-backend.toml" "$@"
