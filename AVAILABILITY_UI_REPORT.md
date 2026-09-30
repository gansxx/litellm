# UI 分离与可用性功能报告

## 实现结果

代理镜像不再在构建阶段编译或复制 Admin UI 静态产物。`ui/Dockerfile` 负责构建独立 UI 镜像，默认 `docker-compose.yml` 新增 `ui` 服务并暴露 `3000` 端口。UI nginx 将 API 请求反向代理到 Compose 网络内的 `litellm:4000`，因此浏览器只需要访问 `http://localhost:3000/ui/`

模型健康状态页现在会读取 `/health/history` 中的已记录探测结果，并按部署 ID 展示以下数据：

- Availability: 健康记录占全部记录的百分比
- Average Latency: 有响应时间样本的算术平均值
- Peak Latency: 有响应时间样本中的最大值

探测仍由 LiteLLM 代理执行，UI 不保存也不接触供应商凭据。监控范围是 `model_list` 内配置的 LiteLLM 部署端点，不是任意 HTTP URL

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
```

启动后访问 `http://localhost:3000/ui/?page=models`，打开 `Health Status` 标签页查看探测状态和统计数据

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

## 调研参考

[Uptime Kuma](https://github.com/louislam/uptime-kuma) 是自托管监控实现，参考了其按监视器聚合正常率和响应时间的看板模型

[Prometheus Blackbox Exporter](https://github.com/prometheus/blackbox_exporter) 是 HTTP 等端点探测实现，参考了其将探测执行放在监控后端、将展示层与探测凭据分离的边界

本实现选择复用 LiteLLM 已有后台健康检查，而不引入新的监控数据库或第三方服务。这样部署端点、认证、探测调度和历史保留均保持在现有代理配置中
