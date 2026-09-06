import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Publica o service worker com um identificador de build embutido.
 *
 * Sem isso o arquivo do worker sairia byte a byte igual a cada deploy, o
 * navegador não veria diferença e o app continuaria servindo a versão antiga
 * mesmo com assets novos. O worker só é gerado no build: em desenvolvimento
 * ele atrapalharia o hot reload.
 */
function serviceWorker(): Plugin {
  return {
    name: 'tecnoar-service-worker',
    apply: 'build',
    generateBundle() {
      const origem = path.resolve(__dirname, 'sw.template.js')
      const codigo = fs
        .readFileSync(origem, 'utf-8')
        .replace('__BUILD_ID__', Date.now().toString(36))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: codigo })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { host: true, port: Number(process.env.PORT) || 5173 },
})
