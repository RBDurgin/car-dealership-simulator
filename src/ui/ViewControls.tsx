import type { ReactNode } from 'react'
import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { rotateView } from '../scene/runtime'
import { useGame } from '../state/store'

const WALL_LABELS = { up: 'Walls up', cutaway: 'Walls cut away', down: 'Walls down' } as const

function ViewButton({ label, wide, onClick, children }: ViewButtonProps) {
  return (
    <button
      className={wide ? 'view-btn view-btn-wide' : 'view-btn'}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

interface ViewButtonProps {
  label: string
  wide?: boolean
  onClick: () => void
  children: ReactNode
}

/**
 * On-screen buttons for the view keys: rotate (Q / E), wall mode (V) and help (?).
 * Touch screens rotate with a two-finger twist instead, so they skip the rotate buttons.
 */
export function ViewControls() {
  const wallMode = useGame((s) => s.wallMode)
  const touch = useMediaQuery(COARSE)
  const game = useGame.getState()
  return (
    <div className="view-controls">
      {!touch && (
        <>
          <ViewButton label="Rotate counter-clockwise (Q)" onClick={() => rotateView(1)}>
            ⟲
          </ViewButton>
          <ViewButton label="Rotate clockwise (E)" onClick={() => rotateView(-1)}>
            ⟳
          </ViewButton>
        </>
      )}
      <ViewButton label={`${WALL_LABELS[wallMode]} (V)`} wide onClick={game.cycleWallMode}>
        Walls
      </ViewButton>
      <ViewButton label="How to play (?)" onClick={() => game.toggleHelp()}>
        ?
      </ViewButton>
    </div>
  )
}
