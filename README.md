# Herox

Herox is an Agent CLI for developers. It is designed to support OpenAI-compatible
AI model providers, local tools, MCP, skills, plugins, and subagents.

The project is currently in the M0 bootstrap phase. See:

- [Requirements](docs/requirements.md)
- [Development plan](docs/development-plan.md)

## Install

```bash
npm install -g @heroor/x
herox --help
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @heroor/x pack --dry-run
```

Current local CLI checks:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js config get
node packages/cli/dist/index.js provider list
node packages/cli/dist/index.js provider test openai
```
