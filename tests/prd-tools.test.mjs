import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createPrd, reviewPrd, updatePrd } from '../presets/prd-agent/tools/prd-core.mjs'

function completeFeature(overrides = {}) {
  return {
    id: 'FR-001',
    moduleId: 'MOD-001',
    name: '创建预约',
    goal: '让会员预订课程',
    userRoles: ['会员'],
    preconditions: ['会员已登录'],
    userActions: ['选择课程并提交'],
    systemBehaviors: ['系统保存预约并显示成功结果'],
    inputs: ['课程 ID'],
    outputs: ['预约记录'],
    businessRules: ['BR-001'],
    exceptions: ['EX-001'],
    acceptanceCriteria: [{ given: '课程可预约', when: '会员提交预约', then: '系统必须保存并显示预约成功' }],
    ...overrides,
  }
}

function completePrd() {
  return createPrd('一个课程预约产品', {
    productOverview: { name: '预约助手', problem: '人工预约容易冲突', valueProposition: '统一可用时段和预约结果' },
    goals: [{ id: 'G-001', description: '减少预约冲突', successSignal: '冲突预约必须被拒绝' }],
    users: [{ id: 'U-001', role: '会员', needs: ['预约课程'] }],
    scenarios: [{ id: 'S-001', userId: 'U-001', trigger: '需要上课', action: '预约', expectedOutcome: '预约成功' }],
    modules: [{ id: 'MOD-001', name: '预约', goal: '管理预约' }],
    features: [completeFeature()],
    businessRules: [{ id: 'BR-001', featureIds: ['FR-001'], description: '当时段已满时，系统必须拒绝预约' }],
    flows: [{ id: 'FL-001', featureIds: ['FR-001'], name: '预约流程', steps: ['选择', '提交'], completionCondition: '显示预约结果' }],
    exceptions: [{ id: 'EX-001', featureIds: ['FR-001'], trigger: '时段已满', systemBehavior: '拒绝保存', userFeedback: '显示已满', recovery: '选择其他时段' }],
    acceptanceCriteria: [{ id: 'AC-001', featureIds: ['FR-001'], given: '时段可用', when: '会员提交', then: '系统必须保存预约' }],
    openQuestions: ['无'],
    scope: { inScope: ['创建预约'], outOfScope: ['在线支付'] },
  })
}

test('createPrd returns every v0.2 section and complete feature fields', () => {
  const prd = completePrd()
  assert.equal(prd.schemaVersion, '0.2')
  for (const field of ['productOverview', 'goals', 'users', 'scenarios', 'modules', 'features', 'businessRules', 'flows', 'exceptions', 'acceptanceCriteria', 'openQuestions', 'scope']) {
    assert(Object.hasOwn(prd, field), `${field} must exist`)
  }
  for (const field of ['name', 'goal', 'userRoles', 'preconditions', 'userActions', 'systemBehaviors', 'inputs', 'outputs', 'businessRules', 'exceptions', 'acceptanceCriteria']) {
    assert(Object.hasOwn(prd.features[0], field), `feature.${field} must exist`)
  }
})

test('updatePrd applies narrow operations and preserves unrelated and extension data', () => {
  const current = completePrd()
  current.extension = { source: 'user-import', untouched: true }
  current.features[0].customPriority = 'P0'
  const updated = updatePrd(current, {
    operations: [{ op: 'replace', path: '/features/0/goal', value: '让会员快速完成课程预订' }],
  })
  assert.equal(updated.features[0].goal, '让会员快速完成课程预订')
  assert.deepEqual(updated.goals, current.goals)
  assert.deepEqual(updated.extension, current.extension)
  assert.equal(updated.features[0].customPriority, 'P0')
  assert.equal(current.features[0].goal, '让会员预订课程', 'input must not be mutated')
})

test('updatePrd rejects invalid paths instead of silently rewriting content', () => {
  assert.throws(() => updatePrd(completePrd(), {
    operations: [{ op: 'replace', path: '/features/9/goal', value: 'x' }],
  }), /path does not resolve|path does not exist/)
})

test('reviewPrd reports completeness, vague wording, untestable criteria and missing exceptions', () => {
  const prd = completePrd()
  prd.features[0].goal = '适当提升体验'
  prd.features[0].exceptions = []
  prd.features[0].acceptanceCriteria = ['体验良好']
  prd.acceptanceCriteria = ['体验良好']
  prd.openQuestions = []
  const review = reviewPrd(prd)
  const codes = new Set(review.issues.map(item => item.code))
  assert.equal(review.valid, false)
  assert(codes.has('VAGUE_DESCRIPTION'))
  assert(codes.has('UNTESTABLE_ACCEPTANCE_CRITERION'))
  assert(codes.has('MISSING_FEATURE_EXCEPTIONS'))
  assert(codes.has('MISSING_OPEN_QUESTIONS'))
})

test('reviewPrd detects opposing business rules regardless of their order', () => {
  const prd = completePrd()
  prd.businessRules = [
    { id: 'BR-001', description: '用户可以取消预约' },
    { id: 'BR-002', description: '用户不得取消预约' },
  ]
  assert(reviewPrd(prd).issues.some(item => item.code === 'POSSIBLE_RULE_CONFLICT'))
})

test('preset exposes all v0.2 tools and skills', async () => {
  const [config, structure, feature] = await Promise.all([
    readFile(new URL('../presets/prd-agent/agent.cordis.yml', import.meta.url), 'utf8'),
    readFile(new URL('../presets/prd-agent/skills/prd-structure/SKILL.md', import.meta.url), 'utf8'),
    readFile(new URL('../presets/prd-agent/skills/feature-specification/SKILL.md', import.meta.url), 'utf8'),
  ])
  assert.match(config, /\.\/tools\/prd-tools\.mjs/)
  for (const tool of ['create_prd', 'update_prd', 'review_prd']) {
    assert.match(await readFile(new URL('../presets/prd-agent/tools/prd-tools.mjs', import.meta.url), 'utf8'), new RegExp(`name: '${tool}'`))
  }
  assert.match(structure, /Product Overview/)
  assert.match(feature, /systemBehaviors/)
})
