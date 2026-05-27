import { describe, expect, it } from "vitest";

import {
  createChatCompletion,
  extractStreamContent,
  resolveProviderConnection,
  testProviderConnection,
} from "./index.js";

describe("resolveProviderConnection", () => {
  it("combines preset, config override, and env key", () => {
    const connection = resolveProviderConnection({
      config: {
        model: { provider: "deepseek", name: "deepseek-model" },
        providers: {
          deepseek: {
            baseURL: "https://example.test/v1",
            apiKeyEnv: "DEEPSEEK_API_KEY",
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        },
      },
      env: { DEEPSEEK_API_KEY: "secret" },
    });

    expect(connection.provider).toBe("deepseek");
    expect(connection.baseUrl).toBe("https://example.test/v1");
    expect(connection.apiKey).toBe("secret");
    expect(connection.model).toBe("deepseek-model");
    expect(connection.temperature).toBe(0.1);
    expect(connection.maxOutputTokens).toBe(1024);
  });

  it("uses model generation defaults when the provider does not override them", () => {
    const connection = resolveProviderConnection({
      config: {
        model: {
          provider: "moonshot",
          name: "kimi-test",
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
        providers: {
          moonshot: {
            baseURL: "https://example.test/v1",
          },
        },
      },
    });

    expect(connection.temperature).toBe(0.2);
    expect(connection.maxOutputTokens).toBe(2048);
  });
});

describe("createChatCompletion", () => {
  it("posts an OpenAI-compatible chat completion request", async () => {
    const calls: Array<{ url: string; init: RequestInitLike }> = [];
    const result = await createChatCompletion(
      {
        provider: "test",
        baseUrl: "https://example.test/v1",
        model: "test-model",
        temperature: 0.3,
        maxOutputTokens: 16,
        apiKey: "secret",
        compatibility: "openai-chat-completions",
      },
      {
        messages: [{ role: "user", content: "Say OK" }],
        temperature: 0.7,
        maxOutputTokens: 8,
      },
      async (url, init) => {
        calls.push({ url, init });
        return jsonResponse({
          choices: [{ message: { role: "assistant", content: "OK" } }],
        });
      },
    );

    expect(calls[0]?.url).toBe("https://example.test/v1/chat/completions");
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      model: "test-model",
      temperature: 0.7,
      max_tokens: 8,
    });
    expect(result.content).toBe("OK");
  });

  it("uses connection generation defaults when request options omit them", async () => {
    const calls: Array<{ url: string; init: RequestInitLike }> = [];
    await createChatCompletion(
      {
        provider: "test",
        baseUrl: "https://example.test/v1",
        model: "test-model",
        temperature: 0.3,
        maxOutputTokens: 16,
        compatibility: "openai-chat-completions",
      },
      {
        messages: [{ role: "user", content: "Say OK" }],
      },
      async (url, init) => {
        calls.push({ url, init });
        return jsonResponse({
          choices: [{ message: { role: "assistant", content: "OK" } }],
        });
      },
    );

    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      temperature: 0.3,
      max_tokens: 16,
    });
  });
});

describe("stream parser", () => {
  it("extracts delta content from server-sent events", () => {
    const stream = [
      'data: {"choices":[{"delta":{"content":"O"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"K"}}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    expect(extractStreamContent(stream)).toEqual(["O", "K"]);
  });
});

describe("testProviderConnection", () => {
  it("does not call the network when an API key is missing", async () => {
    const result = await testProviderConnection(
      {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1",
        apiKeyEnv: "OPENAI_API_KEY",
        compatibility: "openai-chat-completions",
      },
      async () => {
        throw new Error("network should not be called");
      },
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("OPENAI_API_KEY");
  });

  it("uses configured generation defaults for the test request", async () => {
    const calls: Array<{ url: string; init: RequestInitLike }> = [];
    const result = await testProviderConnection(
      {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1",
        temperature: 0.6,
        maxOutputTokens: 32,
        compatibility: "openai-chat-completions",
      },
      async (url, init) => {
        calls.push({ url, init });
        return jsonResponse({
          choices: [{ message: { role: "assistant", content: "OK" } }],
        });
      },
    );

    expect(result.status).toBe("ok");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      temperature: 0.6,
      max_tokens: 32,
    });
  });
});

interface RequestInitLike {
  headers?: Record<string, string>;
  body?: unknown;
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}
