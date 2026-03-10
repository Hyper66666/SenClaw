# Senclaw 实施路线图

本文档定义了 Senclaw 项目的推荐实施顺序，基于组件依赖关系和架构层次设计。

## 实施原则

1. **依赖优先**：先实现被依赖的基础组件
2. **尽早验证**：每个阶段都能交付可用功能
3. **渐进增强**：从 MVP 到完整功能逐步迭代
4. **风险前置**：安全和可观测性尽早引入

---

## 实施阶段

### 阶段 1：基础设施层（4-6 周）

#### 1.1 Persistent Storage (1-2 周)
**OpenSpec**: `openspec/changes/persistent-storage/`

**优先级**: 🔴 最高（所有组件依赖）

**关键交付物**:
- SQLite 数据库配置和连接管理
- Repository 接口定义（`IAgentRepository`, `IRunRepository` 等）
- 数据库迁移系统
- 基础 CRUD 操作

**验收标准**:
- [ ] 所有 Repository 接口实现完成
- [ ] 单元测试覆盖率 > 80%
- [ ] 数据库迁移可以正向/回滚
- [ ] 性能测试：1000 次插入 < 1 秒

**技术栈**:
- better-sqlite3
- Drizzle ORM
- Vitest

---

#### 1.2 Core Runtime Foundation (2-3 周)
**OpenSpec**: `openspec/changes/core-runtime-foundation/`

**优先级**: 🔴 最高（系统核心）

**关键交付物**:
- 协议类型定义（`@senclaw/protocol` 包）
- Gateway API 服务（Fastify）
- Agent Runner 服务
- 工具执行引擎
- LLM Provider 集成（OpenAI, Anthropic）

**验收标准**:
- [ ] Gateway 能接收 HTTP 请求
- [ ] Agent Runner 能执行简单对话
- [ ] 工具调用流程完整（LLM → Tool → LLM）
- [ ] 集成测试：完整的 Agent 执行流程

**技术栈**:
- Fastify
- OpenAI SDK
- Anthropic SDK

---

#### 1.3 API Authentication (1 周)
**OpenSpec**: `openspec/changes/api-authentication/`

**优先级**: 🔴 最高（生产必需）

**关键交付物**:
- API 密钥生成和管理
- Bearer Token 认证中间件
- RBAC 权限控制
- 速率限制（Redis）
- 审计日志

**验收标准**:
- [ ] 所有 API 端点需要认证
- [ ] 不同角色有不同权限
- [ ] 速率限制生效（100 req/min）
- [ ] 审计日志记录所有操作

**技术栈**:
- bcrypt
- Redis
- Fastify hooks

---

### 阶段 2：可观测性层（1-2 周）

#### 2.1 Observability Enhancement
**OpenSpec**: `openspec/changes/observability-enhancement/`

**优先级**: 🟡 高（尽早引入）

**关键交付物**:
- Prometheus metrics 端点
- OpenTelemetry 集成
- Pino 结构化日志
- Grafana 基础仪表板（System Overview, Agent Performance）

**验收标准**:
- [ ] `/metrics` 端点暴露所有关键指标
- [ ] Jaeger 能看到完整 trace
- [ ] 日志包含 traceId 和 spanId
- [ ] Grafana 仪表板可用

**技术栈**:
- prom-client
- OpenTelemetry
- Pino
- Jaeger
- Grafana

**里程碑**: 🎯 **Milestone 1 - MVP**（4-5 周完成）
- 能力：通过 API 创建 Agent、提交任务、查看结果、监控系统

---

### 阶段 3：增强功能层（5-7 周）

#### 3.1 Tool Sandbox (2 周)
**OpenSpec**: `openspec/changes/tool-sandbox/`

**优先级**: 🟡 高（安全增强）

**关键交付物**:
- Level 1: 进程隔离（child_process）
- Level 2: 文件系统沙箱（路径限制）
- 超时和资源限制
- 错误隔离

**验收标准**:
- [ ] 工具在独立进程中执行
- [ ] 超时自动终止
- [ ] 工具崩溃不影响主进程
- [ ] 恶意工具无法访问敏感文件

**技术栈**:
- Node.js child_process
- ulimit (Linux)
- Job Objects (Windows)

**注**: Level 3（网络控制）和 Level 4（Rust 沙箱）可以后续优化

---

#### 3.2 Scheduler (1-2 周)
**OpenSpec**: `openspec/changes/scheduler/`

**优先级**: 🟢 中（增强功能）

**关键交付物**:
- Cron 表达式解析（cron-parser）
- 任务持久化（SQLite）
- 调度器循环（10 秒 tick）
- 失败处理和重试

**验收标准**:
- [ ] 支持标准 cron 表达式
- [ ] 任务按时触发
- [ ] 3 次失败后自动禁用
- [ ] 支持时区配置

**技术栈**:
- cron-parser
- SQLite

---

#### 3.3 Connector Worker (2-3 周)
**OpenSpec**: `openspec/changes/connector-worker/`

**优先级**: 🟢 中（外部集成）

**关键交付物**:
- Webhook 连接器（GitHub, Stripe, Slack）
- Polling 连接器（RSS, API）
- Queue 连接器（RabbitMQ, Redis）
- 事件转换引擎（JSONPath + Handlebars）

**验收标准**:
- [ ] 能接收 GitHub webhook
- [ ] 能轮询 RSS feed
- [ ] 能消费 RabbitMQ 消息
- [ ] 事件转换正确

**技术栈**:
- Fastify (Webhook)
- node-cron (Polling)
- amqplib (RabbitMQ)
- jsonpath-plus
- handlebars

**里程碑**: 🎯 **Milestone 2 - 生产就绪**（7-8 周完成）
- 能力：安全、可监控、可自动化的生产环境

---

### 阶段 4：用户界面层（3-4 周）

#### 4.1 CLI Tool (1 周)
**OpenSpec**: `openspec/changes/cli-tool/`

**优先级**: 🟢 中（开发者体验）

**关键交付物**:
- `senclaw config` 命令
- `senclaw agent` 命令
- `senclaw task` 命令
- `senclaw run` 命令
- 配置文件管理（`~/.senclawrc`）

**验收标准**:
- [ ] 能通过 CLI 完成完整工作流
- [ ] 支持交互式和非交互式模式
- [ ] 支持 JSON 输出
- [ ] 错误提示友好

**技术栈**:
- Commander.js
- Inquirer.js
- Chalk
- cli-table3

---

#### 4.2 Web Console (2-3 周)
**OpenSpec**: `openspec/changes/web-console/`

**优先级**: 🟢 中（用户体验）

**关键交付物**:
- Agent 管理界面
- 任务提交界面
- Run 监控界面
- 实时更新（WebSocket）

**验收标准**:
- [ ] 能通过 UI 创建 Agent
- [ ] 能提交任务并查看结果
- [ ] 实时显示 Run 状态
- [ ] 响应式设计（移动端友好）

**技术栈**:
- React
- TanStack Query
- WebSocket
- Tailwind CSS

**里程碑**: 🎯 **Milestone 3 - 完整功能**（11-13 周完成）
- 能力：自动化任务、外部集成、命令行操作、Web 界面

---

### 阶段 5：开发体验优化（1 周）

#### 5.1 Senclaw Dev Flow (Windows/Linux)
**OpenSpec**: `openspec/changes/senclaw-dev-flow-windows-linux/`

**优先级**: 🔵 低（开发体验优化）

**关键交付物**:
- 一键启动脚本（`npm run dev`）
- 开发环境配置文档
- Docker Compose 配置
- 故障排查指南

**验收标准**:
- [ ] 新开发者能在 10 分钟内启动系统
- [ ] 支持 Windows 和 Linux
- [ ] 热重载生效
- [ ] 文档完整

**技术栈**:
- Docker Compose
- Bash/PowerShell 脚本

**里程碑**: 🎯 **Milestone 4 - 完善体验**（14-16 周完成）
- 能力：完整的用户体验和开发者体验

---

## 并行开发策略

### 可以并行的组件（阶段 3）

**团队 A**: Tool Sandbox
**团队 B**: Scheduler
**团队 C**: Connector Worker

这三个组件相对独立，依赖关系少，可以同时开发。

### 依赖关系图

```
Persistent Storage (必须最先)
    ↓
Core Runtime Foundation (必须第二)
    ↓
API Authentication (必须第三)
    ↓
Observability Enhancement (建议第四)
    ↓
┌─────────────┬─────────────┬─────────────┐
│ Tool Sandbox│  Scheduler  │  Connector  │ (可并行)
└─────────────┴─────────────┴─────────────┘
    ↓
┌─────────────┬─────────────┐
│  CLI Tool   │ Web Console │ (可并行)
└─────────────┴─────────────┘
    ↓
Senclaw Dev Flow (最后)
```

---

## 风险管理

### 🔴 高风险项

1. **跳过 Observability**
   - 风险：后期调试困难，性能问题难以定位
   - 缓解：在阶段 2 尽早引入

2. **Authentication 延后**
   - 风险：安全漏洞，生产环境不可用
   - 缓解：在阶段 1 完成

3. **Storage 设计不当**
   - 风险：后期重构成本高
   - 缓解：充分的单元测试和性能测试

### 🟡 中风险项

1. **Tool Sandbox 过度设计**
   - 风险：开发周期过长
   - 缓解：先实现 Level 1，后续渐进优化

2. **Web Console 功能蔓延**
   - 风险：开发周期失控
   - 缓解：MVP 只做核心功能，美化后续迭代

---

## 资源估算

### 人力需求

**最小团队**（1 个全栈工程师）:
- 总周期：16-20 周
- 适合：原型验证、小规模部署

**推荐团队**（3 个工程师）:
- 后端工程师 × 2（负责阶段 1-3）
- 全栈工程师 × 1（负责阶段 4-5）
- 总周期：10-13 周
- 适合：生产环境部署

**快速团队**（5+ 工程师）:
- 后端工程师 × 3（并行开发阶段 3）
- 前端工程师 × 1（Web Console）
- DevOps 工程师 × 1（Observability + Dev Flow）
- 总周期：8-10 周
- 适合：快速上线、商业项目

### 基础设施需求

**开发环境**:
- 开发机器（本地 SQLite）
- Redis（速率限制）
- Jaeger（追踪）
- Prometheus + Grafana（监控）

**生产环境**:
- 应用服务器（Gateway + Agent Runner）
- SQLite 或 PostgreSQL
- Redis 集群
- 监控栈（Prometheus + Grafana + Jaeger）
- 负载均衡器

---

## 质量保证

### 测试策略

**单元测试**:
- 覆盖率目标：> 80%
- 工具：Vitest
- 重点：Repository、业务逻辑

**集成测试**:
- 覆盖率目标：核心流程 100%
- 工具：Vitest + Supertest
- 重点：API 端点、Agent 执行流程

**端到端测试**:
- 覆盖率目标：关键用户流程
- 工具：Playwright
- 重点：Web Console 核心功能

**性能测试**:
- 工具：k6
- 指标：P95 延迟 < 2s，吞吐量 > 100 req/s

### 代码审查

- 所有 PR 需要至少 1 人审查
- 关键组件（Storage, Core Runtime）需要 2 人审查
- 使用 ESLint + Prettier 保证代码风格

---

## 发布策略

### 版本规划

**v0.1.0 - MVP**（Milestone 1）:
- Storage + Core Runtime + Authentication + Observability
- 发布时间：第 5 周

**v0.2.0 - 生产就绪**（Milestone 2）:
- + Tool Sandbox + Scheduler + Connector Worker
- 发布时间：第 8 周

**v0.3.0 - 完整功能**（Milestone 3）:
- + CLI Tool + Web Console
- 发布时间：第 13 周

**v1.0.0 - 正式版**（Milestone 4）:
- + Dev Flow + 文档完善 + 性能优化
- 发布时间：第 16 周

### 发布检查清单

每个版本发布前需要完成：
- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 性能测试达标
- [ ] 安全扫描无高危漏洞
- [ ] 文档更新
- [ ] CHANGELOG 更新
- [ ] 版本号更新

---

## 参考文档

- [OpenSpec 完成总结](./openspec/COMPLETION_SUMMARY.md)
- [架构设计文档](./openspec/changes/)
- [贡献指南](./CONTRIBUTING.md)

---

## 更新日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-03-10 | 1.0 | 初始版本 |
