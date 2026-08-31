# Requirement Context v0.3

Requirement Context 是需求澄清阶段的结构化事实源，不等同于最终 PRD。

```json
{
  "schemaVersion": "0.3",
  "productDescription": "",
  "confirmedRequirements": [],
  "missingRequirements": [],
  "ambiguousRequirements": [],
  "conflictingRequirements": [],
  "suggestions": [],
  "pendingQuestions": [],
  "assumptions": [],
  "dependencies": [],
  "answerHistory": []
}
```

## 已确认需求

```json
{
  "id": "REQ-001",
  "category": "goal",
  "statement": "产品需要减少小型健身房的预约冲突",
  "source": "user-description",
  "evidence": "用户明确提出目前人工预约容易冲突"
}
```

## 缺失需求

```json
{
  "id": "MIS-001",
  "category": "constraint",
  "description": "尚未明确会员最晚可以提前多久取消预约",
  "impact": "无法确定取消预约的业务规则和验收标准",
  "priority": "high",
  "required": true,
  "question": "会员最晚可以在课程开始前多久取消预约？"
}
```

## 模糊需求

```json
{
  "id": "AMB-001",
  "category": "feature",
  "statement": "管理员可以管理所有预约",
  "interpretations": [
    "管理员只能查看和取消预约",
    "管理员可以创建、修改和取消预约"
  ],
  "impact": "影响管理员权限范围",
  "priority": "high",
  "blocking": true
}
```

## 冲突需求

```json
{
  "id": "CON-001",
  "category": "constraint",
  "statements": [
    "会员可以随时取消预约",
    "课程开始前 24 小时内不得取消"
  ],
  "impact": "无法确定取消预约规则",
  "priority": "critical"
}
```

## 待确认问题

```json
{
  "id": "Q-MIS-001",
  "sourceType": "missing",
  "sourceId": "MIS-001",
  "header": "取消规则",
  "question": "会员最晚可以在课程开始前多久取消预约？",
  "detail": "该规则会影响取消流程和验收标准。",
  "priority": "high",
  "required": true,
  "options": [
    {
      "label": "提前 24 小时（Recommended）",
      "description": "课程开始前 24 小时外允许会员自行取消。"
    },
    {
      "label": "提前 2 小时",
      "description": "提供更灵活的取消窗口。"
    }
  ],
  "multiSelect": false
}
```

## 优先级

仅使用：

- `critical`
- `high`
- `medium`
- `low`

冲突、核心目标、主要用户、MVP 范围和会改变核心流程结果的规则通常为 critical 或 high。
