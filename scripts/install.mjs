#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { defaultDshHome, installArtifact } from '../packages/installer/index.mjs'

// 这是面向人的 CLI 薄层：只负责参数、文本输出和退出码，所有文件操作
// 都委托给 packages/installer，确保 CLI 与自动化测试走同一条路径。
function usage() {
  return `Usage: node scripts/install.mjs [artifact-id] [options]

Options:
  --dsh-home <path>  Override DSH_HOME (default: $DSH_HOME or ~/.dsh)
  --dry-run          Print the planned action without changing files
  --force            Back up a conflicting installation, then replace it
  -h, --help         Show this help
`
}

export function parseArgs(argv) {
  // 手工解析少量稳定参数，避免为了四个选项引入额外 CLI 依赖。
  const options = { artifactId: undefined, dshHome: undefined, dryRun: false, force: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--force') options.force = true
    else if (argument === '-h' || argument === '--help') options.help = true
    else if (argument === '--dsh-home') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('-')) throw new Error('--dsh-home requires a path')
      options.dshHome = value
      index += 1
    } else if (argument.startsWith('--dsh-home=')) {
      const value = argument.slice('--dsh-home='.length)
      if (value === '') throw new Error('--dsh-home requires a path')
      options.dshHome = value
    } else if (argument.startsWith('-')) throw new Error(`unknown option: ${argument}`)
    else if (options.artifactId === undefined) options.artifactId = argument
    else throw new Error(`unexpected argument: ${argument}`)
  }
  return options
}

function renderResult(result) {
  // installer 返回机器可读结果；这里再翻译成人类可读提示。
  if (result.action === 'unchanged') return `${result.artifactId} is already up to date: ${result.target}`
  if (result.dryRun) {
    const backup = result.backup ? `; existing content would be backed up to ${result.backup}` : ''
    return `Dry run: ${result.action} ${result.artifactId} at ${result.target}${backup}`
  }
  const backup = result.backup ? `\nPrevious installation backed up to: ${result.backup}` : ''
  return `${result.artifactId} ${result.action}: ${result.target}${backup}`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }
  const result = await installArtifact({
    artifactId: options.artifactId,
    dshHome: options.dshHome === undefined ? defaultDshHome() : resolve(options.dshHome),
    dryRun: options.dryRun,
    force: options.force,
  })
  process.stdout.write(`${renderResult(result)}\n`)
}

// 被测试 import 时不自动执行；只有 `node scripts/install.mjs` 才进入 main。
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`dsh-kit install: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
