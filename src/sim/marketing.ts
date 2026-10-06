import { ARCHETYPES, type Archetype } from './archetypes'
import { REFERRAL_SKEW } from './reputation'

/**
 * Advertising: timed campaigns paid up front. While one runs it brings extra
 * planned visitors each day, and each channel draws its own kind of shopper.
 * A campaign starts the morning after it's bought, as the day's arrivals are
 * planned at opening.
 */

export type Channel = 'newspaper' | 'radio' | 'tv' | 'online'

/**
 * Where a customer heard of us: a campaign, wandering in off the sidewalk, a
 * friend who bought here (see `sim/reputation.ts`), or none of those.
 */
export type Source = 'regular' | 'walk-in' | 'referral' | Channel

export interface ChannelInfo {
  label: string
  /** Paid in full when the campaign is bought. */
  cost: number
  /** How many days it runs. */
  days: number
  /** Extra planned visitors per day while it runs (fractions are rolled each day). */
  visitors: number
  /** Multipliers on `ARCHETYPES` weights for the visitors it brings (1 when unlisted). */
  skew: Partial<Record<Archetype, number>>
  /** Who it reaches, for the marketing tab. */
  reaches: string
}

export const CHANNELS: Record<Channel, ChannelInfo> = {
  newspaper: {
    label: 'Newspaper ad',
    cost: 1_500,
    days: 3,
    visitors: 1.5,
    skew: { bargain: 3, 'tire-kicker': 1.3 },
    reaches: 'Bargain hunters clipping coupons',
  },
  radio: {
    label: 'Radio spot',
    cost: 2_500,
    days: 4,
    visitors: 2,
    skew: { regular: 1.5 },
    reaches: 'Commuters: a bit of everyone',
  },
  tv: {
    label: 'TV commercial',
    cost: 6_000,
    days: 5,
    visitors: 3,
    skew: { decisive: 3 },
    reaches: 'Buyers ready to sign',
  },
  online: {
    label: 'Online ads',
    cost: 1_200,
    days: 3,
    visitors: 1,
    skew: { couple: 3, 'tire-kicker': 1.5 },
    reaches: 'Young couples browsing',
  },
}

export const CHANNEL_IDS = Object.keys(CHANNELS) as Channel[]

/** Each further run of a channel at the same time adds this fraction of the one before. */
export const REPEAT_FALLOFF = 0.5

export interface Campaign {
  id: string
  channel: Channel
  /** First and last day it brings visitors, inclusive. */
  startDay: number
  endDay: number
}

/** The campaigns bringing visitors on `day`, oldest first. */
export function activeCampaigns(campaigns: readonly Campaign[], day: number): Campaign[] {
  return campaigns.filter((c) => c.startDay <= day && day <= c.endDay)
}

/** Days a campaign still has to run, counting `day` if it runs then. 0 once over. */
export function daysLeft(c: Campaign, day: number): number {
  return Math.max(0, c.endDay - Math.max(day, c.startDay) + 1)
}

/** Campaigns that haven't finished by `day` (running or yet to start). */
export function unfinished(campaigns: readonly Campaign[], day: number): Campaign[] {
  return campaigns.filter((c) => c.endDay >= day)
}

/**
 * Extra visitors campaigns bring on `day`, by channel, times `scale` (from
 * reputation; see `campaignScale`). Several runs of one channel at once fall
 * off: each adds `REPEAT_FALLOFF` of the run before.
 */
export function trafficBoost(
  campaigns: readonly Campaign[],
  day: number,
  scale = 1,
): Partial<Record<Channel, number>> {
  const runs: Partial<Record<Channel, number>> = {}
  for (const c of activeCampaigns(campaigns, day)) runs[c.channel] = (runs[c.channel] ?? 0) + 1
  const boost: Partial<Record<Channel, number>> = {}
  for (const channel of CHANNEL_IDS) {
    const n = runs[channel] ?? 0
    if (n === 0) continue
    // A geometric series: 1 + f + f² + … for n runs.
    const factor = (1 - REPEAT_FALLOFF ** n) / (1 - REPEAT_FALLOFF)
    boost[channel] = CHANNELS[channel].visitors * factor * scale
  }
  return boost
}

/** Archetype odds for a customer from `source`: a channel's (or referrals') skew on the usual weights. */
export function sourceWeights(source: Source): Record<Archetype, number> | undefined {
  if (source === 'regular' || source === 'walk-in') return undefined
  const skew = source === 'referral' ? REFERRAL_SKEW : CHANNELS[source].skew
  const weights = {} as Record<Archetype, number>
  for (const a of Object.keys(ARCHETYPES) as Archetype[]) {
    weights[a] = ARCHETYPES[a].weight * (skew[a] ?? 1)
  }
  return weights
}

export type LaunchResult =
  | { ok: true; campaign: Campaign; cash: number; campaigns: Campaign[] }
  | { ok: false; reason: string }

/** Buys a `channel` campaign on `day`, paid from cash, to start tomorrow. */
export function launchCampaign(
  book: { cash: number; campaigns: readonly Campaign[] },
  channel: Channel,
  day: number,
  id: string,
): LaunchResult {
  const info = CHANNELS[channel]
  if (book.cash < info.cost) return { ok: false, reason: 'Not enough cash for that campaign.' }
  const campaign: Campaign = { id, channel, startDay: day + 1, endDay: day + info.days }
  return {
    ok: true,
    campaign,
    cash: book.cash - info.cost,
    campaigns: [...book.campaigns, campaign],
  }
}

/** A source as the summary names it, e.g. "Newspaper ad". */
export function sourceLabel(source: Source): string {
  if (source === 'regular') return 'Regular traffic'
  if (source === 'walk-in') return 'Walked in'
  if (source === 'referral') return 'Referral'
  return CHANNELS[source].label
}
