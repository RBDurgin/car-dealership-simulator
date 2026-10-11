import { describe, expect, it } from 'vitest'
import { WEEKDAY_TRAFFIC } from './calendar'
import { arrivalScale, patienceDrain } from './customers'
import { TUNING } from './difficulty'
import { eventOn } from './events'
import { START_REPUTATION, visitorScale } from './reputation'
import { WEATHER_EFFECTS } from './weather'

describe('arrivalScale', () => {
  it('is the weekday and the weather alone at the start, on Medium', () => {
    // Day 1 is a Monday.
    expect(arrivalScale(1, 'cloudy', null, TUNING.medium, START_REPUTATION)).toBe(
      WEEKDAY_TRAFFIC[0],
    )
    expect(arrivalScale(6, 'rain', null, TUNING.medium, START_REPUTATION)).toBeCloseTo(
      WEEKDAY_TRAFFIC[5] * WEATHER_EFFECTS.rain.traffic,
    )
  })

  it('multiplies in reputation, a sale weekend and the level', () => {
    const event = { traffic: 1.5 }
    const scale = arrivalScale(1, 'sunny', event, TUNING.easy, 80)
    expect(scale).toBeCloseTo(
      visitorScale(80) *
        WEEKDAY_TRAFFIC[0] *
        WEATHER_EFFECTS.sunny.traffic *
        1.5 *
        TUNING.easy.traffic,
    )
    expect(arrivalScale(1, 'sunny', event, TUNING.hard, 20)).toBeLessThan(scale)
  })

  it('takes the sales events from the calendar', () => {
    const day = Array.from({ length: 365 }, (_, i) => i + 1).find((d) => eventOn(d))!
    const with_ = arrivalScale(day, 'cloudy', eventOn(day), TUNING.medium, START_REPUTATION)
    const without = arrivalScale(day, 'cloudy', null, TUNING.medium, START_REPUTATION)
    expect(with_ / without).toBeCloseTo(eventOn(day)!.traffic)
  })
})

describe('patienceDrain', () => {
  it('is the minutes, slowed by a receptionist and a comfy waiting area', () => {
    expect(patienceDrain(10, 1, 0)).toBe(10)
    expect(patienceDrain(10, 0.5, 0)).toBe(5)
    expect(patienceDrain(10, 1, 0.25)).toBe(7.5)
    expect(patienceDrain(10, 0.5, 0.25)).toBe(3.75)
    expect(patienceDrain(0, 0.5, 0.25)).toBe(0)
  })
})
