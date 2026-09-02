import coreWebVitals from 'eslint-config-next/core-web-vitals'

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...coreWebVitals,
  {
    ignores: [
      'lib/modules/**',
      'lib/puck/module-components.ts',
      'lib/puck/module-rsc-components.ts',
      'lib/layout/module-layout-types.ts',
      'lib/setup/module-starter-layouts.ts',
      '.next/**',
      // Vercel's local build output. Gitignored, not project code, and full of
      // minified chunks that trip source-level rules with nothing to fix in them.
      '.vercel/**',
      'node_modules/**',
      '.claude/**',
      // Python virtualenvs in the dated scratch folders agents leave in the repo
      // root. Untracked, not project code, and site-packages ships bundled JS.
      '**/.venv/**',
      '**/site-packages/**',
    ],
  },
]

export default config
