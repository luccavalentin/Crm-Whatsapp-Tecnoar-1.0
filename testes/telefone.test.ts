import { describe, expect, it } from 'vitest'
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/phone'

/**
 * Telefone é a chave do cliente.
 *
 * Se a normalização daqui divergir da do banco (`public.normalize_phone`), o
 * mesmo caminhoneiro vira dois cadastros — e o histórico dele, que é o que dá
 * contexto para a IA, se parte em dois. Não dá erro em lugar nenhum: só
 * aparece como cliente repetido na lista, semanas depois.
 */
describe('normalizePhone', () => {
  it('completa o país em número com DDD', () => {
    expect(normalizePhone('(11) 98888-7777')).toBe('5511988887777')
    expect(normalizePhone('11 3333-4444')).toBe('551133334444')
  })

  it('mantém quem já veio com o país', () => {
    expect(normalizePhone('+55 11 98888-7777')).toBe('5511988887777')
  })

  it('põe o nono dígito no celular antigo', () => {
    expect(normalizePhone('551188887777')).toBe('5511988887777')
  })

  it('não põe nono dígito em fixo', () => {
    expect(normalizePhone('551133334444')).toBe('551133334444')
  })

  it('as várias formas de escrever o mesmo número chegam no mesmo lugar', () => {
    const formas = ['11988887777', '(11) 98888-7777', '+55 11 98888 7777', '5511988887777']
    const normalizados = new Set(formas.map(normalizePhone))
    expect(normalizados.size).toBe(1)
  })

  it('vazio e lixo devolvem null em vez de string quebrada', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
  })
})

describe('isValidPhone', () => {
  it('aceita celular e fixo brasileiros', () => {
    expect(isValidPhone('(11) 98888-7777')).toBe(true)
    expect(isValidPhone('11 3333-4444')).toBe(true)
  })
  it('recusa o que não é telefone', () => {
    expect(isValidPhone('123')).toBe(false)
    expect(isValidPhone('')).toBe(false)
  })
})

describe('formatPhone', () => {
  it('escreve como gente lê', () => {
    expect(formatPhone('5511988887777')).toBe('+55 (11) 98888-7777')
    expect(formatPhone('551133334444')).toBe('+55 (11) 3333-4444')
  })
  it('sem número, mostra travessão — nunca "null"', () => {
    expect(formatPhone(null)).toBe('—')
    expect(formatPhone('')).toBe('—')
  })
})
