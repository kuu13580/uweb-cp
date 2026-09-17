import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    ignorePatterns: ['**/dist'],
    printWidth: 100,
    singleQuote: true,
    semi: false,
    trailingComma: 'all',
  },
  lint: {
    ignorePatterns: ['**/dist'],
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise'],
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'warn',
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    env: {
      builtin: true,
      browser: true,
      es2024: true,
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['packages/*/test/**/*.test.ts'],
  },
})
