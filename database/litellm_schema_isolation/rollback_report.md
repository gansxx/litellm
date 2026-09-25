# `docker/compose.me.yaml` 回退记录

## 范围

`docker/compose.me.yaml` 使用发布版 LiteLLM 镜像连接本地 PostgreSQL 的 `public` schema。启动完成后，数据库中存在 LiteLLM 表、Prisma migration ledger、LiteLLM 的枚举和运行时视图。

`rollback_compose_me.sql` 只针对本次审计中确认的对象。它会删除所有 `public.LiteLLM_*` 表，不保留其中的数据。

执行命令：

```bash
docker compose -f docker/compose.me.yaml down
docker exec -i supabase-db-light psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < database/litellm_schema_isolation/rollback_compose_me.sql
```

## 已回退对象

- `public` 中所有 `LiteLLM_*` 普通表及其依赖的索引、约束和序列
- `public.JobStatus` 枚举
- `public._prisma_migrations`
- 运行时创建的 8 个视图：`LiteLLM_VerificationTokenView`、`MonthlyGlobalSpend`、`MonthlyGlobalSpendPerKey`、`MonthlyGlobalSpendPerUserPerKey`、`Last30dKeysBySpend`、`Last30dModelsBySpend`、`Last30dTopEndUsersSpend`、`DailyTagSpend`

## 执行结果

已停止 `docker/compose.me.yaml` 启动的 LiteLLM 容器并执行 `rollback_compose_me.sql`。回退后核对结果为：`public` 中的 LiteLLM 关系对象和 `_prisma_migrations` 为 0，`public.JobStatus` 为 0，8 个 LiteLLM 运行时视图为 0。

## Prisma migration 对象审计

LiteLLM Prisma migration 并非只创建表。迁移 SQL 包含建表、`ALTER TABLE`、主键和唯一约束、普通与并发索引，以及 `JobStatus` 枚举。已审计的 migration SQL 未创建函数、存储过程、触发器、扩展、RLS policy 或视图。

视图不在 versioned Prisma migration SQL 中。LiteLLM 启动后由 `litellm/proxy/db/create_views.py` 创建它们，因此回退 SQL 单独删除这些运行时对象。

## 独立 schema 部署验证

`docker-compose-local-schema.yaml` 使用本地 Dockerfile 构建镜像，设置 `LITELLM_DATABASE_SCHEMA=litellm`，并从 `.env.local` 读取 `DATABASE_URL`。启动代码会先创建 schema，再将 `DATABASE_URL` 和可选的 `DIRECT_URL` 的 Prisma `schema` 参数设为 `litellm`。

完整本地镜像构建成功，容器健康检查通过，`GET /health/liveliness` 返回 `I'm alive!`。PostgreSQL catalog 验证到 `litellm` schema 中有 310 个 LiteLLM 关系对象、8 个运行时视图、`JobStatus` 和 `_prisma_migrations`，而 `public` schema 中相关对象为 0。
