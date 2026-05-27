import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@heroor/x-core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@heroor/x-providers": new URL("./packages/providers/src/index.ts", import.meta.url).pathname,
      "@heroor/x-shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      "@heroor/x-tools": new URL("./packages/tools/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["packages/**/*.test.ts"],
  },
})
