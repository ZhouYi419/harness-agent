#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PRESET_NAME = 'prd-agent'
const SOURCE_DIR = fileURLToPath(new URL('../prd-agent/', import.meta.url))

function usage() {
  return `Usage: node scripts/install.mjs [options]

Options:
  --dsh-home <path>  Override DSH_HOME (default: $DSH_HOME or ~/.dsh)
  --dry-run          Print the planned action without changing files
  --force            Back up a conflicting installation, then replace it
  -h, --help         Show this help
`
}

export function parseArgs(argv) {
  const options = { dshHome: undefined, dryRun: false, force: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--force') options.force = true
    else if (argument === '-h' || argument === '--help') options.help = true
    else if (argument === '--dsh-home') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('-')) {
        throw new Error('--dsh-home requires a path')
      }
      options.dshHome = value
      index += 1
    } else if (argument.startsWith('--dsh-home=')) {
      const value = argument.slice('--dsh-home='.length)
      if (value === '') throw new Error('--dsh-home requires a path')
      options.dshHome = value
    } else {
      throw new Error(`unknown option: ${argument}`)
    }
  }
  return options
}

export function defaultDshHome(environment = process.env) {
  return resolve(environment.DSH_HOME || join(homedir(), '.dsh'))
}

async function lstatOrUndefined(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function listTree(root, relative = '') {
  const current = relative === '' ? root : join(root, relative)
  const entries = await readdir(current, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = relative === '' ? entry.name : join(relative, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`symbolic links are not supported in preset trees: ${child}`)
    }
    if (entry.isDirectory()) {
      result.push({ path: child, type: 'directory' })
      result.push(...await listTree(root, child))
    } else if (entry.isFile()) {
      result.push({ path: child, type: 'file' })
    } else {
      throw new Error(`unsupported filesystem entry in preset tree: ${child}`)
    }
  }
  return result
}

export async function treesEqual(leftRoot, rightRoot) {
  const leftStat = await lstatOrUndefined(leftRoot)
  const rightStat = await lstatOrUndefined(rightRoot)
  if (!leftStat?.isDirectory() || !rightStat?.isDirectory()) return false

  const [leftEntries, rightEntries] = await Promise.all([
    listTree(leftRoot),
    listTree(rightRoot),
  ])
  if (JSON.stringify(leftEntries) !== JSON.stringify(rightEntries)) return false

  for (const entry of leftEntries) {
    if (entry.type !== 'file') continue
    const [left, right] = await Promise.all([
      readFile(join(leftRoot, entry.path)),
      readFile(join(rightRoot, entry.path)),
    ])
    if (!left.equals(right)) return false
  }
  return true
}

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-')
}

async function unusedBackupPath(parent, date) {
  const prefix = `${PRESET_NAME}.backup-${timestamp(date)}`
  let candidate = join(parent, prefix)
  let suffix = 1
  while (await lstatOrUndefined(candidate)) {
    candidate = join(parent, `${prefix}-${suffix}`)
    suffix += 1
  }
  return candidate
}

/**
 * 将随项目交付的预设安装到 DSH Home。
 *
 * 已有内容完全相同时不执行操作。冲突内容永远不会被直接删除：使用
 * --force 时，安装器会先把旧目录重命名为带时间戳的同级备份，再发布新目录。
 */
export async function installPreset({
  dshHome = defaultDshHome(),
  dryRun = false,
  force = false,
  sourceDir = SOURCE_DIR,
  now = new Date(),
} = {}) {
  const source = resolve(sourceDir)
  const sourceStat = await lstatOrUndefined(source)
  if (!sourceStat?.isDirectory()) throw new Error(`preset source not found: ${source}`)
  await listTree(source)

  const home = resolve(dshHome)
  const parent = join(home, '.agent-presets')
  const target = join(parent, PRESET_NAME)
  const targetStat = await lstatOrUndefined(target)

  if (targetStat?.isSymbolicLink()) {
    throw new Error(`refusing to replace symbolic-link target: ${target}`)
  }
  if (targetStat && await treesEqual(source, target)) {
    return { action: 'unchanged', target, backup: undefined, dryRun }
  }
  if (targetStat && !force) {
    throw new Error(
      `a different ${PRESET_NAME} installation already exists at ${target}; rerun with --force to back it up and replace it`,
    )
  }

  const action = targetStat ? 'replaced' : 'installed'
  const backup = targetStat ? await unusedBackupPath(parent, now) : undefined
  if (dryRun) return { action, target, backup, dryRun: true }

  await mkdir(parent, { recursive: true })
  const stage = join(parent, `.${PRESET_NAME}.stage-${process.pid}-${randomUUID()}`)
  try {
    await cp(source, stage, { recursive: true, errorOnExist: true, force: false })
    if (!targetStat) {
      await rename(stage, target)
      return { action, target, backup: undefined, dryRun: false }
    }

    await rename(target, backup)
    try {
      await rename(stage, target)
    } catch (error) {
      await rename(backup, target)
      throw error
    }
    return { action, target, backup, dryRun: false }
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

function renderResult(result) {
  if (result.action === 'unchanged') {
    return `PRD Agent is already up to date: ${result.target}`
  }
  if (result.dryRun) {
    const backup = result.backup ? `; existing content would be backed up to ${result.backup}` : ''
    return `Dry run: ${result.action} ${PRESET_NAME} at ${result.target}${backup}`
  }
  const backup = result.backup ? `\nPrevious installation backed up to: ${result.backup}` : ''
  return `PRD Agent ${result.action}: ${result.target}${backup}`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }
  const result = await installPreset({
    dshHome: options.dshHome === undefined ? defaultDshHome() : resolve(options.dshHome),
    dryRun: options.dryRun,
    force: options.force,
  })
  process.stdout.write(`${renderResult(result)}\n`)
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`install-prd-agent: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
