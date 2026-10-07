import { useEffect } from 'react'
import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { PLAYER_ID } from '../sim/customers'
import { dealCustomer } from '../sim/deal'
import { ACTIONS } from '../sim/interactables'
import { findInteractable } from '../scene/runtime'
import { useGame } from '../state/store'
import { ActionMenu } from './ActionMenu'
import { AudioPanel } from './AudioPanel'
import { ControlsHint } from './ControlsHint'
import { CustomerPanel } from './CustomerPanel'
import { DaySummary } from './DaySummary'
import { HowToPlay } from './HowToPlay'
import { InfoPanel } from './InfoPanel'
import { RotatePrompt } from './RotatePrompt'
import { StaffPanel } from './StaffPanel'
import { StockPanel } from './StockPanel'
import { TitleScreen } from './TitleScreen'
import { TopBar } from './TopBar'
import { ViewControls } from './ViewControls'
import './hud.css'

const NOTICE_MS = 2200

function ActionStatus() {
  const action = useGame((s) => s.activeAction)
  const dealName = useGame((s) => dealCustomer(s.customers, PLAYER_ID)?.name)
  const touch = useMediaQuery(COARSE)
  const it = action && findInteractable(action.targetId)
  if (!action || !it) return null

  const def = ACTIONS[action.action]
  const performing = action.phase === 'performing'
  const person = it.kind === 'customer' || it.kind === 'employee' || it.kind === 'nazma'
  let label: string
  if (performing) label = person ? `${def.verb} ${it.name}` : def.verb
  else if (action.action === 'closeDeal' && dealName) label = `Taking ${dealName} to your desk`
  else if (action.action === 'handOff' && dealName) label = `Taking ${dealName} to finance`
  else label = `Heading to ${person ? it.name : it.name.toLowerCase()}`
  const cancel = touch ? 'Tap ✕' : 'Esc'
  const hint =
    def.mode === 'hold' && performing ? `${cancel} or move to stand up` : `${cancel} to cancel`
  return (
    <div className="panel status">
      <button
        className="close status-cancel"
        aria-label="Cancel"
        title="Cancel (Esc)"
        onClick={() => useGame.getState().cancelAll()}
      >
        ✕
      </button>
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
      // N mutes from anywhere too.
      if (e.code === 'KeyN') {
        if (!e.repeat) {
          game.toggleMute()
          if (game.screen === 'playing') {
            game.showNotice(useGame.getState().audio.muted ? 'Sound off' : 'Sound on')
          }
        }
        return
      }
      if (game.helpOpen) {
        if (e.code === 'Escape') game.toggleHelp(false)
        return
      }
      if (game.audioOpen) {
        if (e.code === 'Escape') game.toggleAudioPanel(false)
        return
      }
      if (game.screen === 'title') return
      if (e.code === 'Escape') game.cancelAll()
      else if (e.code === 'KeyH' && !e.repeat) game.toggleStaffPanel()
      else if (e.code === 'KeyI' && !e.repeat) game.toggleStockPanel(undefined, 'stock')
      else if (e.code === 'KeyM' && !e.repeat) game.toggleStockPanel(undefined, 'marketing')
      else if (e.code === 'KeyU' && !e.repeat) game.toggleStockPanel(undefined, 'upgrades')
      else if (e.code === 'KeyC' && !e.repeat) game.toggleStockPanel(undefined, 'calendar')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="hud">
      <TopBar />
      <div className="hud-corner">
        <ViewControls />
        <ControlsHint />
      </div>
      <ActionStatus />
      <NoticeToast />
      <InfoPanel />
      <CustomerPanel />
      <StaffPanel />
      <StockPanel />
      <ActionMenu />
      <DaySummary />
      <TitleScreen />
      <HowToPlay />
      <AudioPanel />
      <RotatePrompt />
    </div>
  )
}
