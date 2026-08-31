// Feature 必填字段的唯一代码级清单。创建时负责补齐类型，Review 时负责逐项检查。
const FEATURE_FIELDS = [
  'name', 'goal', 'userRoles', 'preconditions', 'userActions', 'systemBehaviors',
  'inputs', 'outputs', 'businessRules', 'exceptions', 'acceptanceCriteria',
]

// 除 Product Overview 和 Scope 外，PRD v0.2 的顶层集合字段。
const ROOT_ARRAY_FIELDS = [
  'goals', 'users', 'scenarios', 'modules', 'features', 'businessRules', 'flows',
  'exceptions', 'acceptanceCriteria', 'openQuestions',
]

const ROOT_FIELDS = ['productOverview', ...ROOT_ARRAY_FIELDS, 'scope']

// Review 的轻量启发式词表：用于发现“适当、尽快”等模糊措辞，以及验收标准中
// 是否至少存在条件/动作/可观察结果相关词。它们是质量信号，不是自然语言理解模型。
const VAGUE_WORDS = /(?:等|相关|适当|尽快|必要时|友好|高效|灵活|通常|可能|大概|视情况|etc\.?|appropriate|quickly|user[- ]friendly|flexible|as needed)/i
const TESTABLE_WORDS = /(?:当|如果|给定|完成|显示|返回|保存|拒绝|不得|必须|可以|应|成功|失败|within|given|when|then|must|should|returns?|displays?|saves?|rejects?)/i

function clone(value) {
  // 所有公共入口都基于深拷贝工作，保证调用方传入的原 PRD 不被原地修改。
  return value === undefined ? undefined : structuredClone(value)
}

function asArray(value) {
  // 结构化输出要求集合字段永远是数组；单值会被包装，空值会被归一为空数组。
  if (value === undefined || value === null || value === '') return []
  return Array.isArray(value) ? clone(value) : [clone(value)]
}

function asObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? clone(value) : {}
}

function normalizeScope(value) {
  // 兼容 camelCase/snake_case 输入，统一输出为 v0.2 的 camelCase。
  const scope = asObject(value)
  return {
    inScope: asArray(scope.inScope ?? scope.in_scope),
    outOfScope: asArray(scope.outOfScope ?? scope.out_of_scope),
  }
}

function normalizeFeature(value, index = 0) {
  const source = asObject(value)
  const feature = {
    // 先保留业务扩展字段，再覆盖规范字段，避免 update 时误删 Feature 元数据。
    ...source,
    id: String(source.id ?? `feature-${index + 1}`),
    moduleId: source.moduleId ?? source.module_id ?? null,
  }
  for (const field of FEATURE_FIELDS) {
    if (field === 'name' || field === 'goal') feature[field] = String(source[field] ?? '')
    else feature[field] = asArray(source[field])
  }
  return feature
}

export function normalizePrd(value = {}) {
  // normalizePrd 是 create/update/review 的共同入口：无论输入完整与否，
  // 下游逻辑都能面对同一种字段类型和 v0.2 结构。
  const source = asObject(value)
  const overview = asObject(source.productOverview ?? source.product_overview)
  const normalized = {
    ...source,
    schemaVersion: '0.2',
    productOverview: {
      name: String(overview.name ?? source.productName ?? source.product_name ?? ''),
      summary: String(overview.summary ?? source.description ?? ''),
      problem: String(overview.problem ?? ''),
      valueProposition: String(overview.valueProposition ?? overview.value_proposition ?? ''),
    },
  }
  for (const field of ROOT_ARRAY_FIELDS) {
    const snake = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    normalized[field] = asArray(source[field] ?? source[snake])
  }
  normalized.features = normalized.features.map(normalizeFeature)
  normalized.scope = normalizeScope(source.scope)
  return normalized
}

function parseSupplement(value) {
  // 核心函数兼容对象和 JSON 字符串；模型工具层通常直接传对象。
  // 普通文本无法可靠拆解时只作为 Overview 摘要，不擅自生成规则和 Feature。
  if (value === undefined || value === null || value === '') return {}
  if (typeof value === 'object' && !Array.isArray(value)) return clone(value)
  if (typeof value !== 'string') throw new TypeError('userSupplement must be an object or JSON string')
  try {
    const parsed = JSON.parse(value)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {}
  return { productOverview: { summary: value } }
}

export function createPrd(productDescription, userSupplement = {}) {
  if (typeof productDescription !== 'string' || productDescription.trim() === '') {
    throw new TypeError('productDescription must be a non-empty string')
  }
  const supplement = parseSupplement(userSupplement)
  const overview = asObject(supplement.productOverview ?? supplement.product_overview)
  // 原始产品描述只做 summary 兜底，明确的结构化补充信息优先。
  if (!overview.summary) overview.summary = productDescription.trim()
  return normalizePrd({ ...supplement, productOverview: overview })
}

function decodePointerPart(value) {
  // RFC 6901 转义：路径键名中的 / 写作 ~1，~ 写作 ~0。
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}

function pointerParts(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new TypeError(`invalid JSON pointer: ${path}`)
  return path.slice(1).split('/').map(decodePointerPart)
}

function resolveParent(document, path, createMissing = false) {
  // 返回目标字段的父容器和最后一级 key；add 可创建缺失的中间对象，
  // replace/remove 则必须沿现有结构解析，防止拼错路径后静默写到别处。
  const parts = pointerParts(path)
  const key = parts.pop()
  let parent = document
  for (const part of parts) {
    if (parent[part] === undefined && createMissing) parent[part] = {}
    if (parent[part] === null || typeof parent[part] !== 'object') throw new TypeError(`path does not resolve to a container: ${path}`)
    parent = parent[part]
  }
  return { parent, key }
}

function applyOperation(document, operation) {
  // 只实现当前产品需要的 add/replace/remove 子集，不支持 move/copy/test。
  if (operation === null || typeof operation !== 'object') throw new TypeError('each operation must be an object')
  const { op, path } = operation
  if (!['add', 'replace', 'remove'].includes(op)) throw new TypeError(`unsupported operation: ${op}`)
  const { parent, key } = resolveParent(document, path, op === 'add')
  if (Array.isArray(parent)) {
    // 数组路径支持数字索引；add 的 '-' 表示追加到数组末尾。
    const index = key === '-' ? parent.length : Number(key)
    if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new RangeError(`invalid array index: ${path}`)
    if (op === 'add') parent.splice(index, 0, clone(operation.value))
    else if (op === 'replace') {
      if (index >= parent.length) throw new RangeError(`path does not exist: ${path}`)
      parent[index] = clone(operation.value)
    } else {
      if (index >= parent.length) throw new RangeError(`path does not exist: ${path}`)
      parent.splice(index, 1)
    }
    return
  }
  if (op !== 'add' && !Object.hasOwn(parent, key)) throw new RangeError(`path does not exist: ${path}`)
  if (op === 'remove') delete parent[key]
  else parent[key] = clone(operation.value)
}

export function updatePrd(currentPrd, modificationRequest) {
  // 先规范化、再深拷贝、再逐条应用操作，最后再次规范化新增内容。
  // 返回的是完整新 PRD，但没有出现在 operations 中的分支不会被主动改写。
  const original = normalizePrd(currentPrd)
  const request = typeof modificationRequest === 'string' ? JSON.parse(modificationRequest) : clone(modificationRequest)
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('modificationRequest must be an object or JSON string')
  }
  const updated = clone(original)
  if (Array.isArray(request.operations)) {
    for (const operation of request.operations) applyOperation(updated, operation)
  } else if (typeof request.path === 'string' && typeof request.op === 'string') {
    applyOperation(updated, request)
  } else {
    throw new TypeError('modificationRequest must contain an operation or operations array')
  }
  return normalizePrd(updated)
}

function issue(code, severity, path, message, suggestion) {
  // 所有 Review 规则使用同一种问题结构，path 可直接映射回 update_prd。
  return { code, severity, path, message, suggestion }
}

function meaningful(value) {
  return typeof value === 'string' ? value.trim() !== '' : Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined
}

function checkCompleteness(prd, issues) {
  // 第一层：检查顶层章节、MVP 范围以及每个 Feature 的强制字段。
  if (!meaningful(prd.productOverview.summary) || !meaningful(prd.productOverview.problem)) {
    issues.push(issue('INCOMPLETE_PRODUCT_OVERVIEW', 'error', '/productOverview', 'Product Overview 缺少产品摘要或待解决问题。', '补充 summary 和 problem。'))
  }
  for (const field of ROOT_FIELDS) {
    if (field === 'scope') {
      if (prd.scope.inScope.length === 0) issues.push(issue('MISSING_SCOPE', 'error', '/scope/inScope', 'MVP 范围为空。', '列出至少一个范围内能力。'))
    } else if (field !== 'productOverview' && !meaningful(prd[field])) {
      issues.push(issue('MISSING_SECTION', 'error', `/${field}`, `${field} 缺失或为空。`, `补充 ${field}。`))
    }
  }
  for (const [index, feature] of prd.features.entries()) {
    for (const field of FEATURE_FIELDS) {
      if (!meaningful(feature[field])) {
        issues.push(issue('INCOMPLETE_FEATURE', 'error', `/features/${index}/${field}`, `Feature 缺少 ${field}。`, `补充可验证的 ${field}。`))
      }
    }
  }
}

function checkReferencesAndConflicts(prd, issues) {
  // 第二层：检查 Module/Feature 引用、重复身份和规则的明显正反冲突。
  const moduleIds = new Set(prd.modules.map(module => module?.id).filter(Boolean))
  const usedModuleIds = new Set(prd.features.map(feature => feature.moduleId).filter(Boolean))
  prd.modules.forEach((module, index) => {
    if (module?.id && !usedModuleIds.has(module.id)) issues.push(issue('MODULE_WITHOUT_FEATURES', 'warning', `/modules/${index}`, `模块“${module.name ?? module.id}”没有关联 Feature。`, '补充模块功能，或确认该模块不属于 MVP。'))
  })
  const seenFeatureIds = new Set()
  const seenFeatureNames = new Set()
  for (const [index, feature] of prd.features.entries()) {
    if (seenFeatureIds.has(feature.id)) issues.push(issue('DUPLICATE_FEATURE_ID', 'error', `/features/${index}/id`, `Feature id “${feature.id}” 重复。`, '为 Feature 使用唯一 id。'))
    seenFeatureIds.add(feature.id)
    const normalizedName = feature.name.trim().toLocaleLowerCase()
    if (normalizedName && seenFeatureNames.has(normalizedName)) issues.push(issue('DUPLICATE_FEATURE_NAME', 'warning', `/features/${index}/name`, `功能名称“${feature.name}”重复，可能存在范围冲突。`, '合并重复功能或澄清职责边界。'))
    if (normalizedName) seenFeatureNames.add(normalizedName)
    if (feature.moduleId && !moduleIds.has(feature.moduleId)) issues.push(issue('UNKNOWN_MODULE', 'error', `/features/${index}/moduleId`, `引用了不存在的模块“${feature.moduleId}”。`, '修正 moduleId 或补充对应模块。'))
  }
  const rules = prd.businessRules.map(rule => typeof rule === 'string' ? rule : rule?.description).filter(Boolean)
  // 去除“可以/不得”等极性词后比较规则主体；主体相同、极性相反时给出警告。
  const ruleSignature = rule => ({
    negative: /(?:不得|不允许|禁止|must not|cannot)/i.test(rule),
    text: rule.replace(/(?:不得|不允许|禁止|必须|允许|可以|must not|cannot|must|can)/gi, '').replace(/[，。,.!！\s]/g, ''),
  })
  for (let left = 0; left < rules.length; left += 1) {
    for (let right = left + 1; right < rules.length; right += 1) {
      const a = ruleSignature(rules[left])
      const b = ruleSignature(rules[right])
      if (a.text.length >= 4 && a.text === b.text && a.negative !== b.negative) issues.push(issue('POSSIBLE_RULE_CONFLICT', 'warning', `/businessRules/${right}`, '业务规则可能互相冲突。', '确认允许与禁止条件，并合并为单一规则。'))
    }
  }
}

function checkQuality(prd, issues) {
  // 第三层：递归扫描模糊措辞，并检查全局与 Feature 级验收/异常。
  const visit = (value, path) => {
    if (typeof value === 'string') {
      if (VAGUE_WORDS.test(value)) issues.push(issue('VAGUE_DESCRIPTION', 'warning', path, `描述包含模糊词：“${value}”。`, '替换为明确条件、阈值或结果。'))
    } else if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}/${index}`))
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => visit(item, `${path}/${key}`))
  }
  visit(prd, '')
  for (const [index, criterion] of prd.acceptanceCriteria.entries()) {
    const text = typeof criterion === 'string' ? criterion : JSON.stringify(criterion)
    if (!TESTABLE_WORDS.test(text)) issues.push(issue('UNTESTABLE_ACCEPTANCE_CRITERION', 'error', `/acceptanceCriteria/${index}`, `验收标准不可直接判定：“${text}”。`, '写明前置条件、操作和可观察结果。'))
  }
  for (const [featureIndex, feature] of prd.features.entries()) {
    if (feature.exceptions.length === 0) issues.push(issue('MISSING_FEATURE_EXCEPTIONS', 'error', `/features/${featureIndex}/exceptions`, `Feature“${feature.name || feature.id}”缺少异常场景。`, '补充输入无效、权限不足、依赖失败或并发冲突等适用场景。'))
    feature.acceptanceCriteria.forEach((criterion, criterionIndex) => {
      const text = typeof criterion === 'string' ? criterion : JSON.stringify(criterion)
      if (!TESTABLE_WORDS.test(text)) issues.push(issue('UNTESTABLE_FEATURE_ACCEPTANCE', 'error', `/features/${featureIndex}/acceptanceCriteria/${criterionIndex}`, `Feature 验收标准不可直接判定：“${text}”。`, '写明条件、动作和可观察结果。'))
    })
  }
  if (prd.openQuestions.length === 0) issues.push(issue('MISSING_OPEN_QUESTIONS', 'warning', '/openQuestions', '未记录待确认项。', '确认确实无待确认项；若无，请显式记录“无”。'))
}

export function reviewPrd(currentPrd) {
  // Review 永远先规范化输入，只返回报告，不修改或返回重写后的 PRD。
  const prd = normalizePrd(currentPrd)
  const issues = []
  checkCompleteness(prd, issues)
  checkReferencesAndConflicts(prd, issues)
  checkQuality(prd, issues)
  const counts = { error: 0, warning: 0, info: 0 }
  for (const item of issues) counts[item.severity] += 1
  return {
    valid: counts.error === 0,
    summary: { issueCount: issues.length, ...counts },
    issues,
  }
}

export { FEATURE_FIELDS, ROOT_FIELDS }
