#!/bin/bash
VERSION=`cat ../../../VERSION`
echo "$VERSION"

params=("$@")

# Default to native platform for local builds; set DOCKER_PLATFORM=linux/amd64 for production
PLATFORM="${DOCKER_PLATFORM:-linux/$(uname -m | sed 's/arm64/arm64/' | sed 's/x86_64/amd64/')}"
echo "Building for platform: $PLATFORM"

docker build \
  "${params[@]}" \
  --platform="$PLATFORM" \
  --network=host \
  --file Dockerfile \
  --build-arg APP_VOLUME=/app/storage \
  --build-arg VERSION=$VERSION \
  --tag 783978313898.dkr.ecr.ap-southeast-1.amazonaws.com/modulus:app-$VERSION ../../../
