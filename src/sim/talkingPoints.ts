import { ARCHETYPES } from './archetypes'
import type { Customer } from './customers'
import type { InventoryCar } from './inventory'
import type { CarModel } from './layout'
import type { Rng } from './rng'
import type { TalkingPoint, TestDrive, TopicFit } from './testDrive'

/**
 * Talking points (Phase 20b): twice on a test drive the player gets 3 things
 * to point out about the car. A topic the buyer cares about (their
 * archetype's `topics`) that the car is good at (`MODEL_TOPICS`) goes down
 * best; one or the other is fine, and neither falls flat. Each point adds to
 * the drive's score (`POINT_SCORE` in `sim/testDrive.ts`).
 */

export type Topic = 'safety' | 'power' | 'economy' | 'comfort' | 'space' | 'tech' | 'handling'

export const TOPICS: readonly Topic[] = [
  'safety',
  'power',
  'economy',
  'comfort',
  'space',
  'tech',
  'handling',
]

/** What the player says, on the prompt's buttons. */
export const TOPIC_LABELS: Record<Topic, { icon: string; name: string }> = {
  safety: { icon: '🛡️', name: 'Safety' },
  power: { icon: '⚡', name: 'Power' },
  economy: { icon: '⛽', name: 'Economy' },
  comfort: { icon: '🛋️', name: 'Comfort' },
  space: { icon: '📦', name: 'Space' },
  tech: { icon: '📱', name: 'Tech' },
  handling: { icon: '🏁', name: 'Handling' },
}

/** What each body type is good at. */
export const MODEL_TOPICS: Record<CarModel, readonly Topic[]> = {
  sedan: ['comfort', 'economy', 'safety'],
  'sedan-sports': ['power', 'handling', 'tech'],
  suv: ['space', 'safety', 'comfort'],
  'suv-luxury': ['comfort', 'tech', 'power'],
  'hatchback-sports': ['handling', 'economy', 'tech'],
  van: ['space', 'safety', 'economy'],
  truck: ['space', 'power', 'handling'],
}

/** Talking points per drive, at a third and two thirds of the way. */
export const PROMPTS_PER_DRIVE = 2
/** Topics offered at each prompt. */
export const TOPICS_OFFERED = 3

/**
 * How `topic` suits `c` in `car`: good if they care about it and the car is
 * good at it, ok for one of the two, poor for neither.
 */
export function topicFit(
  c: Pick<Customer, 'archetype'>,
  car: Pick<InventoryCar, 'model'>,
  topic: Topic,
): TopicFit {
  const liked = ARCHETYPES[c.archetype].topics.includes(topic)
  const strong = MODEL_TOPICS[car.model].includes(topic)
  return liked && strong ? 'good' : liked || strong ? 'ok' : 'poor'
}

/**
 * The 3 topics offered at a prompt, in a random order: at least one a good
 * fit, the other two drawn from the rest.
 */
export function offerTopics(
  c: Pick<Customer, 'archetype'>,
  car: Pick<InventoryCar, 'model'>,
  rng: Rng,
): Topic[] {
  const good = TOPICS.filter((t) => topicFit(c, car, t) === 'good')
  const pick = rng.pick(good)
  const rest = TOPICS.filter((t) => t !== pick)
  const picked = [pick]
  while (picked.length < TOPICS_OFFERED) {
    picked.push(rest.splice(rng.int(0, rest.length - 1), 1)[0])
  }
  // Shuffle, so the good one isn't always first.
  for (let i = picked.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[picked[i], picked[j]] = [picked[j], picked[i]]
  }
  return picked
}

/** The best fit among `topics` (the first of the best), for Easy's hint. */
export function bestTopic(
  c: Pick<Customer, 'archetype'>,
  car: Pick<InventoryCar, 'model'>,
  topics: readonly Topic[],
): Topic | null {
  const rank: Record<TopicFit, number> = { good: 2, ok: 1, poor: 0 }
  let best: Topic | null = null
  for (const t of topics) {
    if (best === null || rank[topicFit(c, car, t)] > rank[topicFit(c, car, best)]) best = t
  }
  return best
}

/** The odds a salesperson picks the best topic offered, from skill 1 to skill 5. */
export const STAFF_TOPIC_SKILL = { min: 0.4, max: 0.85 }

/** The odds a salesperson of `skill` (1–5) picks the best of the topics offered. */
export function goodTopicChance(skill: number): number {
  const t = Math.max(0, Math.min(1, (skill - 1) / 4))
  return STAFF_TOPIC_SKILL.min + (STAFF_TOPIC_SKILL.max - STAFF_TOPIC_SKILL.min) * t
}

/**
 * What a salesperson of `skill` points out from `topics`: the best fit
 * `goodTopicChance(skill)` of the time, otherwise one of the others.
 */
export function staffTopic(
  skill: number,
  c: Pick<Customer, 'archetype'>,
  car: Pick<InventoryCar, 'model'>,
  topics: readonly Topic[],
  rng: Rng,
): Topic {
  const best = bestTopic(c, car, topics) ?? topics[0]
  const others = topics.filter((t) => t !== best)
  return rng.next() < goodTopicChance(skill) || others.length === 0 ? best : rng.pick(others)
}

/** How many prompts are due `elapsed` game minutes into a drive `minutes` long. */
export function promptsDue(elapsed: number, minutes: number): number {
  let due = 0
  for (let i = 1; i <= PROMPTS_PER_DRIVE; i++) {
    if (elapsed >= (minutes * i) / (PROMPTS_PER_DRIVE + 1)) due++
  }
  return due
}

/** Prompts made so far on `drive`, the open one included. */
export const promptsMade = (drive: Pick<TestDrive, 'points' | 'offered'>): number =>
  drive.points.length + (drive.offered ? 1 : 0)

/** A prompt left unanswered counts as an ok point. */
export const UNANSWERED: TalkingPoint = { topic: null, fit: 'ok' }

/** `drive` with its open prompt, if any, closed as unanswered. */
export function closePrompt<T extends Pick<TestDrive, 'points' | 'offered'>>(drive: T): T {
  if (!drive.offered) return drive
  return { ...drive, points: [...drive.points, UNANSWERED], offered: null }
}

/** How the buyer took a point, shown under the prompt. */
export const FIT_REACTIONS: Record<TopicFit, string> = {
  good: 'Loves it',
  ok: 'Nods along',
  poor: 'Hmm…',
}
