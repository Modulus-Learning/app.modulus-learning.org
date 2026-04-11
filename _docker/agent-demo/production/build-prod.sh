#!/bin/bash
VERSION=`cat ../../../VERSION`
echo "$VERSION"

params=("$@")

docker build \
  "${params[@]}" \
  --platform=linux/amd64 \
  --file Dockerfile \
  --build-arg VERSION=$VERSION \
  -t 280583594212.dkr.ecr.ap-southeast-1.amazonaws.com/modulus:agent-demo-$VERSION ../../../