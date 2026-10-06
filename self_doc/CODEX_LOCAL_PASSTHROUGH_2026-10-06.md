---
date: 2026-10-06
topic: Codex local credentials through LiteLLM /codex pass-through
status: local virtual key and pass-through verified with a real upstream request
---

# Codex local credential pass-through

## Configuration

The local LiteLLM service is built from this checkout and exposed directly on host port `4000`. Docker Compose no longer publishes the Nginx service on that host port

The local database has `/codex` targeting `https://chatgpt.com/backend-api/codex`, with subpaths enabled, `forward_headers: true`, and authentication required. Its only configured header is `litellm_user_api_key: x-litellm-api-key`; it contains no upstream credential. The configured `desktop-linux` database hostname resolves to the local machine's Tailscale address, as confirmed by the user

The pass-through handler removes the configured LiteLLM key header before forwarding caller headers. Codex sends its local OAuth access token as `Authorization` and sends the LiteLLM key separately in `x-litellm-api-key`. `.devcontainer/codex-local.sh` reads the access token from the host Codex `auth.json` and the virtual key from a separate read-only mount. The LiteLLM proxy does not read, persist, or inject the OAuth token

The Dev Container definition forwards port `4000` and mounts the host auth file and virtual key read-only. Rebuild or reopen the current Dev Container to apply the new virtual-key mount. The existing container was not recreated in this turn; verification piped both local credentials to a one-off Codex process without persisting them in the container

The local proxy no longer applies the Enterprise metadata gate to `allowed_passthrough_routes`. Only proxy admins can set this field; the API and Dashboard both keep that role restriction

The key alias is `codex-local-passthrough-20261006`, with a 365-day lifetime and the `/codex` prefix grant. The key row is stored in the local LiteLLM database. Its plaintext is kept outside the repository at `/root/.codex/litellm_virtual_key` with mode `0600`

## Verification

- `docker compose -f docker-compose-ui-gateway.yaml build litellm ui` completed successfully and both services restarted healthy
- The local proxy on port `4000` passed `/health/liveliness`
- `/key/info` confirmed the generated key alias, expiry, and `/codex` metadata grant without exposing the key
- Codex CLI in the existing Dev Container made a real request through `host.docker.internal:4000/codex/responses` using the local OAuth access token and virtual key and returned `CODEX_VKEY_PASSTHROUGH_OK`
- A real streaming `POST /codex/responses` request using the local OAuth access token and virtual key returned HTTP 200 and contained `CODEX_VKEY_PASSTHROUGH_OK`
- An invalid upstream credential returned an upstream authentication error rather than a local pass-through-route denial
- The key creation and editing Dashboard integration suites passed: 185 tests passed and 3 existing tests were marked expected-fail. Dashboard production build and TypeScript checks passed
- `python -m compileall`, `bash -n .devcontainer/codex-local.sh`, JSON parsing, and `git diff --check` passed. Pytest could not run because pytest is not installed in the host or the existing Dev Container

## Access-control limitation

The generated virtual key is scoped to `/codex` and expires after 365 days. Keep its local file out of source control. The key-creation regression tests could not run because pytest is unavailable in this environment; the live API request exercised the generated key and route grant

The previous port `4000` Nginx-to-Tailscale topology is no longer published by this Compose file. This turn did not upgrade or validate any separate remote proxy. The local Codex base URL is `http://host.docker.internal:4000/codex`

## Files changed

`litellm/proxy/_types.py` exposes `forward_headers` for database-managed pass-through endpoints and treats `allowed_passthrough_routes` as a standard metadata field. Authentication accepts the mapped key header for included subpaths. Header forwarding strips the mapped key from both direct and `x-pass-` headers. Proxy-admin-only checks remain on virtual-key creation and update

`.devcontainer/devcontainer.json` and `.devcontainer/codex-local.sh` use read-only host mounts for the OAuth credential and virtual key. `docker-compose-ui-gateway.yaml` publishes LiteLLM directly on port `4000`
