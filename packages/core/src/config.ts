import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse } from 'node:path'

export interface HeroxModelConfig {
  provider?: string
  name?: string
  temperature?: number
  maxOutputTokens?: number
}

export interface HeroxProviderConfig {
  baseURL?: string
  baseUrl?: string
  apiKey?: string
  apiKeyEnv?: string
  defaultModel?: string
  model?: string
  temperature?: number
  maxOutputTokens?: number
  headers?: Record<string, string>
}

export interface HeroxConfig {
  model: HeroxModelConfig
  providers: Record<string, HeroxProviderConfig>
  env: Record<string, string>
}

export interface ConfigSource {
  label: string
  path: string
  exists: boolean
  error?: string
}

export interface LoadHeroxConfigOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
}

export interface LoadedHeroxConfig {
  config: HeroxConfig
  sources: ConfigSource[]
  workspaceRoot: string
}

const defaultConfig: HeroxConfig = {
  model: {
    provider: 'openai',
  },
  providers: {
    openai: {
      apiKeyEnv: 'OPENAI_API_KEY',
    },
  },
  env: {},
}

export function loadHeroxConfig(options: LoadHeroxConfigOptions = {}): LoadedHeroxConfig {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const workspaceRoot = findHeroxWorkspaceRoot(cwd)
  const sourcePaths = [
    { label: 'user', path: join(options.homeDir ?? homedir(), '.herox', 'settings.json') },
    { label: 'project', path: join(workspaceRoot, '.herox', 'settings.json') },
    { label: 'local', path: join(workspaceRoot, '.herox', 'settings.local.json') },
  ]

  let config = cloneConfig(defaultConfig)
  const sources: ConfigSource[] = []

  for (const source of sourcePaths) {
    const loaded = readConfigSource(source.label, source.path)
    sources.push(loaded.source)
    if (loaded.config !== undefined) {
      config = mergeHeroxConfig(config, loaded.config)
    }
  }

  config = applyEnvironmentOverrides(config, env)

  return {
    config,
    sources,
    workspaceRoot,
  }
}

export function getConfigValue(config: HeroxConfig, path?: string): unknown {
  if (path === undefined || path.length === 0) {
    return config
  }

  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) {
      return undefined
    }
    return current[key]
  }, config)
}

export function mergeHeroxConfig(base: HeroxConfig, override: Partial<HeroxConfig>): HeroxConfig {
  return {
    model: {
      ...base.model,
      ...(isRecord(override.model) ? stripUndefined(override.model) : {}),
    },
    providers: mergeProviderConfigs(base.providers, override.providers),
    env: {
      ...base.env,
      ...(isStringRecord(override.env) ? override.env : {}),
    },
  }
}

function applyEnvironmentOverrides(config: HeroxConfig, env: NodeJS.ProcessEnv): HeroxConfig {
  return mergeHeroxConfig(config, {
    model: stripUndefined({
      provider: env.HEROX_PROVIDER,
      name: env.HEROX_MODEL,
    }),
  })
}

function readConfigSource(
  label: string,
  path: string,
): { source: ConfigSource; config?: Partial<HeroxConfig> } {
  if (!existsSync(path)) {
    return {
      source: { label, path, exists: false },
    }
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isRecord(parsed)) {
      return {
        source: { label, path, exists: true, error: 'Config file must contain a JSON object.' },
      }
    }

    return {
      source: { label, path, exists: true },
      config: parsed as Partial<HeroxConfig>,
    }
  } catch (error) {
    return {
      source: {
        label,
        path,
        exists: true,
        error: error instanceof Error ? error.message : 'Unknown config parse error.',
      },
    }
  }
}

export function findHeroxWorkspaceRoot(cwd: string): string {
  let current = cwd
  const root = parse(cwd).root

  while (current !== root) {
    if (
      existsSync(join(current, '.git')) ||
      existsSync(join(current, '.herox')) ||
      existsSync(join(current, 'HEROX.md'))
    ) {
      return current
    }
    current = dirname(current)
  }

  return cwd
}

function mergeProviderConfigs(
  base: Record<string, HeroxProviderConfig>,
  override: unknown,
): Record<string, HeroxProviderConfig> {
  if (!isRecord(override)) {
    return { ...base }
  }

  const merged: Record<string, HeroxProviderConfig> = { ...base }

  for (const [name, value] of Object.entries(override)) {
    if (!isRecord(value)) {
      continue
    }
    // Provider blocks should merge by provider name so a project can override
    // only baseURL while keeping the user's apiKeyEnv or custom headers.
    merged[name] = {
      ...(merged[name] ?? {}),
      ...(stripUndefined(value) as HeroxProviderConfig),
    }
  }

  return merged
}

function cloneConfig(config: HeroxConfig): HeroxConfig {
  return {
    model: { ...config.model },
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([name, provider]) => [name, { ...provider }]),
    ),
    env: { ...config.env },
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
