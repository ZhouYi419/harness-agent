import { defineTool } from '@deepseek-ai/dsh-tools'

import { createPrd, reviewPrd, updatePrd } from './prd-core.mjs'

// 本文件是 DSH/Cordis 适配层：定义模型能看到的工具名称、参数和展示方式。
// 可测试的业务算法全部放在 prd-core.mjs，避免与 Harness 生命周期耦合。
export const name = 'prd-tools'
// Cordis 会等 Host Plane 的 tools 服务可用后再执行 apply。
export const inject = ['tools']

// PRD 允许业务方扩展对象字段，因此输入输出 schema 使用开放对象；
// 标准字段完整性由 normalizePrd/reviewPrd 负责，而非在传输层拒绝。
const openObject = { type: 'object', additionalProperties: true }

const jsonOutput = {
  schema: openObject,
  // execute 返回保真 JSON 值；render 只决定工具结果在对话里的文本展示。
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

export function apply(ctx) {
  // 创建：Agent 先通过 Skill 澄清并整理用户事实，工具只规范化结构。
  ctx.tools.register(defineTool({
    name: 'create_prd',
    description: '根据产品描述和已确认的结构化补充信息创建符合 PRD v0.2 schema 的 JSON。不要把未确认推测放入补充信息。',
    parameters: {
      product_description: { type: 'string', required: true, description: '用户提供的产品描述。' },
      user_supplement: { ...openObject, required: true, description: '从用户已确认事实整理出的字段；字段遵循 prd-structure 和 feature-specification。' },
    },
    output: jsonOutput,
    async execute(args) {
      return createPrd(args.product_description, args.user_supplement)
    },
  }))

  // 更新：Agent 把自然语言修改要求翻译成最小 JSON Pointer 操作。
  ctx.tools.register(defineTool({
    name: 'update_prd',
    description: '用 JSON Pointer add/replace/remove 操作局部更新 PRD，并保留所有未修改内容。',
    parameters: {
      current_prd: { ...openObject, required: true, description: '当前完整 PRD JSON。' },
      modification_request: {
        ...openObject,
        required: true,
        description: '包含 operations 数组；每项为 {op:add|replace|remove,path,value?}，path 使用 JSON Pointer。',
      },
    },
    output: jsonOutput,
    async execute(args) {
      return updatePrd(args.current_prd, args.modification_request)
    },
  }))

  // 评审：返回机器可读问题列表，不直接修改输入 PRD。
  ctx.tools.register(defineTool({
    name: 'review_prd',
    description: '检查 PRD 的功能遗漏、规则冲突、模糊或不可验收描述，以及缺失的异常场景和待确认项。',
    parameters: {
      current_prd: { ...openObject, required: true, description: '待检查的完整 PRD JSON。' },
    },
    output: jsonOutput,
    async execute(args) {
      return reviewPrd(args.current_prd)
    },
  }))
}
