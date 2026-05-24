# Herox 开发计划

## 1. 目标

本计划把 Herox 拆成可发布、可验证的阶段。优先交付一个能通过 npm 安装、能在真实项目中执行代码任务的 MVP，然后逐步补齐 Plugins、Hooks、Background Subagents 和更完整的 MCP 能力。

## 2. 技术选型

- Runtime：Node.js 20+。
- Language：TypeScript, ESM。
- Package manager：pnpm workspace。
- CLI framework：Commander.js 或 Clipanion。MVP 推荐 Commander.js，生态稳定、心智负担低。
- Terminal UI：先使用 prompts + chalk + ora + diff renderer；复杂 TUI 延后。
- Validation：Zod。
- HTTP：内置 `fetch` + 自定义 SSE parser，避免 OpenAI SDK 对兼容供应商的限制。
- MCP：`@modelcontextprotocol/sdk`。
- Tests：Vitest。
- Lint/format：ESLint + Prettier。
- Packaging：tsdown 输出纯 ESM CLI，首发不做原生二进制。
- Release：Changesets + npm provenance。
- Future runtime：后期评估 Bun 构建和单文件二进制发布，但不进入 MVP。

## 3. 仓库结构

MVP 使用 monorepo，但只拆必要模块。先发布单一 npm 包 `@heroor/x`，其他 workspace 包只作为内部模块，不单独发布。

```text
.
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docs/
│   ├── requirements.md
│   └── development-plan.md
├── packages/
│   ├── cli/
│   ├── core/
│   ├── providers/
│   ├── tools/
│   └── shared/
└── examples/
    └── basic-project/
```

包职责：

- `packages/cli`：对外 npm 包 `@heroor/x`，命令解析、交互输入、终端输出、进程生命周期。
- `packages/core`：Agent Loop、上下文构建、会话管理、权限引擎、事件总线。
- `packages/providers`：OpenAI-compatible adapter、provider presets、streaming parser。
- `packages/tools`：内置工具和 tool registry。
- `packages/shared`：通用类型、错误、日志、路径工具。

MVP 阶段，MCP、Skills、Plugins、Subagents 先放在 `core` 或 `tools` 内部目录中实现。等接口稳定后，再拆成独立 workspace 包：

```text
packages/
  mcp/
  skills/
  plugins/
  agents/
```

## 4. 里程碑总览

```text
M0  Repo bootstrap
M1  Config + provider adapter
M2  Agent Loop + streaming CLI
M3  Tools + permission engine
M4  Session persistence + resume + compact
M5  MCP stdio tools
M6  Skills + foreground subagents
M7  npm MVP release
M8  Plugins + hooks
M9  v1.0 hardening
```

## 5. M0：仓库初始化

目标：建立可持续开发的 TypeScript monorepo。

任务：

- 初始化 workspace 根 `package.json`。
- 创建 `packages/cli/package.json`，包名为 `@heroor/x`。
- 配置 `pnpm-workspace.yaml`。
- 添加 TypeScript、Vitest、ESLint、Prettier、tsdown。
- 创建 MVP 五包结构：`cli`、`core`、`providers`、`tools`、`shared`。
- 实现 `herox --version` 和 `herox --help`。
- 添加基础 CI 脚本：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。

验收：

- `pnpm install` 成功。
- `pnpm build` 生成可执行 CLI。
- `node packages/cli/dist/index.js --help` 正常输出。
- `pnpm test` 至少运行一个 smoke test。
- `pnpm --filter @heroor/x pack --dry-run` 不包含源码 map、测试 fixture 和无关文件。

## 6. M1：配置系统与 Provider Adapter

目标：Herox 能读取配置并调用 OpenAI-compatible 模型。

任务：

- 实现配置层级合并：defaults、user、project、local、env、CLI flags。
- 支持 `~/.herox/settings.json`、`.herox/settings.json`、`.herox/settings.local.json`。
- 实现 provider preset：`openai`、`deepseek`、`qwen`、`moonshot`、`openrouter`、`ollama`。
- 实现 Chat Completions 请求和非流式响应。
- 实现流式响应 SSE parser。
- 实现错误归一化：鉴权失败、限流、模型不存在、网络失败、上下文超限。
- 实现 `herox provider test <name>`。

验收：

- 可以通过环境变量配置 API key。
- `herox provider test openai` 能输出连接状态和模型响应摘要。
- 流式和非流式请求均有单元测试。
- 不同 provider 的 base URL、headers、model 参数能被覆盖。

## 7. M2：Agent Loop 与 CLI 会话

目标：完成最小可用的交互式智能体。

任务：

- 实现 `herox` 交互会话。
- 实现 `herox run "task"` 一次性任务。
- 加载 `HEROX.md`、用户级 `~/.herox/HEROX.md`。
- 实现模型消息构造：system、instructions、conversation history、tool results。
- 实现最大轮数、最大输出 token、用户中断。
- 实现基础 slash commands：`/help`、`/model`、`/status`、`/exit`。
- 实现终端 renderer：流式文本、错误、模型状态、token usage。

验收：

- 在空项目中可与模型对话。
- 在有 `HEROX.md` 的项目中，模型请求包含项目指令。
- Ctrl+C 能中断当前模型请求且不破坏会话。
- `herox run` 能以退出码表达成功或失败。

## 8. M3：Tools 与 Permission Engine

目标：让 Agent 能安全地读写项目和执行命令。

任务：

- 实现 tool registry。
- 实现内置工具：`fs.read`、`fs.list`、`fs.search`、`fs.patch`、`shell.exec`、`git.status`、`git.diff`。
- 实现 tool call 解析和结果回传。
- 实现 permission modes：`plan`、`default`、`acceptEdits`。
- 实现 allow/deny 规则匹配。
- 实现人工确认 prompt，支持本次允许、会话允许、永久允许。
- 实现工具输出截断和摘要。

验收：

- 模型能搜索、读取并修改文件。
- 写文件和 shell 执行在默认模式下会请求确认。
- `plan` 模式下任何写入和 shell 执行都会被拒绝。
- deny 规则优先于 allow 规则。
- destructive command 测试用例必须被拦截。

## 9. M4：会话持久化、恢复和压缩

目标：会话可以审计、恢复，并能处理长上下文。

任务：

- 实现 JSONL transcript。
- 保存模型响应、工具调用、权限决策和错误摘要。
- 实现 `herox resume [session-id]`。
- 实现 `/compact`：将历史压缩成摘要消息。
- 添加 `--no-save` 和 `--json`。
- 实现敏感字段脱敏。

验收：

- 会话结束后能在 `~/.herox/sessions` 找到记录。
- resume 后模型能继续前一会话上下文。
- transcript 中不出现 API key 和 Authorization header。
- `/compact` 后上下文长度明显下降，且保留任务状态。

## 10. M5：MCP stdio Tools

目标：Herox 能连接 MCP server 并把 MCP tools 纳入统一工具系统。

任务：

- 支持 `.herox/mcp.json`。
- 实现 MCP stdio server lifecycle。
- 支持 `${workspaceFolder}` 和 `${env:NAME}` 展开。
- 将 MCP tools 映射为 namespaced Herox tools。
- MCP tool 调用接入 permission engine。
- 实现 `herox mcp list` 和 `herox mcp add` 的基础版本。

验收：

- 可以连接一个 stdio MCP server。
- 模型能调用 MCP tool 并收到结果。
- MCP server 启动失败时错误可诊断，不导致无关会话崩溃。
- MCP tool 权限与内置工具一致。

## 11. M6：Skills 与 Foreground Subagents

目标：支持可复用工作流和上下文隔离任务。

任务：

- 实现 skill metadata discovery。
- 解析 `SKILL.md` frontmatter。
- 启动时只加载 skill metadata，调用时再加载内容。
- 实现 `herox skill list` 和 `herox skill run <name>`。
- 实现 `.herox/agents/*.md` 解析。
- 实现 foreground subagent：新上下文、专属 prompt、工具限制、返回摘要。
- 实现 `herox agent list`。

验收：

- 项目 skill 可被发现并按需注入。
- skill 推荐工具不能绕过全局权限。
- subagent 能用独立上下文读取项目并返回结构化摘要。
- subagent 的工具限制生效。

## 12. M7：npm MVP Release

目标：发布可安装的 MVP。

任务：

- 整理 README：安装、快速开始、provider 配置、权限说明。
- 添加 examples。
- 添加 `herox doctor`。
- 配置 Changesets。
- 配置 npm provenance。
- 配置 GitHub Actions trusted publishing。
- 配置 `files` 白名单，只发布 `dist`、`README.md`、`LICENSE` 和必要元数据。
- 发布 `@heroor/x@0.1.0`。

验收：

- `npm install -g @heroor/x` 后能运行 `herox`。
- npm 包安装不依赖 `postinstall`。
- 新用户能在 5 分钟内完成 provider 配置并跑通一次任务。
- README 覆盖常见 provider 示例。
- `herox doctor` 能发现缺失 API key、Node 版本过低、MCP 启动失败等问题。

## 13. M8：Plugins 与 Hooks

目标：补齐扩展分发和生命周期拦截能力。

任务：

- 定义 `.herox-plugin/plugin.json` schema。
- 支持本地路径 plugin 安装。
- 支持 plugin commands、skills、agents、mcp。
- 实现 plugin namespace。
- 支持 npm 和 Git source 安装。
- 实现 hooks：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`SessionEnd`。
- 支持 command/http/prompt hook。

验收：

- 示例 plugin 可以贡献 skill、agent、command 和 MCP server。
- 命名冲突能通过 namespace 解决。
- `PreToolUse` hook 可以阻止高风险工具调用。
- 首次运行项目共享 hook 时会提示用户确认。

## 14. M9：v1.0 Hardening

目标：从可用走向可靠。

任务：

- MCP HTTP/SSE、resources、prompts。
- Background subagents 和并发结果汇总。
- Provider capabilities 自动探测。
- 更完整的 JSON event stream。
- Windows 路径、Shell、权限兼容测试。
- 模型请求重试、限流退避和超时策略。
- 大型项目性能优化：索引、缓存、上下文裁剪。
- 安全审计：敏感文件、命令注入、plugin 来源、MCP 权限。

验收：

- 核心包测试覆盖率达到 80% 以上。
- 在 macOS、Linux、Windows CI 上通过测试。
- 常见 provider 至少有 smoke test 或 mock contract test。
- 文档包含迁移指南、插件开发指南和安全模型。

## 15. 测试策略

单元测试：

- 配置合并和优先级。
- provider 请求构造、stream parser、错误归一化。
- permission engine allow/deny 匹配。
- tool schema validation。
- skill、agent、plugin manifest 解析。

集成测试：

- `herox run` with mocked provider。
- tool call 多轮循环。
- MCP stdio mock server。
- session save/resume。
- plugin loading。

端到端测试：

- 临时项目中运行 `herox run "read package.json"`。
- 模拟模型返回 tool call，验证文件修改和权限提示。
- npm pack 后安装到临时目录运行 smoke test。

安全测试：

- 拦截 `rm -rf`、覆盖 `.env`、写 `.git`、读取 home 敏感目录。
- transcript 脱敏。
- plugin hook 首次运行确认。
- MCP server 环境变量展开不泄露 secret。

## 16. 发布策略

版本规划：

- `0.1.0`：MVP，单 Agent、基础工具、stdio MCP、skills、foreground subagent。
- `0.2.0`：plugins、hooks、自定义 commands。
- `0.3.0`：background subagents、MCP HTTP/SSE。
- `0.4.0`：Bun 构建实验和平台二进制发布预研。
- `1.0.0`：稳定配置协议、插件协议、权限协议和公共 SDK。

发布前检查：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @heroor/x pack --dry-run
```

npm 包要求：

- `name`: `@heroor/x`
- `bin.herox`: `dist/index.js`
- `engines.node`: `>=20`
- 首发为纯 Node.js CLI，不包含 `postinstall`、平台 optional dependency 和原生二进制。
- 使用 `npm publish --provenance --access public` 或 GitHub trusted publishing 等效流程。
- 包体积需要监控，避免把测试 fixtures 和源码 map 全量发布。
- 公开 API 在 1.0 前可以调整，但需要在 changelog 标注 breaking changes。

后期二进制发布策略：

- 主包继续保留 `@heroor/x` 和 `herox` 命令。
- 平台包命名为 `@heroor/x-darwin-arm64`、`@heroor/x-linux-x64`、`@heroor/x-linux-x64-musl`、`@heroor/x-win32-x64` 等。
- 优先采用 JS shim 在运行时解析平台包并 spawn 二进制，减少 postinstall 失败面。
- 如果必须使用 postinstall 链接二进制，需要增加安装失败诊断、手动修复命令、平台包 checksum 校验和安全审查。

## 17. 优先级排序

最高优先级：

- Provider adapter。
- Agent Loop。
- Tools。
- Permission engine。
- Session persistence。

第二优先级：

- MCP stdio。
- Skills。
- Foreground subagents。
- npm release。

第三优先级：

- Plugins。
- Hooks。
- Background subagents。
- MCP HTTP/SSE。
- Auto memory。

## 18. 近期下一步

建议下一次开发直接进入 M0：

1. 初始化 pnpm monorepo。
2. 创建 `packages/cli`，并将其发布包名设置为 `@heroor/x`。
3. 实现 `herox --help`、`herox --version`、`herox doctor` 的空壳。
4. 建立 Vitest、TypeScript、ESLint、Prettier 基线。
5. 为 M1 的配置系统写第一批测试。
