#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { installArtifact } from '../packages/installer/index.mjs'

const probe = spawnSync('dsh', ['--help'], { encoding: 'utf8' })
if (probe.error?.code === 'ENOENT') {
  process.stdout.write('DSH smoke skipped: the dsh executable is not installed on PATH.\n')
  process.exit(0)
}
if (probe.error) throw probe.error

const dshHome = await mkdtemp(join(tmpdir(), 'dsh-prd-agent-smoke-'))
try {
  const installed = await installArtifact({ artifactId: 'prd-agent', dshHome })
  const result = spawnSync('dsh', ['--profile', 'web', '--dump-config'], {
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: dshHome },
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`dsh config smoke failed (${result.status}): ${result.stderr || result.stdout}`)
  }
  const output = `${result.stdout}\n${result.stderr}`
  if (!output.includes('agent-presets')) {
    throw new Error('dsh config smoke did not compose the agent-presets service')
  }
  process.stdout.write(`DSH config smoke passed with temporary preset: ${installed.target}\n`)
  if (!process.env.DEEPSEEK_API_KEY) {
    process.stdout.write('Real-model smoke skipped: DEEPSEEK_API_KEY is not set.\n')
  } else {
    process.stdout.write('DEEPSEEK_API_KEY is set; use the documented Web smoke scenario to verify a real turn.\n')
  }
} finally {
  await rm(dshHome, { recursive: true, force: true })
}
