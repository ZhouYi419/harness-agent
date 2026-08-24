import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const CATALOG_PATH = resolve(PROJECT_ROOT, 'dsh-kit.json')

function safeSourcePath(root, value, field) {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value)) {
    throw new Error(`${field} must be a non-empty relative path`)
  }
  const resolved = resolve(root, value)
  const local = relative(root, resolved)
  if (local.startsWith('..') || isAbsolute(local)) throw new Error(`${field} escapes the project root: ${value}`)
  return resolved
}

export async function loadCatalog(path = CATALOG_PATH) {
  const catalogPath = resolve(path)
  let catalog
  try {
    catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`invalid catalog JSON: ${catalogPath}`)
    throw error
  }
  if (catalog?.schemaVersion !== 1) throw new Error('catalog schemaVersion must be 1')
  if (!Array.isArray(catalog.artifacts) || catalog.artifacts.length === 0) {
    throw new Error('catalog must contain at least one artifact')
  }
  const root = resolve(catalogPath, '..')
  const ids = new Set()
  for (const artifact of catalog.artifacts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artifact?.id ?? '')) {
      throw new Error(`invalid artifact id: ${artifact?.id ?? '<missing>'}`)
    }
    if (ids.has(artifact.id)) throw new Error(`duplicate artifact id: ${artifact.id}`)
    ids.add(artifact.id)
    if (!['preset', 'skill', 'plugin', 'workflow', 'bundle'].includes(artifact.type)) {
      throw new Error(`unsupported artifact type for ${artifact.id}: ${artifact.type}`)
    }
    artifact.sourcePath = safeSourcePath(root, artifact.source, `${artifact.id}.source`)
  }
  if (catalog.defaultArtifact !== undefined && !ids.has(catalog.defaultArtifact)) {
    throw new Error(`defaultArtifact is not in the catalog: ${catalog.defaultArtifact}`)
  }
  return { ...catalog, path: catalogPath, root }
}

export function findArtifact(catalog, id) {
  const artifact = catalog.artifacts.find(candidate => candidate.id === id)
  if (!artifact) throw new Error(`unknown artifact: ${id}`)
  return artifact
}
