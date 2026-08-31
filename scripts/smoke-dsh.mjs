#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { installArtifact } from '../packages/installer/index.mjs'

// 冒烟分两层：先确认机器上是否有 dsh；有的话再用隔离的临时 DSH_HOME
// 安装 Preset 并让 DSH 展开 Web Profile 配置。全程不污染用户真实 ~/.dsh。
const probe = spawnSync('dsh', ['--help'], { encoding: 'utf8' })
if (probe.error?.code === 'ENOENT') {
  process.stdout.write('DSH smoke skipped: the dsh executable is not installed on PATH.\n')
  process.exit(0)
}
if (probe.error) throw probe.error

const dshHome = await mkdtemp(join(tmpdir(), 'dsh-prd-agent-smoke-'))
try {
  // 安装器把 Preset 放到临时目录的 .agent-presets/prd-agent。
  const installed = await installArtifact({ artifactId: 'prd-agent', dshHome })
  // DSH_HOME 指向临时目录后，--dump-config 会验证 Host Profile 能否发现并组装它。
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
  // 这里只验证配置组合链路；真实模型行为留给带 API Key 的 Web 场景测试。
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
  // 无论成功或失败，都清理临时安装目录。
  await rm(dshHome, { recursive: true, force: true })
}
