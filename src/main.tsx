import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startAutosave } from './state/persistence'
import { useGame } from './state/store'

startAutosave()

// Console access while developing, e.g. `game.getState().sellCar('lot-car-1')`.
if (import.meta.env.DEV) Object.assign(window, { game: useGame })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
