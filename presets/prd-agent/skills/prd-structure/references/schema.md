# PRD v0.2 JSON Schema 说明

规范字段如下：

```json
{
  "schemaVersion": "0.2",
  "productOverview": {
    "name": "",
    "summary": "",
    "problem": "",
    "valueProposition": ""
  },
  "goals": [],
  "users": [],
  "scenarios": [],
  "modules": [],
  "features": [],
  "businessRules": [],
  "flows": [],
  "exceptions": [],
  "acceptanceCriteria": [],
  "openQuestions": [],
  "scope": {
    "inScope": [],
    "outOfScope": []
  }
}
```

建议对象形状：

- Goal：`{ "id", "description", "successSignal" }`
- User：`{ "id", "role", "needs" }`
- Scenario：`{ "id", "userId", "trigger", "action", "expectedOutcome" }`
- Module：`{ "id", "name", "goal" }`
- Business Rule：`{ "id", "featureIds", "description" }`
- Flow：`{ "id", "featureIds", "name", "steps", "completionCondition" }`
- Exception：`{ "id", "featureIds", "trigger", "systemBehavior", "userFeedback", "recovery" }`
- Acceptance Criterion：`{ "id", "featureIds", "given", "when", "then" }`
- Open Question：`{ "id", "question", "impact" }`

Feature 的强制形状由 `feature-specification` Skill 定义。对象可以包含业务需要的附加字段，但不得改变上述字段的语义。

## 局部更新协议

`update_prd` 的 `modification_request` 使用以下结构：

```json
{
  "operations": [
    { "op": "replace", "path": "/features/0/goal", "value": "更新后的目标" },
    { "op": "add", "path": "/openQuestions/-", "value": { "id": "TBD-002", "question": "...", "impact": "..." } },
    { "op": "remove", "path": "/scope/outOfScope/0" }
  ]
}
```

支持 `add`、`replace`、`remove`。路径使用 JSON Pointer；数组末尾追加使用 `-`。一次请求应只包含实现用户修改所必需的操作。
