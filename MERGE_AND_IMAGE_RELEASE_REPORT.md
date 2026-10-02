# Merge and three-container image release report

## Scope

Merged `origin/main` into `feat/ui-availability-container` at `a0784cb952`

The branch keeps the standalone LiteLLM proxy, UI, and nginx gateway deployment in `docker-compose-ui-gateway.yaml`. The public gateway port remains `4000`

## Compatibility checks

`docker compose --env-file /dev/null -f docker-compose-ui-gateway.yaml config --quiet` passed and resolves the `litellm`, `ui`, and `nginx` services

`npm run test:unit -- src/components/networking.test.ts` passed: 42 tests

`npm run test:integration -- 'src/app/(dashboard)/router-settings/_components/general_settings.integration.test.tsx'` passed: 10 tests

The live gateway returned `200` for `/ui/` and `/health/liveliness`. The `/ui/` response contains a Next static JavaScript asset path

`nginx -t` passed in the gateway image

The focused Python regression test could not run in this environment. The project requires `uv >=0.10.9`, the installed version is `0.10.0`, and the system pytest environment lacks `boto3`. The covered regression is `test_config_list_exposes_background_health_check_settings`

## Commit image hook

Git now uses `.githooks` through `core.hooksPath`. The executable `post-commit` hook invokes `scripts/push_ui_gateway_images.sh`

Each successful commit builds and pushes these images:

- `ghcr.io/gansxx/litellm-proxy`
- `ghcr.io/gansxx/litellm-ui`
- `ghcr.io/gansxx/litellm-gateway`

Each image receives `<branch>-<shortSHA>` and `<branch>-latest` tags. Set `LITELLM_SKIP_IMAGE_PUSH=1` for a local commit that must skip publication

## Release verification

The commit that adds this report triggers the hook and publishes the final commit tags. The post-commit output and remote manifests are verified after the commit
