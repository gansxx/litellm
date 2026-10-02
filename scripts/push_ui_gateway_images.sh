#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
branch_name=$(git branch --show-current)
branch_tag=$(printf '%s' "${branch_name:-detached}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_.-]/-/g')
commit_tag=$(git rev-parse --short=12 HEAD)
image_registry=${LITELLM_IMAGE_REGISTRY:-ghcr.io/gansxx}

build_and_push() {
  local image_name=$1
  local dockerfile=$2
  local image="${image_registry}/${image_name}"

  docker build \
    -f "${repo_root}/${dockerfile}" \
    -t "${image}:${branch_tag}-${commit_tag}" \
    -t "${image}:${branch_tag}-latest" \
    "${repo_root}"
  docker push "${image}:${branch_tag}-${commit_tag}"
  docker push "${image}:${branch_tag}-latest"
}

build_and_push litellm-proxy Dockerfile
build_and_push litellm-ui ui/Dockerfile
build_and_push litellm-gateway nginx/Dockerfile
