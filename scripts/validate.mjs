#!/usr/bin/env node

import { validateProject } from '../packages/validator/index.mjs'

// 将 validator 的结构化结果转换成 CI 认识的退出码：
// 有错误时设置 exitCode=1，无错误时打印通过的制品数量。
const { errors, catalog } = await validateProject()
if (errors.length > 0) {
  process.stderr.write(`Validation failed with ${errors.length} error(s):\n`)
  for (const error of errors) process.stderr.write(`- ${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Validation passed: ${catalog.artifacts.length} artifact(s) are valid.\n`)
}
