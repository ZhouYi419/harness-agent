import { defineTool } from '@deepseek-ai/dsh-tools'

import {
  analyzeRequirement,
  applyRequirementAnswers,
  selectRequirementQuestions,
} from './requirement-core.mjs'

// 本文件只负责 DSH 工具注册和 Harness 用户问答接口适配。
// 数据处理和排序规则全部放在 requirement-core.mjs。
export const name = 'requirement-tools'

// userQuestions 由 DSH Web Host 提供，ask() 会等待 Web UI 返回用户答案。
export const inject = ['tools', 'userQuestions']

const openObject = {
  type: 'object',
  additionalProperties: true,
}

const openObjectOutput = {
  schema: openObject,
  render: (_args, value) => [{
    type: 'text',
    text: JSON.stringify(value, null, 2),
  }],
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'analyze_requirement',
    description: '把产品描述和基于用户证据的分析草稿整理为 Requirement Context v0.3，输出已确认、缺失、模糊、冲突、建议和待确认项。',
    parameters: {
      product_description: {
        type: 'string',
        required: true,
        description: '用户提供的原始产品描述。',
      },
      analysis_draft: {
        ...openObject,
        required: true,
        description: '根据 requirement-analysis Skill 提取的结构化分析草稿，不得包含未经标记的推测。',
      },
      current_context: {
        ...openObject,
        description: '可选的现有 Requirement Context；补充分析时用于保留既有内容。',
      },
    },
    output: openObjectOutput,
    async execute(args) {
      return analyzeRequirement(
        args.product_description,
        args.analysis_draft,
        args.current_context,
      )
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ask_requirement_questions',
    description: '从 Requirement Context 中选择最多 5 个最高优先级问题，并通过 Harness 用户问答界面等待用户回答。',
    parameters: {
      current_context: {
        ...openObject,
        required: true,
        description: '包含 pendingQuestions 的完整 Requirement Context。',
      },
      max_questions: {
        type: 'number',
        description: '本轮最多询问的问题数，默认 5，且不会超过 5。',
      },
    },
    output: openObjectOutput,
    async execute(args, exec) {
      const questions = selectRequirementQuestions(
        args.current_context,
        args.max_questions ?? 5,
      )

      if (questions.length === 0) {
        return {
          askedQuestionIds: [],
          answers: [],
        }
      }

      // 转换成 DSH UserQuestionService 使用的 camelCase 请求结构。
      const requestQuestions = questions.map(question => ({
        id: question.id,
        question: question.question,
        ...(question.header
          ? { header: question.header }
          : {}),
        ...(question.detail
          ? { detail: question.detail }
          : {}),
        ...(question.options?.length
          ? {
              options: question.options.map(option => ({
                label: String(option.label),
                ...(option.description
                  ? { description: String(option.description) }
                  : {}),
              })),
            }
          : {}),
        multiSelect: Boolean(question.multiSelect),
      }))

      // 该 Promise 会在用户回答、取消或当前 turn 被中止时结束。
      const result = await ctx.userQuestions.ask({
        questions: requestQuestions,
        signal: exec.signal,
      })

      return {
        askedQuestionIds: questions.map(question => question.id),
        answers: result.answers,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'apply_requirement_answers',
    description: '把 Harness 返回的用户答案合并进 Requirement Context，生成已确认需求并移除对应未解决项。',
    parameters: {
      current_context: {
        ...openObject,
        required: true,
        description: '提问前的完整 Requirement Context。',
      },
      question_result: {
        ...openObject,
        required: true,
        description: 'ask_requirement_questions 返回的结构化结果。',
      },
    },
    output: openObjectOutput,
    async execute(args) {
      return applyRequirementAnswers(
        args.current_context,
        args.question_result,
      )
    },
  }))
}