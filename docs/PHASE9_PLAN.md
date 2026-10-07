# Phase 9 Plan: Adversaries (Nazma)

**Status:** 9a done 2026-10-06. 9b done 2026-10-06. 9c done 2026-10-06. 9d done 2026-10-06, awaiting review. We do one sub-phase per session and stop for Robert's review after each, the same as earlier phases.

## Context

SPEC Phase 9 adds adversaries. Nazma is a disgruntled former employee (he/him) who tries to ruin the business. He makes cars dirty so they need washing again, steals cars, and talks employees into quitting. A security guard can be hired to deter him.

Phases 3 and 7 already give us what he can hurt. Car cleanliness feeds `acceptChance`. The staff roster has wages and skill. Stock carries real dealer cost and floor plan debt. The owner (`sim/owner.ts`, `scene/Owner.tsx`) already shows how a scheduled visitor walks in from the sidewalk outside the store.

**Decisions made with Robert (2026-10-06):**

- **A mix of on-screen and overnight.** Nazma walks onto the lot by day to smudge cars and to work on staff. Thefts happen overnight, and a security guard on the payroll stops them.
- **Both the player and the guard can stop him.** Clicking Nazma gives a **Confront** action, which runs him off if you reach him in time. A guard catches him automatically and makes his visits rarer.
- **A stolen car is lost outright.** Its cost is written off. If the car was floored, the bank calls in the loan the next morning.
- **Poaching gets a counter-offer.** After Nazma's chat the employee is _thinking of quitting_. You can keep them with a raise from the staff panel before closing; otherwise they leave at the end of the day.

## Levers that already exist

| Lever                            | Where                                                          | Phase 9 use                                                                      |
| -------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Scheduled visitor, seeded by day | `sim/owner.ts` `isOwnerDay`, `OWNER_SEED`                      | `isNazmaDay` uses the same pattern, plus a guard factor                          |
| Ambient walker outside the store | `scene/Owner.tsx`, `runtime.ambientPos`, `scene/walker.ts`     | `scene/Nazma.tsx`; crowd avoidance comes free                                    |
| Cleanliness                      | `sim/cleanliness.ts` (`mapCars`, `washCar`, `dirtiestCar`)     | `smudgeCar`; the porter already cleans up after him                              |
| Roster events                    | `sim/staff.ts` `reduceStaff`, `Role`, `ROLE_LIMITS`, `wageFor` | `security` role; a `quitting` flag; `keep` and `quit` events                     |
| Staff decisions                  | `sim/staffAi.ts` (`nextPorterTask`), `scene/Staff.tsx`         | `nextGuardTask` (patrol, chase)                                                  |
| Clickable people                 | `scene/runtime.ts` `findInteractable`, `personInteractable`    | Nazma as a target with `confront`                                                |
| Morning step                     | `state/store.ts` `beginDay`                                    | Plan the day's visit; overnight theft                                            |
| Closing step                     | `settleDay`                                                    | Quitters leave; theft loss in the summary                                        |
| Floor plan                       | `sim/floorPlan.ts` `payoffOnSale`                              | Loan called in on a stolen floored car                                           |
| `DayStats`, `netIncome`          | `sim/deal.ts`                                                  | `nazma` incident record; `theft` comes off `netIncome`                           |
| Sound and voices                 | `sim/sfxEvents.ts` `sfxFor`, `sim/chatter.ts` `reactionsFor`   | Cues for his arrival, smudging, being caught and a theft; grumbling when run off |

## Sub-phases

### 9a: Nazma's visits and smudged cars

- `sim/nazma.ts` (pure, tested):
  - `NAZMA_ID`, `FIRST_NAZMA_DAY` (4) and `NAZMA_SEED`.
  - `isNazmaDay(day, guarded)`: a seeded roll against `VISIT_CHANCE` (about 0.35). A guard on the payroll scales the chance by `GUARD_DETERRENCE` (about 0.4; 0 is used until 9b). Day 4 is always a visit, so he gets introduced.
  - `NazmaVisit { scheme: 'smudge' | 'poach', targets: string[], arrivalMinute, status: 'coming' | 'onLot' | 'done' | 'runOff', progress }`. `planVisit(rng, day, inventory, roster)` picks the scheme. In 9a it is always `smudge`, aimed at 2–3 available cars with lot cars first.
  - `smudgeCar(inventory, id)` takes off `SMUDGE_DIRT` (about 0.5). It goes in `sim/cleanliness.ts` next to `washCar`.
- Store: `nazma: NazmaVisit | null`, planned in `beginDay`. Actions:
  - `nazmaArrived`: the first visit (day 4) gets a story notice.
  - `nazmaSmudge(carId)`
  - `nazmaRunOff(by: 'player' | 'guard')`
  - `nazmaLeft`
  - `DayStats.nazma: { visited, smudged, runOff: 'player' | 'guard' | null, stolen: StolenCar[], poached: string[], quit: string[] }`.
- `scene/Nazma.tsx` is modelled on `scene/Owner.tsx`. He comes in from a sidewalk end at `arrivalMinute`, walks to each target car, rubs it for `SMUDGE_SECONDS` (then calls `nazmaSmudge`) and walks off. If he's run off, he hurries to the nearest sidewalk end at a faster speed. Only his position lives in `ambientPos`, never in the store. Look: a staff variant with a dark hoodie tint (`bodyTint`) and a red "Nazma" badge.
- Player counterplay: Nazma is a target in `findInteractable` with one action, `confront` (new `ActionId`, `instant`, label "Confront"). It reaches him the way the player reaches a customer. On arrival it calls `nazmaRunOff('player')`, and that stops him partway through a smudge.
- Sound and voice: `SfxCue` gets `scuff` (a smudge, with the car as subject) and `shoo` (run off). He gets a seeded voice through `voiceOf`, `reactionsFor` adds a grumble when he's run off, and both new cues go in `public/audio/LICENSE.md`.
- Summary: a "Nazma" line ("smudged 2 cars", or "run off by you").
- Help: a Nazma section in `ui/HowToPlay.tsx`, and Confront in `ui/controls.ts`.
- No save change: his visits are rebuilt from the day number.

### 9b: Security guard

- `Role` gets `security`, with label "Security guard", badge "Security", limit 1 and a wage of about 80 plus 20 per skill. The blurb: "Patrols the lot, chases off Nazma and keeps him away at night." `generateCandidates` includes the new role automatically. `isEmployee` in the save should accept only known roles.
- `layout.ts`: `GUARD_PATROL_TILES`, a loop past the lot, the driveway and the showroom door, clear of the walkway (check with `layout.test.ts` / `crowd.test.ts`).
- `sim/staffAi.ts` `nextGuardTask(guard, nazmaTile, guardTile)` returns `patrol` (the next patrol tile) or `chase` (once Nazma is within `guardSight(skill)`, about 4 + skill tiles). It's pure and tested. `scene/Staff.tsx` carries it out. It reads Nazma from `ambientPos.get(NAZMA_ID)`, and on contact (within 1.2 units) calls `nazmaRunOff('guard')`.
- Deterrence: `isNazmaDay(day, guarded)` now uses `GUARD_DETERRENCE`. `guarded` means a guard who isn't fired is on the payroll that morning.
- Help: add the guard to the roles in HowToPlay.

### 9c: Overnight theft

- `sim/nazma.ts` `planTheft(rng, day, inventory, guarded)`: from `FIRST_THEFT_DAY` (6) on, a seeded `THEFT_CHANCE` (about 0.15). There's never a theft with a guard on the payroll. He takes an available **lot** car (the showroom is locked), picked weighted toward higher MSRP. He can't make two thefts within `THEFT_GAP_DAYS` (3) of each other; the gap is derived by replaying earlier days, the way `isOwnerDay` works, so nothing extra is saved.
- `beginDay`: after `dropSold` and before delivery, a theft takes the car out of `inventory`. If the car was floored, cash is charged its `cost` (the loan is called). The theft goes in `DayStats.nazma.stolen` as `{ model, cost, floored }`. The morning notice reads: "Nazma stole the Summit Ridge off the lot overnight." If a guard on the payroll stopped it, the notice is "Your guard ran someone off the lot last night." instead, recorded as a foiled theft.
- `deal.ts`: `theftLoss(stats)` is the sum of stolen cost. `netIncome` subtracts it, and the summary shows a "Stolen stock" line. A stolen car's slot is free again for `placeOrder` (it's simply gone from inventory).
- The theft runs once per morning and the morning is rebuilt from the save, so loading a save can't steal twice. The save is taken after the night's theft is applied in `beginDay`, so the car stays gone.
- Sound: a `thud`-style "empty space" cue isn't needed. Only the morning notice chime plays.

### 9d: Poaching and counter-offers

- `planVisit` can now pick `poach` (about 40% when anyone eligible is at their post). The target is someone with status `atPost` who isn't fired, isn't a guard and isn't already quitting, with higher skill preferred. Nazma walks up to them and chats for `POACH_SECONDS` (6). The chat uses the turn-taking in `sim/chatter.ts`, with a new conversation kind. If he's run off or caught before the chat ends, nothing happens.
- `Employee.quitting: boolean`. `reduceStaff` gets new events:
  - `{ type: 'poached', id }` sets `quitting`.
  - `{ type: 'keep', id, wage }` clears `quitting` and sets the raised wage.
  - At `close`, anyone still `quitting` becomes `fired: true` and leaves; they're removed when they reach the sidewalk.
  - Payroll still pays them for the day.
- Store: `nazmaPoach(employeeId)` gives the notice "Dana is thinking of quitting. Nazma made them an offer." `keepEmployee(id)` raises the wage by `RETENTION_RAISE` (20%, at least $20/day), and its cost shows on the button. The staff panel (`ui/StaffPanel`) shows a "Thinking of quitting" tag and a **Keep (+$X/day)\*\* button. Their badge in the world gets a "?" marker.
- Summary: "Nazma poached Dana" or "You kept Dana (+$25/day)".
- Save: `quitting` is always false by the time the end-of-day save runs, so `createSave` strips it and `parseSave` defaults it. Bump `SAVE_VERSION` to 8 with an `UPGRADES[7]` step that adds `quitting: false`, so the `Employee` shape stays honest.
- Help: poaching and the Keep button in HowToPlay and the staff section.

## Tuning targets

- Without a guard he shows up about every third day from day 4. A smudge costs about 0.5 cleanliness on 2–3 cars, which is roughly −8% accept on those cars until they're washed.
- A theft is the expensive one: about $20–55k cost written off. A guard costs about $120–180/day. That makes the guard a real choice early on and an easy one once stock is valuable.
- A raise to keep a seasoned salesperson (about 20%) should usually be worth it, and keeping a green one usually not.

## Verification (each sub-phase)

- `npm test`:
  - New `nazma.test.ts`: visit and theft schedules are deterministic, the guard lowers or blocks them, `planVisit` targets and `smudgeCar`.
  - `staffAi` tests for `nextGuardTask`.
  - `staff.test.ts` for the poach, keep and close quitting events.
  - `deal.test.ts` for `theftLoss` / `netIncome`.
  - Store tests (`store.nazma.test.ts`) for run-off, a theft in `beginDay` with floored payoff, keep and quit.
  - A save test that a v7 save loads into v8.
- `npm run lint`, `npm run build`.
- `npm run dev` / `/run`: skip to day 4 and watch Nazma smudge cars. Confront him. Hire a guard and see him chased off. Skip nights without a guard until a lot car disappears, and check the summary and cash (floored payoff). Let him poach someone, use Keep, and check that an un-kept employee leaves at closing. Resume a save and confirm nothing repeats.
