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
import {
  startAudioPref,
  startAutosave,
  startControlsPref,
  startGraphicsPref,
  startTrophyCase,
} from './state/persistence'
import { useGame } from './state/store'
import { startAchievements } from './state/achievements'
import { instrumentStore, PERF, PERF_BUSY } from './state/perf'
import { startTips } from './state/tips'

// Before anything subscribes, so every listener is timed.
if (PERF) instrumentStore(useGame)
// A ?perf=busy game is a test bench: it never saves, or touches the trophy case.
if (!PERF_BUSY) startAutosave()
const smallScreen = matchesMedia(COMPACT) || matchesMedia(COARSE)
// The controls hint starts collapsed on phones and touch screens.
startControlsPref(!smallScreen)
startAudioPref()
// Auto graphics start a step down there.
startGraphicsPref(smallScreen)
startTips()
// After the tips, so neither shows over the other's notice.
startAchievements()
if (!PERF_BUSY) startTrophyCase()
if (PERF_BUSY) void import('./state/perfScenario').then((m) => m.startBusyDay())
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
