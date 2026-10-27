import { lazy, Suspense, type ReactNode } from 'react'
import { dayOver } from '../sim/clock'
import { useGame } from '../state/store'
import { panelChunks } from './panelChunks'

const LazyHowToPlay = lazy(panelChunks.howToPlay)
const LazyAudioPanel = lazy(panelChunks.audio)
const LazyStockPanel = lazy(panelChunks.stock)
const LazyDaySummary = lazy(panelChunks.summary)
const LazyTutorialCard = lazy(panelChunks.tutorialCard)

const Loading = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={null}>{children}</Suspense>
)

// Each gate selects only whether its panel is open, as the panels themselves do (18c).

export function HowToPlay() {
  const open = useGame((s) => s.helpOpen)
  return open ? (
    <Loading>
      <LazyHowToPlay />
    </Loading>
  ) : null
}

export function AudioPanel() {
  const open = useGame((s) => s.audioOpen)
  return open ? (
    <Loading>
      <LazyAudioPanel />
    </Loading>
  ) : null
}

export function StockPanel() {
  const open = useGame((s) => s.stockOpen)
  return open ? (
    <Loading>
      <LazyStockPanel />
    </Loading>
  ) : null
}

export function TutorialCard() {
  const open = useGame((s) => s.tutorialCard !== null)
  return open ? (
    <Loading>
      <LazyTutorialCard />
    </Loading>
  ) : null
}

export function DaySummary() {
  const open = useGame(dayOver)
  return open ? (
    <Loading>
      <LazyDaySummary />
    </Loading>
  ) : null
}
