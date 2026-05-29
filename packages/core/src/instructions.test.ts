import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildConversationMessages,
  buildRunMessages,
  loadHeroxInstructions,
} from './instructions.js'

describe('loadHeroxInstructions', () => {
  it('loads user and project HEROX.md files', () => {
    const root = join(tmpdir(), `herox-instructions-${crypto.randomUUID()}`)
    const home = join(root, 'home')
    const project = join(root, 'project')

    mkdirSync(join(home, '.herox'), { recursive: true })
    mkdirSync(project, { recursive: true })
    writeFileSync(join(home, '.herox', 'HEROX.md'), 'Prefer focused responses.')
    writeFileSync(join(project, 'HEROX.md'), 'Run tests before finishing.')

    const result = loadHeroxInstructions({
      workspaceRoot: project,
      homeDir: home,
    })

    expect(result.sources.filter((source) => source.exists)).toHaveLength(2)
    expect(result.content).toContain('Prefer focused responses.')
    expect(result.content).toContain('Run tests before finishing.')
  })
})

describe('buildRunMessages', () => {
  it('combines default system prompt, instructions, and task', () => {
    const messages = buildRunMessages({
      task: 'Fix the failing test.',
      instructions: 'Add comments for complex logic.',
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      role: 'system',
    })
    expect(messages[0]?.content).toContain('Add comments for complex logic.')
    expect(messages[1]).toEqual({
      role: 'user',
      content: 'Fix the failing test.',
    })
  })
})

describe('buildConversationMessages', () => {
  it('includes system instructions, prior turns, and the next user message', () => {
    const messages = buildConversationMessages({
      instructions: 'Run tests before finishing.',
      history: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
      nextUserMessage: 'Fix the failing test.',
    })

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('Run tests before finishing.'),
      }),
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Fix the failing test.' },
    ])
  })
})
