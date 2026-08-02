import path from 'path'
import { defineConfig } from 'vitest/config'

// Mirrors the "@/*" -> "./*" path alias from tsconfig.json so tests can import
// application modules by their normal `@/lib/...` specifier.
export default defineConfig({
  test: {
    // Never collect tests out of .claude: agents keep git worktrees of this repo
    // in there, whose copies of the suite resolve `@/...` back to THIS root and
    // then fail on files their own branch has since renamed. They are somebody
    // else's checkout, not this one's source.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', 'wiki/**', 'modules/*/node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
