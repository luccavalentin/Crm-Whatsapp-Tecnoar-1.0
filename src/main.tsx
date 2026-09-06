import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { registrarServiceWorker } from './features/pwa/useAppShell'
import { prepararSom } from './features/notifications/aviso'
import { applyTheme, readStoredTheme } from './features/theme'

// O script no index.html ja marcou o documento antes da primeira pintura.
// Aqui so alinhamos a cor da barra do sistema com o tema em uso.
applyTheme(readStoredTheme())

// Fora do React: a casca precisa ficar em cache mesmo para quem ainda nao
// entrou, senao o app instalado nao abre sem rede.
registrarServiceWorker()

// O navegador so libera audio depois de um gesto: prendemos no primeiro.
prepararSom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
