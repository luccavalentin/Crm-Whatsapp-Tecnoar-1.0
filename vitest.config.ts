import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Testes das funções puras — as que quebram em silêncio.
 *
 * Não é suíte de interface: é a lógica que, errada, não dá erro em lugar
 * nenhum e aparece só como cliente duplicado no CRM, resposta cortada no meio
 * ou mensagem que nunca foi respondida.
 *
 * As Edge Functions rodam em Deno, mas as funções testadas aqui não tocam em
 * banco nem em rede: são importadas direto do mesmo arquivo que vai para
 * produção, para não existir a chance de o teste passar numa cópia.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['testes/**/*.test.ts'],
  },
})
