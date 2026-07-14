import path from 'path'
import { defineConfig } from 'vitest/config'

// Mirrors the "@/*" -> "./*" path alias from tsconfig.json so tests can import
// application modules by their normal `@/lib/...` specifier.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
