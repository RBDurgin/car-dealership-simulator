import { describe, expect, it } from 'vitest'
import { ARCHETYPES, type Archetype } from './archetypes'
import { CAR_MODELS } from './customers'
import { createRng } from './rng'
import {
  bestTopic,
  closePrompt,
  goodTopicChance,
  MODEL_TOPICS,
  offerTopics,
  promptsDue,
  promptsMade,
  staffTopic,
  STAFF_TOPIC_SKILL,
  topicFit,
  TOPICS,
  TOPICS_OFFERED,
  UNANSWERED,
} from './talkingPoints'

const archetypes = Object.keys(ARCHETYPES) as Archetype[]

describe('talking points', () => {
  it('has a good topic for every buyer in every car', () => {
    for (const archetype of archetypes) {
      for (const model of CAR_MODELS) {
        const good = TOPICS.filter((t) => topicFit({ archetype }, { model }, t) === 'good')
        expect(good.length, `${archetype} in a ${model}`).toBeGreaterThan(0)
      }
    }
  })

  it('likes a topic the buyer cares about and the car is good at best, and neither least', () => {
    // A truck is roomy and strong; a bargain hunter cares about space, not power.
    expect(MODEL_TOPICS.truck).toContain('space')
    expect(topicFit({ archetype: 'bargain' }, { model: 'truck' }, 'space')).toBe('good')
    expect(topicFit({ archetype: 'bargain' }, { model: 'truck' }, 'power')).toBe('ok')
    expect(topicFit({ archetype: 'bargain' }, { model: 'truck' }, 'economy')).toBe('ok')
    expect(topicFit({ archetype: 'bargain' }, { model: 'truck' }, 'comfort')).toBe('poor')
  })

  it('offers 3 different topics, one at least a good fit, the same for the same seed', () => {
    for (const archetype of archetypes) {
      for (const model of CAR_MODELS) {
        for (let seed = 1; seed <= 20; seed++) {
          const offer = offerTopics({ archetype }, { model }, createRng(seed))
          expect(offer).toHaveLength(TOPICS_OFFERED)
          expect(new Set(offer).size).toBe(TOPICS_OFFERED)
          expect(offer.some((t) => topicFit({ archetype }, { model }, t) === 'good')).toBe(true)
          expect(offerTopics({ archetype }, { model }, createRng(seed))).toEqual(offer)
        }
      }
    }
  })

  it('doesn’t always put the good topic first', () => {
    const firsts = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const offer = offerTopics({ archetype: 'regular' }, { model: 'sedan' }, createRng(seed))
      firsts.add(topicFit({ archetype: 'regular' }, { model: 'sedan' }, offer[0]))
    }
    expect(firsts.size).toBeGreaterThan(1)
  })

  it('marks the best of the topics offered', () => {
    const c = { archetype: 'bargain' as const }
    expect(bestTopic(c, { model: 'truck' }, ['comfort', 'power', 'space'])).toBe('space')
    expect(bestTopic(c, { model: 'truck' }, ['comfort', 'power'])).toBe('power')
  })

  it('comes up at a third and two thirds of the way', () => {
    expect(promptsDue(0, 30)).toBe(0)
    expect(promptsDue(9.9, 30)).toBe(0)
    expect(promptsDue(10, 30)).toBe(1)
    expect(promptsDue(20, 30)).toBe(2)
    expect(promptsDue(40, 30)).toBe(2)
  })

  it('counts a prompt left unanswered as ok', () => {
    const open = { points: [], offered: ['safety', 'power', 'tech'] as const }
    const closed = closePrompt({ ...open, offered: [...open.offered] })
    expect(closed).toEqual({ points: [UNANSWERED], offered: null })
    expect(UNANSWERED.fit).toBe('ok')
    expect(promptsMade({ ...open, offered: [...open.offered] })).toBe(1)
    expect(promptsMade(closed)).toBe(1)
    const none = { points: [], offered: null }
    expect(closePrompt(none)).toBe(none)
  })
})

describe('a salesperson’s talking points', () => {
  it('picks the best topic more often the more skilled they are, about 40% to 85%', () => {
    expect(goodTopicChance(1)).toBeCloseTo(STAFF_TOPIC_SKILL.min)
    expect(goodTopicChance(5)).toBeCloseTo(STAFF_TOPIC_SKILL.max)
    const rate = (skill: number) => {
      const rng = createRng(skill)
      let good = 0
      for (let i = 0; i < 2000; i++) {
        const topics = offerTopics({ archetype: 'regular' }, { model: 'sedan' }, rng)
        const t = staffTopic(skill, { archetype: 'regular' }, { model: 'sedan' }, topics, rng)
        if (topicFit({ archetype: 'regular' }, { model: 'sedan' }, t) === 'good') good++
      }
      return good / 2000
    }
    const rates = [1, 2, 3, 4, 5].map(rate)
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1])
    expect(rates[0]).toBeGreaterThan(0.35)
    expect(rates[0]).toBeLessThan(0.55)
    expect(rates[4]).toBeGreaterThan(0.8)
  })

  it('always picks one of the topics offered', () => {
    const rng = createRng(3)
    const topics = offerTopics({ archetype: 'couple' }, { model: 'van' }, rng)
    for (let i = 0; i < 20; i++) {
      expect(topics).toContain(
        staffTopic(1, { archetype: 'couple' }, { model: 'van' }, topics, rng),
      )
    }
  })
})
