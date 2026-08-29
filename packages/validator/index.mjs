import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { loadCatalog, PROJECT_ROOT } from '../catalog/index.mjs'

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
  const ids = [...config.matchAll(/^- id:\s+([a-z0-9-]+)\s*$/gm)].map(match => match[1])
  if (ids.length === 0) errors.push(`${artifact.source}/agent.cordis.yml: no plugin rows found`)
  if (new Set(ids).size !== ids.length) errors.push(`${artifact.source}/agent.cordis.yml: row ids must be unique`)
  const modules = [...config.matchAll(/^\s+name:\s+['"]?([^'"\s]+)['"]?\s*$/gm)].map(match => match[1])
  for (const module of modules.filter(value => value.startsWith('./'))) {
    const modulePath = resolve(dirname(configPath), module)
    if (!await isFile(modulePath)) errors.push(`${artifact.source}/agent.cordis.yml: local module is missing: ${module}`)
  }
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
