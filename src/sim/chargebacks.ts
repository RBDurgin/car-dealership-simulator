import type { CreditTier } from './credit'
import { PRODUCTS, type ProductId, type SaleFi } from './fi'
import { formatMoney } from './format'
import type { Rng } from './rng'
import { FI_COMMISSION } from './staff'

/**
 * Chargebacks (19d): a product cancelled early, or a loan paid off or
 * refinanced soon after the sale, takes back what the dealer made on it. The
 * harder the deal was sold (pressure, markup) and the weaker the buyer's
 * credit, the likelier. Rolled once when the deal is signed, landing
 * `CHARGEBACK_DAYS` later; `settleDay` takes those due off cash. When the
 * finance manager signed the deal, his commission share comes back too.
 */

/** What's taken back: a product's gross, or the lender's reserve. */
export type ChargebackKind = ProductId | 'reserve'

export interface Chargeback {
  /** The day it lands. */
  day: number
  /** What it takes back. */
  amount: number
  customerName: string
  kind: ChargebackKind
  /** The finance manager who signed the deal, whose commission share comes back, or null. */
  financeId: string | null
  /** His share of `amount`, while `financeId` is set. */
  clawback: number
}

/** The odds each kind is charged back on a fair deal from a buyer with good credit. */
export const CHARGEBACK_BASE: Record<ChargebackKind, number> = {
  warranty: 0.03,
  gap: 0.03,
  protection: 0.04,
  tyre: 0.04,
  reserve: 0.02,
}
/** Pressure (see `pressureOf`) a buyer shrugs off… */
export const FAIR_PRESSURE = 3
/** …and what each point past it adds. */
export const PRESSURE_CHARGEBACK = 0.02
/** Markup points over this are what sends a buyer to refinance… */
export const FAIR_MARKUP = 1
/** …and what each adds to a product's odds, and the reserve's. */
export const MARKUP_CHARGEBACK = 0.02
export const MARKUP_RESERVE = 0.06
/** Added by the buyer's credit: weaker credit cancels and defaults more. */
export const TIER_CHARGEBACK: Record<CreditTier, number> = { A: 0, B: 0.01, C: 0.04, D: 0.07 }
/** Nothing is that likely to come back. */
export const MAX_CHARGEBACK = 0.6
/** A chargeback lands this many days after the sale. */
export const CHARGEBACK_DAYS = { min: 15, max: 90 }

/**
 * The odds `kind` is charged back on a deal sold with `pressure` and `markup`
 * to a buyer of credit `tier` (null for cash), × the level's `scale`
 * (`Tuning.chargebackScale`).
 */
export function chargebackChance(
  kind: ChargebackKind,
  pressure: number,
  markup: number,
  tier: CreditTier | null,
  scale = 1,
): number {
  const overMarkup = Math.max(0, markup - FAIR_MARKUP)
  const chance =
    CHARGEBACK_BASE[kind] +
    PRESSURE_CHARGEBACK * Math.max(0, pressure - FAIR_PRESSURE) +
    (kind === 'reserve' ? MARKUP_RESERVE : MARKUP_CHARGEBACK) * overMarkup +
    (tier ? TIER_CHARGEBACK[tier] : 0)
  return Math.max(0, Math.min(MAX_CHARGEBACK, chance * scale))
}

/** Who the deal was and who signed it, for `rollChargebacks`. */
export interface ChargebackDeal {
  day: number
  customerName: string
  tier: CreditTier | null
  /** The finance manager who signed it, or null. */
  financeId: string | null
  /** `Tuning.chargebackScale`. */
  scale?: number
}

/**
 * The chargebacks a deal's F&I will bring, each product taken and the reserve
 * rolled on `rng` (always the same number of rolls per product and reserve,
 * hit or not), each landing `CHARGEBACK_DAYS` later.
 */
export function rollChargebacks(fi: SaleFi, deal: ChargebackDeal, rng: Rng): Chargeback[] {
  const items: { kind: ChargebackKind; amount: number }[] = [
    ...fi.products.map((p) => ({ kind: p.id as ChargebackKind, amount: p.price - p.cost })),
    ...(fi.reserve > 0 ? [{ kind: 'reserve' as const, amount: fi.reserve }] : []),
  ]
  const out: Chargeback[] = []
  for (const { kind, amount } of items) {
    const hit = rng.next() < chargebackChance(kind, fi.pressure, fi.markup, deal.tier, deal.scale)
    const day = deal.day + rng.int(CHARGEBACK_DAYS.min, CHARGEBACK_DAYS.max)
    if (!hit || amount <= 0) continue
    out.push({
      day,
      amount,
      customerName: deal.customerName,
      kind,
      financeId: deal.financeId,
      clawback: deal.financeId ? Math.round(amount * FI_COMMISSION) : 0,
    })
  }
  return out
}

/** The chargebacks that land by `day`, and those still to come. */
export function dueChargebacks(
  list: readonly Chargeback[],
  day: number,
): { due: Chargeback[]; later: Chargeback[] } {
  const due: Chargeback[] = []
  const later: Chargeback[] = []
  for (const c of list) (c.day <= day ? due : later).push(c)
  return { due, later }
}

/** What `list` takes back in all. */
export function chargebackTotal(list: readonly Chargeback[]): number {
  return list.reduce((sum, c) => sum + c.amount, 0)
}

/**
 * The commission clawed back from the finance managers of `due` who are still
 * on the payroll (`onRoster`). One who has left keeps his.
 */
export function clawbackTotal(
  due: readonly Chargeback[],
  onRoster: (id: string) => boolean,
): number {
  return due.reduce((sum, c) => sum + (c.financeId && onRoster(c.financeId) ? c.clawback : 0), 0)
}

/** What a chargeback takes back, in words: "Extended warranty", "Lender's reserve". */
export function chargebackLabel(kind: ChargebackKind): string {
  return kind === 'reserve' ? "Lender's reserve" : PRODUCTS[kind].name
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']

/** "Two chargebacks today: −$1,840 (Ann's extended warranty, …)." for the morning, or null with none. */
export function chargebackNotice(due: readonly Chargeback[]): string | null {
  if (due.length === 0) return null
  const n = WORDS[due.length] ?? String(due.length)
  const what = due
    .map((c) => `${c.customerName}'s ${chargebackLabel(c.kind).toLowerCase()}`)
    .join(', ')
  const s = due.length === 1 ? '' : 's'
  return `${n} chargeback${s} today: ${formatMoney(-chargebackTotal(due))} (${what}).`
}
