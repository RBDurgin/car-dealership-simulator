import { PERF_REFRESH_S, type PerfDay, type SpeedTotals } from '../state/perf'

/** "iPhone, Chrome": the device and browser, for the row's first cell. */
export function deviceLabel(
  ua = navigator.userAgent,
  touchPoints = navigator.maxTouchPoints,
): string {
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : 'Desktop'
  const browser = /CriOS|Chrome/.test(ua)
    ? 'Chrome'
    : /FxiOS|Firefox/.test(ua)
      ? 'Firefox'
      : /Safari/.test(ua)
        ? 'Safari'
        : 'browser'
  return `${device}, ${browser}`
}

const fixed = (n: number, places: number) => n.toFixed(places)

/** One `docs/PERF.md` table row for the day's readings at one speed. */
export function perfRow(where: string, day: PerfDay, t: SpeedTotals): string {
  const mean = (sum: number) => sum / t.samples
  const cells = [
    where,
    `${t.speed}×`,
    fixed(mean(t.fps), 1),
    `${fixed(mean(t.p95), 0)} ms`,
    `${Math.round(mean(t.calls))} / ${t.maxCalls}`,
    `${Math.round(mean(t.triangles) / 1000)}k`,
    String(day.last.geometries),
    String(day.last.textures),
    fixed(mean(t.setsPerSecond), 1),
    fixed(mean(t.listenerMs), 2),
    String(Math.round(mean(t.walkers))),
    String(Math.round(mean(t.html))),
    day.heapMB === null ? '' : `${Math.round(day.heapMB)} MB`,
  ]
  return `| ${cells.join(' | ')} |`
}

/** The whole report: a row per speed played, then whether memory climbed. */
export function perfReportText(where: string, day: PerfDay): string {
  const rows = day.bySpeed.map((t) => perfRow(where, day, t))
  const minutes = (day.bySpeed.reduce((a, t) => a + t.samples, 0) * PERF_REFRESH_S) / 60
  return [
    ...rows,
    '',
    `Geometries ${day.first.geometries} → ${day.last.geometries}, ` +
      `textures ${day.first.textures} → ${day.last.textures} over the day ` +
      `(${fixed(minutes, 1)} min of readings).`,
  ].join('\n')
}
