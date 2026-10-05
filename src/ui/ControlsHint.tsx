import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { useGame } from '../state/store'
import { CONTROLS, TOUCH_CONTROLS } from './controls'

/** Keys (or, on a touch screen, gestures and buttons), collapsible to just its header. */
export function ControlsHint() {
  const open = useGame((s) => s.controlsOpen)
  const touch = useMediaQuery(COARSE)
  const controls = touch ? TOUCH_CONTROLS : CONTROLS
  return (
    <div className="panel controls">
      <button
        className="controls-toggle"
        aria-expanded={open}
        onClick={() => useGame.getState().toggleControls()}
      >
        Controls {open ? '▾' : '▸'}
      </button>
      {open &&
        controls.map(([key, label]) => (
          <div key={key} className="control">
            <kbd>{key}</kbd>
            <span>{label}</span>
          </div>
        ))}
    </div>
  )
}
