import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { findArtifact, loadCatalog } from '../catalog/index.mjs'

export function defaultDshHome(environment = process.env) {
  return resolve(environment.DSH_HOME || join(homedir(), '.dsh'))
}

async function lstatOrUndefined(path) {
  try { return await lstat(path) } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

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

function installCoordinates(artifact, dshHome) {
  if (artifact.type !== 'preset') throw new Error(`installation is not implemented for artifact type: ${artifact.type}`)
  return { installName: artifact.installName ?? artifact.id, parent: join(resolve(dshHome), '.agent-presets') }
}

export async function installArtifact({
  artifactId, dshHome = defaultDshHome(), dryRun = false, force = false,
  sourceDir, now = new Date(), catalog: providedCatalog,
} = {}) {
  const catalog = providedCatalog ?? await loadCatalog()
  const id = artifactId ?? catalog.defaultArtifact
  if (!id) throw new Error('artifact id is required')
  const artifact = findArtifact(catalog, id)
  const source = resolve(sourceDir ?? artifact.sourcePath)
  const sourceStat = await lstatOrUndefined(source)
  if (!sourceStat?.isDirectory()) throw new Error(`artifact source not found: ${source}`)
  await listTree(source)

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
  if (dryRun) return { artifactId: id, action, target, backup, dryRun: true }

  await mkdir(parent, { recursive: true })
  const stage = join(parent, `.${installName}.stage-${process.pid}-${randomUUID()}`)
  try {
    await cp(source, stage, { recursive: true, errorOnExist: true, force: false })
    if (!targetStat) {
      await rename(stage, target)
      return { artifactId: id, action, target, backup: undefined, dryRun: false }
    }
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

// Backward-compatible name for existing consumers while the repository migrates.
export const installPreset = installArtifact
