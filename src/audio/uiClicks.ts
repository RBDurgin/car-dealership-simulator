import { playSfx } from './samples'

const CLICK_VOLUME = 0.5

/**
 * A soft click for every HUD button pressed, and when a volume slider is let
 * go so the new level can be heard. One delegated listener, so no component
 * needs to know about sound.
 */
export function startUiClicks(): () => void {
  const onClick = (e: Event) => {
    if (e.target instanceof Element && e.target.closest('.hud button')) {
      playSfx('click', CLICK_VOLUME)
    }
  }
  const onChange = (e: Event) => {
    if (e.target instanceof Element && e.target.closest('.hud input[type="range"]')) {
      playSfx('click', CLICK_VOLUME)
    }
  }
  document.addEventListener('click', onClick)
  document.addEventListener('change', onChange)
  return () => {
    document.removeEventListener('click', onClick)
    document.removeEventListener('change', onChange)
  }
}
