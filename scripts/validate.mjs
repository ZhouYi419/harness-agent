#!/usr/bin/env node

import { validateProject } from '../packages/validator/index.mjs'

const { errors, catalog } = await validateProject()
if (errors.length > 0) {
  process.stderr.write(`Validation failed with ${errors.length} error(s):\n`)
  for (const error of errors) process.stderr.write(`- ${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Validation passed: ${catalog.artifacts.length} artifact(s) are valid.\n`)
}
