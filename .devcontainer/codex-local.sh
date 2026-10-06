#!/usr/bin/env bash
set -euo pipefail

: "${virtual_key:?Set virtual_key in the host environment before opening the dev container}"
codex_upstream_authorization="$(python -c 'import json; print(json.load(open("/root/.codex/auth.json"))["tokens"]["access_token"])')"
export codex_upstream_authorization

exec codex exec --ignore-user-config \
  -c 'model_provider="local"' \
  -c 'model="gpt-6-luna"' \
  -c 'model_providers.local.name="LiteLLM local"' \
  -c 'model_providers.local.base_url="http://host.docker.internal:4001/codex"' \
  -c 'model_providers.local.wire_api="responses"' \
  -c 'model_providers.local.env_key="codex_upstream_authorization"' \
  -c 'model_providers.local.env_http_headers={"x-litellm-api-key"="virtual_key"}' \
  "$@"
