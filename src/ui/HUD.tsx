import { useEffect, useRef } from 'react'
import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { PLAYER_ID } from '../sim/customers'
import { dealCustomer } from '../sim/deal'
import { ACTIONS } from '../sim/interactables'
import { driveClock, findInteractable } from '../scene/runtime'
import { useGame, winShowing } from '../state/store'
import { ActionMenu } from './ActionMenu'
import { ControlsHint } from './ControlsHint'
import { CustomerPanel } from './CustomerPanel'
import { InfoPanel } from './InfoPanel'
import { AudioPanel, DaySummary, HowToPlay, StockPanel } from './lazyPanels'
import { prefetchPanels } from './panelChunks'
import { RotatePrompt } from './RotatePrompt'
import { StaffPanel } from './StaffPanel'
import { TitleScreen } from './TitleScreen'
import { WinScreen } from './WinScreen'
import { TopBar } from './TopBar'
import { ViewControls } from './ViewControls'
import './hud.css'

const NOTICE_MS = 2200
/** Longer notices (tips, a busy morning) stay up long enough to read. */
const NOTICE_MS_PER_CHAR = 50

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
  else if (action.action === 'ride' && dealName) label = `Walking ${dealName} to the car`
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

/**
 * Out on a test drive: who with, a bar of the time left (from scene/DrivenCar,
 * read each animation frame) and Head back (✕ or Esc).
 */
function DriveStatus() {
  const c = useGame((s) => {
    const deal = dealCustomer(s.customers, PLAYER_ID)
    return deal?.phase === 'driving' ? deal : null
  })
  const touch = useMediaQuery(COARSE)
  const fill = useRef<HTMLDivElement>(null)
  const id = c?.id
  useEffect(() => {
    if (!id) return
    let frame = requestAnimationFrame(function draw() {
      const clock = driveClock.get(id)
      if (fill.current && clock) {
        fill.current.style.width = `${Math.round((1 - clock.left / clock.total) * 100)}%`
      }
      frame = requestAnimationFrame(draw)
    })
    return () => cancelAnimationFrame(frame)
  }, [id])
  if (!c) return null
  const cut = !!c.drive?.cut
  return (
    <div className="panel status drive-status">
      {!cut && (
        <button
          className="close status-cancel"
          aria-label="Head back"
          title="Head back (Esc)"
          onClick={() => useGame.getState().headBack()}
        >
          ✕
        </button>
      )}
      <div className="status-label">
        {cut ? `Heading back with ${c.name}` : `Test drive with ${c.name}`}
      </div>
      <div className="progress">
        <div ref={fill} className="drive-fill" />
      </div>
      {!cut && <div className="status-hint">{touch ? 'Tap ✕' : 'Esc'} to head back early</div>}
    </div>
  )
}

function NoticeToast() {
  const notice = useGame((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const ms = Math.max(NOTICE_MS, notice.text.length * NOTICE_MS_PER_CHAR)
    const t = setTimeout(() => useGame.getState().clearNotice(notice.id), ms)
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
  useEffect(prefetchPanels, [])
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
      // The win screen waits for Keep playing.
      if (winShowing(game)) return
      if (e.code === 'Escape') game.cancelAll()
      else if (e.code === 'KeyH' && !e.repeat) game.toggleStaffPanel()
      else if (e.code === 'KeyI' && !e.repeat) game.toggleStockPanel(undefined, 'stock')
      else if (e.code === 'KeyM' && !e.repeat) game.toggleStockPanel(undefined, 'marketing')
      else if (e.code === 'KeyU' && !e.repeat) game.toggleStockPanel(undefined, 'upgrades')
      else if (e.code === 'KeyC' && !e.repeat) game.toggleStockPanel(undefined, 'calendar')
      else if (e.code === 'KeyK' && !e.repeat) game.toggleStockPanel(undefined, 'rival')
      else if (e.code === 'KeyB' && !e.repeat) game.toggleStockPanel(undefined, 'service')
      // Dev: Shift+L brings someone back from the client book.
      else if (e.code === 'KeyL' && !e.repeat && e.shiftKey && import.meta.env.DEV)
        game.devReturnClient()
      else if (e.code === 'KeyL' && !e.repeat) game.toggleStockPanel(undefined, 'clients')
      else if (e.code === 'KeyP' && !e.repeat) game.toggleStockPanel(undefined, 'stats')
      else if (e.code === 'KeyF' && !e.repeat) game.toggleStockPanel(undefined, 'finance')
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
      <DriveStatus />
      <NoticeToast />
      <InfoPanel />
      <CustomerPanel />
      <StaffPanel />
      <StockPanel />
      <ActionMenu />
      <DaySummary />
      <WinScreen />
      <TitleScreen />
      <HowToPlay />
      <AudioPanel />
      <RotatePrompt />
    </div>
  )
}
