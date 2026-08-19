import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { installPreset, parseArgs, treesEqual } from '../scripts/install.mjs'

async function temporaryHome(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-prd-agent-'))
  t.after(async () => { await rm(root, { recursive: true, force: true }) })
  return root
}

test('parseArgs accepts the public installer interface', () => {
  assert.deepEqual(parseArgs(['--dsh-home', '/tmp/example', '--dry-run', '--force']), {
    dshHome: '/tmp/example',
    dryRun: true,
    force: true,
    help: false,
  })
  assert.equal(parseArgs(['--dsh-home=/tmp/other']).dshHome, '/tmp/other')
  assert.throws(() => parseArgs(['--dsh-home']), /requires a path/)
  assert.throws(() => parseArgs(['--unknown']), /unknown option/)
})

test('dry-run reports an install without creating the target', async (t) => {
  const dshHome = await temporaryHome(t)
  const result = await installPreset({ dshHome, dryRun: true })
  assert.equal(result.action, 'installed')
  assert.equal(result.dryRun, true)
  await assert.rejects(readFile(join(result.target, 'preset.yml')), { code: 'ENOENT' })
})

test('first install succeeds and an identical reinstall is idempotent', async (t) => {
  const dshHome = await temporaryHome(t)
  const first = await installPreset({ dshHome })
  assert.equal(first.action, 'installed')
  assert.match(await readFile(join(first.target, 'preset.yml'), 'utf8'), /name: PRD Agent/)

  const second = await installPreset({ dshHome })
  assert.equal(second.action, 'unchanged')
  assert.equal(second.target, first.target)
})

test('a conflicting installation is refused without force', async (t) => {
  const dshHome = await temporaryHome(t)
  const first = await installPreset({ dshHome })
  await writeFile(join(first.target, 'preset.yml'), 'name: Modified locally\n')

  await assert.rejects(installPreset({ dshHome }), /already exists/)
  assert.equal(await readFile(join(first.target, 'preset.yml'), 'utf8'), 'name: Modified locally\n')
})

test('force backs up conflicting content before replacing it', async (t) => {
  const dshHome = await temporaryHome(t)
  const first = await installPreset({ dshHome })
  await writeFile(join(first.target, 'preset.yml'), 'name: Modified locally\n')

  const replaced = await installPreset({
    dshHome,
    force: true,
    now: new Date('2026-08-19T03:04:05.000Z'),
  })
  assert.equal(replaced.action, 'replaced')
  assert.equal(await readFile(join(replaced.backup, 'preset.yml'), 'utf8'), 'name: Modified locally\n')
  assert.match(await readFile(join(replaced.target, 'preset.yml'), 'utf8'), /name: PRD Agent/)
  assert.equal(await treesEqual(join(process.cwd(), 'prd-agent'), replaced.target), true)

  const siblings = await readdir(join(dshHome, '.agent-presets'))
  assert(siblings.includes('prd-agent.backup-20260819-030405Z'))
})
