---
name: prd-structure
description: 创建、更新或检查结构化 PRD JSON 时统一顶层数据结构、字段语义、引用关系和范围表达。
---

# PRD 结构

PRD 的规范载体是 JSON。创建、局部更新、模块级或功能级修改以及 Review 时，都必须遵循 [PRD JSON Schema](references/schema.md)。

## 结构约束

- 顶层必须包含 Product Overview、Goals、Users、Scenarios、Modules、Features、Business Rules、Flows、Exceptions、Acceptance Criteria、Open Questions 和 Scope 对应字段。
- `schemaVersion` 固定为 `0.2`。集合字段即使为空也使用数组，禁止用省略字段、`null` 或“暂无”字符串代替。
- Modules 负责业务分组；Features 是可独立描述、实现和验收的功能。Feature 通过 `moduleId` 关联 Module。
- 规则、流程、异常和验收项应使用稳定 ID，并在适用时引用 Feature ID；局部更新不得重排或复用未受影响的 ID。
- `scope.inScope` 只放已确认的 MVP 能力，`scope.outOfScope` 只放已明确排除或延期的能力。
- 未确认但不阻塞的事实进入 `openQuestions`，不得用 Agent 推测填充正式字段。

## 工具使用

- 新建调用 `create_prd`，传入原始产品描述以及只含已确认事实的 `user_supplement`。
- 局部修改调用 `update_prd`。把用户要求转换为最小 JSON Pointer 操作，只修改必要路径。
- Review 调用 `review_prd`，保留工具返回的问题路径、严重度和建议，不把警告冒充已确认需求。

如果用户需要人类可读版本，可以在工具返回 JSON 后额外渲染 Markdown；JSON 始终是结构化事实源。
