import type { Customer } from '../sim/customers'
import { installedExpansions } from '../sim/expansions'
import { installed, type ImprovementId } from '../sim/improvements'
import type { ExpansionId } from '../sim/layout'
import { buyBlocker, lotSlotFor } from '../sim/sellers'
import { baseSellerBonus, testDriveBonus } from './derived'
import type { GameState } from './types'

/**
 * Memoised reads of the store for selectors: each one keeps its last inputs
 * and result, and gives the same result (the same reference) back while every
 * input is the same reference. Selectors run on every `set()`, so the work
 * behind them runs only when what it reads has changed.
 */

/** `fn`, remembering its last call: the same arguments (by `Object.is`) give the last result. */
export function memoLast<A extends readonly unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  let lastArgs: A | null = null
  let last!: R
  return (...args: A) => {
    if (
      lastArgs &&
      lastArgs.length === args.length &&
      args.every((a, i) => Object.is(a, lastArgs![i]))
    ) {
      return last
    }
    last = fn(...args)
    lastArgs = args
    return last
  }
}

const upNowOf = memoLast(installed)

/** Improvements up today, recomputed only when `improvements` or the day change. */
export const upNow = (s: Pick<GameState, 'improvements' | 'clock'>): ImprovementId[] =>
  upNowOf(s.improvements, s.clock.day)

const groundOf = memoLast(installedExpansions)

/** Expansions up today, recomputed only when `expansions` or the day change. */
export const groundUp = (s: Pick<GameState, 'expansions' | 'clock'>): ExpansionId[] =>
  groundOf(s.expansions, s.clock.day)

const customerIndex = memoLast(
  (customers: readonly Customer[]) => new Map(customers.map((c) => [c.id, c])),
)

/** Customer `id`, or null: one lookup, with the index built once per `customers` change. */
export const customerById = (s: Pick<GameState, 'customers'>, id: string): Customer | null =>
  customerIndex(s.customers).get(id) ?? null

const bonusOf = memoLast(
  (
    improvements: GameState['improvements'],
    day: number,
    difficulty: GameState['difficulty'],
    roster: GameState['roster'],
    clients: GameState['clients'],
    handlerId: Customer['handlerId'],
    clientId: Customer['clientId'],
  ) =>
    baseSellerBonus(
      { improvements, clock: { day } as GameState['clock'], difficulty, roster, clients },
      { handlerId, clientId },
    ),
)

/** `sellerBonusFor`, recomputed only when what it reads changes. */
export const sellerBonusOf = (
  s: GameState,
  c: Pick<Customer, 'handlerId' | 'clientId' | 'drive' | 'wantsDrive' | 'targetCarId'>,
): number =>
  bonusOf(s.improvements, s.clock.day, s.difficulty, s.roster, s.clients, c.handlerId, c.clientId) +
  testDriveBonus(s, c)

const lotRoomOf = memoLast(
  (
    inventory: GameState['inventory'],
    orders: GameState['orders'],
    purchases: GameState['purchases'],
    expansions: GameState['expansions'],
    day: number,
  ) => !!lotSlotFor({ inventory, orders, purchases, expansions, clock: { day } }),
)

/** Whether a lot space is free for a used car (`lotSlotFor`), recomputed only when stock changes. */
export const lotRoom = (s: GameState): boolean =>
  lotRoomOf(s.inventory, s.orders, s.purchases, s.expansions, s.clock.day)

const buyBlockerOf = memoLast(
  (
    cash: number,
    inventory: GameState['inventory'],
    orders: GameState['orders'],
    purchases: GameState['purchases'],
    expansions: GameState['expansions'],
    day: number,
    price: number,
  ) => buyBlocker({ cash, inventory, orders, purchases, expansions, clock: { day } }, price),
)

/** `buyBlocker` for `price`, recomputed only when cash, stock or the price change. */
export const buyBlockerFor = (s: GameState, price: number): string | null =>
  buyBlockerOf(s.cash, s.inventory, s.orders, s.purchases, s.expansions, s.clock.day, price)
