import { CSI_FLOOR } from './csi'
import { WASH_BELOW } from './cleanliness'
import { dueCount, type Client } from './clients'
import { bubbleOf, PLAYER_ID, type Customer } from './customers'
import type { DayStats, DriveStats } from './deal'
import { financing, loanDeclined, type FiStats } from './fi'
import { installedExpansions, unlockedBy, type OwnedExpansion } from './expansions'
import type { FranchiseTier } from './franchise'
import type { InventoryCar } from './inventory'
import type { NazmaVisit } from './nazma'
import { quoteFor } from './negotiation'
import type { OwnerVisit } from './owner'
import type { RankId } from './progression'
import { BUST_SHARE, BUST_WEEKS, type RivalStatus } from './rival'
import { bayCount, type ServiceJob } from './service'
import type { RecordKey } from './stats'
import { isStale, STALE_DAYS } from './usedCars'

/** A used car this worn or worse is worth reconditioning (see the `recon` tip). */
export const ROUGH_CONDITION = 0.5

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
  | 'rivalOpens'
  | 'rivalBust'
  | 'staleUsed'
  | 'franchise'
  | 'expansion'
  | 'serviceBay'
  | 'recon'
  | 'serviceClient'
  | 'finding'
  | 'recall'
  | 'clientBook'
  | 'followUp'
  | 'appointment'
  | 'tradeUpDue'
  | 'referral'
  | 'appreciation'
  | 'csi'
  | 'declinedCredit'
  | 'fiMenu'
  | 'chargeback'
  | 'financeManager'
  | 'testDrive'
  | 'ding'
  | 'driveStaff'
  | 'stats'
  | 'achievement'

/** Financed deals in a day that make a finance manager worth hiring. */
export const FINANCE_TIP_DEALS = 5

/** Drives the player takes in a day, with a salesperson free, that make it worth sending them instead. */
export const DRIVE_STAFF_TIP_DRIVES = 3

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
  serviceBay:
    'Your service garage is open. Hire a mechanic for each bay from the staff panel; the Service tab on the office computer shows what they’re working on.',
  recon:
    'This used car is in rough shape. Pick Recondition on it, or use the Service tab: a mechanic raises its condition, and it goes back on sale for more.',
  recall:
    'A recall client drove in. Meet them at the garage’s counter and choose Check in: the manufacturer pays for the work, so they never say no. The more of the recalled model you’ve sold, the more come in.',
  serviceClient:
    'A service client drove in. Meet them at the garage’s counter and choose Check in to quote the job; they pay when they collect their car. A service advisor checks clients in for you.',
  finding:
    'A mechanic found more work on a client’s car. Choose Recommend work on the client in the garage, or Call from the Service tab if they’re away. A higher shop rate makes a yes less likely; a car ready before anyone offers it loses the sale.',
  rivalOpens:
    "Nazma's lot across the road is open, and some shoppers go to him instead. A good reputation, ads running and prices close to his win them back. The office computer's Rival tab shows how he's doing.",
  rivalBust: `Nazma went bust: his share stayed under ${Math.round(BUST_SHARE * 100)}% for ${BUST_WEEKS} weeks. He'll be back in a few weeks under a new name, a little stronger, so use the quiet to build up.`,
  clientBook:
    'Someone went in your client book: buyers become clients, and shoppers who talked to you but didn’t buy stay as prospects for two weeks. The office computer’s Clients tab shows how happy each visit left them. A star over a waiting customer means they’ve been here before.',
  followUp:
    'A shopper left without buying and is a prospect now. Call them back from the desk phone in the office (or the Call button in the Clients tab): a be-back who books an appointment comes in ready to deal.',
  appointment:
    'An appointment is booked for tomorrow. The morning notice and the Calendar tab say when they’re due. Don’t keep them waiting: a booked client minds a wait twice as much.',
  tradeUpDue:
    'A client is due to trade up the car you sold them. They may come in on their own, the likelier the happier they are, or call them from the desk phone to book a time. They drive in with their old car to trade. The Clients tab’s Due filter lists who’s due, and its loyalty discount brings them back more often.',
  referral:
    'A friend of one of your clients is here: their panel says who sent them. Happy clients send friends for a few weeks after buying. A referral fee in the Clients tab, and a thank-you call, make them send more.',
  appreciation:
    'Your book has 10 clients. Book a client appreciation day in the Calendar tab: a cookout on the lot that brings clients back, leaves them happier and brings in clients due to trade up.',
  csi: `This month's CSI came in under ${CSI_FLOOR}, so the manufacturer cut the holdback by a quarter. Every new-car buyer's visit counts: keep waits short, haggle less, and hand over clean cars at a fair price.`,
  declinedCredit:
    'No lender will take this buyer at what they meant to put down. Ask for more down if their budget reaches it, or let them go. Weaker credit needs more down, and Subprime Auto lends only up to $40,000.',
  fiMenu:
    'Your buyer is financing. Pick a lender and the markup (each point earns a reserve), then present products one at a time. Every product shown and every point of markup makes the next yes harder, and a buyer pushed hard is less happy and more likely to cancel later.',
  chargeback:
    'A chargeback landed: a buyer cancelled a product or paid off their loan early, and the dealer gives back what it made. Deals sold with heavy markup or too many products come back more often, and a client charged back soon after buying comes in sour next time.',
  financeManager: `${FINANCE_TIP_DEALS} buyers financed today with no finance manager. Hire one from the staff panel: he runs the F&I menu by his skill while you stay on the floor, and salespeople hand him the buyers banks won't take at the buy rate.`,
  testDrive:
    'A shopper with a key over their head wants to drive the car. Choose Test drive on them to ride along: a good drive makes a yes likelier and a smaller discount. Point out what suits them when asked. Give them a price without the drive and they’re cooler on it.',
  ding: 'A car came back from a test drive with a dent, and dinged cars sell less often. Choose Fix dent on it to book the garage, or Recondition a used one.',
  driveStaff: `You’ve taken ${DRIVE_STAFF_TIP_DRIVES} test drives today while a salesperson stood free. Choose Send with … in the shopper's panel to hand the drive to them, and stay on the floor to sell.`,
  stats:
    'You broke a record today. The office computer’s Stats tab (P) keeps every day you close: lifetime totals, your records and charts of sales, gross, cash and more.',
  achievement:
    'You earned an achievement. See them all in the office computer’s Stats tab (P) under Achievements, and every game’s in the trophy case on the title screen.',
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
  dayStats: Pick<DayStats, 'missed' | 'quota'> & {
    newRecords?: readonly RecordKey[]
    fi?: Pick<FiStats, 'financed' | 'declined' | 'chargebackCount'>
    drives?: Pick<DriveStats, 'taken' | 'byStaff' | 'dings'>
  }
  roster?: readonly { id: string; role: string; status: string; fired: boolean }[]
  achievements?: readonly unknown[]
  owner: OwnerVisit | null
  nazma: NazmaVisit | null
  franchise: FranchiseTier
  career: { rank: RankId }
  rival: { status: RivalStatus }
  expansions: readonly OwnedExpansion[]
  serviceJobs: readonly ServiceJob[]
  clients: readonly Client[]
}

const prospects = (s: TipState) => s.clients.filter((c) => c.status === 'prospect').length
const booked = (s: TipState) => s.clients.filter((c) => c.appointment).length
const clientCount = (s: TipState) => s.clients.filter((c) => c.status === 'client').length
/** Clients in the book that make an appreciation day worth booking. */
export const APPRECIATION_TIP_CLIENTS = 10

/** The player's buyer at the F&I menu who wasn't there before, matching `test`. */
function newToMenu(prev: TipState, next: TipState, test: (c: Customer) => boolean): boolean {
  if (next.customers === prev.customers) return false
  return next.customers.some(
    (c) =>
      c.phase === 'menu' &&
      c.handlerId === PLAYER_ID &&
      prev.customers.find((p) => p.id === c.id)?.phase !== 'menu' &&
      test(c),
  )
}

const fiCount = (s: TipState, key: 'financed' | 'declined' | 'chargebackCount') =>
  s.dayStats.fi?.[key] ?? 0

/** Drives the player took today (back from the road). */
const playerDrives = (s: TipState) =>
  (s.dayStats.drives?.taken ?? 0) - (s.dayStats.drives?.byStaff ?? 0)

/** A salesperson at their post with nobody to look after. */
const idleSalesperson = (s: TipState) =>
  !!s.roster?.some(
    (e) =>
      e.role === 'sales' &&
      e.status === 'atPost' &&
      !e.fired &&
      !s.customers.some((c) => c.handlerId === e.id && c.phase !== 'leaving'),
  )

const garageUp = (s: TipState) => bayCount(installedExpansions(s.expansions, s.clock.day)) > 0

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
    case 'rivalOpens':
    case 'rivalBust': {
      const status = id === 'rivalOpens' ? 'open' : 'closed'
      return next.rival.status === status && prev.rival.status !== status
    }
    case 'serviceBay':
      return garageUp(next) && !garageUp(prev)
    case 'recon': {
      if (next.inventory === prev.inventory || !garageUp(next)) return false
      const known = new Set(prev.inventory.map((c) => c.id))
      return next.inventory.some(
        (c) =>
          !known.has(c.id) &&
          c.status === 'available' &&
          !!c.used &&
          c.used.condition < ROUGH_CONDITION,
      )
    }
    case 'serviceClient': {
      if (next.customers === prev.customers) return false
      const before = new Map(prev.customers.map((c) => [c.id, c.phase]))
      return next.customers.some(
        // The recall tip covers recall clients.
        (c) =>
          c.service &&
          c.service.kind !== 'recall' &&
          c.phase === 'waiting' &&
          before.get(c.id) === 'arriving',
      )
    }
    case 'finding': {
      if (next.serviceJobs === prev.serviceJobs) return false
      const had = new Set(prev.serviceJobs.filter((j) => j.finding).map((j) => j.id))
      return next.serviceJobs.some((j) => j.finding?.status === 'found' && !had.has(j.id))
    }
    case 'recall': {
      if (next.customers === prev.customers) return false
      const before = new Map(prev.customers.map((c) => [c.id, c.phase]))
      return next.customers.some(
        (c) =>
          c.service?.kind === 'recall' && c.phase === 'waiting' && before.get(c.id) === 'arriving',
      )
    }
    case 'clientBook':
      return next.clients !== prev.clients && next.clients.length > prev.clients.length
    case 'followUp':
      return next.clients !== prev.clients && prospects(next) > prospects(prev)
    case 'appointment':
      return next.clients !== prev.clients && booked(next) > booked(prev)
    case 'tradeUpDue':
      return (
        (next.clients !== prev.clients || next.clock.day !== prev.clock.day) &&
        dueCount(next.clients, next.clock.day) > dueCount(prev.clients, prev.clock.day)
      )
    case 'referral': {
      if (next.customers === prev.customers) return false
      const known = new Set(prev.customers.map((c) => c.id))
      return next.customers.some((c) => c.referredBy && !known.has(c.id))
    }
    case 'appreciation':
      return (
        next.clients !== prev.clients &&
        clientCount(next) >= APPRECIATION_TIP_CLIENTS &&
        clientCount(prev) < APPRECIATION_TIP_CLIENTS
      )
    case 'csi': {
      const csi = next.dayStats.quota?.csi
      return !prev.dayStats.quota && csi !== undefined && csi !== null && csi < CSI_FLOOR
    }
    case 'declinedCredit':
      return (
        fiCount(next, 'declined') > fiCount(prev, 'declined') ||
        newToMenu(prev, next, (c) => !!c.fi && loanDeclined(c, c.fi))
      )
    case 'fiMenu':
      return newToMenu(prev, next, (c) => financing(c) && !!c.fi && !loanDeclined(c, c.fi))
    case 'chargeback':
      return fiCount(next, 'chargebackCount') > fiCount(prev, 'chargebackCount')
    case 'financeManager':
      return (
        fiCount(next, 'financed') >= FINANCE_TIP_DEALS &&
        fiCount(prev, 'financed') < FINANCE_TIP_DEALS &&
        !next.roster?.some((e) => e.role === 'finance' && !e.fired)
      )
    case 'testDrive': {
      if (next.customers === prev.customers) return false
      return next.customers.some((c) => {
        if (bubbleOf(c) !== 'drive') return false
        const before = prev.customers.find((p) => p.id === c.id)
        return !before || bubbleOf(before) !== 'drive'
      })
    }
    case 'ding':
      return (next.dayStats.drives?.dings ?? 0) > (prev.dayStats.drives?.dings ?? 0)
    case 'driveStaff':
      return (
        playerDrives(next) >= DRIVE_STAFF_TIP_DRIVES &&
        playerDrives(prev) < DRIVE_STAFF_TIP_DRIVES &&
        idleSalesperson(next)
      )
    case 'stats':
      return (next.dayStats.newRecords?.length ?? 0) > 0 && !prev.dayStats.newRecords?.length
    case 'achievement':
      return (next.achievements?.length ?? 0) > 0 && !prev.achievements?.length
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
