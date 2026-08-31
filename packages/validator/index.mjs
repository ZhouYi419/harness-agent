import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { loadCatalog, PROJECT_ROOT } from '../catalog/index.mjs'

// validator 只做静态结构检查，不启动 DSH，也不调用模型。
// 它负责尽早发现无法安装或无法被 DSH 组装的制品。
async function isFile(path) {
  try { return (await stat(path)).isFile() } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function isDirectory(path) {
  try { return (await stat(path)).isDirectory() } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function parseFrontmatter(content, path, errors) {
  // 当前只需要 Skill frontmatter 的一层键值（name/description），
  // 因此使用小型解析器即可，不引入完整 YAML 依赖。
  const match = content.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (match === null) {
    errors.push(`${path}: missing YAML frontmatter`)
    return {}
  }
  const values = {}
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':')
    if (separator !== -1) values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return values
}

async function validateSkillDirectory(skillRoot, root, errors) {
  const skillFile = join(skillRoot, 'SKILL.md')
  const displayPath = relative(root, skillFile)
  if (!await isFile(skillFile)) {
    errors.push(`${displayPath}: missing`)
    return
  }
  const content = await readFile(skillFile, 'utf8')
  const frontmatter = parseFrontmatter(content, displayPath, errors)
  const directory = skillRoot.split(/[\\/]/).at(-1)
  if (frontmatter.name !== directory) errors.push(`${displayPath}: frontmatter name must match directory`)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.name ?? '')) errors.push(`${displayPath}: name must be kebab-case`)
  if ((frontmatter.description ?? '').length < 20) errors.push(`${displayPath}: description is missing or too vague`)

  // SKILL.md 中显式链接的 references/*.md 必须存在且不能逃出该 Skill 目录。
  const references = [...content.replace(/\r\n/g, '\n').matchAll(/\]\((references\/[^)#]+\.md)\)/g)].map(match => match[1])
  for (const reference of references) {
    const resolved = resolve(dirname(skillFile), reference)
    const local = relative(skillRoot, resolved)
    if (local.startsWith('..') || isAbsolute(local)) errors.push(`${displayPath}: reference escapes skill directory: ${reference}`)
    else if (!await isFile(resolved)) errors.push(`${displayPath}: missing reference ${reference}`)
  }
}

async function validateSkillsRoot(skillsRoot, root, errors) {
  let entries
  try { entries = await readdir(skillsRoot, { withFileTypes: true }) } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries.filter(candidate => candidate.isDirectory())) {
    await validateSkillDirectory(join(skillsRoot, entry.name), root, errors)
  }
}

async function validatePreset(artifact, root, errors) {
  const configPath = join(artifact.sourcePath, 'agent.cordis.yml')
  const metadataPath = join(artifact.sourcePath, 'preset.yml')
  if (!await isFile(configPath)) errors.push(`${artifact.source}/agent.cordis.yml: missing`)
  if (!await isFile(metadataPath)) errors.push(`${artifact.source}/preset.yml: missing`)
  if (!await isFile(configPath) || !await isFile(metadataPath)) return

  const config = await readFile(configPath, 'utf8')
  // 每个 Cordis 行的 id 必须唯一，否则 DSH 组装时无法稳定标识插件实例。
  const ids = [...config.matchAll(/^- id:\s+([a-z0-9-]+)\s*$/gm)].map(match => match[1])
  if (ids.length === 0) errors.push(`${artifact.source}/agent.cordis.yml: no plugin rows found`)
  if (new Set(ids).size !== ids.length) errors.push(`${artifact.source}/agent.cordis.yml: row ids must be unique`)
  // name 既可能是官方 npm 模块，也可能是随 Preset 发布的 ./tools/*.mjs。
  const modules = [...config.matchAll(/^\s+name:\s+['"]?([^'"\s]+)['"]?\s*$/gm)].map(match => match[1])
  for (const module of modules.filter(value => value.startsWith('./'))) {
    const modulePath = resolve(dirname(configPath), module)
    if (!await isFile(modulePath)) errors.push(`${artifact.source}/agent.cordis.yml: local module is missing: ${module}`)
  }
  // allowlist 同时防止漏装必需插件和意外扩大 Agent 的工具权限面。
  const allowlist = artifact.validation?.allowedModules
  if (allowlist) {
    const unexpected = modules.filter(module => !allowlist.includes(module))
    const missing = allowlist.filter(module => !modules.includes(module))
    if (unexpected.length) errors.push(`${artifact.source}/agent.cordis.yml: unexpected modules: ${unexpected.join(', ')}`)
    if (missing.length) errors.push(`${artifact.source}/agent.cordis.yml: missing modules: ${missing.join(', ')}`)
  }
  const metadata = await readFile(metadataPath, 'utf8')
  if (!/^name:\s+\S.+$/m.test(metadata)) errors.push(`${artifact.source}/preset.yml: name is missing`)
  if (!/^description:\s+\S.+$/m.test(metadata)) errors.push(`${artifact.source}/preset.yml: description is missing`)
  await validateSkillsRoot(join(artifact.sourcePath, 'skills'), root, errors)
}

export async function validateProject({ root = PROJECT_ROOT } = {}) {
  const errors = []
  let catalog
  try { catalog = await loadCatalog(join(root, 'dsh-kit.json')) } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], catalog: undefined }
  }
  // 按制品类型分派校验；当前仓库实现了 preset 的完整结构检查。
  for (const artifact of catalog.artifacts) {
    if (!await isDirectory(artifact.sourcePath)) {
      errors.push(`${artifact.source}: artifact source directory is missing`)
      continue
    }
    if (artifact.type === 'preset') await validatePreset(artifact, root, errors)
  }
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (packageJson.type !== 'module') errors.push('package.json: project must use ESM')
  for (const required of ['README.md', 'scripts/install.mjs', 'scripts/validate.mjs']) {
    if (!await isFile(join(root, required))) errors.push(`${required}: missing`)
  }
  return { errors, catalog }
}
