import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  analyzeRequirement,
  applyRequirementAnswers,
  selectRequirementQuestions,
} from '../presets/prd-agent/tools/requirement-core.mjs'

test('analyzeRequirement generates pending questions for unresolved items', () => {
  const context = analyzeRequirement(
    '一个健身房课程预约产品',
    {
      confirmedRequirements: [
        {
          category: 'goal',
          statement: '减少课程预约冲突',
          source: 'user-description',
        },
      ],
      missingRequirements: [
        {
          id: 'MIS-001',
          category: 'user',
          description: '尚未明确主要用户',
          priority: 'critical',
          required: true,
        },
      ],
      ambiguousRequirements: [
        {
          id: 'AMB-001',
          statement: '管理员可以管理预约',
          interpretations: [
            '只能查看和取消',
            '可以创建、修改和取消',
          ],
          priority: 'high',
          blocking: true,
        },
      ],
    },
  )

  assert.equal(context.schemaVersion, '0.3')
  assert.equal(context.confirmedRequirements.length, 1)
  assert.equal(context.pendingQuestions.length, 2)
  assert(context.pendingQuestions.some(
    question => question.sourceId === 'MIS-001',
  ))
  assert(context.pendingQuestions.some(
    question => question.sourceId === 'AMB-001',
  ))
})

test('selectRequirementQuestions prioritizes conflicts and limits a round to five', () => {
  const pendingQuestions = [
    {
      id: 'Q-LOW',
      sourceType: 'missing',
      priority: 'low',
      required: false,
      question: '低优先级问题',
    },
    {
      id: 'Q-CONFLICT',
      sourceType: 'conflict',
      priority: 'critical',
      required: true,
      question: '冲突问题',
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `Q-HIGH-${index}`,
      sourceType: 'missing',
      priority: 'high',
      required: true,
      question: `高优先级问题 ${index}`,
    })),
  ]

  const selected = selectRequirementQuestions(
    { pendingQuestions },
    99,
  )

  assert.equal(selected.length, 5)
  assert.equal(selected[0].id, 'Q-CONFLICT')
  assert(!selected.some(question => question.id === 'Q-LOW'))
})

test('applyRequirementAnswers confirms answers and removes resolved gaps', () => {
  const context = analyzeRequirement(
    '一个课程预约产品',
    {
      missingRequirements: [
        {
          id: 'MIS-001',
          category: 'constraint',
          description: '缺少取消时间限制',
          question: '最晚可以提前多久取消？',
          priority: 'high',
          required: true,
        },
      ],
    },
  )

  const updated = applyRequirementAnswers(context, {
    answers: [
      {
        id: 'Q-MIS-001',
        selected: ['提前 24 小时'],
      },
    ],
  })

  assert.equal(updated.missingRequirements.length, 0)
  assert.equal(updated.pendingQuestions.length, 0)
  assert.equal(updated.confirmedRequirements.length, 1)
  assert.match(
    updated.confirmedRequirements[0].statement,
    /提前 24 小时/,
  )
  assert.equal(updated.answerHistory.length, 1)
})

test('requirement analysis does not mutate the original context', () => {
  const original = {
    productDescription: '原始描述',
    confirmedRequirements: [
      {
        id: 'REQ-001',
        statement: '已有需求',
      },
    ],
  }

  const result = analyzeRequirement(
    '更新后的描述',
    {
      suggestions: [
        {
          statement: '可选建议',
        },
      ],
    },
    original,
  )

  assert.equal(original.productDescription, '原始描述')
  assert.equal(original.confirmedRequirements.length, 1)
  assert.equal(result.productDescription, '更新后的描述')
  assert.equal(result.suggestions.length, 1)
})

test('analysis appends id-less requirements without overwriting current items', () => {
  const result = analyzeRequirement(
    '课程预约产品',
    {
      confirmedRequirements: [
        { statement: '新增需求', source: 'user-answer' },
      ],
    },
    {
      confirmedRequirements: [
        { id: 'REQ-001', statement: '已有需求', source: 'user-description' },
      ],
    },
  )

  assert.deepEqual(
    result.confirmedRequirements.map(item => item.id),
    ['REQ-001', 'REQ-002'],
  )
  assert.deepEqual(
    result.confirmedRequirements.map(item => item.statement),
    ['已有需求', '新增需求'],
  )
})

test('preset exposes requirement v0.3 tools and skills', async () => {
  const [config, toolSource, analysisSkill, strategySkill] =
    await Promise.all([
      readFile(
        new URL(
          '../presets/prd-agent/agent.cordis.yml',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../presets/prd-agent/tools/requirement-tools.mjs',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../presets/prd-agent/skills/requirement-analysis/SKILL.md',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../presets/prd-agent/skills/question-strategy/SKILL.md',
          import.meta.url,
        ),
        'utf8',
      ),
    ])

  assert.match(config, /\.\/tools\/requirement-tools\.mjs/)
  assert.doesNotMatch(
    config,
    /@deepseek-ai\/dsh-tool-ask-user/,
  )

  for (const name of [
    'analyze_requirement',
    'ask_requirement_questions',
    'apply_requirement_answers',
  ]) {
    assert.match(toolSource, new RegExp(`name: '${name}'`))
  }

  assert.match(analysisSkill, /歧义识别/)
  assert.match(strategySkill, /一轮最多询问 5 个问题/)
})
