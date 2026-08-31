import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { findArtifact, loadCatalog } from '../catalog/index.mjs'

// DSH_HOME 决定 DSH 的用户级数据目录。显式参数优先，其次读取环境变量，
// 最后回退到 ~/.dsh，便于 CLI、测试和真实 DSH 使用同一套安装逻辑。
export function defaultDshHome(environment = process.env) {
  return resolve(environment.DSH_HOME || join(homedir(), '.dsh'))
}

async function lstatOrUndefined(path) {
  try { return await lstat(path) } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

// 以稳定顺序枚举目录树。除了比较安装内容，这一步也拒绝符号链接，
// 避免安装源通过链接跳到仓库或 DSH_HOME 之外。
async function listTree(root, relativePath = '') {
  const current = relativePath === '' ? root : join(root, relativePath)
  const entries = await readdir(current, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = relativePath === '' ? entry.name : join(relativePath, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`symbolic links are not supported: ${child}`)
    if (entry.isDirectory()) {
      result.push({ path: child, type: 'directory' })
      result.push(...await listTree(root, child))
    } else if (entry.isFile()) result.push({ path: child, type: 'file' })
    else throw new Error(`unsupported filesystem entry: ${child}`)
  }
  return result
}

export async function treesEqual(leftRoot, rightRoot) {
  const leftStat = await lstatOrUndefined(leftRoot)
  const rightStat = await lstatOrUndefined(rightRoot)
  if (!leftStat?.isDirectory() || !rightStat?.isDirectory()) return false
  // 先比较目录结构，再逐个比较文件字节；内容完全相同才视为幂等重装。
  const [leftEntries, rightEntries] = await Promise.all([listTree(leftRoot), listTree(rightRoot)])
  if (JSON.stringify(leftEntries) !== JSON.stringify(rightEntries)) return false
  for (const entry of leftEntries) {
    if (entry.type !== 'file') continue
    const [left, right] = await Promise.all([
      readFile(join(leftRoot, entry.path)), readFile(join(rightRoot, entry.path)),
    ])
    if (!left.equals(right)) return false
  }
  return true
}

function timestamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-')
}

async function unusedBackupPath(parent, installName, date) {
  const prefix = `${installName}.backup-${timestamp(date)}`
  let candidate = join(parent, prefix)
  let suffix = 1
  while (await lstatOrUndefined(candidate)) candidate = join(parent, `${prefix}-${suffix++}`)
  return candidate
}

// 目前只有 preset 的 DSH 落盘位置已经确定：
// <DSH_HOME>/.agent-presets/<installName>。
function installCoordinates(artifact, dshHome) {
  if (artifact.type !== 'preset') throw new Error(`installation is not implemented for artifact type: ${artifact.type}`)
  return { installName: artifact.installName ?? artifact.id, parent: join(resolve(dshHome), '.agent-presets') }
}

export async function installArtifact({
  artifactId, dshHome = defaultDshHome(), dryRun = false, force = false,
  sourceDir, now = new Date(), catalog: providedCatalog,
} = {}) {
  // 1. 从唯一制品清单定位源目录。测试可以注入 catalog/sourceDir，
  //    但正常 CLI 路径始终使用仓库根目录的 dsh-kit.json。
  const catalog = providedCatalog ?? await loadCatalog()
  const id = artifactId ?? catalog.defaultArtifact
  if (!id) throw new Error('artifact id is required')
  const artifact = findArtifact(catalog, id)
  const source = resolve(sourceDir ?? artifact.sourcePath)
  const sourceStat = await lstatOrUndefined(source)
  if (!sourceStat?.isDirectory()) throw new Error(`artifact source not found: ${source}`)
  await listTree(source)

  // 2. 计算 DSH 目标目录，并区分首次安装、相同重装和冲突安装。
  const { parent, installName } = installCoordinates(artifact, dshHome)
  const target = join(parent, installName)
  const targetStat = await lstatOrUndefined(target)
  if (targetStat?.isSymbolicLink()) throw new Error(`refusing to replace symbolic-link target: ${target}`)
  if (targetStat && await treesEqual(source, target)) {
    return { artifactId: id, action: 'unchanged', target, backup: undefined, dryRun }
  }
  if (targetStat && !force) {
    throw new Error(`a different ${id} installation already exists at ${target}; rerun with --force to back it up and replace it`)
  }
  const action = targetStat ? 'replaced' : 'installed'
  const backup = targetStat ? await unusedBackupPath(parent, installName, now) : undefined
  // dry-run 只返回将要发生的动作，不创建目录、不备份、不复制。
  if (dryRun) return { artifactId: id, action, target, backup, dryRun: true }

  // 3. 先复制到同级临时目录，再通过 rename 原子发布，避免 DSH 读到半成品。
  await mkdir(parent, { recursive: true })
  const stage = join(parent, `.${installName}.stage-${process.pid}-${randomUUID()}`)
  try {
    await cp(source, stage, { recursive: true, errorOnExist: true, force: false })
    if (!targetStat) {
      await rename(stage, target)
      return { artifactId: id, action, target, backup: undefined, dryRun: false }
    }
    // --force 更新先把旧版本改名为可恢复备份；新版本发布失败时回滚旧目录。
    await rename(target, backup)
    try { await rename(stage, target) } catch (error) {
      await rename(backup, target)
      throw error
    }
    return { artifactId: id, action, target, backup, dryRun: false }
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

// 兼容旧调用方的历史名称；新代码统一使用 installArtifact。
export const installPreset = installArtifact
