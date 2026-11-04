/* Tests run in Node by default. A test that needs a browser DOM starts with: // @vitest-environment jsdom */
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./client/src', import.meta.url)) } },
  test: {
    include: ['{api,brand,client,scripts,server,shared}/**/*.test.{js,jsx}'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
  },
})
