import { useState } from 'react'
import { PERF_BUSY, perfDay } from '../state/perf'
import { deviceLabel, perfReportText } from './perfText'

/**
 * With `?perf`, the end-of-day summary shows the day's overlay readings as
 * rows ready to paste into `docs/PERF.md`'s device table, with a Copy
 * button, so a phone's numbers can be sent without a console.
 */
export default function PerfReport() {
  const [copied, setCopied] = useState(false)
  const day = perfDay.current
  if (!day || day.bySpeed.length === 0) return null
  const where = `${deviceLabel()}, ${PERF_BUSY ? 'busy day' : `day ${day.day}`}`
  const text = perfReportText(where, day)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }
  return (
    <div className="perf-report">
      <div className="info-kicker">Perf readings for docs/PERF.md</div>
      <pre>{text}</pre>
      <button type="button" className="btn btn-small" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
