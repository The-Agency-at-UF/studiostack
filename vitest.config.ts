import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    fileParallelism: false,
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.{test,integration.test}.{ts,tsx}', 'packages/*/src/**/*.test.ts'],
  },
})
