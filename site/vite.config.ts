import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Real pages, each its own HTML file, so each is crawlable and linkable.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: page('./index.html'), coach: page('./coach/index.html'), progress: page('./progress/index.html'),
        validate: page('./validate/index.html'), review: page('./review/index.html'), legal: page('./legal/index.html'), login: page('./login/index.html') },
    },
  },
})
