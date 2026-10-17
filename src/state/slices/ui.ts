import { DEFAULT_AUDIO_SETTINGS, withVolume } from '../../sim/audioSettings'
import { DEFAULT_GRAPHICS } from '../../sim/graphics'
import {
  CONVERSATION_PHASES,
  DEAL_PHASES,
  actionBlocker,
  dealCustomer,
  isCustomerAction,
} from '../../sim/deal'
import { PLAYER_ID } from '../../sim/customers'
import { huddleBlocker, praiseBlocker } from '../../sim/morale'
import { confrontBlocker } from '../../sim/nazma'
import { dingBlocker, reconBlocker } from '../../sim/service'
import { vehicleOwnerId } from '../../sim/sellers'
import { playerRiding } from '../../sim/testDrive'
import { WALL_MODES } from '../../sim/walls'
import { dispatch, endDeal, notify, type Kit } from '../core'
import { DEV_TIME_SCALES, reconBook } from '../derived'
import { nextActionId, nextNoticeId, nextOrderId } from '../rng'
import type { GameState } from '../types'

/** Why the player can't praise employee `id` now, or null if they can. */
function praiseFor(s: GameState, id: string): string | null {
  const e = s.roster.find((x) => x.id === id)
  return e ? praiseBlocker(e, s.clock.day) : 'They’ve gone.'
}

type UiKeys =
  | 'screen'
  | 'moveOrder'
  | 'showGrid'
  | 'wallMode'
  | 'viewYaw'
  | 'activeAction'
  | 'hoveredId'
  | 'menu'
  | 'inspectedId'
  | 'notice'
  | 'staffOpen'
  | 'stockOpen'
  | 'computerTab'
  | 'helpOpen'
  | 'controlsOpen'
  | 'rotatePrompt'
  | 'audio'
  | 'audioOpen'
  | 'graphics'
  | 'qualityTier'
  | 'timeScale'
  | 'issueMoveOrder'
  | 'clearMoveOrder'
  | 'toggleGrid'
  | 'cycleWallMode'
  | 'setViewYaw'
  | 'setHovered'
  | 'openMenu'
  | 'closeMenu'
  | 'requestAction'
  | 'arriveAction'
  | 'completeAction'
  | 'cancelAction'
  | 'cancelAll'
  | 'walkAway'
  | 'letWait'
  | 'closeInspect'
  | 'showNotice'
  | 'clearNotice'
  | 'toggleStaffPanel'
  | 'toggleStockPanel'
  | 'toggleHelp'
  | 'toggleControls'
  | 'setRotatePrompt'
  | 'setVolume'
  | 'toggleMute'
  | 'toggleAudioPanel'
  | 'setGraphics'
  | 'setQualityTier'
  | 'cycleTimeScale'

/** The player's moves and actions, the menus, panels and notices, and the settings. */
export function uiSlice(k: Kit): Pick<GameState, UiKeys> {
  const { get, set } = k
  return {
    screen: 'title',
    moveOrder: null,
    showGrid: false,
    wallMode: 'cutaway',
    viewYaw: Math.PI / 4,
    activeAction: null,
    hoveredId: null,
    menu: null,
    inspectedId: null,
    notice: null,
    staffOpen: false,
    stockOpen: false,
    computerTab: 'stock',
    helpOpen: false,
    controlsOpen: true,
    rotatePrompt: false,
    audio: DEFAULT_AUDIO_SETTINGS,
    audioOpen: false,
    graphics: DEFAULT_GRAPHICS,
    qualityTier: 0,
    timeScale: 1,
    issueMoveOrder: (tx, tz) => {
      // Out on a test drive: the floor will have to wait.
      if (playerRiding(get().customers)) return
      dispatch(k, { type: 'cancel' })
      set({ moveOrder: { id: nextOrderId(), tx, tz }, menu: null })
      // Walking off mid-conversation; someone following just keeps following.
      endDeal(k, CONVERSATION_PHASES)
    },
    clearMoveOrder: () => set({ moveOrder: null }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    cycleWallMode: () =>
      set((s) => ({
        wallMode: WALL_MODES[(WALL_MODES.indexOf(s.wallMode) + 1) % WALL_MODES.length],
      })),
    setViewYaw: (viewYaw) => set({ viewYaw }),
    setHovered: (hoveredId) => {
      if (get().hoveredId !== hoveredId) set({ hoveredId })
    },
    openMenu: (targetId, x, y) => set({ menu: { targetId, x, y } }),
    closeMenu: () => set({ menu: null }),
    requestAction: (targetId, action) => {
      if (playerRiding(get().customers)) {
        set({ menu: null })
        return notify(k, "You're out on a test drive.")
      }
      if (action === 'call') return void get().phoneClient()
      const s = get()
      const blocker =
        action === 'confront'
          ? confrontBlocker(s.nazma)
          : action === 'praise'
            ? praiseFor(s, targetId)
            : action === 'huddle'
              ? huddleBlocker(
                  s.clock.minute,
                  s.dayStats.huddle,
                  s.roster.filter((e) => e.status === 'atPost' && !e.fired).length,
                )
              : action === 'recondition'
                ? reconBlocker(reconBook(s), targetId)
                : action === 'fixDing'
                  ? dingBlocker(reconBook(s), targetId)
                  : actionBlocker(
                      action,
                      targetId,
                      s.customers,
                      s.roster,
                      s.inventory,
                      s.serviceJobs,
                    )
      if (blocker) {
        set({ menu: null })
        return notify(k, blocker)
      }
      // Turning to someone else ends the conversation; greeting someone else also
      // drops a customer who was following.
      const deal = dealCustomer(get().customers, PLAYER_ID)
      // Looking over the car of the seller they're talking to, or getting in
      // the car they're taking for a drive, doesn't end the talk.
      const ours = deal?.id === vehicleOwnerId(targetId) || deal?.drive?.carId === targetId
      if (deal && deal.id !== targetId && !ours) {
        endDeal(k, isCustomerAction(action) ? DEAL_PHASES : CONVERSATION_PHASES)
      }
      set({ moveOrder: null, menu: null, inspectedId: null })
      dispatch(k, { type: 'request', id: nextActionId(), targetId, action })
    },
    arriveAction: (id) => dispatch(k, { type: 'arrive', id, now: performance.now() }),
    completeAction: (id) => dispatch(k, { type: 'complete', id }),
    cancelAction: () => dispatch(k, { type: 'cancel' }),
    cancelAll: () => {
      const s = get()
      if (s.helpOpen) return set({ helpOpen: false })
      if (s.audioOpen) return set({ audioOpen: false })
      if (s.menu) return set({ menu: null })
      if (s.staffOpen) return set({ staffOpen: false })
      if (s.stockOpen) return set({ stockOpen: false })
      // Out on a test drive, Esc heads back.
      if (playerRiding(s.customers)) return s.headBack()
      const busy = s.activeAction || s.moveOrder || s.inspectedId
      dispatch(k, { type: 'cancel' })
      set({ moveOrder: null, inspectedId: null })
      // A first Esc stops what the player is doing; with nothing left to stop it
      // lets a customer who was following wait instead.
      if (busy) endDeal(k, CONVERSATION_PHASES)
      else endDeal(k, DEAL_PHASES, (name) => `${name} will wait for you.`)
    },
    walkAway: () => {
      if (playerRiding(get().customers)) return
      dispatch(k, { type: 'cancel' })
      set({ moveOrder: null })
      endDeal(k, CONVERSATION_PHASES)
    },
    letWait: () => {
      dispatch(k, { type: 'cancel' })
      set({ moveOrder: null })
      endDeal(k, DEAL_PHASES, (name) => `${name} will wait for you.`)
    },
    closeInspect: () => set({ inspectedId: null }),
    showNotice: (text) => set({ notice: { id: nextNoticeId(), text } }),
    clearNotice: (id) => {
      if (get().notice?.id === id) set({ notice: null })
    },
    // The staff and stock panels share the left edge, so one closes the other.
    toggleStaffPanel: (open) =>
      set((s) => {
        const staffOpen = open ?? !s.staffOpen
        return { staffOpen, stockOpen: staffOpen ? false : s.stockOpen }
      }),
    toggleStockPanel: (open, tab) =>
      set((s) => {
        const switching = open === undefined && tab !== undefined && tab !== s.computerTab
        const stockOpen = open ?? (switching || !s.stockOpen)
        return {
          stockOpen,
          computerTab: tab ?? s.computerTab,
          staffOpen: stockOpen ? false : s.staffOpen,
        }
      }),
    toggleHelp: (open) => set((s) => ({ helpOpen: open ?? !s.helpOpen })),
    toggleControls: (open) => set((s) => ({ controlsOpen: open ?? !s.controlsOpen })),
    setRotatePrompt: (rotatePrompt) => set({ rotatePrompt }),
    setVolume: (bus, volume) => set((s) => ({ audio: withVolume(s.audio, bus, volume) })),
    toggleMute: (muted) => set((s) => ({ audio: { ...s.audio, muted: muted ?? !s.audio.muted } })),
    toggleAudioPanel: (open) => set((s) => ({ audioOpen: open ?? !s.audioOpen })),
    setGraphics: (graphics) => set({ graphics }),
    setQualityTier: (qualityTier) => set({ qualityTier }),
    cycleTimeScale: () =>
      set((s) => {
        const i = DEV_TIME_SCALES.indexOf(s.timeScale as (typeof DEV_TIME_SCALES)[number])
        return { timeScale: DEV_TIME_SCALES[(i + 1) % DEV_TIME_SCALES.length] }
      }),
  }
}
