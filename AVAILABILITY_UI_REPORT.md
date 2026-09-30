# UI 分离与可用性功能报告

## 实现结果

代理镜像不再在构建阶段编译或复制 Admin UI 静态产物。`ui/Dockerfile` 负责构建独立 UI 镜像，`docker-compose-ui-gateway.yaml` 将 UI、代理和 nginx 作为三个服务启动。nginx 是唯一对宿主机开放的入口，浏览器通过 `http://localhost:4000/ui/` 访问 UI

Health Status 页面会读取 `/health/history` 中的已记录探测结果，并按配置模型端点的部署 ID 展示以下数据：

- Availability: 健康记录占全部记录的百分比
- Average Latency: 有响应时间样本的算术平均值
- Peak Latency: 有响应时间样本中的最大值

探测仍由 LiteLLM 代理执行，UI 不保存也不接触供应商凭据。监控范围是 `model_list` 内配置的 LiteLLM 部署端点，不是任意 HTTP URL

定时探测可通过 `general_settings.background_health_checks` 启用，并由 `health_check_interval` 以秒为单位配置间隔。`general_settings.background_health_check_model_groups` 可指定要测试的 `model_name` 组；未配置时会测试全部已配置模型端点。单个部署也可通过 `model_info.disable_background_health_check: true` 排除

## UI 集中管理健康检查

Router Settings 的 `Health Checks` 标签页集中管理原先需要写入 `general_settings` 的四项配置：后台健康检查开关、定时间隔（秒）、并发检查数和需要测试的模型组。每项均可单独保存或重置，保存会调用既有的 `/config/field/update` 接口，重置会调用 `/config/field/delete` 接口，因此无需继续编辑 YAML 即可统一管理

模型组填写的是配置中 `model_list[].model_name` 的逗号分隔列表，例如 `monitored-model`。留空并保存会清除该配置，后台检查随即覆盖所有已配置模型组。Health Status 页面展示这些配置模型端点的可用率、平均延迟和峰值延迟，定时执行频率及覆盖范围均由本标签页可见并可修改的配置决定

`/config/list` 的字段白名单现已包含四项健康检查配置，避免 Health Checks 标签页在未返回字段时显示空白。本地运行中的代理已实际返回这四项，类型分别为 Boolean、Integer、Integer 和 List

## 配置示例

```yaml
model_list:
  - model_name: monitored-model
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: os.environ/OPENAI_API_KEY

general_settings:
  background_health_checks: true
  health_check_interval: 60
  health_check_concurrency: 5
  background_health_check_model_groups:
    - monitored-model
```

启动后访问 `http://localhost:4000/ui/?page=models`，打开 `Health Status` 标签页查看探测状态、可用率、平均延迟和峰值延迟

现有持久化策略会在状态变化时立即保存，并在状态稳定时至少每小时保存一次记录。统计结果因此代表已记录的探测历史，而不是每一个内存中的探测周期

## 本地模拟验证

已通过 `docker compose --env-file /dev/null config --quiet` 验证双容器 Compose 配置。`ui` 服务依赖代理健康检查，UI 自身使用 `/healthz` 健康检查

已使用与 `ui/Dockerfile` 相同的固定 nginx 镜像、`ui/nginx.conf` 和已提交 UI 静态资源启动临时容器，执行结果如下：

```text
GET /healthz  -> ok
HEAD /ui/     -> HTTP/1.1 200 OK
```

已在固定 Node 24.19 Docker 环境执行：

```text
npm run test:unit -- src/components/model_dashboard/healthAvailability.test.ts
2 tests passed

npm run test:component -- src/components/model_dashboard/HealthCheckComponent.test.tsx
12 tests passed

npm run lint -- src/components/model_dashboard/healthAvailability.ts src/components/model_dashboard/healthAvailability.test.ts src/components/model_dashboard/HealthCheckComponent.tsx src/components/model_dashboard/HealthChecksTableColumns.tsx src/components/networking.tsx
passed

npm run test:integration -- src/app/(dashboard)/router-settings/_components/general_settings.integration.test.tsx
10 tests passed

docker compose -f docker-compose-ui-gateway.yaml build ui
passed

docker compose -f docker-compose-ui-gateway.yaml up -d --no-deps --force-recreate ui
ui recreated and healthy
GET /ui/ -> 200
GET /healthz -> 200
```

## 三容器网关验证

`docker-compose.yml` 保持不变。新的 `docker-compose-ui-gateway.yaml` 使用独立 Compose 项目 `litellm-ui-gateway`，包含 `litellm`、`ui` 和 `nginx` 三个服务。UI 容器仅提供静态文件，nginx 容器是唯一对宿主机开放的入口，并映射 `4000:4000`

已停止 `docker-compose-local-schema.yaml` 的旧栈，再启动新栈。实际验证结果如下：

```text
litellm  healthy
ui       healthy
nginx    healthy

GET /healthz                                  -> 200
GET /ui/                                      -> 200
GET /litellm/.well-known/litellm-ui-config    -> 200
GET /health/liveliness                        -> 200
```

UI 构建已改为不在构建期请求 Google Fonts，因此当前源码可成功构建并用于上述三容器验证

静态服务器会将 Next.js 的 `/litellm-asset-prefix/_next` 构建资源映射到实际的 `/_next` 文件树。已批量验证首页引用的全部 JS 和 CSS 资源均返回成功响应

## 调研参考

[Uptime Kuma](https://github.com/louislam/uptime-kuma) 是自托管监控实现，参考了其按监视器聚合正常率和响应时间的看板模型

[Prometheus Blackbox Exporter](https://github.com/prometheus/blackbox_exporter) 是 HTTP 等端点探测实现，参考了其将探测执行放在监控后端、将展示层与探测凭据分离的边界

本实现选择复用 LiteLLM 已有后台健康检查，而不引入新的监控数据库或第三方服务。这样部署端点、认证、探测调度和历史保留均保持在现有代理配置中
