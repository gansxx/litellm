---
date: 2026-10-06
topic: Codex local credentials through LiteLLM /codex pass-through
status: local endpoint configured and real client request verified
---

# Codex local credential pass-through

## Configuration

The local LiteLLM service is built from this checkout and exposed directly on host port `4001`. The existing gateway on port `4000` remains unchanged because its Nginx upstream points to a different Tailscale-hosted proxy

The local database now has `/codex` targeting `https://chatgpt.com/backend-api/codex`, with subpaths enabled, `forward_headers: true`, and authentication required. Its only configured header is `litellm_user_api_key: x-litellm-api-key`; it contains no upstream credential

The pass-through handler removes the configured LiteLLM key header before forwarding caller headers. Codex sends its local OAuth access token as `Authorization` and sends the LiteLLM key separately in `x-litellm-api-key`. `.devcontainer/codex-local.sh` uses host Codex `auth.json` mounted read-only into the client container and reads only its access token for the Codex process. The LiteLLM proxy does not read, persist, or inject that OAuth token

The Dev Container definition forwards port `4001` and mounts the host auth file read-only. Rebuild or reopen the current Dev Container to apply that mount. The already-running container used for verification did not have this mount, so the test supplied the access token only to the one Codex process

## Verification

- `docker compose -f docker-compose-ui-gateway.yaml build litellm` completed successfully
- The local proxy on port `4001` passed `/health/liveliness`
- Codex CLI `0.160.1` in the Dev Container made a real request through the local `/codex/responses` route using the host's current OAuth access token and received `CODEX_PROXY_OK`
- A source-mounted runtime smoke check verified that the mapped LiteLLM key header is removed while the local `Authorization` header remains, and that a `/codex/responses` request reads the configured key header
- `python -m compileall` and `bash -n .devcontainer/codex-local.sh` passed. Pytest could not load `tests/unit/conftest.py` in the host environment because `boto3` is missing

## Access-control limitation

The end-to-end request used the local proxy master key as the LiteLLM key header for verification. A short-lived `$0.25`, one-hour virtual key was also tested and deleted, but the request was denied because it had no `allowed_passthrough_routes` grant. Creating a key with that grant was rejected by this local installation's Enterprise license gate. Do not replace this with `auth: false`; provision a permitted key/team route grant or license before using a non-admin virtual key

The separate Tailscale proxy served through port `4000` returned `401` during the test. Its `/codex` configuration was also changed to remove its static upstream `Authorization` and use the mapped client key header, but that older runtime did not forward the caller `Authorization`. It now requires that proxy to be upgraded with this code before `/codex` there can work. The working local Codex base URL is `http://host.docker.internal:4001/codex`

## Files changed

`litellm/proxy/_types.py` exposes `forward_headers` for database-managed pass-through endpoints. Endpoint create/update now registers that setting. Authentication accepts the mapped key header for included subpaths. Header forwarding strips the mapped key from both direct and `x-pass-` headers

`.devcontainer/devcontainer.json`, `.devcontainer/codex-local.sh`, and `docker-compose-ui-gateway.yaml` provide the read-only local Codex credential mount, separate LiteLLM key header, and local API port `4001`
