---
name: requirement-clarification
description: 兼容旧流程的需求澄清入口，将创建或修改 PRD 的请求路由到结构化需求分析和提问策略。
---

# 需求澄清入口

本 Skill 保留用于兼容 PRD Agent v0.1 和 v0.2 的调用习惯。

处理新的产品想法或会改变产品需求的修改时：

1. 加载 `requirement-analysis`。
2. 调用 `analyze_requirement` 形成 Requirement Context。
3. 加载 `question-strategy`。
4. 存在阻塞问题时调用 `ask_requirement_questions`。
5. 用户回答后调用 `apply_requirement_answers`。
6. 重新检查 Requirement Context。
7. 阻塞问题全部解决后，加载 `prd-generator`。

不得再通过自然语言事实账本代替 Requirement Context，也不得直接调用通用问答工具绕过问题排序。
