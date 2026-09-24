# LiteLLM 本地 Tailscale 部署分析

## 目标与产物

本地部署使用 Tailscale Cloud Run 文档的 userspace networking 方式，不需要容器具有 `NET_ADMIN` 权限或挂载 `/dev/net/tun`。实现由以下文件组成：

- `Dockerfile.tailscale-local` 从固定摘要的 LiteLLM 与 Tailscale 镜像构建运行镜像
- `docker/tailscale_local_entrypoint.sh` 启动 `tailscaled`、使用 auth key 入网，并启动 LiteLLM
- `docker-compose-local.yaml` 只定义一个 `litellm` 服务，并从 `.env.local` 读取配置

Compose 文件不会启动 PostgreSQL、Prometheus 或其他服务。`DATABASE_URL` 与现有 `tskey` 均由 `.env.local` 注入。入口脚本同时支持将密钥命名为 `TAILSCALE_AUTHKEY`，便于后续与 Tailscale 文档的环境变量名称统一。

启动命令：

```bash
docker compose -f docker-compose-local.yaml up --build -d
```

停止测试环境：

```bash
docker compose -f docker-compose-local.yaml down
```

## 网络工作方式

入口脚本以如下模式启动 Tailscale：

```text
tailscaled --tun=userspace-networking --socks5-server=127.0.0.1:1055
```

该模式提供本地 SOCKS5 代理，而不是 Linux TUN 网卡。LiteLLM 的 HTTP 出站请求通过 `ALL_PROXY=socks5://127.0.0.1:1055` 使用该代理。基础 LiteLLM 镜像未带 `httpx` 的 SOCKS 依赖，因此专用 Dockerfile 安装了固定版本的 `socksio==1.0.0`。

该设计与 Tailscale 的 Cloud Run 指引一致，并适用于可使用 SOCKS5 的 HTTP 客户端。它不能透明代理任意 TCP 应用。

## 本地测试结果

已完成以下验证：

- `docker compose -f docker-compose-local.yaml config -q` 成功
- `sh -n docker/tailscale_local_entrypoint.sh` 成功
- 专用镜像成功构建
- 容器使用 `.env.local` 中的 key 成功完成 Tailscale 认证并进入 `Running` 状态

数据库连接未成功。LiteLLM 启动日志中的 Prisma 报错为 `P1001: Can't reach database server at desktop-linux:5438`。该失败不是 Tailscale 认证失败，也不是 LiteLLM migration SQL 失败。

当前数据库服务监听在宿主机回环地址 `127.0.0.1:5438`，而 `DATABASE_URL` 的主机名解析为 tailnet 地址。Prisma 的 PostgreSQL 查询引擎使用直接 TCP 连接，并不使用 `ALL_PROXY` 提供的 SOCKS5 通道。因此 userspace networking 不能让 Prisma 直接访问该数据库端点。

若数据库必须经 Tailscale 私网访问，Cloud Run 兼容方案需要在镜像中加入 TCP-to-SOCKS 转发器，并将 `DATABASE_URL` 指向该转发器。另一种方案是使用内核 TUN 模式，但它需要 `/dev/net/tun` 与网络管理权限，不适用于 Cloud Run。若数据库本身可经 VPC、私网连接或公共 TLS 端点访问，则可以保持当前 userspace 部署而不经过 SOCKS5 访问数据库。

## 同一数据库新 schema 与新数据库的选择

| 维度 | 现有数据库中新 schema | 新建数据库 |
| --- | --- | --- |
| 隔离程度 | 共享实例、备份域和资源上限，隔离较弱 | 独立连接、权限、备份恢复和容量治理，隔离最强 |
| 运维成本 | 成本低，可复用现有网络、监控和高可用配置 | 需要新增实例或数据库级资源、监控和备份策略 |
| 数据交互 | 可执行跨 schema 查询，仍应避免业务耦合 | 跨库查询、事务和数据迁移更复杂 |
| 风险范围 | 错误权限、资源争用或迁移操作可能影响同实例其他 schema | 故障和恢复通常局限于 LiteLLM 数据库 |
| 初始化 | 需要预先创建 schema、授予权限并指定 Prisma schema 或 `search_path` | 新数据库的 `public` schema 可直接运行 LiteLLM migration |

对于希望与既有应用共享同一 PostgreSQL 实例且具备明确 schema 权限管理的场景，新 schema 成本较低。迁移前应在预发布环境验证 Prisma 连接串中的目标 schema、迁移表 `_prisma_migrations` 的位置，以及所有未限定 schema 的 SQL 是否落入预期 schema。

对于需要独立生命周期、独立恢复边界或较严格资源隔离的场景，新数据库更合适。迁移时先创建数据库和最小权限角色，再运行 LiteLLM 的版本化迁移。历史数据复制应使用受控的逻辑导出导入或应用任务，不能放入 Prisma schema migration，因为启动 migration 不应重写大量数据。

## LiteLLM schema 初始化实现

`schema.prisma` 是 Prisma 数据模型的声明来源，数据源读取 `DATABASE_URL`。

LiteLLM 启动时，[`litellm/proxy/proxy_cli.py`](litellm/proxy/proxy_cli.py) 会检查 Prisma CLI，并根据 `DISABLE_SCHEMA_UPDATE`、`--use_prisma_db_push` 和 migration resolver 配置决定是否初始化数据库。

[`litellm/proxy/db/prisma_client.py`](litellm/proxy/db/prisma_client.py) 的 `PrismaManager.setup_database` 负责分流：默认路径委托给 `ProxyExtrasDBManager` 执行 `prisma migrate deploy`，`--use_prisma_db_push` 则执行 `prisma db push --accept-data-loss --skip-generate`。

[`litellm-proxy-extras/litellm_proxy_extras/utils.py`](litellm-proxy-extras/litellm_proxy_extras/utils.py) 的 `ProxyExtrasDBManager` 实现迁移目录定位、基线、失败迁移恢复、v1/v2 resolver 与 `_prisma_migrations` ledger 处理。版本化 SQL 位于 `litellm-proxy-extras/litellm_proxy_extras/migrations/*/migration.sql`。

[`litellm/proxy/prisma_migration.py`](litellm/proxy/prisma_migration.py) 是可独立调用的 migration 与 Prisma client generation 入口。生产容器的默认入口最终调用 LiteLLM CLI，因此通常由 `proxy_cli.py` 触发上述初始化路径。
