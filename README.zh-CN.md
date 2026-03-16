# Senclaw

[English](./README.md) | [简体中文](./README.zh-CN.md)

Senclaw 是一个 AI Agent 编排平台，具备持久化存储、API Key 鉴权、Web Console、连接器接入、任务调度以及沙箱化工具执行能力。

当前代码库功能已经比较完整，仓库门禁在本地也已恢复为绿色。截止 2026 年 3 月 16 日，Windows 基线 go-live gate 已完成闭环，包含 Node 22 复验和浏览器级受保护 Web Console 验收。RabbitMQ 与 Redis Streams 队列驱动已内置实现，并具备单元测试覆盖与默认 gateway 接线，但真实 broker 的发布级证据仍待补齐。

## 就绪度快照

最新本地证据记录于 2026 年 3 月 16 日（Windows 基线使用便携式 Node `v22.22.1` 复验）：

- `pnpm run build`：通过
- `pnpm run test`：通过（`46` 个测试文件，`267` 个测试）
- `pnpm run test:integration`：通过（`6` 个测试文件，`20` 个测试），另有一个 opt-in live-broker suite（`1` 个文件，未配置 broker 环境时 `4` 个跳过）
- `pnpm run verify`：通过

当前支持的开发平台：

- Windows
- Linux

当前阻塞项与各子系统状态请查看 [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)。

## 仓库结构

Applications：

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

这台机器当前默认安装仍是 Node `v20.11.0`，所以直接运行命令时会有 engine warning；若要按支持矩阵执行本地与 CI 验证，应使用 Node 22+。项目的支持运行时门禁已经通过便携式 Node `v22.22.1` 在本地完成复验。

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/Hyper66666/SenClaw.git
cd SenClaw

# 安装依赖
corepack pnpm install

# 配置环境变量
copy .env.example .env
# Linux 使用：cp .env.example .env

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

## 一键本地运行

如果你想快速启动一套本地可用的 Senclaw，可直接使用启动脚本：

```bash
# Windows
scripts\start-senclaw.cmd
scripts\stop-senclaw.cmd

# Linux
./scripts/start-senclaw.sh
./scripts/stop-senclaw.sh
```

启动脚本会在 `.tmp/live-run` 下初始化本地运行目录，启动 gateway 和 web console，复用持久化 bootstrap admin key，并在终端打印启动摘要，包含：

- 当前模型 ID
- admin key
- Web Console 地址
- gateway 地址
- 运行日志目录

Web Console 头部包含 `EN / 中文` 语言切换按钮。所选语言会持久化，并分别作用于：

- 当前浏览器中的 Web Console 文案
- 下一次启动脚本运行时的终端输出文案（通过 `.tmp/live-run/runtime-settings.json`）

如果你已经在仓库根目录的 Windows `cmd` 中，也可以直接使用更短的命令：

```bat
senclaw start
senclaw stop
```

这个包装器会转发到 `packages/cli` 中的本地 CLI，行为与启动脚本一致。

## 鉴权

默认情况下，Gateway 中 `/api/v1/*` 路由都需要 Bearer API Key。

创建或引导一把 key：

```bash
corepack pnpm run auth:bootstrap-admin
```

Web Console 当前支持轻量级 API Key session。在使用 agents、runs 或 task 提交等受保护页面前，需要先在页面头部粘贴 Bearer token。

## 真实 Provider Smoke 测试

Senclaw 提供了一条不会把密钥写入仓库的 OpenAI-compatible provider smoke 路径。先在本地设置以下环境变量：

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

该脚本会走真实的 gateway 和 agent runtime 流程，创建一个临时的 `provider: openai` agent，提交任务，等待执行完成，并输出 assistant 响应或可诊断的 provider 错误。2026 年 3 月 12 日，这条 smoke 路径已在 Volcengine Ark OpenAI-compatible endpoint 上使用 `doubao-seed-2.0-pro` 完成验证，返回结果为 `OK`。

## 验证命令

```bash
corepack pnpm run build
corepack pnpm run test
corepack pnpm run test:integration
corepack pnpm run verify
```

当前所有发布声明都应以这四条命令全部通过为前提。Windows 基线签收已经完成，剩余发布工作只限于可选的 broker-backed queue 验证和 Linux 原生沙箱验证。

## 关键文档

- [生产就绪度](./PRODUCTION_READINESS.md)
- [Web Console](./apps/web/README.md)
- [Scheduler API](./docs/api/scheduler.md)
- [Connector Worker](./docs/api/connectors.md)
- [Tool Sandbox](./docs/api/tool-sandbox.md)

## 当前缺口

当前从“本地已绿”到“完全可对外宣称为生产就绪”之间，剩余的是：

- 在宣称 broker-backed queue 达到发布级支持前，补齐 RabbitMQ 与 Redis 的真实 broker 验证
- 如果要在所有支持平台上宣称 level 4 native enforcement，补齐 Linux 上基于证据的 Rust 原生沙箱验证

## 仓库地址

- Source: https://github.com/Hyper66666/SenClaw
- Issues: https://github.com/Hyper66666/SenClaw/issues
