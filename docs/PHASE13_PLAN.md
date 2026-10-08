# Phase 13 Plan: Expansion and Progression

**Status:** planned 2026-10-07. 13a built 2026-10-07; 13b is next. We do one sub-phase per session and stop for Robert's review after each, as in earlier phases. This phase builds on everything through Phase 12. The save is v12 today, so 13a makes it v13.

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
| Save `UPGRADES`                                                                                                 | `sim/save.ts`                          | v13 adds `career`, `franchise`, `expansions` and `won`                                                   |

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

- Thresholds (Medium, before `rankScale`): Main Street $40k gross and reputation 45, Trusted Dealer $150k and 55, Regional Name $400k and 65, Dealer of the Year $800k and 80. First guesses, for the 13f tuning pass.
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
- Saved in v13.
- Difficulty: `Tuning.franchiseSlack` (Easy: a month near the target still holds the tier).

### 13c: Bigger map and performance groundwork (no gameplay change)

- `GRID_WIDTH` goes from 40 to about 54. The parcel is tx 40–53, behind its own fence, with a "For sale" sign. Until it's bought, it's grass and blocked.
- The road and sidewalk extend east. `SIDEWALK_ENDS` and the pedestrians' spawn points move with them. So does the hardcoded `ROAD_EAST` in `sim/driving.ts`.
- Leave room for Phase 15's service garage: a corner of about 10×8 tiles, a service lane in front of it and a second gate in the south fence. If 13d's rows and 13e's wing don't leave that much, widen the map to about 60 instead.
- `buildLayout(expansions)`. The grid is rebuilt each morning, the same way improvement footprints are now.
- The camera's pan bounds cover the parcel.
- The performance fixes below (pathfinding and shadows).
- Done when: the game looks and plays as before, apart from the empty parcel.

### 13d: Lot expansion

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

### 13e: Showroom wing

- A wing on the parcel's north side, joined to the building through a door in the east wall. It holds 2 more platforms (`DISPLAY_CARS`), sales desks 3–4 (`SALES_DESKS`) and a second lounge sofa.
- `roleLimits(expansions)`: 4 salespeople and 2 porters.
- `nextSalesTask` and `nextPorterTask` already handle any number of staff. Check that desks are handed out to the new chairs.
- The performance check below runs here, with everything built.

### 13f: Dealer of the Year, sandbox and balance

- Reaching the top rank opens the win screen (`ui/WinScreen.tsx`). It shows days played, lifetime gross, best month and franchise tier.
- **Keep playing** sets `won: true` (saved), so the win screen shows once. The title screen shows a trophy on a save that has won.
- Tuning pass to hit the targets below.

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
