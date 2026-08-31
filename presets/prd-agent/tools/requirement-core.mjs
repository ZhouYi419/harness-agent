// Requirement Context 的集合字段。所有公共函数都保证这些字段存在且为数组。
const CONTEXT_LIST_FIELDS = [
  'confirmedRequirements',
  'missingRequirements',
  'ambiguousRequirements',
  'conflictingRequirements',
  'suggestions',
  'pendingQuestions',
  'assumptions',
  'dependencies',
  'answerHistory',
]

const PREFIXES = {
  confirmedRequirements: 'REQ',
  missingRequirements: 'MIS',
  ambiguousRequirements: 'AMB',
  conflictingRequirements: 'CON',
  suggestions: 'SUG',
  pendingQuestions: 'Q',
  assumptions: 'ASM',
  dependencies: 'DEP',
  answerHistory: 'ANS',
}

const PRIORITY_SCORE = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function asObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? clone(value)
    : {}
}

function asArray(value) {
  if (value === undefined || value === null || value === '') return []
  return Array.isArray(value) ? clone(value) : [clone(value)]
}

function normalizePriority(value) {
  return Object.hasOwn(PRIORITY_SCORE, value) ? value : 'medium'
}

function nextId(items, prefix) {
  let maximum = 0

  for (const item of items) {
    const match = String(item?.id ?? '').match(
      new RegExp(`^${prefix}-(\\d+)$`),
    )
    if (match) maximum = Math.max(maximum, Number(match[1]))
  }

  return `${prefix}-${String(maximum + 1).padStart(3, '0')}`
}

function normalizeItems(items, prefix) {
  const normalized = []
  const usedIds = new Set()

  for (const rawItem of asArray(items)) {
    const item = asObject(rawItem)

    if (!item.id || usedIds.has(String(item.id))) {
      item.id = nextId(normalized, prefix)
    } else {
      item.id = String(item.id)
    }

    if (item.priority !== undefined) {
      item.priority = normalizePriority(item.priority)
    }

    usedIds.add(item.id)
    normalized.push(item)
  }

  return normalized
}

// 同一 ID 的新内容覆盖旧内容；没有 ID 冲突的内容按原顺序追加。
function upsertItems(currentItems, incomingItems, prefix) {
  const result = normalizeItems(currentItems, prefix)
  const indexById = new Map(
    result.map((item, index) => [item.id, index]),
  )

  for (const rawIncoming of asArray(incomingItems)) {
    const incoming = asObject(rawIncoming)
    const explicitId = incoming.id ? String(incoming.id) : undefined
    const existingIndex = explicitId === undefined
      ? undefined
      : indexById.get(explicitId)

    if (existingIndex === undefined) {
      // 没有显式 ID 的新条目必须基于已有结果分配编号，不能从 001 重新开始，
      // 否则补充分析会意外覆盖 currentContext 中的同编号需求。
      incoming.id = explicitId ?? nextId(result, prefix)
      indexById.set(incoming.id, result.length)
      result.push(incoming)
    } else {
      result[existingIndex] = {
        ...result[existingIndex],
        ...incoming,
      }
    }
  }

  return result
}

export function normalizeRequirementContext(value = {}) {
  const source = asObject(value)

  const context = {
    ...source,
    schemaVersion: '0.3',
    productDescription: String(source.productDescription ?? ''),
  }

  for (const field of CONTEXT_LIST_FIELDS) {
    context[field] = normalizeItems(
      source[field],
      PREFIXES[field],
    )
  }

  return context
}

function defaultQuestionForMissing(item) {
  return item.question
    ?? `请补充以下需求：${item.description ?? item.statement ?? item.id}`
}

function defaultQuestionForAmbiguity(item) {
  const interpretations = asArray(item.interpretations)
    .map(String)
    .filter(Boolean)

  return {
    question: item.question
      ?? `“${item.statement ?? item.id}”具体指什么？`,
    options: item.options
      ?? interpretations.map(label => ({ label })),
  }
}

function defaultQuestionForConflict(item) {
  const statements = asArray(item.statements)
    .map(String)
    .filter(Boolean)

  return {
    question: item.question
      ?? `以下需求存在冲突，请确认最终采用哪一项：${statements.join('；')}`,
    options: item.options
      ?? statements.map(label => ({ label })),
  }
}

// 为尚未关联问题的缺失、歧义和冲突项生成稳定问题。
// 问题 ID 直接包含来源 ID，重复分析时不会不断生成新问题。
function derivePendingQuestions(context) {
  const questions = [...context.pendingQuestions]
  const linkedSources = new Set(
    questions.map(question => `${question.sourceType}:${question.sourceId}`),
  )

  const addQuestion = (sourceType, item, data) => {
    const sourceKey = `${sourceType}:${item.id}`
    if (linkedSources.has(sourceKey)) return

    questions.push({
      id: `Q-${item.id}`,
      sourceType,
      sourceId: item.id,
      header: item.header ?? '需求确认',
      question: data.question,
      detail: item.impact ?? '',
      priority: normalizePriority(item.priority),
      required: sourceType === 'conflict'
        ? true
        : Boolean(item.required ?? item.blocking),
      options: asArray(data.options ?? item.options),
      multiSelect: Boolean(item.multiSelect),
    })

    linkedSources.add(sourceKey)
  }

  for (const item of context.missingRequirements) {
    addQuestion('missing', item, {
      question: defaultQuestionForMissing(item),
      options: item.options,
    })
  }

  for (const item of context.ambiguousRequirements) {
    addQuestion(
      'ambiguous',
      item,
      defaultQuestionForAmbiguity(item),
    )
  }

  for (const item of context.conflictingRequirements) {
    addQuestion(
      'conflict',
      item,
      defaultQuestionForConflict(item),
    )
  }

  return normalizeItems(questions, PREFIXES.pendingQuestions)
}

export function analyzeRequirement(
  productDescription,
  analysisDraft = {},
  currentContext = {},
) {
  if (
    typeof productDescription !== 'string'
    || productDescription.trim() === ''
  ) {
    throw new TypeError(
      'productDescription must be a non-empty string',
    )
  }

  const current = normalizeRequirementContext(currentContext)
  const draft = asObject(analysisDraft)

  const result = {
    ...current,
    schemaVersion: '0.3',
    productDescription: productDescription.trim(),
  }

  // analysisDraft 由 Agent 根据 Skill 提取；核心层负责合并、编号和稳定结构。
  for (const field of CONTEXT_LIST_FIELDS) {
    result[field] = upsertItems(
      current[field],
      draft[field],
      PREFIXES[field],
    )
  }

  result.pendingQuestions = derivePendingQuestions(result)

  return normalizeRequirementContext(result)
}

function questionScore(question) {
  let score = PRIORITY_SCORE[normalizePriority(question.priority)]

  if (question.required) score += 1_000
  if (question.sourceType === 'conflict') score += 2_000

  return score
}

export function selectRequirementQuestions(
  currentContext,
  maxQuestions = 5,
) {
  const context = normalizeRequirementContext(currentContext)
  const requestedLimit = Number(maxQuestions)

  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new RangeError('maxQuestions must be a positive integer')
  }

  // 单轮上限固定为 5，防止模型通过传入大值绕过提问策略。
  const limit = Math.min(requestedLimit, 5)

  return context.pendingQuestions
    .filter(question => question.status !== 'answered')
    .sort((left, right) => {
      const scoreDifference = questionScore(right) - questionScore(left)
      if (scoreDifference !== 0) return scoreDifference
      return String(left.id).localeCompare(String(right.id))
    })
    .slice(0, limit)
}

function answerText(answer, question) {
  const selected = asArray(answer.selected)
    .map(String)
    .filter(Boolean)

  const custom = typeof answer.custom === 'string'
    ? answer.custom.trim()
    : ''

  // 单选中的自定义答案覆盖选项；多选中的自定义答案作为额外内容保留。
  if (custom && !question.multiSelect) return custom
  if (custom) selected.push(custom)

  return selected.join('；')
}

function unresolvedField(sourceType) {
  return {
    missing: 'missingRequirements',
    ambiguous: 'ambiguousRequirements',
    conflict: 'conflictingRequirements',
  }[sourceType]
}

export function applyRequirementAnswers(
  currentContext,
  questionResult,
) {
  const context = normalizeRequirementContext(currentContext)
  const result = asObject(questionResult)
  const answers = asArray(result.answers)
  const questionById = new Map(
    context.pendingQuestions.map(question => [question.id, question]),
  )

  const answeredQuestionIds = new Set()

  for (const rawAnswer of answers) {
    const answer = asObject(rawAnswer)
    const question = questionById.get(String(answer.id ?? ''))

    // 忽略不属于当前上下文的答案，避免旧会话或错误 ID 污染需求模型。
    if (!question) continue

    const value = answerText(answer, question)
    if (!value) continue

    const requirementId = nextId(
      context.confirmedRequirements,
      PREFIXES.confirmedRequirements,
    )

    context.confirmedRequirements.push({
      id: requirementId,
      category: question.category ?? 'clarification',
      statement: `${question.question}：${value}`,
      source: 'user-answer',
      evidence: value,
      sourceQuestionId: question.id,
      sourceRequirementId: question.sourceId,
    })

    context.answerHistory.push({
      id: nextId(
        context.answerHistory,
        PREFIXES.answerHistory,
      ),
      questionId: question.id,
      selected: asArray(answer.selected),
      ...(answer.custom ? { custom: String(answer.custom) } : {}),
    })

    answeredQuestionIds.add(question.id)

    // 用户回答后，从未解决集合中移除对应缺失、歧义或冲突项。
    const field = unresolvedField(question.sourceType)
    if (field) {
      context[field] = context[field].filter(
        item => item.id !== question.sourceId,
      )
    }
  }

  context.pendingQuestions = context.pendingQuestions.filter(
    question => !answeredQuestionIds.has(question.id),
  )

  return normalizeRequirementContext(context)
}

export { CONTEXT_LIST_FIELDS, PRIORITY_SCORE }
