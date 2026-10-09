# Phase 13 Plan: Expansion and Progression

**Status:** planned 2026-10-07. 13a built 2026-10-07, 13b, 13c, 13d and 13e on 2026-10-08, 13f on 2026-10-09. **Phase 13 is done.** Still open: the real-phone `?fps` check (see Performance). We do one sub-phase per session and stop for Robert's review after each, as in earlier phases. This phase builds on everything through Phase 12. 13a made the save v13 and 13b v15 (12.5a took v14). 13d and 13f each add to the save and take the next save version when they're built.

## Context

The game's goal is to build a rich client base and grow revenue, but nothing grows over a long game. On day 100 you have the same lot, the same building and the same staff limits as on day 1 (`ROLE_LIMITS`: 2 salespeople). Nothing marks progress, and a run never ends. Phase 13 gives the game a spine to progress along, more to spend money on, and a win.

**Decisions made with Robert (2026-10-07):**

- **Ranks, a win, then sandbox.** Dealer ranks come from lifetime gross profit and reputation, and each rank unlocks expansions. The top rank, Dealer of the Year, shows a win screen. After that, play goes on.
- **A lot and a showroom wing.** The map widens with a fenced-off parcel to the east. Buying the parcel adds lot rows. A later wing adds display platforms, sales desks 3–4 and higher staff limits.
- **Franchise tiers tied to the quota.** The tiers are Bronze, Silver and Gold. The tier changes the invoice price, the holdback and which luxury models you can order. Missing the quota drops you a tier.

## Levers that already exist

| Lever                                                                                                           | Where                                  | Phase 13 use                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Improvements catalogue (tiers, `requires`, `installed(owned, day)`, overnight install, `improvementFootprints`) | `sim/improvements.ts`, `scene/runtime` | `sim/expansions.ts` copies it: bought in the Upgrades tab and put up overnight                           |
| `PARKING_SPACES`, `DISPLAY_CARS`, `ALL_SLOTS`, `freeSlots`                                                      | `sim/layout.ts`, `sim/ordering.ts`     | The parcel's spaces and platforms go in the same tables. `freeSlots` skips slots that aren't unlocked    |
| `WALL_RUNS`, `OPENINGS`, `ZONES`, `buildLayout`                                                                 | `sim/layout.ts`                        | `buildLayout(expansions)` paints the parcel and cuts the fence opening once it's bought                  |
| `ROLE_LIMITS`, `SALES_DESKS`                                                                                    | `sim/staff.ts`, `sim/layout.ts`        | `roleLimits(expansions)`: the wing allows 4 salespeople and 2 porters                                    |
| Quota, `holdback`, `settleDay` on the month's last day                                                          | `sim/quota.ts`                         | Moves the franchise tier, and the tier scales the holdback                                               |
| `orderCost(model, day, invoice)`                                                                                | `sim/ordering.ts`                      | Multiplies in the tier's invoice factor. `orderable(model, tier)` locks luxury models in the Stock panel |
| `reputation`, `grossProfit`, `DayStats`                                                                         | `sim/reputation.ts`, `sim/deal.ts`     | Each day adds to the `career` totals the rank is read from                                               |
| Owner goals                                                                                                     | `sim/owner.ts`                         | Already scale with `salesStaff`, so they grow with the wing                                              |
| `Tuning` / `TUNING`                                                                                             | `sim/difficulty.ts`                    | New levers `rankScale` and `franchiseSlack`, neutral on Medium                                           |
| Tips, how-to-play guide, controls                                                                               | `sim/tips.ts`, `ui/HowToPlay.tsx`      | Tips `rankUp`, `franchise` and `expansion`. A Progress section in the Business tab                       |
| Save `UPGRADES`                                                                                                 | `sim/save.ts`                          | Adds `career` (13a, v13), then `franchise` (13b), `expansions` (13d) and `won` (13f)                     |

## Sub-phases

### 13a: Ranks and career (pure + save + HUD)

- New `sim/progression.ts` (pure, tested):
  - `Career { gross, sales, days, bestMonth }`, added to in `settleDay`.
  - `RANKS`: Corner Lot → Main Street → Trusted Dealer → Regional Name → Dealer of the Year. Each rank needs a lifetime gross and a minimum reputation.
  - `rankOf(career, reputation, scale)`, and `rankProgress` for a meter.
- Store: `career`. A rank-up shows in the summary and in the next morning's notice.
- Top bar: a rank chip beside the `QuotaMeter`. The summary gets a rank progress line.
- Save v13: `career`. An older save starts it at zeros.
- Difficulty: `Tuning.rankScale` (× rank thresholds: Easy 0.75, Medium 1, Hard 1.3).

**13a implementation notes:**

- Thresholds (Medium, before `rankScale`): first guesses were Main Street $40k, Trusted Dealer $150k, Regional Name $400k and Dealer of the Year $800k; 13f retuned them (see its notes).
- A rank is kept once reached (`Career.rank`), so an expansion bought at a rank can't be stranded by a bad week. Ranks are earned in order: a reputation short of one rank holds back those above it.
- `rankScale` scales only the gross. Reputation is already scaled by `repGain`/`repLoss`.
- `bestMonth` is a month's gross profit, counted on the month's last day from `Career.monthGross`.
- No `rankUp` tip: the summary banner and morning notice already say it, and tips are Easy only.

### 13b: Franchise tier

- New `sim/franchise.ts` (pure, tested):
  - `FranchiseTier` is `bronze`, `silver` or `gold`. A new game starts at Bronze.
  - `nextTier(tier, quotaResult)`: up a tier after a month that met the target, down a tier after a month under `HOLDBACK_FLOOR`.
  - `TIER_PERKS`:
    - `invoice`: 1 / 0.98 / 0.96.
    - `holdback`: ×1 / ×1.25 / ×1.5.
    - The models you may order.
- `orderable(model, tier)`: `sedan-sports` needs Silver and `suv-luxury` needs Gold. The opening stock still has both, so day 1 looks as it does now.
- `settleDay` applies the change on the month's last day, and it's recorded in `DayStats.quota`.
- The Stock panel greys out locked models ("Silver dealers only"). The Calendar tab shows the tier.
- Saved (next save version). An older save starts with no franchise.
- Difficulty: `Tuning.franchiseSlack` (Easy: a month near the target still holds the tier).

**13b implementation notes:**

- Save v15 keeps `franchise`. "No franchise" for an older save is Bronze, whose perks are neutral, so an older game plays as before apart from the two locked models.
- `QuotaResult.tier` is `{ from, to }`. The holdback is paid at the month's tier (`from`), and `settleDay` sets the store's `franchise` to `to`. The next morning's notice says what the move brings (`tierNotice`).
- Invoice: the store's `orderInvoice(s)` is the level's factor × the tier's, used by `orderCar` and the Stock panel.
- `franchiseSlack` lowers the drop line below `HOLDBACK_FLOOR`: Easy 0.1 (drops under 70%), Medium and Hard 0. It doesn't make moving up easier.
- `placeOrder` refuses a locked model first ("Gold dealers only."); `OrderBook.tier` defaults to Bronze.
- Tip `franchise` (Easy) shows on the first tier change. The summary has a Franchise row; the Calendar tab lists the tiers and the line to move up or down.
- What's new: update 11.

### 13c: Bigger map and performance groundwork (no gameplay change)

- `GRID_WIDTH` goes from 40 to about 54. The parcel is tx 40–53, behind its own fence, with a "For sale" sign. Until it's bought, it's grass and blocked.
- The road and sidewalk extend east. `SIDEWALK_ENDS` and the pedestrians' spawn points move with them. So does the hardcoded `ROAD_EAST` in `sim/driving.ts`.
- Leave room for Phase 15's service garage: a corner of about 10×8 tiles, a service lane in front of it and a second gate in the south fence. If 13d's rows and 13e's wing don't leave that much, widen the map to about 60 instead.
- `buildLayout(expansions)`. The grid is rebuilt each morning, the same way improvement footprints are now.
- The camera's pan bounds cover the parcel.
- The performance fixes below (pathfinding and shadows).
- Done when: the game looks and plays as before, apart from the empty parcel.

**13c implementation notes:**

- **Width 60, not 54.** At 54 the parcel's inside is 13 tiles wide, which doesn't hold the wing, about 12 spaces and a 10×8 garage with its lane (about 360 tiles against 299). At 60 it's 19×23 (437 tiles). `PARCEL` is tx 40–58, tz 1–23, inside a fence on all four sides (the old east fence at tx 39 is now the dividing fence). The rough split for later is: the wing on the north side next to the building (about tx 37–48, tz 2–12), the garage in the north-east corner (about tx 49–58, tz 1–8) with its lane down the east side to a second south gate, and the lot rows in the south-west (about tx 40–55, tz 13–23). 13d, 13e and Phase 15 make the final calls.
- The grid stays centred on the world origin, so every world x moved 10 units west. Only the sun had a hardcoded position. Everything else goes through `tileToWorld`, and the camera follows the player with no pan bounds, so the parcel needed no camera change.
- The closed parcel is the zone `parcel`, which blocks like the road and is painted rough grass. So a click on it fails at once instead of searching the whole map. The For Sale sign (`forSaleSign`, drawn in `scene/Props.tsx`) is in `layout.props` only while the parcel is unbought.
- `buildLayout(expansions)` takes `ExpansionId[]` (only `east-lot` for now). With `east-lot`, the parcel turns to asphalt, the sign goes and the dividing fence opens at `PARCEL_GATE` (tx 39, tz 15–23). 13d adds the spaces and can move the gate. `Layout.areas` is the painted zone list, which `scene/Floors` now draws from.
- `scene/runtime` rebuilds the grid from the layout each morning (`resetGrid`, then the parked cars, stock and improvements go back on). For 13d: build the layout from the expansions up that day, replace `layout` in place before `resetGrid`, and give `Floors`, `Walls` and `Props` a signal to redraw, since they read `layout` once.
- **Pathfinding:** a binary heap (`OpenHeap`) with lazy deletion replaces the linear open list and the `open.includes` check. A tile is pushed again whenever its cost improves, and stale entries are skipped once the tile is closed, so no `inOpen` array is needed. The tests check path cost against a plain Dijkstra on random grids, with and without crowd surcharges. Paths can differ tile for tile on ties, but never in cost. Timings on the 60×30 map in Node on a desktop: crossing the sidewalk 0.10 ms (both versions), an open diagonal 0.26 → 0.09 ms, office to the far sidewalk end with a crowd 0.40 → 0.34 ms, and an unreachable goal 0.50 → 0.37 ms. The gain is modest at today's sizes. The real protection is that the closed parcel is blocked.
- **Shadows:** the sun and its target follow `cameraState.focus` (moved there from a ref in `CameraRig`). `snappedSunTarget` (`scene/sunFollow.ts`) rounds the target to whole shadow-map texels in the light's own axes, so shadows don't shimmer as the camera eases. The frustum is still ±30.
- No What's new entry and no help changes: nothing the player can do has changed.

### 13d: Lot expansion

- Save, next version: `expansions` (`{ id, day }[]`). An older save starts with none.
- New `sim/expansions.ts`, modelled on improvements:
  - `EXPANSIONS`:
    - `east-lot`: about $60k, needs Main Street.
    - `showroom-wing`: about $150k, needs Regional Name and the lot.
  - `buyExpansion` mirrors `buyImprovement`. `installed(owned, day)` puts it up overnight.
- The lot adds about 12 spaces in 3 rows, and the east fence opens.
- `ALL_SLOTS` and `freeSlots` gate slots on `slotUnlocked`.
- Existing systems cover the new ground:
  - `GUARD_PATROL_TILES` gains a stop.
  - The porter's standby tiles stay where they are.
  - Nazma's theft and smudging reach the new spaces with no new code. Test that they do.
- The Upgrades tab gets an Expansion section, locked by rank with the reason shown.

**13d implementation notes:**

- Save v16 keeps `expansions` (`OwnedExpansion[]`); an older save starts with none. `sim/expansions.ts` has `EXPANSIONS` (only `east-lot` so far, $60k from Main Street; the wing joins it in 13e), `installedExpansions(owned, day)`, `expansionBlocker`/`buyExpansion` (already bought, then the rank, then `requires`, then cash), and `unlockedBy(prev, next)` for the tip.
- **Two rows of six, not three rows.** Spaces are 2×4 like the front rows, so three rows plus aisles don't fit in tz 13–23. The front row is tx 41–52, tz 20–23 (noses to the street), and the second faces it from tz 14–17 (noses north), with the aisle between. The spaces stay south of tz 13 (the wing) and west of tx 53 (the service lane). They are in `PARKING_SPACES` (indices 27–38) with `requires: 'east-lot'`; `spaceOpen(index, expansions)` and `slotUnlocked`/`openSlots` gate them, and `freeSlots` takes the expansions up as a 4th argument, so they fill after the old lot's.
- Books (`OrderBook`, `BuyBook`) extend `Grounds` (`expansions` and `clock`, both on the store), read through `expansionsUp`, so the store passes `s` as before. Ground bought today isn't open until tomorrow, for orders as well.
- **The quota doesn't grow** with the lot: `monthlyQuota` takes `BASE_SLOTS` (the 30 a new game has), not every slot. Otherwise the clamp would push it to the 20 maximum as soon as the lot was bought. Revisit in 13f.
- The spend is `DayStats.expansions`, off `netIncome` and its own summary row, like improvements.
- The guard's patrol is `patrolTiles(expansions)`: one more stop in the east lot's aisle (tx 47, tz 18), passed to `nextGuardTask` as `patrol`. The porter's standby stays put.
- `scene/runtime` rebuilds `layout` in place when the expansions up change (`regrounded`, then `resetGrid`). `useGround()` (in `scene/useUpNow.ts`) re-renders `Floors` (stripes only on open spaces), `Props` (the sign comes down) and `Walls` (remounted by key, so the fence's instance counts are rebuilt).
- Nazma's smudging and theft need no change: both pick from lot cars, which include the east lot's (tested in `expansions.test.ts`).
- Tip `expansion` (Easy) when a rank-up makes one buyable. What's new: update 12. Help: an Expansion part under Progress in the Business tab.

### 13e: Showroom wing

- A wing on the parcel's north side, joined to the building through a door in the east wall. It holds 2 more platforms (`DISPLAY_CARS`), sales desks 3–4 (`SALES_DESKS`) and a second lounge sofa.
- `roleLimits(expansions)`: 4 salespeople and 2 porters.
- `nextSalesTask` and `nextPorterTask` already handle any number of staff. Check that desks are handed out to the new chairs.
- The performance check below runs here, with everything built.

**13e implementation notes:**

- `showroom-wing` is $150k from Regional Name and needs the east lot. No save change: `expansions` already holds it (v16).
- **The wing is `WING` (tx 37–48, tz 2–13, walls included)**, its glass front in line with the building's at tz 13 and its east wall at tx 48, leaving tx 49–58 for the garage. `buildLayout` paints it `showroom`, adds its walls (`WING_WALLS`), clears the old dividing fence inside it and cuts two doors (`WING_OPENINGS`): one from the lounge's south-east corner (tx 36, tz 12) and a 2-wide front door at tx 37–38 onto the apron by the gate.
- **The lounge door is in the corner, not the middle of the east wall**, because the coffee bar upgrade fills tx 35, tz 10–11 and the counters tz 9. The lounge plant stood in that corner, so with the wing up it moves to tx 30, tz 9 (only then; the lounge looks the same before).
- Inside: the second sofa (`wing-sofa`) in the north-west corner, platforms 3–4 (`PLATFORMS`, with `requires: 'showroom-wing'`) along the north wall, sales desks 3–4 in front of them and two plants. `DISPLAY_CARS` is now the opening stock by platform index (like `LOT_CARS`), and `PLATFORMS` the platforms (like `PARKING_SPACES`). `platformOpen`/`slotUnlocked` gate them, so `freeSlots` fills the wing's platforms before any lot space once it's up. `BASE_SLOTS` is still 30.
- `SALES_DESKS` has 4 desks (3–4 `requires` the wing); `salesDesks(expansions)` is those standing. `salesDeskOf`, `postChairId`, `leadChoice` and `SalesContext` take the expansions up, so a let-go third salesperson still has no desk without the wing.
- `roleLimits(expansions)`: 4 salespeople and 2 porters with the wing (`canHire` takes the expansions up; the store and the Staff panel pass `expansionsUp`). Plural messages are proper plurals now ("2 lot porters").
- Two porters used to pick the same car. `PorterContext.taken` is what the others are washing (`washesBesides` in `scene/Staff`).
- The scene reads chairs and sofas from the live `layout.props` (`scene/Staff`, `scene/Customers`), and `scene/runtime` holds the new desks' approach tiles (`holdSeats`) when the layout is rebuilt. Buyers queued for finance take the lounge sofa's seats first, then the wing's. The spotlights upgrade lights only the platforms that stand; the designer sofa swaps both sofas (`swap.propIds`).
- What's new: update 13. Help: the Staff section in the People tab gives the limits; the Expansion list in Business picks up the wing from `EXPANSIONS`. The `expansion` tip no longer says "ground".
- Performance: not yet checked on a real phone. Headless (SwiftShader) with the wing built, 21 cars, 6 staff and about 10 customers drew about 519 calls a frame; fps there means nothing. The `?fps` check on the mid-range Android phone is still to do before 13f.

### 13f: Dealer of the Year, sandbox and balance

- Reaching the top rank opens the win screen (`ui/WinScreen.tsx`). It shows days played, lifetime gross, best month and franchise tier.
- **Keep playing** sets `won: true` (saved in the next save version, false for an older save), so the win screen shows once. The title screen shows a trophy on a save that has won.
- Tuning pass to hit the targets below.

**13f implementation notes:**

- Save v17 keeps `won`; an older save gets `false`, so a game that already reached the top rank sees the win screen at its next day summary.
- `winShowing(s)` in the store: the screen is playing, the day is over, the career is at `TOP_RANK` (`atTopRank`) and `won` is false. So the win screen (`ui/WinScreen.tsx`) opens over the summary on the evening of the rank-up. Keep playing calls `keepPlaying()`, which sets `won`, and autosave writes it at once. While it's up, the game keys are ignored. It shows days played, cars sold, lifetime gross, the best month (`bestMonthSoFar`, counting the month under way) and the tier. `sfxFor` plays the `fanfare` when the career reaches the top rank. The title screen's Continue shows a trophy on a save with `won`.
- **The tuning was done with a model, not real play.** Headless SwiftShader distorts walking time too much to measure sales. So a throwaway Monte Carlo used the real `planArrivals`, `generateCustomer`, `acceptChance`, `reputationChange`, `addDay`, `monthlyQuota` and `nextTier`. It assumed a player who asks the customer's hope price and serves a set number of customers a day (3 by the player, 2 per salesperson, 2 salespeople from day 4). It was calibrated to Robert's figure of 3–5 sales a day early on and more later: about 3.5 a day for the first 10 days and 4.4 a day in days 30–60, at about $3k gross a car. It leaves out stock capital, marketing and improvements, and what the wing adds.
- Rank thresholds (Medium) are now Main Street $120k, Trusted Dealer $300k, Regional Name $550k and Dealer of the Year $1M. Reputation is unchanged (45/55/65/80). Model medians: Main Street day 13–14, Trusted Dealer 28–31, Regional Name 45–51, Dealer of the Year 71–79. Easy reaches the top rank around day 47–52. Hard's `rankScale` went from 1.3 to 1.15, because lower traffic already slows Hard: about day 115, and reputation 80 is the real gate there.
- **The quota was far too easy at that pace:** 12–20 cars against 100+ sold, so every player was Gold by month 3. It's now `CARS_PER_SLOT` 3 (from 0.5), `REPUTATION_SLOPE` 0.4 (from 0.08) and `QUOTA_RANGE` 40–160. A new game's January target is 81 on Medium. In the model a good Medium player meets it every month (Silver in month 2, Gold in month 3), and a weaker one (about 3 a day) hovers at 80–100% and climbs slowly. Hard's ×1.15 makes it a real stretch. The holdback is still a share of the month's MSRP sold, so its size barely changes. The quota still uses `BASE_SLOTS`: visitors, not spaces, limit sales, so it doesn't grow with the lot.
- Expansion prices are unchanged ($60k and $150k). Main Street now comes around day 14, so the east lot can be bought from then, which meets "affordable by about day 25".
- What's new: update 14. Help: the Progress section says the top rank wins and play goes on.

## Performance

The baseline, from Phase 4c, is 53–61 fps on a mid-range Android phone in Chrome. iOS hasn't been checked on a real device. The expansion adds about 35% more map, about 15 more cars and up to 3 more staff. Here are the risks, cheapest first:

1. **Pathfinding.** `findPathToAny` (`sim/pathfinding.ts`) scans the open list linearly for the lowest cost, and calls `open.includes` for every neighbour.
   - That's O(n²) in the open set. A wider map and longer walks, like a buyer heading to the far east lot, cost more than the extra area alone suggests.
   - An unreachable goal searches the whole grid before it fails.
   - **Fix in 13c:** a binary heap and an `inOpen` flag array. Test that the paths come out the same, and time it at 54×30.
2. **Shadows.** The sun's shadow camera is fixed at ±30 units from a fixed position (`scene/Weather.tsx`), so the parcel would fall outside it and get no shadows. Widening the frustum would blur every shadow, and that's worse at 2048 on phones. **Fix in 13c:** the light and its target follow the camera's focus, snapped to whole texels so the shadows don't shimmer. The frustum stays the same size.
3. **Cars are the heaviest props.** Each car is a deep `scene.clone(true)` with its own materials, which the tint and fade need (`scene/Props.tsx`). So its meshes can't be batched, and 50 cars instead of about 35 is a real rise in draw calls.
   - **Measure first:** `?fps` and `renderer.info.render.calls`.
   - **If that's too slow:** share materials per model and tint step, quantizing cleanliness and fade into about 4 steps. Instancing isn't worth it yet.
4. **More skinned characters and `<Html>` overlays.** A busy day can have 4 salespeople, 2 porters and more buyers. Skinned meshes can't be instanced, and every drei `<Html>` badge is a DOM element moved every frame. **Mitigation:** hide the badges and bubbles of characters that are off screen or far from the camera's focus. Chatter already plays only the nearest lines (`MAX_VOICES`).
5. **Crowd and the locked parcel.** `sim/crowd.ts` is roughly O(agents²), which is fine at 30 or fewer. The locked parcel is one grass plane and a fence, so it costs almost nothing.

**Done when:** a real-phone `?fps` check with the wing built, 4 salespeople and a full lot stays at about 50 fps or better. Record the result in the implementation notes here, as 4c did.

## Help (every sub-phase)

- Update `ui/HowToPlay.tsx` as each feature lands, describing only what's built:
  - Ranks, the franchise and expansions go in the Business tab.
  - Staff limits go in the People tab.
- Update `ui/controls.ts` if a key is added. Add the new tips to `sim/tips.ts`.
- What's new (12.5): one `UPDATES` entry per sub-phase that changes play, under `phase: '13'` (13b, 13d, 13e and 13f; 13a's shipped as update 10, and 13c changes nothing on screen).

## Tuning targets (Medium)

- Main Street by about day 15. The east lot affordable by about day 25. Dealer of the Year by about day 70–90.
- Silver is reachable in the second month by a player who meets the quota. Gold needs two good months in a row.
- Easy is faster and Hard slower, through `rankScale`.

## Verification (each sub-phase)

- `npm test`:
  - `progression.test.ts`: ranks, thresholds and `rankScale`.
  - `franchise.test.ts`: tier moves and perks.
  - `expansions.test.ts`: buying, `requires` and rank gating.
  - `pathfinding.test.ts`: the heap returns the same paths.
  - `layout.test.ts`: the parcel's spaces don't overlap, and a walkway passes through the opening.
  - `ordering.test.ts`: locked slots and locked models.
  - Store tests: rank-up, a tier change at month end, and an expansion going up overnight.
  - `difficulty.test.ts`: every level has the new levers, and Medium's are neutral.
  - A save upgrade test: a v12 save loads into v13.
- `npm run lint`, `npm run build`, `npm run e2e`.
- `npm run dev` / `/run`:
  - See a rank-up notice.
  - Buy the lot and see it built the next morning. Order a car into one of its spaces.
  - Build the wing and hire 4 salespeople.
  - Force the top rank, see the win screen, and keep playing.
  - Take `?fps` and a draw-call count before and after.
