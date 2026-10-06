import { playUiCue } from './sfxBridge'

/**
 * A soft click for every HUD button pressed, and when a volume slider is let
 * go so the new level can be heard. One delegated listener, so no component
 * needs to know about sound. A button that opens or closes a panel is heard
 * as the panel instead.
 */
export function startUiClicks(): () => void {
  const onClick = (e: Event) => {
    if (e.target instanceof Element && e.target.closest('.hud button')) playUiCue('click')
  }
  const onChange = (e: Event) => {
    if (e.target instanceof Element && e.target.closest('.hud input[type="range"]')) {
      playUiCue('click')
    }
  }
  document.addEventListener('click', onClick)
  document.addEventListener('change', onChange)
  return () => {
    document.removeEventListener('click', onClick)
    document.removeEventListener('change', onChange)
  }
}
