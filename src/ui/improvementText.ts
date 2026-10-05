import { IMPROVEMENTS, type ImprovementId } from '../sim/improvements'

const pct = (x: number) => Math.round(x * 100)

/** What an improvement does, e.g. "+5% of passers-by walk in · +4 passers-by a day". */
export function effectLabel(id: ImprovementId): string {
  const e = IMPROVEMENTS[id].effects
  const parts = [
    e.walkInChance && `+${pct(e.walkInChance)}% of passers-by walk in`,
    e.passersBy && `+${e.passersBy} passers-by a day`,
    e.expectCut && `customers hope for ${pct(e.expectCut)}% less off`,
    e.acceptBonus && `+${pct(e.acceptBonus)}% chance of a yes`,
    e.patienceSaved && `waiting customers lose patience ${pct(e.patienceSaved)}% slower`,
  ]
  return parts.filter(Boolean).join(' · ')
}
