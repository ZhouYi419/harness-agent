# PRD Agent

面向 MVP 的结构化 PRD 生成、评审和局部修订 Preset。v0.2 包含四个私有 Skill，
并新增 `create_prd`、`update_prd`、`review_prd` 三个确定性 JSON 工具。

PRD v0.2 统一包含 Product Overview、Goals、Users、Scenarios、Modules、Features、
Business Rules、Flows、Exceptions、Acceptance Criteria、Open Questions 和 Scope。
每个 Feature 必须包含名称、目标、角色、前置条件、用户操作、系统行为、输入、输出、
业务规则、异常场景和验收标准。

`update_prd` 使用 JSON Pointer 操作进行局部、模块级或功能级修改，未命中的内容保持
不变。`review_prd` 返回带 JSON 路径和严重度的问题列表，覆盖遗漏、冲突、模糊描述、
不可验收描述、异常场景和待确认项。

从仓库根目录验证并安装：

```sh
npm run validate
npm run install:dsh:dry-run -- prd-agent
npm run install:dsh -- prd-agent
```

详细使用方法和行为约束见仓库根目录的产品说明。
