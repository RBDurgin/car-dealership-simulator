# Nazma's Cupcakes

**Status:** planned 2026-10-09. This is a branch experiment on `nazma-cupcakes`. It doesn't need to merge to `main`, and it doesn't need to stay compatible with `main`'s saves beyond loading them without a crash. Build one sub-phase per session and stop for Robert's review after each, as in earlier phases. It builds on everything through Phase 15b. C1 takes the next save version (v23).

## Context

In Phase 9 Nazma was the saboteur, and in Phase 14 he opened a rival dealership across the road. In this variation Nazma has moved on: his lot is now a cupcake shop called **Nazma's**. He is a friendly neighbour and no longer sabotages anyone. His coworker at the shop, **Jaguar** (he/him), has it in for your dealership and does everything Nazma used to do: smudging cars, stealing one overnight now and then, and poaching staff. Both of them ride motorcycles.

**Decisions made with Robert (2026-10-09):**

- **The rivalry is retired.** The cupcake shop doesn't sell cars. That removes market share, customers carrying his quote, **Match his price**, weekly moves, going bust and reopening, `rivalsBeaten`, the share chip and the rival difficulty levers.
- **This is a branch experiment.** It's a permanent change on this branch, with no mode toggle. Old saves load, and the rival state is dropped.
- **The shop is there from day 1, and Jaguar starts on day 4.** Jaguar takes over Phase 9's schedule (first visit `firstNazmaDay`, now `firstJaguarDay`; thefts from day 6). The level's chances are unchanged. The sabotage no longer depends on any desperation.
- **Nazma is scenery plus friendly visits.** He rides over now and then to chat and wave. He has no gameplay effect and can't be confronted.
- **Stolen cars and poached staff are just gone**, as in Phase 9. The summary says Jaguar took them.
- **Motorcycles: ride in, park, ride off.** Jaguar rides in along the road, parks, walks onto the lot, and rides off when he's done or run off. Nazma rides between his shop and the road. The bike is procedural low-poly, since there's no bike model in `public/models`.
- **The Rival tab becomes a Nazma's tab** (key K). It shows the shop, today's special and Jaguar's track record.

## What goes, what stays

| Today                                                                                                                                                            | After                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `sim/rival.ts` (market share, quotes, moves, bust, `rivalMorning`/`rivalDay`, `sabotageScale`)                                                                   | Deleted. A small `sim/sabotage.ts` keeps the saved `SabotageRecord`                                                                 |
| `Customer.rivalQuote`, `assignQuotes`, `quoteRng`, `quoteFor`, `matchAsk`, `overQuote`, `QUOTE_WALK`, `MATCH_BONUS`, `staffAsk`'s `quote`, walk reason `'rival'` | Deleted. `quoteRng` was its own stream, so the rest of the day plays as before                                                      |
| `Word.scale × (1 − share) × bustBoost`, `trafficBoost(… × blitzScale)`                                                                                           | Back to Phase 13's arrivals                                                                                                         |
| `visitOdds(level, sabotage)`, `planVisit(…, poachChance × sabotage)`, `theftNightAfter(day, rival.lastTheftDay, chance × sabotage)`                              | The level's odds only. `lastTheftDay` moves to `SabotageRecord`                                                                     |
| `NazmaStats.rival`/`joined`, `rivalStole`, `rivalHired`, `theftNotice(…, rival)`                                                                                 | Deleted. Quitters just leave                                                                                                        |
| `Tuning.rivalStrength`/`rivalUndercut`/`rivalComeback`                                                                                                           | Deleted                                                                                                                             |
| `Career.rivalsBeaten`, its `fanfare` in `sfxFor`, the win screen line                                                                                            | Deleted                                                                                                                             |
| `DayStats.rival`, `RivalChip`, the `office-badge` share                                                                                                          | Deleted                                                                                                                             |
| Tips `rivalQuote`, `rivalOpens`, `rivalBust`                                                                                                                     | Deleted. Tip `nazma` becomes `jaguar` (C2). New tip `cupcakes` (C3)                                                                 |
| `scene/RivalLot.tsx`                                                                                                                                             | Becomes `scene/CupcakeShop.tsx` (C3). It reuses the same world-space, off-grid, shared-material, no-shadow, canvas-texture approach |
| `RIVAL_CROSSING`/`RIVAL_GATE` (`sim/layout.ts`)                                                                                                                  | Renamed `SHOP_CROSSING`/`SHOP_GATE`, used by Nazma (C3) and the motorcycle routes (C4)                                              |
| `ui/RivalTab.tsx`, `computerTab` `'rival'`, the computer's `rival` action, key K                                                                                 | `ui/NazmasTab.tsx`, `'nazmas'`, action `nazmas` (C5)                                                                                |
| Phase 9 sabotage (`sim/nazma.ts`, `scene/Nazma.tsx`, `confront`, the guard)                                                                                      | Moved to Jaguar (C2)                                                                                                                |

## Sub-phases

### C1: Retire the rival dealership (pure, store, save)

- Delete `sim/rival.ts`, `rival.test.ts`, `store.rival.test.ts` and `store.quotes.test.ts`. Remove everything in the table above from `store.ts`, `negotiation.ts`, `customers.ts`, `chatter.ts` (the quote grumble; drop `ChatterState.inventory` if nothing else reads it), `sfxEvents.ts`, `tips.ts`, `difficulty.ts`, `progression.ts`, `staffAi.ts`/`scene/Staff.tsx` (`staffAsk` call sites), `ui/CustomerPanel.tsx` (the quote badge and **Match his price**), `ui/TopBar.tsx`, `ui/HUD.tsx`, `ui/WinScreen.tsx`, `ui/DaySummary.tsx` and `ui/StockPanel.tsx` (the Rival tab button). Delete `ui/RivalTab.tsx` and `scene/RivalLot.tsx`. The space across the road stays empty until C3.
- New `sim/sabotage.ts` (pure, tested):
  - `SabotageRecord`: `lastTheftDay`, plus lifetime tallies `visits`, `runOffByYou`, `runOffByGuard`, `smudged`, `stolen`, `poached`, `kept`.
  - `emptySabotage()`.
  - `addSabotageDay(record, stats: NazmaStats)`, called in `settleDay` (the tallies feed the C5 tab).
  - `isSabotageRecord`, for the save.
- Store: `sabotage: SabotageRecord` replaces `rival`. `beginDay` checks `theftNightAfter(day, sabotage.lastTheftDay, level chance)` and stamps `lastTheftDay`. `theftNotice(theft)` loses the rival argument.
- Save v23 (`UPGRADES` step):
  - `sabotage.lastTheftDay` comes from `rival.lastTheftDay`, or from `lastTheftNight(day − 1, chance)` when it's missing. The tallies start at 0.
  - Delete `rival` and `career.rivalsBeaten`.
  - Test that a v22 save with the rival `open` loads, and that reloading never repeats a theft.
- Help: remove the Rival sections from `ui/HowToPlay.tsx` (Business, Selling, People) and K from `ui/controls.ts`.
- `UPDATES` entry: "Nazma's lot across the road has closed. Shoppers no longer go to him, and nobody brings his prices."

### C2: Jaguar takes over the sabotage

- Rename `sim/nazma.ts` → `sim/jaguar.ts`, and `scene/Nazma.tsx` → `scene/Jaguar.tsx`:
  - Constants: `NAZMA_ID` → `JAGUAR_ID`, `NAZMA_VARIANT` → `JAGUAR_VARIANT` (a different model from Nazma's `male-e`, such as `male-c`, with a leather-jacket tint), `FIRST_NAZMA_DAY` → `FIRST_JAGUAR_DAY`.
  - Types and functions: `NazmaVisit`/`NazmaStats`/`isNazmaDay`/`nazmaSummary` → `Jaguar…`.
  - Store: `nazma` → `jaguar`, and the actions `nazmaArrived`/`Smudge`/`Chat`/`Poach`/`RunOff`/`Left` → `jaguar…`. `DayStats.nazma` → `DayStats.jaguar`, and `Tuning.nazmaChance`/`firstNazmaDay` → `jaguarChance`/`firstJaguarDay`.
  - The interactable kind `'nazma'` → `'jaguar'`, with `confrontBlocker`'s text ("Jaguar isn't here."). Also `staffAi`'s guard context `nazma` → `jaguar`, `chatter` (the `poach` conversation and the run-off grumble), `sfxEvents` (the `shoo` subject) and `tips` (`nazma` → `jaguar`).
  - Seeds stay the same (`NAZMA_SEED` keeps its value under a new name), so day rolls don't shift.
  - Rename the test files with them: `nazma.test.ts`, `store.nazma.test.ts`.
- Text: every player-facing "Nazma" in sabotage notices, the summary line and the poach notice becomes "Jaguar" ("Jaguar made them an offer"). The day-4 intro reads: "That's Jaguar. He works at Nazma's cupcake shop across the road, but this is all his own idea: he has it in for the place. Click him to run him off!"
- Until C4, Jaguar walks in along the sidewalk, as Phase 9 Nazma did. Remove the rival-crossing branch from the scene.
- Help: Basics, People and Controls tabs, and the `jaguar` tip text.
- `UPDATES` entry: "Meet Jaguar: he smudges cars, steals one overnight now and then and poaches staff. Confront him or hire a guard."

### C3: Nazma's cupcake shop and his friendly visits

- `scene/CupcakeShop.tsx` (rebuilt from the deleted `RivalLot.tsx`'s approach). It's world-space scenery south of `GRID_HEIGHT`, shown from day 1:
  - A pastel shopfront with a striped awning and a giant cupcake on the roof.
  - A "Nazma's" sign as a canvas texture.
  - Two café tables, and a spot out front where the bikes park (C4).
  - No tiles, no pointer handlers, no shadows, shared materials.
- New `sim/nazma.ts` (pure, tested): Nazma the neighbour.
  - `isNazmaVisitDay(day)`: a seeded roll (about 30%), never on a Jaguar day, so `confront` is never ambiguous.
  - `planNazmaVisit(rng, roster)`: an `arrivalMinute` and 1–2 stops: the player, an employee at their post, or the coffee machine.
  - `NazmaVisit` (`coming`/`onLot`/`done`, `progress`), kept as the store's `nazma`, rebuilt in `beginDay` and never saved.
  - The store actions `nazmaArrived`/`nazmaStop`/`nazmaLeft` only move his visit along. He changes no money, patience or stats.
- `scene/Nazma.tsx`: he walks from `SHOP_GATE` across the road to `SHOP_CROSSING` and onto the lot (until C4 adds his bike), with an apron tint on `male-e`. At each stop he waves and chats. His position goes in `runtime.ambientPos`, and he doesn't block the crowd.
- Chatter: a `chat` conversation kind (`conversationsOf`) between `NAZMA_ID` and the person he stops at, in happy and greeting tones, plus a greeting line in `reactionsFor` on arrival. No `confront` action targets him.
- Notice on his first visit: "Nazma from the cupcake shop across the road popped over to say hi." Tip `cupcakes` on day 1, pointing at the shop and saying Nazma is friendly.
- Help: Basics, a short Neighbours section (Nazma is friendly; Jaguar isn't).
- `UPDATES` entry: "Nazma's is now a cupcake shop across the road, and Nazma drops by to say hello."

### C4: Motorcycles

- New `sim/riding.ts` (pure, tested), modelled on `sim/driving.ts`'s `Leg` and `smoothCorners`:
  - `BIKE_BAYS`: Jaguar's on the road's south shoulder, outside both `LANE`s so it never blocks a driven car, and Nazma's in front of his shop.
  - `jaguarRideIn(from: RoadEnd)` and `jaguarRideOut(to)`: the far or near lane to his bay.
  - `nazmaRide(out | home)`: from the shop out front across the road to the shoulder by `SHOP_CROSSING`, and back.
  - `pickRoadEnd(day)`: seeded.
- `scene/Motorcycle.tsx`: a procedural low-poly bike (two wheels, frame, tank, seat, bars) with shared materials, `castShadow` off, and wheels turned in `useFrame`. The rider sits on it in a riding pose (reuse an idle or sit clip through the `anim` ref) and wears a helmet mesh.
- `scene/Jaguar.tsx`:
  - Stages `ride-in` → `parked` (he dismounts and walks the lot as now) → `ride-out`.
  - When he's run off he runs to his bike (`RUN_FACTOR`) and rides off quickly. When he's done he walks back and rides off.
  - The store's `jaguarArrived` still fires as he steps onto the lot, and `jaguarLeft` once his bike is off the map, so the store doesn't change.
  - Bike positions go in `runtime.vehiclePos` (under ids `bike:jaguar` and `bike:nazma`). A moving bike counts in `blockedAhead`'s others, so driven cars yield to it and it yields to them.
- `scene/Nazma.tsx` uses his bike the same way. When he's not visiting, his bike sits parked outside the shop as scenery.
- Sound: a synthesized `motorbike` `SfxCue` (higher and buzzier than `engine`), played on the ride-in and ride-out stage changes with an `ambient` subject. That needs a `VOLUME` level in `audio/sfxBridge.ts` and a credit line ("synthesized") in `public/audio/LICENSE.md`.
- `UPDATES` entry: "Nazma and Jaguar ride motorcycles. Listen for Jaguar's bike."

### C5: The Nazma's tab (key K)

- `ui/NazmasTab.tsx`: `computerTab` `'nazmas'`, key K, or the office computer's new `nazmas` action (label "Nazma's", verb "Checking on the cupcake shop"). It shows:
  - The shop: a canvas-free card with name, hours and a line about Nazma.
  - Today's special: `specialOf(day)`, seeded from `CUPCAKE_FLAVOURS` in `sim/nazma.ts` and tested.
  - Jaguar's record from the store's `sabotage` tallies: visits, run off by you or by your guard, cars smudged, cars stolen, staff poached and kept.
- Help: Controls (K) in `ui/controls.ts`, and Basics in `ui/HowToPlay.tsx`.
- `UPDATES` entry: "The office computer has a Nazma's tab (K): today's cupcake special and Jaguar's track record."

## Performance

- The cupcake shop costs about as many draw calls as the old rival lot did. Two bikes add a handful of meshes each, and they're only drawn while they're in view.
- Nothing new runs in the store per frame. Bike motion lives in `useFrame` and refs, as `DrivenCar` does.
- Check `?fps` and draw calls with the shop and a bike in view.

## Help and conventions (every sub-phase)

- `ui/HowToPlay.tsx` and `ui/controls.ts` describe only what's built.
- Each sub-phase adds one `UPDATES` entry in `sim/whatsNew.ts` with `phase: 'C'` (shown as "Phase C"), and never edits a shipped one.
- Each sub-phase updates this branch's `CLAUDE.md` bullet for the plan as it lands.

## Verification (each sub-phase)

- `npm test`:
  - C1: the save upgrade (v22 with the rival open loads, no `rival`, `lastTheftDay` carried over), traffic matching Phase 13 (no share term), `respondToAsk` with no quote reason, and `difficulty.test.ts` without the rival levers.
  - C2: the renamed Jaguar tests pass with the same seeds and outcomes.
  - C3: `nazma.test.ts` (never on a Jaguar day, deterministic plan), and chatter's `chat` conversation.
  - C4: `riding.test.ts` (routes stay off the lanes when parked, and the ends are off the map).
  - C5: `specialOf`, and the sabotage tallies through `settleDay`.
- `npm run lint`, `npm run build`, `npm run e2e`.
- `npm run dev` / `/run`: load an old save with the rival open (no crash, no lot). See Jaguar on day 4, confront him, and watch him ride off. Watch Nazma ride over, chat and ride home. Open K.
