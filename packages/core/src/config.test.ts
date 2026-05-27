import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getConfigValue, loadHeroxConfig } from "./config.js";

describe("loadHeroxConfig", () => {
  it("merges user, project, local, and environment config", () => {
    const root = join(tmpdir(), `herox-config-${crypto.randomUUID()}`);
    const home = join(root, "home");
    const project = join(root, "project");

    mkdirSync(join(home, ".herox"), { recursive: true });
    mkdirSync(join(project, ".herox"), { recursive: true });

    writeFileSync(
      join(home, ".herox", "settings.json"),
      JSON.stringify({
        model: { provider: "openai", temperature: 0.4 },
        providers: { openai: { apiKeyEnv: "OPENAI_API_KEY" } },
      }),
    );
    writeFileSync(
      join(project, ".herox", "settings.json"),
      JSON.stringify({
        model: { provider: "deepseek" },
        providers: { deepseek: { baseURL: "https://example.test/v1", temperature: 0.1 } },
      }),
    );
    writeFileSync(
      join(project, ".herox", "settings.local.json"),
      JSON.stringify({
        model: { name: "deepseek-model" },
      }),
    );

    const result = loadHeroxConfig({
      cwd: project,
      env: { HEROX_MODEL: "env-model" },
      homeDir: home,
    });
    console.log("result", result);

    expect(result.config.model.provider).toBe("deepseek");
    expect(result.config.model.name).toBe("env-model");
    expect(result.config.model.temperature).toBe(0.4);
    expect(result.config.providers.deepseek?.baseURL).toBe("https://example.test/v1");
    expect(result.config.providers.deepseek?.temperature).toBe(0.1);
    expect(result.sources.filter((source) => source.exists)).toHaveLength(3);
  });

  it("reads nested config values by dot path", () => {
    const result = loadHeroxConfig({
      cwd: "/tmp/herox-missing",
      env: { HEROX_PROVIDER: "ollama" },
      homeDir: "/tmp/herox-missing-home",
    });

    expect(getConfigValue(result.config, "model.provider")).toBe("ollama");
    expect(getConfigValue(result.config, "providers.openai.apiKeyEnv")).toBe("OPENAI_API_KEY");
  });
});
