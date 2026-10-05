# Phase 7 Plan — Marketing and improvements

**Status:** 7a done 2026-10-05, awaiting review. We do one sub-phase per session and stop for Robert's review after each, the same as earlier phases.

## Context

SPEC Phase 7: spend money on marketing and improvements to raise the chance customers visit; improvements can also support higher prices. Examples: newspaper ads, TV ads, larger sign, wacky inflatable tube man; waiting room TV, upgraded sofa/chairs, showroom improvements.

Phases 5–6 gave us a real P&L (cost, gross, wages, floor plan) and haggling. That lets us judge marketing on ROI, and improvements can raise prices through haggling instead of a flat markup.

**Decisions made with Robert (2026-10-05):**

- **Ads are timed campaigns.** You pay up front for an N-day run. Traffic rises while it runs and stops when it ends.
- **Improvements raise prices by making customers haggle less.** They lower `expect` and add a small accept bonus. There is no markup above MSRP.
- **Improvements go in fixed spots** in the layout. You buy one at the computer and it appears. No build mode.
- **Reputation comes last** (7d), once marketing and improvements work.

## Levers that already exist

| Lever | Where | Phase 7 use |
|---|---|---|
| Planned visitors `VISITORS_PER_DAY` 4–7 | `sim/spawner.ts` `planArrivals` (called in `beginDay`, `state/store.ts:509`) | Campaigns add planned arrivals |
| Passers-by 18–26/day, `WALK_IN_CHANCE` 0.15 | `sim/pedestrians.ts` `planPedestrians` (planned in `scene/Pedestrians.tsx:121`, outside the store) | Sign / tube man raise walk-in chance and the passer-by count; pass in owned upgrades |
| Archetype mix `pickArchetype` | `sim/archetypes.ts` | Each channel skews who comes |
| Haggle `expect` 2–8% | `archetypes.ts`, `negotiation.ts` `hopePrice` | Showroom upgrades shave `expect` |
| `acceptChance(..., bonus)` | `sim/customers.ts:281` | Small comfort bonus |
| `patience` / `patienceLeft` | `sim/customers.ts` `generateCustomer`, `tick` | Waiting room slows patience loss |
| `DayStats`, `netIncome` | `sim/deal.ts:267`, `settleDay` (`store.ts:336`) | Marketing spend line, visitors by source |
| Office computer → `StockPanel` | `ui/StockPanel.tsx`, `sim/interactables.ts` | Add Marketing and Upgrades tabs |
| Existing props `sign`, `lounge-sofa`, `tableCoffeeSquare` | `sim/layout.ts:284,330` | Upgrade tiers swap these models |
| Save v4 + `UPGRADES` chain | `sim/save.ts` | v5: owned upgrades, running campaigns |

## Sub-phases

### 7a: Marketing campaigns

- `sim/marketing.ts` (pure, tested). `CHANNELS` has newspaper, radio, TV and online. Each has a cost, a run length in days, extra visitors per day, and an archetype skew: newspaper brings more bargain hunters, TV more decisive buyers, online younger couples.
  - `Campaign { channel, startDay, endDay }`, `activeCampaigns(day)`, and `trafficBoost(campaigns, day)` → `{ extraVisitors, archetypeWeights }`. Running the same channel twice has diminishing returns.
- `planArrivals(rng, boost)` adds the extra visitors. `pickArchetype(rng, weights?)` takes the skew. `Customer.source: 'walk-in' | 'regular' | Channel` records where they came from.
- Store: `campaigns` and `launchCampaign(channel)`, which pays cash up front (not allowed when cash is short). `DayStats.marketing` holds the spend, and `netIncome` subtracts it.
- UI: a Marketing tab in the computer panel (active runs and days left). The day summary gets a marketing line and a visitors/sales-by-source table for ROI.
- Save v5: `campaigns`, with an `UPGRADES[4]` step that adds `campaigns: []`.
- Update the help (`ui/HowToPlay.tsx`, `ui/controls.ts`).

### 7b: Outdoor improvements

- `sim/improvements.ts` (pure). `IMPROVEMENTS` is a catalogue with id, cost, slot, prerequisite tier and effects. An `Effects` sum covers walk-in chance, passers-by, `expect` delta, accept bonus and patience rate. `effectsOf(owned)`.
- Larger sign (2 tiers, replaces the `sign` prop) and wacky inflatable tube man. The tube man is a procedural flailing mesh in `scene/`, animated in `useFrame` (no store updates). Both raise `WALK_IN_CHANCE`, and the tube man also adds passers-by.
- `planPedestrians(rng, day, effects)`: the scene reads owned upgrades from the store once per day.
- Store: `improvements: string[]` and `buyImprovement(id)`. Upgrades tab in the computer panel. Save adds `improvements`.

### 7c: Indoor improvements

- Waiting room: TV and an upgraded sofa (replaces `loungeSofa`), plus a coffee bar. These slow patience loss while waiting or queued, as a multiplier in `tick`.
- Showroom: new flooring, lighting and a display platform upgrade. Each lowers `expect` a little (floored at 0) and adds a small `acceptChance` bonus, capped so upgrades can't remove haggling entirely.
- Props swap in at fixed spots in `layout.ts`. Check walls, crowd and pathing still pass their tests.

### 7d: Reputation and referrals

- `sim/reputation.ts`: a 0–100 score, updated in `settleDay` from happy buyers, unhappy walkouts, impatient leavers and `missed`.
- Reputation scales the base `VISITORS_PER_DAY` and adds referral arrivals (`source: 'referral'`). It also multiplies campaign effect, so ads work better with a good name.
- HUD reputation meter, a change line in the summary, and the owner can set a reputation goal. Save adds `reputation`.

## Verification (each sub-phase)

- `npm test`: new `marketing.test.ts`, `improvements.test.ts`, `reputation.test.ts`, plus store tests for buying and charging and save upgrade tests (a v4 save loads into v5).
- `npm run lint`, `npm run build`.
- `npm run dev` / `/run`: buy a campaign or upgrade, then skip days. Check the visitor count, the summary lines, that props appear, and that a resumed save keeps them.
