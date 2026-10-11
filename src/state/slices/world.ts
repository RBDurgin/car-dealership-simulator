import { smudgeCar } from '../../sim/cleanliness'
import { buyExpansion, EXPANSIONS } from '../../sim/expansions'
import { formatMoney } from '../../sim/format'
import { buyImprovement, IMPROVEMENTS } from '../../sim/improvements'
import { carName } from '../../sim/interactables'
import { NAZMA_ID, nextTarget, type NazmaStats, type NazmaVisit } from '../../sim/nazma'
import { goalLabel } from '../../sim/owner'
import { reduceStaff } from '../../sim/staff'
import { weatherOn } from '../../sim/weather'
import { dispatch, notify, setRoster, tuning, type Kit } from '../core'
import type { GameState } from '../types'
import { amendLog } from './career'

type WorldKeys =
  | 'improvements'
  | 'weather'
  | 'owner'
  | 'nazma'
  | 'buyImprovement'
  | 'buyExpansion'
  | 'ownerArrived'
  | 'nazmaArrived'
  | 'nazmaSmudge'
  | 'nazmaChat'
  | 'nazmaPoach'
  | 'nazmaRunOff'
  | 'nazmaLeft'

/**
 * The grounds and who comes by: improvements, expansions, the weather, the
 * owner and Nazma. (Expansions and the rival start with `dayOne`.)
 */
export function worldSlice(k: Kit): Pick<GameState, WorldKeys> {
  const { get, set } = k
  return {
    improvements: [],
    weather: weatherOn(1),
    owner: null,
    nazma: null,
    buyImprovement: (id) => {
      const s = get()
      const result = buyImprovement(s, id, s.clock.day)
      if (!result.ok) {
        notify(k, result.reason)
        return false
      }
      const { label, cost } = IMPROVEMENTS[id]
      set({
        cash: result.cash,
        improvements: result.improvements,
        dayStats: { ...s.dayStats, improvements: s.dayStats.improvements + cost },
      })
      amendLog(k)
      notify(k, `Bought the ${label.toLowerCase()} for ${formatMoney(cost)}. It goes up overnight.`)
      return true
    },
    buyExpansion: (id) => {
      const s = get()
      const result = buyExpansion({ ...s, rank: s.career.rank }, id, s.clock.day)
      if (!result.ok) {
        notify(k, result.reason)
        return false
      }
      const { label, cost } = EXPANSIONS[id]
      set({
        cash: result.cash,
        expansions: result.expansions,
        dayStats: { ...s.dayStats, expansions: s.dayStats.expansions + cost },
      })
      amendLog(k)
      notify(k, `Bought the ${label.toLowerCase()} for ${formatMoney(cost)}. It's built overnight.`)
      return true
    },
    ownerArrived: () => {
      const owner = get().owner
      if (!owner || owner.announced) return
      set({ owner: { ...owner, announced: true } })
      notify(k, `The owner wants: ${goalLabel(owner.goal, formatMoney)}.`)
    },
    nazmaArrived: () => {
      const s = get()
      if (s.nazma?.status !== 'coming') return
      setNazma(k, { ...s.nazma, status: 'onLot' })
      tallyNazma(k, { visited: true })
      notify(
        k,
        s.clock.day === tuning(k).firstNazmaDay
          ? "That's Nazma, who used to work here. He has it in for the place. Click him to run him off!"
          : s.rival.status === 'open'
            ? `Nazma crossed the road from ${s.rival.name}.`
            : 'Nazma is back on the lot.',
      )
    },
    nazmaSmudge: (carId) => {
      const s = get()
      if (s.nazma?.status !== 'onLot' || nextTarget(s.nazma) !== carId) return
      setNazma(k, { ...s.nazma, progress: s.nazma.progress + 1 })
      const inventory = smudgeCar(s.inventory, carId)
      if (inventory === s.inventory) return
      set({ inventory })
      tallyNazma(k, { smudged: get().dayStats.nazma.smudged + 1 })
      const car = inventory.find((c) => c.id === carId)
      if (car) notify(k, `Nazma smeared grime all over the ${carName(car.model)}.`)
    },
    nazmaChat: () => {
      const s = get()
      if (s.nazma?.status !== 'onLot' || s.nazma.scheme !== 'poach' || s.nazma.chatting) return
      setNazma(k, { ...s.nazma, chatting: true })
    },
    nazmaPoach: (employeeId) => {
      const s = get()
      if (s.nazma?.status !== 'onLot' || nextTarget(s.nazma) !== employeeId) return
      setNazma(k, { ...s.nazma, progress: s.nazma.progress + 1, chatting: false })
      const roster = reduceStaff(s.roster, { type: 'poached', id: employeeId })
      if (roster === s.roster) return
      setRoster(k, roster)
      const e = roster.find((x) => x.id === employeeId)!
      tallyNazma(k, { poached: [...get().dayStats.nazma.poached, e.name] })
      notify(
        k,
        `${e.name} is thinking of quitting. Nazma made them an offer. Keep them from the staff panel before closing.`,
      )
    },
    nazmaRunOff: (by) => {
      const s = get()
      if (s.nazma?.status !== 'onLot') return
      setNazma(k, { ...s.nazma, status: 'runOff', chatting: false })
      tallyNazma(k, { runOff: by })
      notify(
        k,
        by === 'player' ? 'You ran Nazma off the lot.' : 'Your guard ran Nazma off the lot.',
      )
    },
    nazmaLeft: () => {
      const s = get()
      if (s.nazma?.status === 'onLot') setNazma(k, { ...s.nazma, status: 'done' })
    },
  }
}

/** Updates today's Nazma tally. */
export function tallyNazma(k: Kit, change: Partial<NazmaStats>): void {
  const stats = k.get().dayStats
  k.set({ dayStats: { ...stats, nazma: { ...stats.nazma, ...change } } })
}

/** Stores Nazma's visit, dropping a confront aimed at him once he's no longer on the lot. */
function setNazma(k: Kit, nazma: NazmaVisit): void {
  k.set({ nazma })
  if (nazma.status === 'onLot') return
  const s = k.get()
  if (s.activeAction?.targetId === NAZMA_ID) dispatch(k, { type: 'cancel' })
  if (s.menu?.targetId === NAZMA_ID || s.hoveredId === NAZMA_ID) {
    k.set({
      menu: s.menu?.targetId === NAZMA_ID ? null : s.menu,
      hoveredId: s.hoveredId === NAZMA_ID ? null : s.hoveredId,
    })
  }
}
