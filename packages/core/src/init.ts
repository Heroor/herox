import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { createTextBlock } from '@heroor/x-shared'

import { findHeroxWorkspaceRoot } from './config.js'

export type InitFileAction = 'created' | 'skipped' | 'updated'

export interface InitHeroxProjectOptions {
  cwd?: string
  force?: boolean
}

export interface InitFileResult {
  action: InitFileAction
  path: string
  relativePath: string
  description: string
}

export interface InitHeroxProjectResult {
  workspaceRoot: string
  files: InitFileResult[]
}

const projectInstructionsTemplate = createTextBlock([
  '# Herox Project Instructions',
  '',
  '- Describe project-specific coding rules, test commands, and review expectations here.',
  '- Add necessary comments when logic is complex or non-obvious.',
])

const projectSettingsTemplate = `${JSON.stringify(
  {
    model: {
      provider: 'openai',
    },
    providers: {
      openai: {
        apiKeyEnv: 'OPENAI_API_KEY',
      },
    },
  },
  null,
  2,
)}\n`

const localSettingsIgnoreEntry = '.herox/settings.local.json'

export function initHeroxProject(options: InitHeroxProjectOptions = {}): InitHeroxProjectResult {
  const cwd = options.cwd ?? process.cwd()
  const force = options.force ?? false
  const workspaceRoot = findHeroxWorkspaceRoot(cwd)
  const heroxDir = join(workspaceRoot, '.herox')

  mkdirSync(heroxDir, { recursive: true })

  const files = [
    writeTemplateFile({
      path: join(workspaceRoot, 'HEROX.md'),
      workspaceRoot,
      description: 'project instructions',
      content: projectInstructionsTemplate,
      force,
    }),
    writeTemplateFile({
      path: join(heroxDir, 'settings.json'),
      workspaceRoot,
      description: 'shared project settings',
      content: projectSettingsTemplate,
      force,
    }),
    ensureGitignoreEntry(workspaceRoot),
  ]

  return {
    workspaceRoot,
    files,
  }
}

function writeTemplateFile(options: {
  path: string
  workspaceRoot: string
  description: string
  content: string
  force: boolean
}): InitFileResult {
  const exists = existsSync(options.path)

  if (exists && !options.force) {
    return fileResult({
      action: 'skipped',
      path: options.path,
      workspaceRoot: options.workspaceRoot,
      description: options.description,
    })
  }

  writeFileSync(options.path, options.content)
  return fileResult({
    action: exists ? 'updated' : 'created',
    path: options.path,
    workspaceRoot: options.workspaceRoot,
    description: options.description,
  })
}

function ensureGitignoreEntry(workspaceRoot: string): InitFileResult {
  const gitignorePath = join(workspaceRoot, '.gitignore')

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${localSettingsIgnoreEntry}\n`)
    return fileResult({
      action: 'created',
      path: gitignorePath,
      workspaceRoot,
      description: 'private local settings ignore rule',
    })
  }

  const content = readFileSync(gitignorePath, 'utf8')
  const alreadyIgnored = content
    .split(/\r?\n/)
    .some((line) => line.trim() === localSettingsIgnoreEntry)

  if (alreadyIgnored) {
    return fileResult({
      action: 'skipped',
      path: gitignorePath,
      workspaceRoot,
      description: 'private local settings ignore rule',
    })
  }

  // Preserve the existing file exactly, only adding the missing local settings
  // rule with a separating newline when the file did not already end with one.
  const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
  writeFileSync(gitignorePath, `${content}${separator}${localSettingsIgnoreEntry}\n`)

  return fileResult({
    action: 'updated',
    path: gitignorePath,
    workspaceRoot,
    description: 'private local settings ignore rule',
  })
}

function fileResult(options: {
  action: InitFileAction
  path: string
  workspaceRoot: string
  description: string
}): InitFileResult {
  return {
    action: options.action,
    path: options.path,
    relativePath: relative(options.workspaceRoot, options.path),
    description: options.description,
  }
}
