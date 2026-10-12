import type { Client, ClientPerks } from './clients'
import { OPEN_MINUTE } from './clock'
import type { ClientVisit } from './calls'
import type { Rng } from './rng'
import { LAST_ARRIVAL_MINUTE } from './spawner'

/**
 * Referrals by name (16e). A happy client sends friends in for a while after
 * buying: each morning `planReferrals` gives every client within
 * `REFER_WINDOW` days of their purchase, at `REFER_MIN` satisfaction or more
 * and with fewer than `MAX_FRIENDS` sent for it, a chance to send one. The
 * friend is a stranger who comes with `referredBy` set; if they buy, the
 * client is pleased, counts a referral and is paid the referral fee.
 * Reputation scales how often clients refer (`referralScale`).
 */

/** Days after a purchase a client still sends friends. */
export const REFER_WINDOW = 21
/** Satisfaction a client needs to send a friend. */
export const REFER_MIN = 70
/** Friends a client sends per purchase. */
export const MAX_FRIENDS = 2
/** A client's chance a day of sending a friend at `REFER_MIN`, twice that at 100. */
export const REFER_DAILY = 0.012
/** × the chance by the referral fee: ×1, ×1.5 or ×2. */
export const FEE_REFER: Record<ClientPerks['referralFee'], number> = { 0: 1, 100: 1.5, 250: 2 }
/** × the chance once they've had a thank-you call. */
export const THANKED_REFER = 1.3
/** Satisfaction a client gains when a friend they sent buys. */
export const REFERRAL_BOOST = 5

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * A client's chance a day of sending a friend: none under `REFER_MIN`,
 * `REFER_DAILY` there rising to twice that at 100, × the `fee`'s
 * `FEE_REFER` and `THANKED_REFER` once `thanked`.
 */
export function referChance(
  satisfaction: number,
  fee: ClientPerks['referralFee'] = 0,
  thanked = false,
): number {
  if (satisfaction < REFER_MIN) return 0
  const mood = 1 + (clamp(satisfaction, 0, 100) - REFER_MIN) / (100 - REFER_MIN)
  return REFER_DAILY * mood * FEE_REFER[fee] * (thanked ? THANKED_REFER : 1)
}

/** × the chance by reputation: 0.5 at 0, 1 at 50, 1.5 at 100. */
export function referralScale(reputation: number): number {
  return 0.5 + clamp(reputation, 0, 100) / 100
}

/**
 * Whether `c` may send a friend on `day`: happy enough (`REFER_MIN`), bought
 * within `REFER_WINDOW` days and not sent `MAX_FRIENDS` yet.
 */
export function canRefer(c: Client, day: number): boolean {
  if (c.status !== 'client' || !c.car || c.friendsSent >= MAX_FRIENDS) return false
  if (c.satisfaction < REFER_MIN) return false
  const since = day - c.car.boughtDay
  return since > 0 && since <= REFER_WINDOW
}

export interface ReferralOpts {
  fee: ClientPerks['referralFee']
  reputation: number
  /** `Tuning.clientReturn`. */
  scale: number
}

/**
 * The friends sent in today, as visits by their referrer (`reason`
 * `'friend'`), at a minute on the five through the opening hours. Rolled on
 * `rng` in the book's order, only for those who `canRefer`, so a book with
 * nobody to refer rolls nothing.
 */
export function planReferrals(
  book: readonly Client[],
  day: number,
  rng: Rng,
  opts: ReferralOpts,
): ClientVisit[] {
  const scale = referralScale(opts.reputation) * opts.scale
  const out: ClientVisit[] = []
  for (const c of book) {
    if (!canRefer(c, day)) continue
    if (rng.next() >= referChance(c.satisfaction, opts.fee, c.thanked) * scale) continue
    out.push({ clientId: c.id, minute: friendMinute(rng), reason: 'friend' })
  }
  return out
}

/** A minute on the five between opening and the last arrival. */
export function friendMinute(rng: Rng): number {
  return rng.int(OPEN_MINUTE / 5, LAST_ARRIVAL_MINUTE / 5) * 5
}

/** The book with a friend counted against each referrer in `visits`. */
export function countFriends(book: Client[], visits: readonly ClientVisit[]): Client[] {
  const sent = new Map<string, number>()
  for (const v of visits)
    if (v.reason === 'friend') sent.set(v.clientId, (sent.get(v.clientId) ?? 0) + 1)
  if (sent.size === 0) return book
  return book.map((c) =>
    sent.has(c.id) ? { ...c, friendsSent: c.friendsSent + sent.get(c.id)! } : c,
  )
}

/** The book after a friend sent by `referrerId` bought: a referral, and a happier referrer. */
export function creditReferral(book: Client[], referrerId: string): Client[] {
  return book.map((c) =>
    c.id === referrerId
      ? {
          ...c,
          referrals: c.referrals + 1,
          satisfaction: Math.min(100, c.satisfaction + REFERRAL_BOOST),
        }
      : c,
  )
}
