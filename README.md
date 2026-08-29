# DSH Extension Kit

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的可扩展制品仓库，
统一管理 Agent Preset、Skill、Plugin、Workflow 和 Bundle。

当前可用制品是 **PRD Agent 0.2.0**：把自然语言产品想法转成结构化 MVP PRD JSON，
支持需求澄清、局部/模块/功能级更新、PRD Review、完整性检查，以及在用户明确要求时
创建或更新 JSON 文件。

## 运行要求

- Node.js 22.19+、24 或 26
- 官方 DeepSeek Harness Web Profile
- 使用真实模型时需要可用的 DeepSeek 模型配置

DSH 仍处于开发预览阶段。本仓库当前以 `2026-08` 接口为兼容基线，记录在
[`dsh-kit.json`](dsh-kit.json) 中。

## 快速开始

```sh
npm run validate
npm run install:dsh:dry-run
npm run install:dsh
```

显式指定制品或自定义 DSH Home：

```sh
npm run install:dsh:dry-run -- prd-agent
npm run install:dsh -- prd-agent
npm run install:dsh -- prd-agent --dsh-home /absolute/path/to/dsh-home
```

目标内容相同时安装器保持幂等。目标存在不同内容时默认拒绝覆盖；确认更新可使用：

```sh
npm run install:dsh -- prd-agent --force
```

`--force` 会先将旧目录重命名为带时间戳的同级备份，再发布新版本，不自动删除备份。

## 使用 PRD Agent

启动 DSH Web：

```sh
npx @deepseek-ai/dsh web
```

新建空白会话并选择 **PRD Agent**。启动 DSH 时所在目录就是 Agent 工作区，默认文档路径
`docs/prd/<产品名-slug>.json` 相对于该目录解析。

生成并保存示例：

```text
我想做一个帮助小型健身房管理私教预约的产品，主要用户是店长和教练。
MVP 需要创建课程、会员预约、取消预约和查看当天课表。

根据确认的需求生成结构化 PRD，并保存到 docs/prd/gym-booking.json。
```

如果产品目标、用户、核心场景或 MVP 边界不完整，Agent 会集中提出最多 5 个关键问题，
并在得到答案前停止生成正式 PRD。只要求 Review 时不会修改文件；明确修订时会先读取
完整文档并原地更新。具体制品说明见
[`presets/prd-agent/README.md`](presets/prd-agent/README.md)。

## 项目结构

```text
presets/                 Agent Preset 及其私有 Skill
skills/                  可供多个 Preset 复用的 Skill
plugins/                 Tool、Provider 和 Service 插件
workflows/               多步骤或多 Agent 编排
bundles/                 面向场景的安装组合
packages/
├── catalog/             读取和校验统一制品目录
├── installer/           安全、幂等的制品安装核心
└── validator/           按制品类型执行结构验证
scripts/                 CLI 入口和 DSH 冒烟检查
tests/                   契约与集成测试
docs/                    架构和制品编写规范
dsh-kit.json             唯一制品清单及 DSH 兼容基线
```

架构边界和新增制品规则见 [`docs/architecture.md`](docs/architecture.md)。

## 新增制品

1. 将实现放入对应的顶层目录。
2. 在 `dsh-kit.json` 中登记唯一 ID、类型、版本和源码路径。
3. 为制品补充 README 和相关测试。
4. 运行 `npm test`。

Preset 私有 Skill 放在 `presets/<id>/skills/`；真正跨 Agent 复用的 Skill 才放在根
`skills/`。跨会话服务、Provider、凭据和存储属于 Host Plane，应通过 Plugin/Bundle
提供，不能塞进会话级 Preset。

## 验证和测试

```sh
npm test
```

测试覆盖制品清单、Preset/Skill 结构、安装 dry-run、首次安装、幂等重装、冲突拒绝、
`--force` 备份替换和临时 DSH Web Profile 配置冒烟检查。真实模型的交互行为仍需在
Web UI 中验证。

## License

MIT
