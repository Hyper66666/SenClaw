# Senclaw

[English](./README.md) | [简体中文](./README.zh-CN.md)

Senclaw 是一个 AI Agent 编排平台，具备持久化存储、API Key 鉴权、Web Console、连接器接入、任务调度以及沙箱化工具执行能力。

当前代码库功能已经比较完整，本地仓库门禁也已经恢复为绿色。截至 2026 年 3 月 12 日，最新一次 Windows 本地验证中，`build`、`test`、`test:integration` 和 `verify` 都已通过。RabbitMQ 与 Redis Streams 队列驱动已经在仓库内实现，并带有单元测试覆盖及默认的 gateway 接线，但基于真实 broker 的发布级验证证据仍未补齐。同时，项目也已经记录了真实 OpenAI-compatible provider 的 smoke 结果，因此当前剩余的基础上线工作主要收敛为：在 Node 22 环境复验，以及补齐受保护 Web Console 的验收记录。

## 就绪度快照

截至 2026 年 3 月 12 日的最新本地证据（Windows，Node `v20.11.0`，因此会出现 engine warning）：

- `pnpm run build`：通过
- `pnpm run test`：通过（`33` 个测试文件，`217` 个测试）
- `pnpm run test:integration`：通过（`6` 个测试文件，`20` 个测试）
- `pnpm run verify`：通过

当前支持的开发平台：

- Windows
- Linux

当前阻塞项和各子系统状态详见 [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)。

## 仓库结构

应用：

- `@senclaw/gateway`：Fastify API 与管理入口
- `@senclaw/agent-runner`：Agent 执行运行时
- `@senclaw/tool-runner-host`：沙箱化工具宿主
- `@senclaw/scheduler-app`：独立调度进程
- `@senclaw/connector-worker-app`：连接器生命周期宿主
- `@senclaw/web`：React Web Console

Packages：

- `@senclaw/protocol`：共享 schema 与类型
- `@senclaw/config`：环境变量与配置读取
- `@senclaw/storage`：SQLite 仓储与迁移
- `@senclaw/logging`：结构化日志
- `@senclaw/observability`：指标与 tracing
- `@senclaw/scheduler`：调度服务库
- `@senclaw/connector-worker`：连接器工作库
- `@senclaw/cli`：CLI 客户端

## 前置要求

- Node.js `>=22.0.0`
- pnpm `>=10.0.0`
- 可用于 `SENCLAW_DB_URL` 的 SQLite 文件系统访问权限
- 可选：Rust 工具链，用于原生沙箱验证（`native/sandbox-runner`）

当前这台机器使用的是 Node `v20.11.0`，所以命令虽然能跑通，但会出现 engine warning。要进行受支持的本地验证和 CI 验证，请使用 Node 22+。

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/Hyper66666/SenClaw.git
cd SenClaw

# 安装依赖
corepack pnpm install

# 配置环境变量
copy .env.example .env
# Linux 上使用：cp .env.example .env

# 构建整个 workspace
corepack pnpm run build
```

在不同终端中启动核心服务：

```bash
corepack pnpm --filter @senclaw/gateway dev
corepack pnpm --filter @senclaw/agent-runner dev
corepack pnpm --filter @senclaw/tool-runner-host dev
```

可选进程：

```bash
corepack pnpm --filter @senclaw/scheduler-app dev
corepack pnpm --filter @senclaw/connector-worker-app dev
corepack pnpm --filter @senclaw/web dev
```

说明：

- 根目录下的 `pnpm run dev` 只会启动 `@senclaw/gateway`
- Web Console 开发服务器默认运行在 `http://localhost:3000`
- Gateway API 默认运行在 `http://localhost:4100`
- 独立 scheduler 健康检查默认运行在 `http://localhost:4500/health`

## 鉴权

默认情况下，Gateway 下 `/api/v1/*` 路由都需要 Bearer API Key。

创建或引导一个 key：

```bash
corepack pnpm run auth:bootstrap-admin
```

Web Console 当前支持轻量级 API Key session。使用 agents、runs 或 task 提交等受保护页面前，需要先在页面头部粘贴 Bearer token。

## 真实 Provider Smoke 测试

Senclaw 提供了一个不把密钥写入仓库的 OpenAI-compatible provider smoke 路径。在本地设置以下环境变量：

```bash
SENCLAW_OPENAI_API_KEY=<你的 key>
SENCLAW_OPENAI_BASE_URL=<兼容的 base url>
SENCLAW_OPENAI_MODEL=<模型 ID>
# 可选
SENCLAW_SMOKE_PROMPT=Reply with the single word OK.
SENCLAW_SMOKE_TIMEOUT_MS=60000
```

然后执行：

```bash
corepack pnpm run test:provider-smoke
```

这个脚本会走真实的 gateway 和 agent runtime 流程，创建一个临时的 `provider: openai` agent，提交任务，等待执行完成，并打印 assistant 回复或可诊断的 provider 错误。2026 年 3 月 12 日，这条 smoke 路径已经在 Volcengine Ark OpenAI-compatible endpoint 上用 `doubao-seed-2.0-pro` 验证过，返回结果为 `OK`。

## 验证命令

```bash
corepack pnpm run build
corepack pnpm run test
corepack pnpm run test:integration
corepack pnpm run verify
```

当前对外发布声明应以这四条命令全部通过为前提。当前剩余的基础上线收尾工作，是在 Node 22 上重新跑一遍，以及补齐受保护 Web Console 的验收记录。

## 关键文档

- [生产就绪度](./PRODUCTION_READINESS.md)
- [Web Console](./apps/web/README.md)
- [Scheduler API](./docs/api/scheduler.md)
- [Connector Worker](./docs/api/connectors.md)
- [Tool Sandbox](./docs/api/tool-sandbox.md)

## 当前缺口

项目从“本地全绿”到“可以正式宣称部署就绪”之间，还剩这些事项：

- 在受支持的 Node 22 环境中重新跑一遍 readiness matrix
- 记录一次开启鉴权后的 Web Console 验收
- 如果要对外宣称 broker-backed queue 已具备发布级支持，则需要补齐 RabbitMQ 和 Redis 的真实 broker 验证
- 如果要对外宣称 level 4 native enforcement，则需要补齐 Windows 和 Linux 上基于证据的 Rust 沙箱验证

## 仓库地址

- Source: https://github.com/Hyper66666/SenClaw
- Issues: https://github.com/Hyper66666/SenClaw/issues
