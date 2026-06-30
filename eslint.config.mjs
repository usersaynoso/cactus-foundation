import coreWebVitals from 'eslint-config-next/core-web-vitals'

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...coreWebVitals,
  {
    ignores: [
      'lib/modules/**',
      'lib/puck/module-components.ts',
      '.next/**',
      'node_modules/**',
      '.claude/**',
    ],
  },
]

export default config
