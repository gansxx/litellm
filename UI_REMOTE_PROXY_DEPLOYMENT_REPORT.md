# Local UI and Nginx with Remote LiteLLM Test

## Result

The split deployment is running. LiteLLM was stopped and recreated on `usdatacore` with `docker-compose-ghcr-us.yaml`; the only application service there is `litellm-1`. Local Docker runs only `ui` and `nginx` from `docker-compose-ui-gateway.yaml`. Nginx proxies non-UI paths to `100.117.40.15:4000`, the Tailscale address of the remote LiteLLM service

The local Nginx health endpoint returned `ok`, the proxied `/health/liveliness` endpoint returned `"I'm alive!"`, and the model-info API returned one model through both the local gateway and the direct remote endpoint. A browser login through `http://localhost:4000/ui/models-and-endpoints/` also completed successfully

## Measured Gateway Cost

Five local Nginx health requests completed in 0.466 to 1.480 seconds. Five direct requests to remote LiteLLM completed in 0.465 to 1.483 seconds. The local Nginx connection time was about 0.1 ms; direct remote connection time was usually about 231 ms. The total time is dominated by the inter-node Tailscale path and its variation, not by local Nginx

## Request and Data Flow

```text
Browser
  | static UI
  v
local Nginx -> local UI container
  | API, login, model management, inference
  v
remote LiteLLM -> remote PostgreSQL and provider APIs
```

The UI has no direct database connection. Its management actions call LiteLLM API endpoints through Nginx. LiteLLM persists models in `LiteLLM_ProxyModelTable` and credentials in `LiteLLM_CredentialsTable`, then serves later UI reads and inference routing from its backend state and database-backed registries. Model and credential edits therefore cross the inter-node link once on the request path and once on the response path; they do not add a browser-to-database hop

The current Nginx template serves `/ui` and static assets from the local UI container. It sends all other paths to `LITELLM_HOST`, so login, model lists, credentials, settings, logs, health checks, and completion requests all traverse the inter-node link to LiteLLM

## Pooler Assessment

A PostgreSQL pooler does not lower the latency measured above. It only changes the LiteLLM-to-PostgreSQL connection lifecycle. Because the UI never talks to PostgreSQL and the tested database is colocated with LiteLLM on `usdatacore`, a pooler cannot remove the UI/Nginx-to-LiteLLM network round trip

A pooler can help if the database is remote, connections are frequently created, or concurrent LiteLLM workers exhaust PostgreSQL connections. It can reduce connection setup work and improve throughput under contention. It cannot reduce the physical round-trip time of a query, provider call, or cross-node HTTP request. With a long-lived LiteLLM process and a colocated database, expect little or no user-visible latency improvement from adding one

## Placement Tradeoff

Keeping UI local and LiteLLM remote makes UI assets fast for local users, but every dynamic UI operation and every API request pays the inter-node hop. For streaming completions, that hop contributes directly to time to first token and remains in the response path

Putting Nginx beside LiteLLM is the best placement for API clients near LiteLLM because Nginx-to-LiteLLM becomes local. A separately deployed UI can still be useful for asset locality, but it should reach a gateway colocated with LiteLLM when low control-plane latency matters. If browser users are near the local UI node and API users are near the remote LiteLLM node, use an edge Nginx per user region or route each client to the nearest full gateway stack rather than splitting Nginx and LiteLLM across the high-latency link

## Reproduction Commands

```bash
ssh usdatacore 'cd ~/self_code/litellm && docker compose -f docker-compose-ghcr-us.yaml down && docker compose -f docker-compose-ghcr-us.yaml up -d'
LITELLM_HOST=100.117.40.15:4000 docker compose -f docker-compose-ui-gateway.yaml up -d --no-deps ui nginx
curl http://127.0.0.1:4000/healthz
curl http://127.0.0.1:4000/health/liveliness
```
