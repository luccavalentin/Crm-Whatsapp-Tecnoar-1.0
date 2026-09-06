import { useCallback, useEffect, useState } from 'react'

/**
 * Aparência: claro, escuro ou o que o aparelho estiver usando.
 *
 * São três estados, não dois. "Sistema" é o padrão e não marca nada no
 * documento — quem escolheu marca, e a marca ganha da preferência do
 * aparelho nos dois sentidos. Sem isso, quem prefere claro num celular
 * no modo escuro nunca conseguiria a tela clara.
 *
 * A escolha fica no aparelho, não no banco: é preferência de quem está
 * olhando a tela, não do usuário da empresa. O mesmo atendente quer
 * escuro no celular de plantão e claro no computador da oficina.
 */
export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'tecnoar:tema'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function readStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isTheme(saved) ? saved : 'system'
  } catch {
    // Navegador com armazenamento bloqueado (aba anônima, política do
    // aparelho): segue o sistema em vez de quebrar a tela.
    return 'system'
  }
}

/** Cor da barra de status do celular, para o app instalado não piscar branco. */
function paintBrowserChrome(dark: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#060d18' : '#0D1C33')
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)

  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  paintBrowserChrome(dark)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preferência não persiste; a tela atual continua correta.
    }
  }, [])

  // Em "sistema", o aparelho pode mudar sozinho (anoitece, modo noturno
  // automático). A tela acompanha sem recarregar.
  useEffect(() => {
    if (theme !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [theme])

  return { theme, setTheme }
}
