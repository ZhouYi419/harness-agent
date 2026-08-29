---
name: prd-generator
description: 在需求澄清通过后编排结构化 PRD 的创建、局部更新与 Review，并按需渲染或保存 JSON。
---

# PRD 创建、Review 与修订

仅在 `requirement-clarification` 已完成且允许继续后使用本 Skill。随后必须加载 `prd-structure`；涉及任何 Feature 时同时加载 `feature-specification`。

## 选择模式

- **创建**：把用户已确认事实整理成 `user_supplement`，调用 `create_prd`；不要手写另一套 JSON 结构。
- **Review**：将完整 PRD 传给 `review_prd`。默认只输出结构化 Review 结果，不修改 PRD。
- **修订**：读取完整当前 PRD，把修改要求映射为最小 JSON Pointer 操作后调用 `update_prd`。模块级和功能级修改同样使用该工具。

Review 或修订时，按需读取 [Review 与修订](references/review-and-revision.md)；需要改善措辞时读取 [写作规则](references/writing-rules.md)。旧 Markdown 模板只在用户明确要求 Markdown 展示时读取，不是 v0.2 的事实源。

## 输出约定

- 默认使用中文；跟随用户明确使用的其他语言。
- 默认在对话中返回完整结构化 PRD JSON。
- 只有用户明确要求保存、写入、落盘或更新文件时才使用文件工具。
- 用户指定路径时使用该工作区内路径；否则使用 `docs/prd/<产品名-slug>.json`。slug 保留字母、数字和中日韩文字，把连续空格及标点替换为单个 `-`，去掉首尾 `-`。
- 创建新文件前确认需求门禁已经放行。更新已有文件前先读取完整 JSON，再原地更新。
- 不自动创建版本副本，不在 PRD 正文中增加变更日志。文件完成后，在聊天中列出路径、主要变更和仍待确认事项。
- 如果文件操作被工作区沙箱拒绝，不要改用 Shell 或其他绕过方式；说明限制并请用户提供允许的工作区内路径。

## 内容边界

- 正式需求只能来自“用户已明确”或“用户已确认”的事实。
- 未确认但不阻塞的内容写入“待确认事项”。
- 可选优化只能写入“Agent 建议”，并明确其不会自动进入 MVP 范围。
- 不引入用户没有要求的技术架构、供应商、数据模型或运营流程。
- 保持 MVP 数据精简，但模块、Feature、业务规则、异常场景和验收标准必须可以相互追溯。
