import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'pnpm-lock.yaml'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
]
