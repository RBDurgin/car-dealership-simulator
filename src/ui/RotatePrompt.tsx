import { useEffect } from 'react'
import { PORTRAIT_TOUCH, useMediaQuery } from '../input/useMediaQuery'
import { useGame } from '../state/store'

/** Asks for landscape on an upright touch device, and pauses the game until then. */
export function RotatePrompt() {
  const portrait = useMediaQuery(PORTRAIT_TOUCH)
  useEffect(() => useGame.getState().setRotatePrompt(portrait), [portrait])
  if (!portrait) return null
  return (
    <div className="rotate-prompt" role="alertdialog" aria-label="Rotate your device">
      <div className="rotate-icon" aria-hidden>
        ⟳
      </div>
      <p>Turn your device sideways to play.</p>
    </div>
  )
}
