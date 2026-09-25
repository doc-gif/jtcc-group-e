import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/release-lib.mjs', 'scripts/auto-merge.mjs', 'scripts/ux-policy.mjs', 'scripts/preview-request.mjs', 'scripts/preview-site.mjs', 'scripts/qr.mjs'],
      exclude: ['src/main.tsx', 'src/**/*.test.{ts,tsx}'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
})
