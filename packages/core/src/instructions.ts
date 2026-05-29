import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { ChatMessage } from '@heroor/x-providers'

export interface InstructionSource {
  label: string
  path: string
  exists: boolean
  content?: string
  error?: string
}

export interface LoadHeroxInstructionsOptions {
  workspaceRoot: string
  homeDir?: string
}

export interface LoadedHeroxInstructions {
  sources: InstructionSource[]
  content: string
}

export interface BuildRunMessagesOptions {
  task: string
  instructions?: string
}

const defaultSystemPrompt = [
  'You are Herox, a local developer agent CLI.',
  'Help the user complete software engineering tasks with concise, actionable output.',
].join(' ')

export function loadHeroxInstructions(
  options: LoadHeroxInstructionsOptions,
): LoadedHeroxInstructions {
  const sourcePaths = [
    { label: 'user', path: join(options.homeDir ?? homedir(), '.herox', 'HEROX.md') },
    { label: 'project', path: join(options.workspaceRoot, 'HEROX.md') },
  ]
  const sources = sourcePaths.map((source) => readInstructionSource(source.label, source.path))
  const content = sources
    .filter((source) => source.content !== undefined && source.content.trim().length > 0)
    .map((source) => `# ${source.label} instructions\n\n${source.content}`)
    .join('\n\n')

  return {
    sources,
    content,
  }
}

export function buildRunMessages(options: BuildRunMessagesOptions): ChatMessage[] {
  const instructions = options.instructions?.trim()
  const systemContent =
    instructions === undefined || instructions.length === 0
      ? defaultSystemPrompt
      : `${defaultSystemPrompt}\n\nFollow these additional instructions:\n\n${instructions}`

  return [
    {
      role: 'system',
      content: systemContent,
    },
    {
      role: 'user',
      content: options.task,
    },
  ]
}

function readInstructionSource(label: string, path: string): InstructionSource {
  if (!existsSync(path)) {
    return {
      label,
      path,
      exists: false,
    }
  }

  try {
    return {
      label,
      path,
      exists: true,
      content: readFileSync(path, 'utf8'),
    }
  } catch (error) {
    return {
      label,
      path,
      exists: true,
      error: error instanceof Error ? error.message : 'Unknown instruction read error.',
    }
  }
}
