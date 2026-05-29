import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { initHeroxProject } from './init.js'

describe('initHeroxProject', () => {
  it('creates project instructions, shared settings, and local settings ignore rule', () => {
    const root = join(tmpdir(), `herox-init-${crypto.randomUUID()}`)
    mkdirSync(root, { recursive: true })

    const result = initHeroxProject({ cwd: root })

    expect(result.workspaceRoot).toBe(root)
    expect(result.files.map((file) => file.relativePath)).toEqual([
      'HEROX.md',
      '.herox/settings.json',
      '.gitignore',
    ])
    expect(result.files.every((file) => file.action === 'created')).toBe(true)
    expect(readFileSync(join(root, 'HEROX.md'), 'utf8')).toContain('complex')
    expect(readFileSync(join(root, '.herox', 'settings.json'), 'utf8')).toContain('OPENAI_API_KEY')
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain('.herox/settings.local.json')
  })

  it('skips existing project files without duplicating the gitignore entry', () => {
    const root = join(tmpdir(), `herox-init-${crypto.randomUUID()}`)
    mkdirSync(join(root, '.herox'), { recursive: true })
    writeFileSync(join(root, 'HEROX.md'), 'Existing instructions.')
    writeFileSync(join(root, '.herox', 'settings.json'), '{}\n')
    writeFileSync(join(root, '.gitignore'), 'node_modules\n.herox/settings.local.json\n')

    const result = initHeroxProject({ cwd: root })

    expect(result.files.map((file) => file.action)).toEqual(['skipped', 'skipped', 'skipped'])
    expect(readFileSync(join(root, 'HEROX.md'), 'utf8')).toBe('Existing instructions.')
    expect(
      countOccurrences(readFileSync(join(root, '.gitignore'), 'utf8'), localSettingsEntry),
    ).toBe(1)
  })

  it('overwrites template-managed files with --force', () => {
    const root = join(tmpdir(), `herox-init-${crypto.randomUUID()}`)
    mkdirSync(join(root, '.herox'), { recursive: true })
    writeFileSync(join(root, 'HEROX.md'), 'Existing instructions.')
    writeFileSync(join(root, '.herox', 'settings.json'), '{}\n')

    const result = initHeroxProject({ cwd: root, force: true })

    expect(result.files.map((file) => file.action)).toEqual(['updated', 'updated', 'created'])
    expect(readFileSync(join(root, 'HEROX.md'), 'utf8')).toContain('Herox Project Instructions')
  })

  it('uses the nearest existing workspace marker as the initialization root', () => {
    const root = join(tmpdir(), `herox-init-${crypto.randomUUID()}`)
    const nested = join(root, 'packages', 'demo')
    mkdirSync(join(root, '.git'), { recursive: true })
    mkdirSync(nested, { recursive: true })

    const result = initHeroxProject({ cwd: nested })

    expect(result.workspaceRoot).toBe(root)
    expect(existsSync(join(root, 'HEROX.md'))).toBe(true)
  })
})

const localSettingsEntry = '.herox/settings.local.json'

function countOccurrences(content: string, needle: string): number {
  return content.split(needle).length - 1
}
