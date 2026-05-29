import { describe, expect, it } from 'vitest'

import { buildDoctorReport, formatDoctorReport } from './index.js'

describe('doctor report', () => {
  it('reports node, provider, and tool readiness', () => {
    const report = buildDoctorReport({
      cwd: '/tmp/herox',
      nodeVersion: 'v20.0.0',
      version: '0.1.0',
    })

    expect(report.checks.map((check) => check.name)).toEqual([
      'Node.js',
      'Package',
      'Workspace',
      'Provider presets',
      'Builtin tools',
    ])
    expect(formatDoctorReport(report)).toContain('Herox doctor')
  })
})
