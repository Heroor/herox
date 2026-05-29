import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../package.json' with { type: 'json' }

import { runCli } from './cli.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runCli', () => {
  it('prints help', async () => {
    const output: string[] = []
    const code = await runCli(['--help'], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(0)
    expect(output.join('')).toContain('Usage: herox')
  })

  it('starts an interactive session and handles slash commands without provider calls', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('slash commands should not call the provider')
    })

    const output: string[] = []
    const code = await runCli(
      [],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: {},
        cwd: '/tmp/herox-missing',
        homeDir: '/tmp/herox-missing-home',
        input: ['/help', '/model', '/status', '/exit'],
      },
    )

    console.log(output)
    expect(code).toBe(0)
    expect(output.join('')).toContain('Herox')
    expect(output.join('')).toContain('Interactive commands')
    expect(output.join('')).toContain('Active model')
    expect(output.join('')).toContain('Session status')
    expect(output.join('')).toContain('Bye.')
  })

  it('prints version', async () => {
    const output: string[] = []
    const code = await runCli(['--version'], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(0)
    expect(output.join('')).toContain(packageJson.version)
  })

  it('runs doctor', async () => {
    const output: string[] = []
    const code = await runCli(['doctor'], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(0)
    expect(output.join('')).toContain('Herox doctor')
  })

  it('lists provider presets', async () => {
    const output: string[] = []
    const code = await runCli(['provider', 'list'], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(0)
    expect(output.join('')).toContain('openai')
    expect(output.join('')).toContain('deepseek')
  })

  it('prints effective config values', async () => {
    const output: string[] = []
    const code = await runCli(
      ['config', 'get', 'model.provider'],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: { HEROX_PROVIDER: 'ollama' },
        cwd: '/tmp/herox-missing',
        homeDir: '/tmp/herox-missing-home',
      },
    )

    expect(code).toBe(0)
    expect(output.join('').trim()).toBe('"ollama"')
  })

  it('redacts secret config values', async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    const home = join(root, 'home')
    mkdirSync(join(home, '.herox'), { recursive: true })
    writeFileSync(
      join(home, '.herox', 'settings.json'),
      JSON.stringify({
        env: {
          OPENAI_API_KEY: 'sk-env-secret',
        },
        providers: {
          openai: {
            apiKey: 'sk-test-secret',
          },
        },
      }),
    )

    const output: string[] = []
    const code = await runCli(
      ['config', 'get'],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: {},
        cwd: root,
        homeDir: home,
      },
    )

    expect(code).toBe(0)
    expect(output.join('')).toContain('<redacted>')
    expect(output.join('')).toContain('OPENAI_API_KEY')
    expect(output.join('')).not.toContain('sk-test-secret')
    expect(output.join('')).not.toContain('sk-env-secret')
  })

  it('redacts env values when printing env config directly', async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    const home = join(root, 'home')
    mkdirSync(join(home, '.herox'), { recursive: true })
    writeFileSync(
      join(home, '.herox', 'settings.json'),
      JSON.stringify({
        env: {
          OPENAI_API_KEY: 'sk-env-secret',
          HEROX_CONFIG_DIR: '/private/herox',
        },
      }),
    )

    const output: string[] = []
    const code = await runCli(
      ['config', 'get', 'env'],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: {},
        cwd: root,
        homeDir: home,
      },
    )

    expect(code).toBe(0)
    expect(output.join('')).toContain('OPENAI_API_KEY')
    expect(output.join('')).toContain('HEROX_CONFIG_DIR')
    expect(output.join('')).toContain('<redacted>')
    expect(output.join('')).not.toContain('sk-env-secret')
    expect(output.join('')).not.toContain('/private/herox')
  })

  it('redacts exact env config values', async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    const home = join(root, 'home')
    mkdirSync(join(home, '.herox'), { recursive: true })
    writeFileSync(
      join(home, '.herox', 'settings.json'),
      JSON.stringify({
        env: {
          OPENAI_API_KEY: 'sk-env-secret',
        },
      }),
    )

    const output: string[] = []
    const code = await runCli(
      ['config', 'get', 'env.OPENAI_API_KEY'],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: {},
        cwd: root,
        homeDir: home,
      },
    )

    expect(code).toBe(0)
    expect(output.join('').trim()).toBe('"<redacted>"')
    expect(output.join('')).not.toContain('sk-env-secret')
  })

  it('uses settings env values for provider apiKeyEnv', async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    const home = join(root, 'home')
    mkdirSync(join(home, '.herox'), { recursive: true })
    writeFileSync(
      join(home, '.herox', 'settings.json'),
      JSON.stringify({
        env: {
          OPENAI_API_KEY: 'from-settings-env',
        },
      }),
    )

    const calls: Array<{ headers?: Record<string, string> }> = []
    vi.stubGlobal('fetch', async (_url: string, init: { headers?: Record<string, string> }) => {
      calls.push({ headers: init.headers })
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
        text: async () => '{}',
      }
    })

    const output: string[] = []
    const code = await runCli(
      ['provider', 'test', 'openai'],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: {},
        cwd: root,
        homeDir: home,
      },
    )

    expect(code).toBe(0)
    expect(calls[0]?.headers).toMatchObject({
      Authorization: 'Bearer from-settings-env',
    })
    expect(output.join('')).toContain('OK openai')
  })

  it('requires a task for one-shot run', async () => {
    const output: string[] = []
    const code = await runCli(['run'], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(2)
    expect(output.join('')).toContain('Usage: herox run <task>')
  })

  it('runs a one-shot task with HEROX instructions and streamed output', async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    const home = join(root, 'home')
    mkdirSync(join(home, '.herox'), { recursive: true })
    writeFileSync(join(home, '.herox', 'HEROX.md'), 'Prefer concise output.')
    writeFileSync(join(root, 'HEROX.md'), 'Add comments for complex logic.')

    const calls: Array<{ headers?: Record<string, string>; body?: string }> = []
    vi.stubGlobal(
      'fetch',
      async (_url: string, init: { headers?: Record<string, string>; body?: string }) => {
        calls.push({ headers: init.headers, body: init.body })
        return streamResponse([
          'data: {"choices":[{"delta":{"content":"Done"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      },
    )

    const output: string[] = []
    const code = await runCli(
      ['run', 'fix', 'tests'],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: { OPENAI_API_KEY: 'secret' },
        cwd: root,
        homeDir: home,
      },
    )

    expect(code).toBe(0)
    expect(output.join('')).toBe('Done\n')
    expect(calls[0]?.headers).toMatchObject({
      Authorization: 'Bearer secret',
    })
    expect(JSON.parse(String(calls[0]?.body))).toMatchObject({
      stream: true,
    })
    expect(JSON.parse(String(calls[0]?.body)).messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Add comments for complex logic.'),
        }),
        expect.objectContaining({
          role: 'user',
          content: 'fix tests',
        }),
      ]),
    )
  })

  it('streams interactive replies and sends conversation history', async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'HEROX.md'), 'Keep answers short.')

    const calls: Array<{ body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', async (_url: string, init: { body?: string }) => {
      const reply = `Reply ${calls.length + 1}`
      calls.push({ body: JSON.parse(String(init.body)) as Record<string, unknown> })
      return streamResponse([
        `data: {"choices":[{"delta":{"content":"${reply}"}}]}\n\n`,
        'data: [DONE]\n\n',
      ])
    })

    const output: string[] = []
    const code = await runCli(
      [],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: { OPENAI_API_KEY: 'secret' },
        cwd: root,
        homeDir: join(root, 'home'),
        input: ['first', 'second', '/exit'],
      },
    )

    expect(code).toBe(0)
    expect(output.join('')).toContain('>> Reply 1')
    expect(output.join('')).toContain('>> Reply 2')
    expect(calls).toHaveLength(2)
    expect(calls[0]?.body).toMatchObject({ stream: true })
    expect(calls[0]?.body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Keep answers short.'),
        }),
        { role: 'user', content: 'first' },
      ]),
    )
    expect(calls[1]?.body.messages).toEqual(
      expect.arrayContaining([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'Reply 1' },
        { role: 'user', content: 'second' },
      ]),
    )
  })

  it('exits normally when Ctrl+C interrupts an active interactive reply', async () => {
    vi.stubGlobal('fetch', async (_url: string, init: { signal?: AbortSignal }) => {
      return await new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('This operation was aborted.', 'AbortError')),
          { once: true },
        )
        queueMicrotask(() => process.emit('SIGINT'))
      })
    })

    const output: string[] = []
    const code = await runCli(
      [],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: { OPENAI_API_KEY: 'secret' },
        cwd: '/tmp/herox-missing',
        homeDir: '/tmp/herox-missing-home',
        input: ['hello'],
      },
    )

    expect(code).toBe(0)
    expect(output.join('')).not.toContain('network_failed')
    expect(output.join('')).not.toContain('AbortError')
  })

  it('does not call the provider for interactive input when the API key is missing', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('missing API key should stop provider calls')
    })

    const output: string[] = []
    const code = await runCli(
      [],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: {},
        cwd: '/tmp/herox-missing',
        homeDir: '/tmp/herox-missing-home',
        input: ['hello', '/exit'],
      },
    )

    expect(code).toBe(1)
    expect(output.join('')).toContain('Missing API key. Set OPENAI_API_KEY')
    expect(output.join('')).toContain('Bye.')
  })

  it('does not run a one-shot task when the API key is missing', async () => {
    const output: string[] = []
    const code = await runCli(
      ['run', 'fix tests'],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: {},
        cwd: '/tmp/herox-missing',
        homeDir: '/tmp/herox-missing-home',
      },
    )

    expect(code).toBe(1)
    expect(output.join('')).toContain('Missing API key. Set OPENAI_API_KEY')
  })

  it('initializes project Herox files', async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    mkdirSync(root, { recursive: true })

    const output: string[] = []
    const code = await runCli(
      ['init'],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: {},
        cwd: root,
        homeDir: join(root, 'home'),
      },
    )

    expect(code).toBe(0)
    expect(output.join('')).toContain('Initialized Herox project')
    expect(output.join('')).toContain('CREATED HEROX.md')
    expect(readFileSync(join(root, 'HEROX.md'), 'utf8')).toContain('Herox Project Instructions')
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain('.herox/settings.local.json')
  })

  it('supports force initializing template files', async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    mkdirSync(join(root, '.herox'), { recursive: true })
    writeFileSync(join(root, 'HEROX.md'), 'Existing instructions.')
    writeFileSync(join(root, '.herox', 'settings.json'), '{}\n')

    const output: string[] = []
    const code = await runCli(
      ['init', '--force'],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: {},
        cwd: root,
        homeDir: join(root, 'home'),
      },
    )

    expect(code).toBe(0)
    expect(output.join('')).toContain('UPDATED HEROX.md')
    expect(readFileSync(join(root, 'HEROX.md'), 'utf8')).toContain('Herox Project Instructions')
  })

  it('rejects unknown init options', async () => {
    const output: string[] = []
    const code = await runCli(['init', '--unknown'], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(2)
    expect(output.join('')).toContain('Unknown init option')
    expect(output.join('')).toContain('Usage: herox init [--force]')
  })
})

function append(output: string[], chunk: string | Uint8Array): boolean {
  output.push(String(chunk))
  return true
}

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    }),
    json: async () => ({}),
    text: async () => chunks.join(''),
  }
}
