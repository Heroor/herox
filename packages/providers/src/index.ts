export interface ProviderPreset {
  name: string;
  displayName: string;
  baseUrl: string;
  apiKeyEnv?: string;
  defaultModel: string;
  compatibility: "openai-chat-completions" | "partial";
}

export const providerPresets: ProviderPreset[] = [
  {
    name: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4.1",
    compatibility: "openai-chat-completions",
  },
  {
    name: "deepseek",
    displayName: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    compatibility: "openai-chat-completions",
  },
  {
    name: "qwen",
    displayName: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "QWEN_API_KEY",
    defaultModel: "qwen-plus",
    compatibility: "openai-chat-completions",
  },
  {
    name: "moonshot",
    displayName: "Moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    apiKeyEnv: "MOONSHOT_API_KEY",
    defaultModel: "moonshot-v1-8k",
    compatibility: "openai-chat-completions",
  },
  {
    name: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "openai/gpt-4.1",
    compatibility: "openai-chat-completions",
  },
  {
    name: "ollama",
    displayName: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    compatibility: "partial",
  },
];

export function listProviderPresets(): ProviderPreset[] {
  return [...providerPresets];
}
