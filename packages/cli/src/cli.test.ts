import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { runCli } from "./cli.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("runCli", () => {
  it("prints help", async () => {
    const output: string[] = []
    const code = await runCli(["--help"], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(0)
    expect(output.join("")).toContain("Usage: herox")
  })

  it("prints version", async () => {
    const output: string[] = []
    const code = await runCli(["--version"], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(0)
    expect(output.join("")).toContain("0.1.0")
  })

  it("runs doctor", async () => {
    const output: string[] = []
    const code = await runCli(["doctor"], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(0)
    expect(output.join("")).toContain("Herox doctor")
  })

  it("lists provider presets", async () => {
    const output: string[] = []
    const code = await runCli(["provider", "list"], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    })

    expect(code).toBe(0)
    expect(output.join("")).toContain("openai")
    expect(output.join("")).toContain("deepseek")
  })

  it("prints effective config values", async () => {
    const output: string[] = []
    const code = await runCli(
      ["config", "get", "model.provider"],
      {
        stdout: { write: (chunk) => append(output, chunk) },
        stderr: { write: (chunk) => append(output, chunk) },
      },
      {
        env: { HEROX_PROVIDER: "ollama" },
        cwd: "/tmp/herox-missing",
        homeDir: "/tmp/herox-missing-home",
      },
    )

    expect(code).toBe(0)
    expect(output.join("").trim()).toBe('"ollama"')
  })

  it("redacts secret config values", async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    const home = join(root, "home")
    mkdirSync(join(home, ".herox"), { recursive: true })
    writeFileSync(
      join(home, ".herox", "settings.json"),
      JSON.stringify({
        env: {
          OPENAI_API_KEY: "sk-env-secret",
        },
        providers: {
          openai: {
            apiKey: "sk-test-secret",
          },
        },
      }),
    )

    const output: string[] = []
    const code = await runCli(
      ["config", "get"],
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
    expect(output.join("")).toContain("<redacted>")
    expect(output.join("")).toContain("OPENAI_API_KEY")
    expect(output.join("")).not.toContain("sk-test-secret")
    expect(output.join("")).not.toContain("sk-env-secret")
  })

  it("redacts env values when printing env config directly", async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    const home = join(root, "home")
    mkdirSync(join(home, ".herox"), { recursive: true })
    writeFileSync(
      join(home, ".herox", "settings.json"),
      JSON.stringify({
        env: {
          OPENAI_API_KEY: "sk-env-secret",
          HEROX_CONFIG_DIR: "/private/herox",
        },
      }),
    )

    const output: string[] = []
    const code = await runCli(
      ["config", "get", "env"],
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
    expect(output.join("")).toContain("OPENAI_API_KEY")
    expect(output.join("")).toContain("HEROX_CONFIG_DIR")
    expect(output.join("")).toContain("<redacted>")
    expect(output.join("")).not.toContain("sk-env-secret")
    expect(output.join("")).not.toContain("/private/herox")
  })

  it("redacts exact env config values", async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    const home = join(root, "home")
    mkdirSync(join(home, ".herox"), { recursive: true })
    writeFileSync(
      join(home, ".herox", "settings.json"),
      JSON.stringify({
        env: {
          OPENAI_API_KEY: "sk-env-secret",
        },
      }),
    )

    const output: string[] = []
    const code = await runCli(
      ["config", "get", "env.OPENAI_API_KEY"],
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
    expect(output.join("").trim()).toBe('"<redacted>"')
    expect(output.join("")).not.toContain("sk-env-secret")
  })

  it("uses settings env values for provider apiKeyEnv", async () => {
    const root = join(tmpdir(), `herox-cli-${randomUUID()}`)
    const home = join(root, "home")
    mkdirSync(join(home, ".herox"), { recursive: true })
    writeFileSync(
      join(home, ".herox", "settings.json"),
      JSON.stringify({
        env: {
          OPENAI_API_KEY: "from-settings-env",
        },
      }),
    )

    const calls: Array<{ headers?: Record<string, string> }> = []
    vi.stubGlobal("fetch", async (_url: string, init: { headers?: Record<string, string> }) => {
      calls.push({ headers: init.headers })
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ choices: [{ message: { role: "assistant", content: "OK" } }] }),
        text: async () => "{}",
      }
    })

    const output: string[] = []
    const code = await runCli(
      ["provider", "test", "openai"],
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
      Authorization: "Bearer from-settings-env",
    })
    expect(output.join("")).toContain("OK openai")
  })
})

function append(output: string[], chunk: string | Uint8Array): boolean {
  output.push(String(chunk))
  return true
}
