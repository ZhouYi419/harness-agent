# DSH PRD Agent

基于官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Agent Preset 和 Skill 机制实现的单 Agent PRD 生成器。

V0.1 提供：

- 自然语言产品想法 → 精简 MVP PRD
- 需求完整性判断和关键问题澄清
- 功能模块、子功能、业务规则、异常场景和验收标准生成
- PRD Review
- 根据自然语言反馈修订完整 PRD
- 按用户明确要求创建或原地更新 Markdown 文件

不包含自定义 Tool、HTTP API、数据库、独立前端、多 Agent 或联网检索。

## 运行要求

- Node.js 22.19+、24 或 26
- 官方 DeepSeek Harness Web Profile
- 使用真实模型时需要可用的 DeepSeek 模型配置；通常通过 `DEEPSEEK_API_KEY` 或 DSH Web 的 Models 设置提供

DSH 仍处于开发预览阶段并可能发生不兼容变更。本项目以 2026-08 的官方 Agent Preset、`dsh-skill-filesystem` 和 `dsh-tool-skill` 接口为兼容基线。

## 安装

先验证将要安装的内容：

```sh
npm run validate
npm run install:dsh:dry-run
```

安装到默认的 `${DSH_HOME:-~/.dsh}/.agent-presets/prd-agent`：

```sh
npm run install:dsh
```

使用自定义 DSH Home：

```sh
npm run install:dsh -- --dsh-home /absolute/path/to/dsh-home
```

如果目标目录内容与当前版本一致，安装器不做任何修改。目标存在不同内容时会默认拒绝覆盖。确认更新时使用：

```sh
npm run install:dsh -- --force
```

`--force` 会先把旧目录重命名为同级的 `prd-agent.backup-<时间戳>`，再发布新版本；安装器不会自动删除备份。

## 启动和选择 Agent

启动 DSH Web：

```sh
npx @deepseek-ai/dsh web
```

打开 Web UI，新建空白会话，并在 Agent Preset 列表中选择 **PRD Agent**。如果 Web 已经打开，刷新预设列表或新建会话；已经产生消息的会话不能中途切换预设。

启动 DSH 时所在目录就是 PRD Agent 的工作区。默认文件路径 `docs/prd/<产品名-slug>.md` 相对于该目录解析。

## 使用示例

### 从想法生成 PRD

```text
我想做一个帮助小型健身房管理私教预约的产品，主要用户是店长和教练。
MVP 需要创建课程、会员预约、取消预约和查看当天课表。
```

如果产品目标、核心用户、场景或 MVP 边界不完整，Agent 会一次集中询问最多 5 个关键问题，并在得到答案前停止生成正式 PRD。

### 生成并保存

```text
根据刚才确认的需求生成 PRD，并保存到 docs/prd/gym-booking.md。
```

没有指定路径时，Agent 使用 `docs/prd/<产品名-slug>.md`。默认仅在对话中输出；“保存、写入、落盘、更新文件”等明确指令才会触发文件操作。

### Review 已有 PRD

```text
Review docs/prd/gym-booking.md，重点检查业务规则、异常场景和验收标准。
```

仅要求 Review 时，Agent 输出问题报告，不改原文件。

### 根据反馈修订

```text
更新 docs/prd/gym-booking.md：取消预约必须在课程开始前 4 小时完成；
不足 4 小时时禁止取消，并提示联系门店。其他内容保持不变。
```

Agent 会先读取完整文件，保留未受影响的稳定 ID，更新相关功能、规则、异常和验收标准，原地写回并在聊天中总结变更。不会创建 v2/v3 副本，也不会在正文中累计变更日志。

## PRD 输出结构

默认模板包含：

1. 文档信息
2. 背景与目标
3. 用户与核心场景
4. MVP 范围
5. 核心流程
6. 功能模块与子功能（`FR-nnn`）
7. 业务规则（`BR-nnn`）
8. 异常场景（`EX-nnn`）
9. Given/When/Then 验收标准（`AC-nnn`）
10. 非功能要求
11. 待确认事项
12. Agent 建议（非已确认需求）

正式需求只接受用户明确陈述或确认过的事实。价格、权限、审批、状态流转、数据归属、通知条件、失败补偿和关键阈值不会被擅自补充。

## 能力边界

| 能力 | DSH 内置模块 | 用途 |
| --- | --- | --- |
| Persona | `@deepseek-ai/dsh-persona` | 固定 PRD Agent 职责和文件策略 |
| Skill 发现 | `@deepseek-ai/dsh-skill-filesystem` | 仅发现预设内的两个 Skill |
| Skill 加载 | `@deepseek-ai/dsh-tool-skill` | 按需加载完整 Skill 指令 |
| 用户澄清 | `@deepseek-ai/dsh-tool-ask-user` | 收集关键产品决策 |
| 文件操作 | `@deepseek-ai/dsh-tool-fs` | 在 DSH 工作区沙箱内读取、创建和编辑 PRD |

预设没有 Shell、Web、Goal、Todo、Workflow 或 Subagent 模块。文件操作继续受 DSH Web Profile 的工作区沙箱、读取前修改策略和用户批准机制约束。

## 验证和测试

```sh
npm test
```

测试覆盖：

- 预设 YAML 行和模块白名单
- 恰好两个可发现 Skill、frontmatter 和引用资源
- 安装 dry-run、首次安装、幂等重装和冲突拒绝
- `--force` 备份与替换
- 自定义 `DSH_HOME`
- 本机存在 `dsh` 时的临时 Web Profile 配置冒烟检查；未安装时明确跳过

真实模型行为需要在 Web UI 中检查，因为用户问题是交互式调用。设置模型凭据后，至少验证以下场景：

1. 输入“做一个预约产品”时只提出澄清问题，不输出正式 PRD。
2. 回答目标用户、问题、核心场景和 MVP 范围后，生成带关联 ID 的完整 PRD。
3. 未确认的非关键内容只出现在“待确认事项”，Agent 建议不进入正式范围。
4. 仅要求 Review 时不修改文件。
5. 含糊或冲突的修改要求不会覆盖原文件。
6. 明确的修改要求原地更新，并返回路径、变更摘要和剩余待确认项。

## 项目结构

```text
prd-agent/
├── agent.cordis.yml
├── preset.yml
└── skills/
    ├── requirement-clarification/SKILL.md
    └── prd-generator/
        ├── SKILL.md
        └── references/
scripts/
├── install.mjs
├── smoke-dsh.mjs
└── validate.mjs
tests/
└── install.test.mjs
```

## 恢复备份

安装器会在更新输出中打印备份的绝对路径。停止 DSH Web 后，把当前 `prd-agent` 目录移到其他位置，再将目标备份目录重命名回 `prd-agent`；重新启动或新建会话后生效。
