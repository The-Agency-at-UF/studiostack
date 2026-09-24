import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    fileParallelism: false,
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.{test,integration.test}.{js,jsx}'],
  },
})
