# 架构约定

本仓库是 DSH 扩展制品集合，不实现新的 Harness 核心。

## 制品边界

- `presets/`：每会话挂载的 Agent Persona、工具 Consumer、私有 Skill 和策略。
- `skills/`：可以被多个 Preset 使用的通用知识与操作规范。
- `plugins/`：Tool、Provider 和 Service 的代码实现。
- `workflows/`：确定性的多步骤或多 Agent 编排。
- `bundles/`：把 Host 能力和 Agent 能力组合成可安装场景。

Host Plane 持有跨会话的注册表、凭据、存储、沙箱和 Provider。Agent Plane 只贡献
当前会话使用的 Persona、Prompt、工具 Consumer、Skill 和会话级策略。需要被 Host
或多个会话共享的 Service 不得放进 Preset。

## 制品清单

`dsh-kit.json` 是唯一制品目录。新增制品必须包含稳定的 kebab-case `id`、类型、
版本和工作区相对源码路径。安装和验证代码不得维护第二份制品列表。

当前安装器实现了 `preset`。其他类型可以先登记和验证，但在确定 DSH 的正式安装
位置与生命周期前，不应静默复制到猜测的目录。

## 版本策略

仓库版本描述工具箱自身的演进；每个制品在清单中独立版本化。`compatibility.dsh`
记录验证过的 DSH 兼容基线。升级基线时应同时运行配置冒烟测试。
