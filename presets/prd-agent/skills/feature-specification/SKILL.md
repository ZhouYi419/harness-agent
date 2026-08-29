---
name: feature-specification
description: 创建、修改或评审 PRD Feature 时强制完整描述功能目标、交互、系统响应、规则、异常和可验收结果。
---

# Feature 规格

每个 `features` 数组元素都必须完整包含以下字段：

| 用户要求 | JSON 字段 | 约束 |
| --- | --- | --- |
| 功能名称 | `name` | 简短且唯一，描述一项可独立验收的能力 |
| 功能目标 | `goal` | 写用户或业务结果，不写实现方式 |
| 用户角色 | `userRoles` | 只包含已确认可使用该功能的角色 |
| 前置条件 | `preconditions` | 可建立、可判断的状态 |
| 用户操作 | `userActions` | 按发生顺序描述用户行为 |
| 系统行为 | `systemBehaviors` | 对每个关键操作给出可观察响应 |
| 输入 | `inputs` | 说明必要数据及已确认约束 |
| 输出 | `outputs` | 说明用户或外部系统可观察的结果 |
| 业务规则 | `businessRules` | 引用规则 ID 或写单一、确定的规则 |
| 异常场景 | `exceptions` | 引用异常 ID 或写触发、反馈与恢复方式 |
| 验收标准 | `acceptanceCriteria` | 引用 AC ID 或提供 Given/When/Then 对象 |

Feature 还必须有稳定 `id`，并用 `moduleId` 关联所属模块；暂时无法归属时使用 `null`，同时加入待确认项。

不要把多个无依赖能力塞入一个 Feature，也不要把单个按钮机械拆成 Feature。所有字段都必须存在；缺少已确认内容时保留空数组或空字符串，并把具体缺口加入 `openQuestions`，不得猜测。

验收标准必须具备可建立的前置状态、单一操作和可观察结果。异常至少覆盖该功能实际适用的输入无效、权限不足、重复操作、依赖失败或状态冲突；不适用的类别无需虚构。
