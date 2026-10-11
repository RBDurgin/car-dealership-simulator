import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { perfReading, storeCounts } from '../state/perf'
import { ambientPos, customerPos, staffPos, vehiclePos } from './runtime'

/** How often the numbers are refreshed, in seconds. */
const REFRESH = 0.5
/** Frame times kept for the percentiles: about two seconds at 60 fps. */
const WINDOW = 120

const percentile = (sorted: readonly number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0

/**
 * The `?perf` overlay (lazy-loaded only with the flag, see `scene/Scene`):
 * fps and frame time, the last frame's draw calls and triangles, the
 * renderer's live geometries and textures, store sets and listener time per
 * second (`state/perf.ts`), and the walkers, cars and `<Html>` badges in the
 * world. A plain DOM label refreshed a couple of times a second, outside
 * React, so a phone can be checked without a console.
 */
export default function PerfOverlay() {
  const gl = useThree((s) => s.gl)
  const host = useThree((s) => s.events.connected as HTMLElement | null | undefined)
  const label = useRef<HTMLPreElement | null>(null)
  const frames = useRef<number[]>([])
  const since = useRef(0)
  const last = useRef({ sets: storeCounts.sets, listenerMs: storeCounts.listenerMs })

  useEffect(() => {
    const el = document.createElement('pre')
    el.className = 'perf-overlay'
    document.body.appendChild(el)
    label.current = el
    return () => {
      el.remove()
      label.current = null
      perfReading.latest = null
    }
  }, [])

  // Read before this frame renders, so the counts are the whole of the last one.
  useFrame((_, delta) => {
    const times = frames.current
    times.push(delta * 1000)
    if (times.length > WINDOW) times.shift()
    since.current += delta
    if (since.current < REFRESH || !label.current) return
    const seconds = since.current
    since.current = 0

    const sorted = [...times].sort((a, b) => a - b)
    const mean = times.reduce((a, b) => a + b, 0) / times.length
    const { calls, triangles } = gl.info.render
    const { geometries, textures } = gl.info.memory
    const sets = storeCounts.sets - last.current.sets
    const listenerMs = storeCounts.listenerMs - last.current.listenerMs
    last.current = { sets: storeCounts.sets, listenerMs: storeCounts.listenerMs }
    const s = {
      fps: Math.round(1000 / mean),
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      calls,
      triangles,
      geometries,
      textures,
      setsPerSecond: sets / seconds,
      listenerMs: listenerMs / seconds,
      listeners: storeCounts.listeners,
      walkers: customerPos.size + staffPos.size + ambientPos.size + 1,
      vehicles: vehiclePos.size,
      // drei's <Html> puts its divs in the canvas's wrapper, beside the canvas's own.
      html: host ? host.childElementCount - 1 : 0,
    }
    perfReading.latest = s
    label.current.textContent = [
      `${s.fps} fps · ${s.p50.toFixed(1)} / ${s.p95.toFixed(1)} ms (p50/p95)`,
      `${s.calls} calls · ${Math.round(s.triangles / 1000)}k tris`,
      `${s.geometries} geo · ${s.textures} tex`,
      `${s.setsPerSecond.toFixed(1)} sets/s · ${s.listenerMs.toFixed(2)} ms/s in ${s.listeners} listeners`,
      `${s.walkers} walkers · ${s.vehicles} cars · ${s.html} html`,
    ].join('\n')
  })

  return null
}
