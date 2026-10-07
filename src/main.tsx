import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startAudio } from './audio/engine'
import { startMusic, syncMusic } from './audio/music'
import { startRain, syncRain } from './audio/rain'
import { preloadSfx } from './audio/samples'
import { startSfx } from './audio/sfxBridge'
import { startUiClicks } from './audio/uiClicks'
import { COARSE, COMPACT, matchesMedia } from './input/useMediaQuery'
import { startAudioPref, startAutosave, startControlsPref } from './state/persistence'
import { useGame } from './state/store'
import { startTips } from './state/tips'

startAutosave()
// The controls hint starts collapsed on phones and touch screens.
startControlsPref(!matchesMedia(COMPACT) && !matchesMedia(COARSE))
startAudioPref()
startTips()
// Silent until the first gesture; then the sounds load and the music starts.
startAudio(() => {
  preloadSfx()
  syncMusic()
  syncRain()
})
startMusic()
startRain()
startUiClicks()
startSfx()

// Console access while developing, e.g. `game.getState().sellCar('lot-car-1')`.
if (import.meta.env.DEV) Object.assign(window, { game: useGame })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
