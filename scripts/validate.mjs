#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const PRESET = join(ROOT, 'prd-agent')
const SKILLS = join(PRESET, 'skills')
const errors = []

function check(condition, message) {
  if (!condition) errors.push(message)
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function parseFrontmatter(content, path) {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  check(match !== null, `${path}: missing YAML frontmatter`)
  if (match === null) return {}
  const values = {}
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return values
}

async function validateSkills() {
  const entries = (await readdir(SKILLS, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
  const expected = ['prd-generator', 'requirement-clarification']
  check(JSON.stringify(entries) === JSON.stringify(expected),
    `skill root must contain exactly ${expected.join(', ')}; found ${entries.join(', ') || 'none'}`)

  for (const directory of entries) {
    const skillFile = join(SKILLS, directory, 'SKILL.md')
    check(await isFile(skillFile), `${relative(ROOT, skillFile)}: missing`)
    if (!await isFile(skillFile)) continue
    const content = await readFile(skillFile, 'utf8')
    const frontmatter = parseFrontmatter(content, relative(ROOT, skillFile))
    check(frontmatter.name === directory,
      `${relative(ROOT, skillFile)}: frontmatter name must match directory`)
    check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.name ?? ''),
      `${relative(ROOT, skillFile)}: name must be kebab-case`)
    check((frontmatter.description ?? '').length >= 20,
      `${relative(ROOT, skillFile)}: description is missing or too vague`)

    const referenced = [...content.matchAll(/\]\((references\/[^)#]+\.md)\)/g)]
      .map(match => match[1])
    for (const reference of referenced) {
      const resolved = resolve(dirname(skillFile), reference)
      const localPath = relative(resolve(dirname(skillFile)), resolved)
      check(!localPath.startsWith('..') && !isAbsolute(localPath),
        `${relative(ROOT, skillFile)}: reference escapes its skill directory: ${reference}`)
      check(await isFile(resolved), `${relative(ROOT, skillFile)}: missing reference ${reference}`)
    }
  }

  const generatorRefs = (await readdir(join(SKILLS, 'prd-generator', 'references')))
    .filter(name => name.endsWith('.md'))
    .sort()
  check(JSON.stringify(generatorRefs) === JSON.stringify([
    'prd-template.md',
    'review-and-revision.md',
    'writing-rules.md',
  ]), `prd-generator references are incomplete or contain unexpected files: ${generatorRefs.join(', ')}`)
}

async function validatePreset() {
  const configPath = join(PRESET, 'agent.cordis.yml')
  const config = await readFile(configPath, 'utf8')
  const ids = [...config.matchAll(/^- id:\s+([a-z0-9-]+)\s*$/gm)].map(match => match[1])
  const expectedIds = ['persona', 'skill-filesystem', 'tool-skill', 'tool-ask-user', 'tool-fs']
  check(JSON.stringify(ids) === JSON.stringify(expectedIds),
    `agent preset rows must be exactly ${expectedIds.join(', ')}; found ${ids.join(', ')}`)
  check(new Set(ids).size === ids.length, 'agent preset row ids must be unique')

  const modules = [...config.matchAll(/^\s+name:\s+['"]?([^'"\s]+)['"]?\s*$/gm)]
    .map(match => match[1])
  const allowedModules = [
    '@deepseek-ai/dsh-persona',
    '@deepseek-ai/dsh-skill-filesystem',
    '@deepseek-ai/dsh-tool-skill',
    '@deepseek-ai/dsh-tool-ask-user',
    '@deepseek-ai/dsh-tool-fs',
  ]
  check(JSON.stringify(modules) === JSON.stringify(allowedModules),
    `agent preset module allowlist mismatch: ${modules.join(', ')}`)
  check(!modules.some(module => /(?:bash|shell|web|subagent|workflow|terminal|goal|todo)/i.test(module)),
    'agent preset must not expose shell, web, delegation, workflow, goal, or todo modules')
  check(config.includes('includeDefaultRoots: false'),
    'skill filesystem must disable project and user default roots')
  check(config.includes("new URL('skills/', baseUrl)"),
    'skill filesystem must resolve the preset-local skills directory')
  check(config.includes('complete: true'), 'persona must own the complete system prompt')

  const metadata = await readFile(join(PRESET, 'preset.yml'), 'utf8')
  check(/^name:\s+PRD Agent\s*$/m.test(metadata), 'preset.yml must expose the PRD Agent display name')
  check(/^description:\s+\S.+$/m.test(metadata), 'preset.yml must include a description')
}

async function validateProject() {
  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  check(packageJson.version === '0.1.0', 'package version must be 0.1.0')
  check(packageJson.type === 'module', 'package must use ESM scripts')
  check(Object.keys(packageJson.dependencies ?? {}).length === 0,
    'runtime dependencies are not allowed')
  check(packageJson.scripts?.validate === 'node scripts/validate.mjs',
    'package.json must expose the validate script')

  for (const required of ['README.md', 'scripts/install.mjs', 'tests/install.test.mjs']) {
    check(await isFile(join(ROOT, required)), `${required}: missing`)
  }
}

await Promise.all([validateSkills(), validatePreset(), validateProject()])

if (errors.length > 0) {
  process.stderr.write(`Validation failed with ${errors.length} error(s):\n`)
  for (const error of errors) process.stderr.write(`- ${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('Validation passed: prd-agent preset, two skills, references, and tool allowlist are valid.\n')
}
