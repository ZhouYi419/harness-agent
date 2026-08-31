---
name: requirement-analysis
description: 分析产品想法或已有需求，识别已确认、缺失、模糊、冲突、依赖、假设和建议，并形成结构化 Requirement Context。
---

# 需求分析

在创建 PRD 或处理会改变产品需求的补充信息前使用本 Skill。

分析结果必须来自用户原始描述、用户后续回答或已有 Requirement Context。不得把行业惯例、Agent 建议或未经确认的假设写成已确认需求。

Requirement Context 的字段结构见 [Requirement Context](references/requirement-context.md)。

## 分析维度

逐项检查以下信息：

1. **目标识别**：产品解决什么问题，期望产生什么结果。
2. **用户识别**：谁使用产品，谁管理产品，角色之间是否存在权限差异。
3. **场景识别**：用户在什么情况下开始使用，完成什么操作，期望什么结果。
4. **功能识别**：实现核心场景需要哪些能力，哪些属于 MVP。
5. **约束识别**：权限、状态、价格、时间、数量、合规、数据和性能限制。
6. **依赖识别**：外部系统、第三方服务、人工流程和前置业务能力。
7. **假设识别**：分析过程中暂时采用、但用户尚未确认的前提。
8. **歧义识别**：存在两种以上合理解释的描述。
9. **冲突识别**：不能同时成立的目标、规则、范围或用户陈述。

## 分类规则

每条信息只能进入一个主要类别：

- `confirmedRequirements`：用户已经明确或已经回答确认的需求。
- `missingRequirements`：完成核心流程所必需、但尚未提供的信息。
- `ambiguousRequirements`：已有描述存在多种合理解释。
- `conflictingRequirements`：现有陈述不能同时成立。
- `suggestions`：Agent 提出的可选优化，不属于正式需求。
- `assumptions`：为了继续分析而暂时采用的前提，必须标记为未确认。
- `dependencies`：需求成立或实现所依赖的外部条件。
- `pendingQuestions`：需要向用户提出的问题。

分析完成后调用 `analyze_requirement`，不要只在自然语言中输出分析结果。

## 证据要求

每个已确认需求应尽量包含：

- `statement`：准确、单一的需求陈述。
- `category`：goal、user、scenario、feature、constraint、dependency 或 scope。
- `source`：user-description、user-answer 或 existing-context。
- `evidence`：支持该结论的用户原文摘要。

没有用户证据的内容不得标记为 confirmed。

## 阻塞判断

以下信息缺失或冲突时，通常阻塞 PRD 生成：

- 产品目标和待解决问题。
- 主要用户。
- 至少一个核心使用场景。
- MVP 范围。
- 会改变核心流程结果的权限、状态或业务规则。
- 两条不能同时成立的需求。

非关键的文案、界面布局、技术实现偏好通常不阻塞 PRD，可以作为建议或待确认项保留。