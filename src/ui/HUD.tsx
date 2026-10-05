import { useEffect } from 'react'
import { PLAYER_ID } from '../sim/customers'
import { dealCustomer } from '../sim/deal'
import { ACTIONS } from '../sim/interactables'
import { findInteractable } from '../scene/runtime'
import { useGame } from '../state/store'
import { ActionMenu } from './ActionMenu'
import { ControlsHint } from './ControlsHint'
import { CustomerPanel } from './CustomerPanel'
import { DaySummary } from './DaySummary'
import { HowToPlay } from './HowToPlay'
import { InfoPanel } from './InfoPanel'
import { StaffPanel } from './StaffPanel'
import { TitleScreen } from './TitleScreen'
import { TopBar } from './TopBar'
import './hud.css'

const NOTICE_MS = 2200

function ActionStatus() {
  const action = useGame((s) => s.activeAction)
  const dealName = useGame((s) => dealCustomer(s.customers, PLAYER_ID)?.name)
  const it = action && findInteractable(action.targetId)
  if (!action || !it) return null

  const def = ACTIONS[action.action]
  const performing = action.phase === 'performing'
  const person = it.kind === 'customer' || it.kind === 'employee'
  let label: string
  if (performing) label = person ? `${def.verb} ${it.name}` : def.verb
  else if (action.action === 'closeDeal' && dealName) label = `Taking ${dealName} to your desk`
  else if (action.action === 'handOff' && dealName) label = `Taking ${dealName} to finance`
  else label = `Heading to ${person ? it.name : it.name.toLowerCase()}`
  const hint = def.mode === 'hold' && performing ? 'Esc or move to stand up' : 'Esc to cancel'
  return (
    <div className="panel status">
      <div className="status-label">{label}</div>
      {performing && def.mode === 'timed' && (
        <div className="progress">
          {/* Keyed by action id so the CSS animation restarts for each run. */}
          <div
            key={action.id}
            className="progress-fill"
            style={{ animationDuration: `${def.durationMs}ms` }}
          />
        </div>
      )}
      <div className="status-hint">{hint}</div>
    </div>
  )
}

function NoticeToast() {
  const notice = useGame((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => useGame.getState().clearNotice(notice.id), NOTICE_MS)
    return () => clearTimeout(t)
  }, [notice])
  if (!notice) return null
  return (
    <div key={notice.id} className="panel notice">
      {notice.text}
    </div>
  )
}

export function HUD() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = useGame.getState()
      // `?` or F1 opens the guide from anywhere, the title screen included.
      if ((e.code === 'Slash' && e.shiftKey) || e.code === 'F1') {
        e.preventDefault()
        if (!e.repeat) game.toggleHelp()
        return
      }
      if (game.helpOpen) {
        if (e.code === 'Escape') game.toggleHelp(false)
        return
      }
      if (game.screen === 'title') return
      if (e.code === 'Escape') game.cancelAll()
      else if (e.code === 'KeyH' && !e.repeat) game.toggleStaffPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="hud">
      <TopBar />
      <ControlsHint />
      <ActionStatus />
      <NoticeToast />
      <InfoPanel />
      <CustomerPanel />
      <StaffPanel />
      <ActionMenu />
      <DaySummary />
      <TitleScreen />
      <HowToPlay />
    </div>
  )
}
