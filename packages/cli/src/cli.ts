import {
  buildConversationMessages,
  buildDoctorReport,
  buildRunMessages,
  formatDoctorReport,
  getConfigValue,
  initHeroxProject,
  loadHeroxInstructions,
  loadHeroxConfig,
} from '@heroor/x-core'
import type { ConversationTurn, LoadedHeroxInstructions, LoadedHeroxConfig } from '@heroor/x-core'
import {
  createChatCompletionStream,
  listProviderPresets,
  ProviderError,
  type ProviderConnection,
  resolveProviderConnection,
  testProviderConnection,
} from '@heroor/x-providers'
import type { CliIo } from '@heroor/x-shared'
import { createTextBlock } from '@heroor/x-shared'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

export type InteractiveInput = Iterable<string> | AsyncIterable<string>

export interface RunCliOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
  input?: InteractiveInput
}

type CliRuntime = Required<Pick<RunCliOptions, 'cwd' | 'env'>> &
  Pick<RunCliOptions, 'homeDir' | 'input'>

const helpText = createTextBlock([
  'Herox Agent CLI',
  '',
  'Usage: herox [command] [options]',
  '',
  'Commands:',
  '  (no command)               Start an interactive session',
  '  config get [path]          Print effective config or a dot-path value',
  '  config paths               Print config source paths',
  '  doctor                     Check local Herox runtime readiness',
  '  provider list              List built-in provider presets',
  '  provider test [provider]   Test an OpenAI-compatible provider',
  '  run <task>                 Execute a one-shot task',
  '  init [--force]             Initialize project Herox files',
  '  resume [session]           Resume a saved session (coming soon)',
  '',
  'Options:',
  '  -h, --help                 Show help',
  '  -v, --version              Show version',
])

const interactiveHelpText = createTextBlock([
  'Interactive commands',
  '',
  '  /help                      Show interactive commands',
  '  /model                     Show the active provider and model',
  '  /status                    Show workspace and conversation status',
  '  /exit                      Exit the session',
  '',
])

const ansi = {
  brand: '\x1b[38;2;200;160;255m',
  cyan: '\x1b[38;2;160;255;255m',
  orange: '\x1b[38;2;255;190;130m',
  dim: '\x1b[2m',
  error: '\x1b[31;1m',
  success: '\x1b[32;1m',
  warn: '\x1b[33;1m]',
  reset: '\x1b[0m',
}

interface InteractiveInputState {
  interrupted: boolean
}

class InteractiveInterruptError extends Error {
  constructor() {
    super('Interactive session interrupted.')
    this.name = 'InteractiveInterruptError'
  }
}

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
    input: options.input,
  }

  if (command === undefined) {
    return handleInteractiveCommand(io, runtime)
  }

  if (command === '-h' || command === '--help' || command === 'help') {
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

  if (command === 'init') {
    return handleInitCommand(normalizedArgs.slice(1), io, runtime)
  }

  if (command === 'resume') {
    io.stderr.write(`herox "${command}" is not implemented yet.\n`)
    return 2
  }

  io.stderr.write(`Unknown command: "${command}"\n\n`)
  io.stderr.write(helpText)
  return 1
}

function handleConfigCommand(args: string[], io: CliIo, runtime: CliRuntime): number {
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

function handleInitCommand(args: string[], io: CliIo, runtime: CliRuntime): number {
  const parsed = parseInitArgs(args)
  if (parsed.error !== undefined) {
    io.stderr.write(`${parsed.error}\n`)
    io.stderr.write('Usage: herox init [--force]\n')
    return 2
  }

  try {
    const result = initHeroxProject({
      cwd: runtime.cwd,
      force: parsed.force,
    })
    io.stdout.write(formatInitResult(result))
    return 0
  } catch (error) {
    io.stderr.write(
      `${error instanceof Error ? error.message : 'Project initialization failed.'}\n`,
    )
    return 1
  }
}

async function handleProviderCommand(
  args: string[],
  io: CliIo,
  runtime: CliRuntime,
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

async function handleRunCommand(args: string[], io: CliIo, runtime: CliRuntime): Promise<number> {
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

async function handleInteractiveCommand(io: CliIo, runtime: CliRuntime): Promise<number> {
  const loaded = loadHeroxConfig(runtime)
  const instructions = loadHeroxInstructions({
    workspaceRoot: loaded.workspaceRoot,
    homeDir: runtime.homeDir,
  })

  let connection: ProviderConnection
  try {
    connection = resolveProviderConnection({
      config: loaded.config,
      env: mergeProviderEnv(loaded.config.env, runtime.env),
    })
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : 'Session setup failed.'}\n`)
    return 1
  }

  const history: ConversationTurn[] = []
  const inputState: InteractiveInputState = { interrupted: false }
  let exitCode = 0

  io.stdout.write(formatInteractiveBanner(loaded, connection))

  for await (const rawLine of readInteractiveInput(runtime.input, io, inputState)) {
    const message = rawLine.trim()
    if (message.length === 0) {
      continue
    }

    if (message.startsWith('/')) {
      const slashResult = handleInteractiveSlashCommand(message, {
        connection,
        history,
        instructions,
        loaded,
      })
      if (slashResult.output.length > 0) {
        io.stdout.write(slashResult.output)
      }
      if (slashResult.exit) {
        return exitCode
      }
      continue
    }

    if (connection.apiKeyEnv !== undefined && connection.apiKey === undefined) {
      io.stderr.write(`Missing API key. Set ${connection.apiKeyEnv} and retry.\n`)
      exitCode = 1
      continue
    }

    try {
      const assistantContent = await streamInteractiveReply({
        connection,
        history,
        instructions: instructions.content,
        io,
        message,
      })
      history.push(
        { role: 'user', content: message },
        { role: 'assistant', content: assistantContent },
      )
    } catch (error) {
      if (error instanceof InteractiveInterruptError) {
        return 0
      }

      io.stderr.write(formatRunError(error))
      exitCode = 1
    }
  }

  return inputState.interrupted ? 0 : exitCode
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

function formatInteractiveBanner(
  loaded: LoadedHeroxConfig,
  connection: ProviderConnection,
): string {
  const heroVersion = colorize(`Herox v${readPackageVersion()}`, ansi.brand)
  const modelInfo = colorize(`${connection.model}(${connection.baseUrl})`, ansi.orange)
  return createTextBlock([
    `${heroVersion} · ${modelInfo}`,
    loaded.workspaceRoot,
    colorize(`Type /help for commands, '/exit' to quit.`, ansi.dim),
    '',
  ])
}

function formatModelStatus(connection: ProviderConnection): string {
  return createTextBlock([
    'Active model',
    '',
    `Provider: ${connection.provider}`,
    `Model: ${connection.model}`,
    `Base URL: ${connection.baseUrl}`,
    `Compatibility: ${connection.compatibility}`,
    `API key: ${formatApiKeyStatus(connection)}`,
    '',
  ])
}

function formatApiKeyStatus(connection: ProviderConnection): string {
  if (connection.apiKeyEnv === undefined) {
    return connection.apiKey === undefined ? 'not required' : 'configured'
  }

  return connection.apiKey === undefined
    ? `missing ${connection.apiKeyEnv}`
    : `available via ${connection.apiKeyEnv}`
}

function formatInteractiveStatus(options: {
  connection: ProviderConnection
  history: ConversationTurn[]
  instructions: LoadedHeroxInstructions
  loaded: LoadedHeroxConfig
}): string {
  const instructionCount = options.instructions.sources.filter(
    (source) => source.exists && source.error === undefined,
  ).length

  return createTextBlock([
    'Session status',
    '',
    `Workspace: ${options.loaded.workspaceRoot}`,
    `Model: ${options.connection.provider}(${options.connection.model})`,
    `Turns: ${Math.floor(options.history.length / 2)}`,
    `Messages: ${options.history.length}`,
    `Instruction sources: ${instructionCount}`,
  ])
}

function formatInitResult(result: ReturnType<typeof initHeroxProject>): string {
  return createTextBlock([
    `Initialized Herox project at ${result.workspaceRoot}`,
    '',
    ...result.files.map(
      (file) =>
        `${file.action.toUpperCase().padEnd(7, ' ')} ${file.relativePath} (${file.description})`,
    ),
  ])
}

function formatRunError(error: unknown): string {
  if (error instanceof ProviderError && error.kind !== 'unknown') {
    return `${error.message} (${error.kind})\n`
  }

  return `${error instanceof Error ? error.message : 'Run failed.'}\n`
}

async function streamInteractiveReply(options: {
  connection: ProviderConnection
  history: ConversationTurn[]
  instructions: string
  io: CliIo
  message: string
}): Promise<string> {
  const abortController = new AbortController()
  const interruptHandler = installRequestInterruptHandler(abortController)
  let content = ''

  // TODO: Need loading
  options.io.stdout.write('>> ')

  try {
    for await (const delta of createChatCompletionStream(options.connection, {
      messages: buildConversationMessages({
        history: options.history,
        instructions: options.instructions,
        nextUserMessage: options.message,
      }),
      signal: abortController.signal,
    })) {
      content += delta
      options.io.stdout.write(delta)
    }
  } catch (error) {
    if (interruptHandler.wasInterrupted()) {
      throw new InteractiveInterruptError()
    }

    throw error
  } finally {
    interruptHandler.stop()
    options.io.stdout.write('\n\n')
  }

  return content
}

function handleInteractiveSlashCommand(
  command: string,
  context: {
    connection: ProviderConnection
    history: ConversationTurn[]
    instructions: LoadedHeroxInstructions
    loaded: LoadedHeroxConfig
  },
): { exit: boolean; output: string } {
  const [name] = command.split(/\s+/, 1)

  if (name === '/help') {
    return { exit: false, output: interactiveHelpText }
  }

  if (name === '/model') {
    return { exit: false, output: formatModelStatus(context.connection) }
  }

  if (name === '/status') {
    return { exit: false, output: formatInteractiveStatus(context) }
  }

  if (name === '/exit') {
    return { exit: true, output: 'Bye.\n' }
  }

  return { exit: false, output: `Unknown slash command: ${command}\n` }
}

async function* readInteractiveInput(
  input: InteractiveInput | undefined,
  io: CliIo,
  state: InteractiveInputState,
): AsyncGenerator<string> {
  if (input !== undefined) {
    for await (const line of input) {
      yield String(line)
    }
    return
  }

  const readline = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })
  const onInterrupt = (): void => {
    state.interrupted = true
    io.stdout.write('\n')
    readline.close()
  }

  try {
    readline.on('SIGINT', onInterrupt)
    io.stdout.write('> ')
    for await (const line of readline) {
      yield line
      io.stdout.write('> ')
    }
  } finally {
    readline.off('SIGINT', onInterrupt)
    readline.close()
  }
}

function installRequestInterruptHandler(abortController: AbortController): {
  stop: () => void
  wasInterrupted: () => boolean
} {
  let interrupted = false
  const onInterrupt = (): void => {
    interrupted = true
    abortController.abort()
  }

  // SIGINT should cancel only the active model request; the surrounding
  // interactive loop remains responsible for deciding whether to keep running.
  process.once('SIGINT', onInterrupt)
  return {
    stop: () => {
      process.off('SIGINT', onInterrupt)
    },
    wasInterrupted: () => interrupted,
  }
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

function parseInitArgs(args: string[]): { force: boolean; error?: string } {
  let force = false

  for (const arg of args) {
    if (arg === '--force' || arg === '-f') {
      force = true
      continue
    }

    return {
      force,
      error: `Unknown init option: "${arg}"`,
    }
  }

  return { force }
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

function colorize(text: string, color: string): string {
  return `${color}${text}${ansi.reset}`
}
