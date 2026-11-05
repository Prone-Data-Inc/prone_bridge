/* ESLint for the whole repo: React rules for the browser code, Node rules for the API, scripts and brand tools. */
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['**/dist', '**/node_modules', 'brand/output', 'coverage', '.vercel', 'shared/src/brand/wordmark.js']),
  {
    files: ['client/src/**/*.{js,jsx}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    files: ['shared/src/**/*.{js,jsx}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: [
      'server/**/*.js',
      'api/**/*.js',
      'brand/**/*.js',
      'scripts/**/*.js',
      '*.config.js',
      'client/vite.config.js',
      'client/vite-plugins/**/*.js',
    ],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    /* Test helpers and the end to end tests, which run the browser code and the API together. */
    files: ['client/test/**/*.{js,jsx}', 'client/e2e/**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
])
