---
title: Local Codex Dev Container and Pass Through Verification
date: 2026-10-06
timezone: Asia/Shanghai
repository: /root/git_repo/litellm
branch: feat/ui-availability-container
status: dev container enabled, upstream authentication rejected
---

# Local Codex Dev Container and Pass Through Verification

## Environment

Extended the existing `.devcontainer` setup with the official `@openai/codex` CLI at version `0.160.1`. The container uses Node `24.14.1` and npm `11.11.0`, exposes the host gateway as `host.docker.internal`, and receives `virtual_key` from the host environment at runtime. The container runs as root because the mounted workspace is root-owned in this environment

The running container reports:

```text
node v24.14.1
npm 11.11.0
codex-cli 0.160.1
virtual_key_present=yes
host.docker.internal resolves to 172.17.0.1
GET http://host.docker.internal:4000/health/liveliness -> 200
```

`.devcontainer/codex-local.sh` selects the local provider and points it at the host's `/codex` endpoint. To use it inside the dev container:

```bash
bash .devcontainer/codex-local.sh --ephemeral --json 'Reply with exactly: local provider pass-through ok'
```

The host process that opens the Dev Container must inherit `virtual_key`; the value is not stored in this repository

## Live request result

The local `/codex` endpoint is configured for `https://chatgpt.com/backend-api/codex`, includes subpaths, requires LiteLLM authentication, and has an upstream `Authorization` header configured. The validation team `local-allowed-passthrough-routes` retains its `/codex` grant

The host's existing `virtual_key` was not accepted for this proxy. A temporary one-hour validation key was generated for the allowed team with a `$0.25` budget and supplied to Codex through stdin. Codex then sent requests to `/codex/responses`; the endpoint returned `401 Unauthorized` with a Cloudflare request ID. This confirms the container, Codex provider config, route authorization, and forwarding path reach the configured upstream. The upstream rejected its authentication before returning a Codex response

The temporary validation key was deleted after the attempt. The persisted team grant was not changed. No credentials or response headers containing credentials were recorded here

The configured upstream authorization value is stored in the local proxy configuration. Its content was not printed or modified. A successful completion still requires an upstream credential that the ChatGPT Codex endpoint accepts

## Repository changes

- `.devcontainer/devcontainer.json` pins Node `24.14.1`, maps `host.docker.internal`, forwards the host `virtual_key` into remote processes, and selects the root remote user for the root-owned workspace
- `.devcontainer/devcontainer-lock.json` pins the resolved Node and Docker-in-Docker Dev Container features
- `.devcontainer/post-create.sh` installs the official Codex CLI at `0.160.1`
- `.devcontainer/codex-local.sh` runs Codex against the local LiteLLM `/codex` route

The first container initialization exposed the workspace ownership mismatch and the dashboard's Node version requirement. Both were fixed before the successful container build. `npm ci` completed and reported eight dependency audit advisories; package versions were not changed
