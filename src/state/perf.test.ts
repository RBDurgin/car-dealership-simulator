import { beforeEach, describe, expect, it } from 'vitest'
import { deviceLabel, perfReportText } from '../ui/perfText'
import { perfDay, recordPerf, type PerfSample } from './perf'

const sample = (extra: Partial<PerfSample> = {}): PerfSample => ({
  fps: 60,
  p50: 16,
  p95: 18,
  calls: 400,
  triangles: 100_000,
  geometries: 150,
  textures: 80,
  setsPerSecond: 1,
  listenerMs: 0.5,
  listeners: 12,
  walkers: 20,
  vehicles: 0,
  html: 10,
  ...extra,
})

describe('the day’s perf readings', () => {
  beforeEach(() => {
    perfDay.current = null
  })

  it('averages readings by speed and keeps the memory at the first and last', () => {
    recordPerf(sample({ fps: 60, calls: 400 }), 3, 1)
    recordPerf(sample({ fps: 50, calls: 500, geometries: 170 }), 3, 1)
    const day = recordPerf(sample({ fps: 30, geometries: 190, textures: 90 }), 3, 4, 120)
    expect(day.bySpeed.map((t) => [t.speed, t.samples])).toEqual([
      [1, 2],
      [4, 1],
    ])
    expect(day.first).toEqual({ geometries: 150, textures: 80 })
    expect(day.last).toEqual({ geometries: 190, textures: 90 })
    expect(day.heapMB).toBe(120)
    const text = perfReportText('iPhone, Chrome, busy day', day)
    expect(text).toContain(
      '| iPhone, Chrome, busy day | 1× | 55.0 | 18 ms | 450 / 500 | 100k | 190 | 90 |',
    )
    expect(text).toContain('| 4× | 30.0 |')
    expect(text).toContain('Geometries 150 → 190, textures 80 → 90')
  })

  it('starts afresh on a new day', () => {
    recordPerf(sample(), 3, 1)
    const day = recordPerf(sample({ geometries: 300 }), 4, 1)
    expect(day.day).toBe(4)
    expect(day.bySpeed[0].samples).toBe(1)
    expect(day.first.geometries).toBe(300)
  })

  it('names the device and browser', () => {
    const iphoneChrome =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
    const iphoneSafari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    const ipad =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    expect(deviceLabel(iphoneChrome, 5)).toBe('iPhone, Chrome')
    expect(deviceLabel(iphoneSafari, 5)).toBe('iPhone, Safari')
    expect(deviceLabel(ipad, 5)).toBe('iPad, Safari')
    expect(deviceLabel(ipad, 0)).toBe('Desktop, Safari')
  })
})
