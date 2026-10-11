import { expect, test } from 'vitest'
import type { Difficulty } from '../../sim/difficulty'
import { createSave, parseSave } from '../../sim/save'
import { useGame } from '../store'
import { playDay } from './bot'

/**
 * The long-game bench (`npm run bench`, not part of `npm test`): plays 500
 * days headless on Medium and Hard with `bot.ts`, and reports ms per day
 * (early, middle and late, which should stay flat), ms per `tickClock`, and
 * the save's size and `createSave`/`parseSave` times at the end. The numbers
 * go in `docs/PERF.md`; each run prints them as JSON.
 */

const DAYS = 500
/** Days averaged at the start, middle and end of the run. */
const WINDOW = 50

const initial = useGame.getState()
const game = () => useGame.getState()

const avg = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const pct = (xs: readonly number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
}
const round = (n: number, places = 3) => Number(n.toFixed(places))

interface Run {
  level: Difficulty
  days: number
  totalSeconds: number
  msPerDay: {
    first: number
    middle: number
    last: number
    p95: number
    max: number
    slowestDay: number
  }
  msPerTick: { mean: number; p95: number; max: number }
  /** What the bot got done, so a run that stalled shows. */
  played: {
    sales: number
    visitors: number
    clients: number
    logDays: number
    cash: number
    rank: string
    expansions: number
  }
  save: { bytes: number; createMs: number; parseMs: number }
}

/** Times `fn` over a few runs and gives the mean, after one to warm up. */
function timeIt(fn: () => void, runs = 10): number {
  fn()
  const t = performance.now()
  for (let i = 0; i < runs; i++) fn()
  return (performance.now() - t) / runs
}

type State = ReturnType<typeof game>

function playGame(level: Difficulty): { run: Run; state: State; saveText: string } {
  useGame.setState(initial, true)
  game().newGame(level)
  const dayMs: number[] = []
  const tickMs: number[] = []
  const start = performance.now()
  for (let d = 0; d < DAYS; d++) {
    const t = performance.now()
    playDay((ms) => tickMs.push(ms))
    game().startNextDay()
    dayMs.push(performance.now() - t)
  }
  const totalSeconds = (performance.now() - start) / 1000
  const s = game()
  const saveText = JSON.stringify(createSave(s, 0))
  const mid = Math.floor(DAYS / 2 - WINDOW / 2)
  return {
    state: s,
    saveText,
    run: {
      level,
      days: DAYS,
      totalSeconds: round(totalSeconds, 1),
      msPerDay: {
        first: round(avg(dayMs.slice(0, WINDOW)), 2),
        middle: round(avg(dayMs.slice(mid, mid + WINDOW)), 2),
        last: round(avg(dayMs.slice(-WINDOW)), 2),
        p95: round(pct(dayMs, 0.95), 2),
        max: round(Math.max(...dayMs), 2),
        slowestDay: dayMs.indexOf(Math.max(...dayMs)) + 1,
      },
      msPerTick: {
        mean: round(avg(tickMs)),
        p95: round(pct(tickMs, 0.95)),
        max: round(Math.max(...tickMs)),
      },
      played: {
        sales: s.lifetime.sales,
        visitors: s.lifetime.visitors,
        clients: s.clients.length,
        logDays: s.log.length,
        cash: Math.round(s.cash),
        rank: s.career.rank,
        expansions: s.expansions.length,
      },
      save: {
        bytes: saveText.length,
        createMs: round(timeIt(() => JSON.stringify(createSave(s, 0)))),
        parseMs: round(timeIt(() => parseSave(JSON.parse(saveText)))),
      },
    },
  }
}

// Each level's game is played once, in its test, and then the benches time
// the saves of a real day-500 game.
for (const level of ['medium', 'hard'] as const) {
  test(`${DAYS} days on ${level}`, { timeout: 300_000 }, async ({ bench }) => {
    const { run, state, saveText } = playGame(level)
    console.log(JSON.stringify(run, null, 2))
    expect(run.played.logDays).toBe(DAYS)
    expect(parseSave(JSON.parse(saveText))).not.toBeNull()
    await bench.compare(
      bench('createSave + stringify', () => {
        JSON.stringify(createSave(state, 0))
      }),
      bench('parse + parseSave', () => {
        parseSave(JSON.parse(saveText))
      }),
    )
  })
}
