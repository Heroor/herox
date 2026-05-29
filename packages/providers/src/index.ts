export interface ProviderPreset {
  name: string
  displayName: string
  baseUrl: string
  apiKeyEnv?: string
  defaultModel: string
  compatibility: 'openai-chat-completions' | 'partial'
}

export interface ProviderConfigInput {
  model?: {
    provider?: string
    name?: string
    temperature?: number
    maxOutputTokens?: number
  }
  providers?: Record<
    string,
    {
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
  >
}

export interface ProviderConnection {
  provider: string
  baseUrl: string
  model: string
  temperature?: number
  maxOutputTokens?: number
  apiKey?: string
  apiKeyEnv?: string
  headers?: Record<string, string>
  compatibility: ProviderPreset['compatibility']
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
  name?: string
  tool_call_id?: string
}

export interface CreateChatCompletionOptions {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxOutputTokens?: number
  signal?: AbortSignal
}

export interface ChatCompletionResult {
  content: string
  raw: unknown
}

export type ChatCompletionStream = AsyncIterable<string>

export interface ProviderTestResult {
  status: 'ok' | 'error'
  message: string
}

export interface FetchResponseLike {
  ok: boolean
  status: number
  statusText: string
  body?: ReadableStream<Uint8Array> | null
  json(): Promise<unknown>
  text(): Promise<string>
}

export type FetchLike = (
  url: string,
  init: {
    method: 'POST'
    headers: Record<string, string>
    body: string
    signal?: AbortSignal
  },
) => Promise<FetchResponseLike>

export type ProviderErrorKind =
  | 'auth_failed'
  | 'context_length_exceeded'
  | 'model_not_found'
  | 'network_failed'
  | 'rate_limited'
  | 'unknown'

export class ProviderError extends Error {
  readonly status?: number
  readonly code?: string
  readonly type?: string
  readonly kind: ProviderErrorKind

  constructor(
    message: string,
    options: {
      status?: number
      code?: string
      kind?: ProviderErrorKind
      type?: string
    } = {},
  ) {
    super(message)
    this.name = 'ProviderError'
    this.status = options.status
    this.code = options.code
    this.kind = options.kind ?? 'unknown'
    this.type = options.type
  }
}

export const providerPresets: ProviderPreset[] = [
  {
    name: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-5.5',
    compatibility: 'openai-chat-completions',
  },
  {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-v4-pro',
    compatibility: 'openai-chat-completions',
  },
  {
    name: 'qwen',
    displayName: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'QWEN_API_KEY',
    defaultModel: 'qwen-plus',
    compatibility: 'openai-chat-completions',
  },
  {
    name: 'moonshot',
    displayName: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
    defaultModel: 'moonshot-v1-8k',
    compatibility: 'openai-chat-completions',
  },
  {
    name: 'mimo',
    displayName: 'Mimo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    apiKeyEnv: 'MIMO_API_KEY',
    defaultModel: 'mimo-v2.5',
    compatibility: 'openai-chat-completions',
  },
  {
    name: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'deepseek/deepseek-v4-flash:free',
    compatibility: 'openai-chat-completions',
  },
  {
    name: 'ollama',
    displayName: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    compatibility: 'partial',
  },
]

export function listProviderPresets(): ProviderPreset[] {
  return [...providerPresets]
}

export function getProviderPreset(name: string): ProviderPreset | undefined {
  return providerPresets.find((preset) => preset.name === name)
}

export function resolveProviderConnection(options: {
  config?: ProviderConfigInput
  providerName?: string
  env?: NodeJS.ProcessEnv
}): ProviderConnection {
  const config = options.config ?? {}
  const env = options.env ?? process.env
  const providerName = options.providerName ?? config.model?.provider ?? 'openai'
  const preset = getProviderPreset(providerName)
  const override = config.providers?.[providerName]

  if (preset === undefined && override === undefined) {
    throw new ProviderError(`Unknown provider "${providerName}".`)
  }

  const baseUrl = override?.baseURL ?? override?.baseUrl ?? preset?.baseUrl
  if (baseUrl === undefined) {
    throw new ProviderError(`Provider "${providerName}" is missing baseURL.`)
  }

  const apiKeyEnv = override?.apiKeyEnv ?? preset?.apiKeyEnv
  const apiKey = override?.apiKey ?? (apiKeyEnv !== undefined ? env[apiKeyEnv] : undefined)
  const model =
    override?.model ?? config.model?.name ?? override?.defaultModel ?? preset?.defaultModel
  // Provider-specific generation defaults let one provider tune sampling without
  // changing the global model defaults used by other providers.
  const temperature = override?.temperature ?? config.model?.temperature
  const maxOutputTokens = override?.maxOutputTokens ?? config.model?.maxOutputTokens

  if (model === undefined) {
    throw new ProviderError(`Provider "${providerName}" is missing a model.`)
  }

  return {
    provider: providerName,
    baseUrl,
    model,
    temperature,
    maxOutputTokens,
    apiKey,
    apiKeyEnv,
    headers: override?.headers,
    compatibility: preset?.compatibility ?? 'partial',
  }
}

export async function createChatCompletion(
  connection: ProviderConnection,
  options: CreateChatCompletionOptions,
  fetchLike: FetchLike = defaultFetch,
): Promise<ChatCompletionResult> {
  const response = await postChatCompletion(connection, options, false, fetchLike)

  if (!response.ok) {
    throw await providerErrorFromResponse(response)
  }

  const raw = await response.json()
  return {
    content: extractAssistantContent(raw),
    raw,
  }
}

export async function testProviderConnection(
  connection: ProviderConnection,
  fetchLike: FetchLike = defaultFetch,
): Promise<ProviderTestResult> {
  if (connection.apiKeyEnv !== undefined && connection.apiKey === undefined) {
    return {
      status: 'error',
      message: `Missing API key. Set ${connection.apiKeyEnv} and retry.`,
    }
  }

  try {
    const result = await createChatCompletion(
      connection,
      {
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        temperature: connection.temperature ?? 0,
        maxOutputTokens: connection.maxOutputTokens ?? 8,
      },
      fetchLike,
    )

    return {
      status: 'ok',
      message:
        result.content.length > 0 ? `Model responded: ${result.content}` : 'Model responded.',
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Provider test failed.',
    }
  }
}

export async function* createChatCompletionStream(
  connection: ProviderConnection,
  options: CreateChatCompletionOptions,
  fetchLike: FetchLike = defaultFetch,
): AsyncGenerator<string> {
  const response = await postChatCompletion(connection, options, true, fetchLike)

  if (!response.ok) {
    throw await providerErrorFromResponse(response)
  }

  if (response.body === undefined || response.body === null) {
    throw new ProviderError('Streaming response did not include a readable body.', {
      kind: 'network_failed',
      status: response.status,
    })
  }

  for await (const data of readSseDataFromBody(response.body)) {
    if (data === '[DONE]') {
      return
    }

    const content = extractDeltaContent(data)
    if (content !== undefined) {
      yield content
    }
  }
}

export function extractStreamContent(streamText: string): string[] {
  return parseSseDataLines(streamText).flatMap((data) => {
    if (data === '[DONE]') {
      return []
    }

    try {
      const parsed: unknown = JSON.parse(data)
      const content = readNestedString(parsed, ['choices', '0', 'delta', 'content'])
      return content === undefined ? [] : [content]
    } catch {
      return []
    }
  })
}

async function postChatCompletion(
  connection: ProviderConnection,
  options: CreateChatCompletionOptions,
  stream: boolean,
  fetchLike: FetchLike,
): Promise<FetchResponseLike> {
  try {
    return await fetchLike(joinUrl(connection.baseUrl, 'chat/completions'), {
      method: 'POST',
      headers: buildHeaders(connection),
      body: JSON.stringify({
        model: options.model ?? connection.model,
        messages: options.messages,
        temperature: options.temperature ?? connection.temperature,
        max_tokens: options.maxOutputTokens ?? connection.maxOutputTokens,
        stream,
      }),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error
    }

    throw new ProviderError(formatNetworkErrorMessage(error), {
      kind: 'network_failed',
    })
  }
}

async function* readSseDataFromBody(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })

      // SSE events are delimited by blank lines; keeping the final partial
      // event in buffer lets us handle JSON split across network chunks.
      const normalized = buffer.replace(/\r\n/g, '\n')
      const events = normalized.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        yield* parseSseDataLines(`${event}\n\n`)
      }

      if (done) {
        break
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (buffer.length > 0) {
    yield* parseSseDataLines(buffer)
  }
}

function extractDeltaContent(data: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(data)
    return readNestedString(parsed, ['choices', '0', 'delta', 'content'])
  } catch {
    return undefined
  }
}

function parseSseDataLines(streamText: string): string[] {
  const events: string[] = []
  let current: string[] = []

  for (const line of streamText.split(/\r?\n/)) {
    if (line.length === 0) {
      if (current.length > 0) {
        events.push(current.join('\n'))
        current = []
      }
      continue
    }

    if (line.startsWith('data:')) {
      current.push(line.slice('data:'.length).trimStart())
    }
  }

  if (current.length > 0) {
    events.push(current.join('\n'))
  }

  return events
}

function buildHeaders(connection: ProviderConnection): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(connection.headers ?? {}),
  }

  if (connection.apiKey !== undefined) {
    headers.Authorization = `Bearer ${connection.apiKey}`
  }

  return headers
}

function extractAssistantContent(raw: unknown): string {
  return readNestedString(raw, ['choices', '0', 'message', 'content']) ?? ''
}

function readNestedString(value: unknown, path: string[]): string | undefined {
  let current = value

  for (const key of path) {
    if (Array.isArray(current)) {
      current = current[Number.parseInt(key, 10)]
      continue
    }

    if (!isRecord(current)) {
      return undefined
    }

    current = current[key]
  }

  return typeof current === 'string' ? current : undefined
}

async function providerErrorFromResponse(response: FetchResponseLike): Promise<ProviderError> {
  const text = await response.text()
  const parsed = parseJson(text)
  const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined
  const message = readErrorMessage(error) ?? `${response.status} ${response.statusText}`

  return new ProviderError(message, {
    status: response.status,
    code: readOptionalString(error, 'code'),
    kind: classifyProviderError(response.status, error, message),
    type: readOptionalString(error, 'type'),
  })
}

function readErrorMessage(error: Record<string, unknown> | undefined): string | undefined {
  return readOptionalString(error, 'message')
}

function readOptionalString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const entry = value?.[key]
  return typeof entry === 'string' ? entry : undefined
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function classifyProviderError(
  status: number,
  error: Record<string, unknown> | undefined,
  message: string,
): ProviderErrorKind {
  const combined = [readOptionalString(error, 'code'), readOptionalString(error, 'type'), message]
    .filter((entry) => entry !== undefined)
    .join(' ')
    .toLowerCase()

  if (status === 401 || status === 403) {
    return 'auth_failed'
  }

  if (status === 429) {
    return 'rate_limited'
  }

  if (
    combined.includes('context_length') ||
    combined.includes('context length') ||
    combined.includes('context window') ||
    combined.includes('maximum context') ||
    combined.includes('too many tokens')
  ) {
    return 'context_length_exceeded'
  }

  if (
    combined.includes('model_not_found') ||
    combined.includes('model not found') ||
    combined.includes('does not exist') ||
    (status === 404 && combined.includes('model'))
  ) {
    return 'model_not_found'
  }

  return 'unknown'
}

function formatNetworkErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : 'Unknown network error.'
  return `Network request failed: ${detail}`
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

async function defaultFetch(
  url: string,
  init: Parameters<FetchLike>[1],
): Promise<FetchResponseLike> {
  return fetch(url, init)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
