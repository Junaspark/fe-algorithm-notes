import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

const nextWithoutIncompatibleReactRules = nextVitals.map((config) => ({
  ...config,
  rules: Object.fromEntries(
    Object.entries(config.rules ?? {}).filter(([ruleName]) => !ruleName.startsWith('react/')),
  ),
}))

export default defineConfig([
  ...nextWithoutIncompatibleReactRules,
  ...nextTypeScript,
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  globalIgnores(['.next/**', 'coverage/**', 'node_modules/**']),
])
