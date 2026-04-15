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
  --file Dockerfile \
  --build-arg VERSION=$VERSION \
  -t 280583594212.dkr.ecr.ap-southeast-1.amazonaws.com/modulus:agent-demo-$VERSION ../../../