import { WASH_BELOW } from './cleanliness'
import { PLAYER_ID, type Customer } from './customers'
import type { DayStats } from './deal'
import { unlockedBy } from './expansions'
import type { FranchiseTier } from './franchise'
import type { InventoryCar } from './inventory'
import type { NazmaVisit } from './nazma'
import { quoteFor } from './negotiation'
import type { OwnerVisit } from './owner'
import type { RankId } from './progression'
import { isStale, STALE_DAYS } from './usedCars'

/**
 * Guided tips on Easy: a short pointer the first time something happens.
 * Pure: `tipFor` diffs two store states like `sfxFor`, and `state/tips.ts`
 * shows the tip and marks it seen.
 */
export type TipId =
  | 'wash'
  | 'haggle'
  | 'restock'
  | 'missed'
  | 'nazma'
  | 'owner'
  | 'lowCash'
  | 'seller'
  | 'tradeIn'
  | 'rivalQuote'
  | 'staleUsed'
  | 'franchise'
  | 'expansion'

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
  tradeIn:
    'This buyer brought a car to trade. Appraise it, then set an allowance as you haggle. They weigh what they pay after the trade, and a lowball allowance offends them.',
  rivalQuote:
    "This buyer has a price from Nazma's lot across the road. Ask much more and they may go to him; Match his price makes a yes more likely.",
  staleUsed: `A used car has been in stock ${STALE_DAYS} days, and it's worth less every day. Buyers judge its price by what it's worth now, so take a lower offer to move it.`,
  franchise:
    'Your franchise tier changed. Higher tiers pay less for stock, earn a bigger holdback and can order the top models. Meet the quota to move up; fall well short and you drop. The Calendar tab shows where you stand.',
  expansion:
    'Your new rank lets you expand. See the office computer’s Upgrades tab: what you buy there is built overnight.',
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
  clock: { day: number }
  cash: number
  inventory: readonly InventoryCar[]
  customers: readonly Customer[]
  dayStats: Pick<DayStats, 'missed'>
  owner: OwnerVisit | null
  nazma: NazmaVisit | null
  franchise: FranchiseTier
  career: { rank: RankId }
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
    case 'seller':
    case 'tradeIn': {
      if (next.customers === prev.customers) return false
      return next.customers.some(
        (c) =>
          (id === 'seller' ? c.selling : c.trade) &&
          c.vehicle?.parked &&
          !prev.customers.find((p) => p.id === c.id)?.vehicle?.parked,
      )
    }
    case 'rivalQuote': {
      if (next.customers === prev.customers) return false
      // Once the player is talking with them about a car his quote is on.
      const quoted = (c: Customer) => {
        const car = next.inventory.find((x) => x.id === c.targetCarId)
        return !!car && quoteFor(c, car) !== null
      }
      return next.customers.some(
        (c) =>
          c.handlerId === PLAYER_ID &&
          c.phase === 'talking' &&
          prev.customers.find((p) => p.id === c.id)?.handlerId !== PLAYER_ID &&
          quoted(c),
      )
    }
    case 'staleUsed': {
      const stale = (s: TipState) =>
        s.inventory.filter((c) => c.status === 'available' && isStale(c, s.clock.day))
      const was = new Set(stale(prev).map((c) => c.id))
      return stale(next).some((c) => !was.has(c.id))
    }
    case 'franchise':
      return next.franchise !== prev.franchise
    case 'expansion':
      return unlockedBy(prev.career.rank, next.career.rank).length > 0
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
