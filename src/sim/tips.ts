import { WASH_BELOW } from './cleanliness'
import { PLAYER_ID, type Customer } from './customers'
import type { DayStats } from './deal'
import type { InventoryCar } from './inventory'
import type { NazmaVisit } from './nazma'
import type { OwnerVisit } from './owner'

/**
 * Guided tips on Easy: a short pointer the first time something happens.
 * Pure: `tipFor` diffs two store states like `sfxFor`, and `state/tips.ts`
 * shows the tip and marks it seen.
 */
export type TipId =
  'wash' | 'haggle' | 'restock' | 'missed' | 'nazma' | 'owner' | 'lowCash' | 'seller'

/** Cash under this is low enough to point at the floor plan. */
export const LOW_CASH = 5_000

/** Each tip's text, in the order `tipFor` checks them. */
export const TIPS: Record<TipId, string> = {
  nazma:
    'Nazma smudges your cars. Go up to him and choose Confront to run him off, or hire a security guard to keep him away.',
  owner:
    "Meet the owner's goal by closing time for a cash bonus. The banner up top shows how you're doing.",
  haggle:
    "They countered. Hold your price, split the difference or take their offer. They creep up each round, but push too hard and they'll walk.",
  restock:
    'A sale frees a space. Order more cars from the office computer (the Office button) and they arrive tomorrow morning.',
  missed:
    'Someone left because none of the body types they wanted was in stock. Keep a mix of models to catch more buyers.',
  wash: 'Dirty cars sell less often. Go up to one and choose Wash car, or hire a lot porter to keep them clean.',
  seller: 'A seller drove in wanting cash for their car. Appraise it before you make an offer.',
  lowCash:
    'Cash is running low. Order on the floor plan to pay when the car sells, and only pay off loans early when you can spare it.',
}

export const TIP_IDS = Object.keys(TIPS) as TipId[]

export function isTipId(v: unknown): v is TipId {
  return (TIP_IDS as readonly unknown[]).includes(v)
}

/** The slice of the store `tipFor` compares. */
export interface TipState {
  screen: 'title' | 'playing'
  cash: number
  inventory: readonly InventoryCar[]
  customers: readonly Customer[]
  dayStats: Pick<DayStats, 'missed'>
  owner: OwnerVisit | null
  nazma: NazmaVisit | null
}

const missedCount = (s: TipState) =>
  Object.values(s.dayStats.missed).reduce((sum, n) => sum + (n ?? 0), 0)

/** Whether tip `id` applies to the change from `prev` to `next`. */
function applies(id: TipId, prev: TipState, next: TipState): boolean {
  switch (id) {
    case 'nazma':
      return next.nazma?.status === 'onLot' && prev.nazma?.status !== 'onLot'
    case 'owner':
      return !!next.owner?.announced && !prev.owner?.announced
    case 'haggle': {
      if (next.customers === prev.customers) return false
      return next.customers.some(
        (c) =>
          c.handlerId === PLAYER_ID &&
          c.haggle &&
          !prev.customers.find((p) => p.id === c.id)?.haggle,
      )
    }
    case 'restock':
    case 'wash': {
      if (next.inventory === prev.inventory) return false
      const before = new Map(prev.inventory.map((c) => [c.id, c]))
      return next.inventory.some((c) => {
        const was = before.get(c.id)
        if (!was) return false
        if (id === 'restock') return c.status === 'sold' && was.status === 'available'
        return (
          c.status === 'available' && c.cleanliness < WASH_BELOW && was.cleanliness >= WASH_BELOW
        )
      })
    }
    case 'missed':
      return missedCount(next) > missedCount(prev)
    case 'seller': {
      if (next.customers === prev.customers) return false
      return next.customers.some(
        (c) =>
          c.selling &&
          c.vehicle?.parked &&
          !prev.customers.find((p) => p.id === c.id)?.vehicle?.parked,
      )
    }
    case 'lowCash':
      return next.cash < LOW_CASH && prev.cash >= LOW_CASH
  }
}

/**
 * The first tip not yet in `seen` that the change from `prev` to `next`
 * calls for, or null. Nothing while the title screen is up or as a game
 * starts or resumes from it.
 */
export function tipFor(prev: TipState, next: TipState, seen: readonly TipId[]): TipId | null {
  if (next.screen !== 'playing' || prev.screen !== 'playing') return null
  return TIP_IDS.find((id) => !seen.includes(id) && applies(id, prev, next)) ?? null
}

/** "Tip: …" for the notice. */
export function tipText(id: TipId): string {
  return `Tip: ${TIPS[id]}`
}
