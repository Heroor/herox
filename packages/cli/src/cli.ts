import {
  buildDoctorReport,
  buildRunMessages,
  formatDoctorReport,
  getConfigValue,
  loadHeroxInstructions,
  loadHeroxConfig,
} from '@heroor/x-core'
import {
  createChatCompletionStream,
  listProviderPresets,
  ProviderError,
  resolveProviderConnection,
  testProviderConnection,
} from '@heroor/x-providers'
import type { CliIo } from '@heroor/x-shared'
import { createTextBlock } from '@heroor/x-shared'
import { readFileSync } from 'node:fs'

export interface RunCliOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
}

const helpText = createTextBlock([
  'Herox Agent CLI',
  '',
  'Usage: herox [command] [options]',
  '',
  'Commands:',
  '  config get [path]          Print effective config or a dot-path value',
  '  config paths               Print config source paths',
  '  doctor                     Check local Herox runtime readiness',
  '  provider list              List built-in provider presets',
  '  provider test [provider]   Test an OpenAI-compatible provider',
  '  run <task>                 Execute a one-shot task',
  '  init                       Initialize project Herox files (coming soon)',
  '  resume [session]           Resume a saved session (coming soon)',
  '',
  'Options:',
  '  -h, --help                 Show help',
  '  -v, --version              Show version',
])

export async function runCli(
  args: string[] = process.argv.slice(2),
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
  options: RunCliOptions = {},
): Promise<number> {
  const normalizedArgs = normalizeArgs(args)
  const [command] = normalizedArgs
  const runtime = {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    homeDir: options.homeDir,
  }

  if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
    io.stdout.write(helpText)
    return 0
  }

  if (command === '-v' || command === '--version' || command === 'version') {
    io.stdout.write(`${readPackageVersion()}\n`)
    return 0
  }

  if (command === 'doctor') {
    const report = buildDoctorReport({
      cwd: runtime.cwd,
      version: readPackageVersion(),
    })
    io.stdout.write(formatDoctorReport(report))
    return hasDoctorErrors(report.checks) ? 1 : 0
  }

  if (command === 'config') {
    return handleConfigCommand(normalizedArgs.slice(1), io, runtime)
  }

  if (command === 'provider') {
    return handleProviderCommand(normalizedArgs.slice(1), io, runtime)
  }

  if (command === 'run') {
    return handleRunCommand(normalizedArgs.slice(1), io, runtime)
  }

  if (command === 'init' || command === 'resume') {
    io.stderr.write(`herox "${command}" is not implemented yet.\n`)
    return 2
  }

  io.stderr.write(`Unknown command: "${command}"\n\n`)
  io.stderr.write(helpText)
  return 1
}

function handleConfigCommand(
  args: string[],
  io: CliIo,
  runtime: Required<Pick<RunCliOptions, 'cwd' | 'env'>> & Pick<RunCliOptions, 'homeDir'>,
): number {
  const [subcommand, key] = args
  const loaded = loadHeroxConfig(runtime)

  if (subcommand === 'get' || subcommand === undefined) {
    io.stdout.write(
      `${JSON.stringify(redactConfigValue(getConfigValue(loaded.config, key), key), null, 2)}\n`,
    )
    return 0
  }

  if (subcommand === 'paths') {
    io.stdout.write(
      createTextBlock([
        `workspaceRoot: ${loaded.workspaceRoot}`,
        ...loaded.sources.map((source) => {
          const state = source.exists ? 'found' : 'missing'
          return `${source.label}: ${state} ${source.path}${source.error ? ` (${source.error})` : ''}`
        }),
      ]),
    )
    return loaded.sources.some((source) => source.error !== undefined) ? 1 : 0
  }

  io.stderr.write(`Unknown config command: "${subcommand}"\n`)
  return 1
}

async function handleProviderCommand(
  args: string[],
  io: CliIo,
  runtime: Required<Pick<RunCliOptions, 'cwd' | 'env'>> & Pick<RunCliOptions, 'homeDir'>,
): Promise<number> {
  const [subcommand, providerName] = args

  if (subcommand === 'list' || subcommand === undefined) {
    io.stdout.write(formatProviderList())
    return 0
  }

  if (subcommand === 'test') {
    const loaded = loadHeroxConfig(runtime)

    try {
      const connection = resolveProviderConnection({
        config: loaded.config,
        providerName,
        env: mergeProviderEnv(loaded.config.env, runtime.env),
      })
      const result = await testProviderConnection(connection)
      io.stdout.write(
        `${result.status.toUpperCase()} ${connection.provider}(${connection.model}): ${result.message}\n`,
      )
      return result.status === 'ok' ? 0 : 1
    } catch (error) {
      io.stderr.write(`${error instanceof Error ? error.message : 'Provider test failed.'}\n`)
      return 1
    }
  }

  io.stderr.write(`Unknown provider command: "${subcommand}"\n`)
  return 1
}

async function handleRunCommand(
  args: string[],
  io: CliIo,
  runtime: Required<Pick<RunCliOptions, 'cwd' | 'env'>> & Pick<RunCliOptions, 'homeDir'>,
): Promise<number> {
  const task = args.join(' ').trim()
  if (task.length === 0) {
    io.stderr.write('Usage: herox run <task>\n')
    return 2
  }

  const loaded = loadHeroxConfig(runtime)
  const instructions = loadHeroxInstructions({
    workspaceRoot: loaded.workspaceRoot,
    homeDir: runtime.homeDir,
  })

  try {
    const connection = resolveProviderConnection({
      config: loaded.config,
      env: mergeProviderEnv(loaded.config.env, runtime.env),
    })

    if (connection.apiKeyEnv !== undefined && connection.apiKey === undefined) {
      io.stderr.write(`Missing API key. Set ${connection.apiKeyEnv} and retry.\n`)
      return 1
    }

    for await (const delta of createChatCompletionStream(connection, {
      messages: buildRunMessages({
        task,
        instructions: instructions.content,
      }),
    })) {
      io.stdout.write(delta)
    }
    io.stdout.write('\n')
    return 0
  } catch (error) {
    io.stderr.write(formatRunError(error))
    return 1
  }
}

function mergeProviderEnv(
  configEnv: Record<string, string>,
  runtimeEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return {
    ...configEnv,
    ...runtimeEnv,
  }
}

function formatProviderList(): string {
  const lines = [
    'Provider presets',
    '',
    ...listProviderPresets().map((provider) => {
      const key = provider.apiKeyEnv === undefined ? 'no key' : provider.apiKeyEnv
      return `${provider.name.padEnd(12, ' ')} ${provider.defaultModel.padEnd(22, ' ')} ${key}`
    }),
  ]

  return createTextBlock(lines)
}

function formatRunError(error: unknown): string {
  if (error instanceof ProviderError && error.kind !== 'unknown') {
    return `${error.message} (${error.kind})\n`
  }

  return `${error instanceof Error ? error.message : 'Run failed.'}\n`
}

function redactConfigValue(value: unknown, path?: string): unknown {
  if (path !== undefined && shouldRedactConfigPath(path, value)) {
    return value === undefined ? undefined : '<redacted>'
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      redactConfigValue(entry, appendConfigPath(path, String(index))),
    )
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        shouldRedactConfigPath(appendConfigPath(path, key), entry)
          ? '<redacted>'
          : redactConfigValue(entry, appendConfigPath(path, key)),
      ]),
    )
  }

  return value
}

function appendConfigPath(path: string | undefined, key: string): string {
  return path === undefined || path.length === 0 ? key : `${path}.${key}`
}

function shouldRedactConfigPath(path: string, value: unknown): boolean {
  const segments = path.split('.')
  const key = segments.at(-1) ?? ''

  return isSecretKey(key) || (segments[0] === 'env' && !isRedactableContainer(value))
}

function isRedactableContainer(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase()
  const compact = normalized.replace(/[^a-z0-9]/g, '')

  return (
    compact === 'apikey' ||
    compact === 'authorization' ||
    compact.endsWith('apikey') ||
    compact.endsWith('token') ||
    compact.endsWith('secret') ||
    compact.endsWith('password')
  )
}

function normalizeArgs(args: string[]): string[] {
  return args[0] === '--' ? args.slice(1) : args
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    )
    return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function hasDoctorErrors(checks: Array<{ status: string }>): boolean {
  return checks.some((check) => check.status === 'error')
}
