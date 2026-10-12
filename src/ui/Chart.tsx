import { useState, type PointerEvent } from 'react'
import type { Point } from '../sim/stats'

/** The drawing's own units; the SVG scales to the panel's width. */
const W = 340
const H = 140
const LEFT = 40
const RIGHT = 6
const TOP = 8
const BOTTOM = 8
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = H - TOP - BOTTOM

/** Rounded top (or bottom, below zero) on a bar from `y0` to `y1`, at most 4 units. */
function barPath(x: number, w: number, base: number, end: number): string {
  const h = Math.abs(end - base)
  const r = Math.min(2, w / 2, h)
  const up = end < base
  const tip = end
  const dir = up ? 1 : -1
  return [
    `M${x},${base}`,
    `V${tip + dir * r}`,
    `Q${x},${tip} ${x + r},${tip}`,
    `H${x + w - r}`,
    `Q${x + w},${tip} ${x + w},${tip + dir * r}`,
    `V${base}`,
    'Z',
  ].join(' ')
}

/** Lowest and highest value the axis shows: bars always include zero, a flat line gets room. */
function domain(values: number[], bars: boolean): [number, number] {
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (bars) {
    lo = Math.min(0, lo)
    hi = Math.max(0, hi)
  }
  if (hi === lo) {
    hi += 1
    if (!bars) lo -= 1
  }
  if (!bars) {
    const pad = (hi - lo) * 0.08
    return [lo - pad, hi + pad]
  }
  return [lo, hi]
}

/**
 * A small chart for the Stats tab: bars for amounts (negatives hang below the
 * zero line) or a line for levels. Hover or tap picks a point for the readout,
 * which starts on the latest.
 */
export function Chart({
  points,
  kind,
  format,
  axisFormat,
  label,
}: {
  points: Point[]
  kind: 'bar' | 'line'
  /** The readout's value, in full. */
  format: (v: number) => string
  /** The axis' highest and lowest values, kept short. */
  axisFormat: (v: number) => string
  /** What is charted, for screen readers. */
  label: string
}) {
  const [picked, setPicked] = useState<number | null>(null)
  if (points.length === 0) return null
  const bars = kind === 'bar'
  const values = points.map((p) => p.value)
  const [lo, hi] = domain(values, bars)
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * PLOT_H
  const slot = PLOT_W / points.length
  const x = (i: number) => LEFT + slot * i + slot / 2
  const index = picked !== null && picked < points.length ? picked : points.length - 1
  const at = points[index]
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const unit = ((e.clientX - box.left) / box.width) * W
    const i = Math.floor((unit - LEFT) / slot)
    setPicked(Math.max(0, Math.min(points.length - 1, i)))
  }
  const zero = y(0)
  // A 2-unit gap between bars, thinner bars when there are many.
  const barW = Math.max(1, Math.min(slot - 2, 18))
  return (
    <figure className="stats-chart">
      <figcaption className="stats-chart-readout" aria-live="polite">
        <span className="muted">{at.label}</span>{' '}
        <b className={at.value < 0 ? 'stats-negative' : undefined}>{format(at.value)}</b>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        onPointerMove={(e) => e.pointerType === 'mouse' && pick(e)}
        onPointerDown={pick}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setPicked(null)}
      >
        <text className="chart-axis-label" x={LEFT - 4} y={TOP + 4}>
          {axisFormat(hi)}
        </text>
        <text className="chart-axis-label" x={LEFT - 4} y={TOP + PLOT_H}>
          {axisFormat(lo)}
        </text>
        <line className="chart-guide" x1={x(index)} x2={x(index)} y1={TOP} y2={TOP + PLOT_H} />
        {bars ? (
          <>
            {points.map((p, i) =>
              p.value === 0 ? null : (
                <path
                  key={p.day}
                  className={p.value < 0 ? 'chart-bar chart-bar-negative' : 'chart-bar'}
                  d={barPath(x(i) - barW / 2, barW, zero, y(p.value))}
                  opacity={i === index ? 1 : 0.75}
                />
              ),
            )}
            <line className="chart-zero" x1={LEFT} x2={W - RIGHT} y1={zero} y2={zero} />
          </>
        ) : (
          <>
            <line
              className="chart-zero"
              x1={LEFT}
              x2={W - RIGHT}
              y1={TOP + PLOT_H}
              y2={TOP + PLOT_H}
            />
            <polyline
              className="chart-line"
              points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
            />
            <circle className="chart-dot" cx={x(index)} cy={y(at.value)} r={4} />
          </>
        )}
      </svg>
      <div className="stats-chart-ends muted">
        <span>{points[0].label}</span>
        {points.length > 1 && <span>{points[points.length - 1].label}</span>}
      </div>
    </figure>
  )
}
