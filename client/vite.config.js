import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { guardBrowserKeys } from './vite-plugins/guardBrowserKeys.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode }) => {
  /* One .env at the repo root serves the API and the web app. Only VITE_* keys reach the browser. */
  const env = loadEnv(mode, repo, '')
  const apiPort = env.PORT || 8000

  return {
    root: here,
    envDir: repo,
    plugins: [react(), guardBrowserKeys(env)],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true,
      /* The shared folder lives next to the client, outside its root. */
      fs: { allow: [repo] },
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  }
})
