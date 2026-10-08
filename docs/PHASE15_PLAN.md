# Phase 15 Plan: Service Department

**Status:** planned 2026-10-08. Phase 13 comes first: the garage is one of its expansions, unlocked by its ranks, and service demand reads its `Career`. Phase 15 doesn't need Phase 14, but it comes after it in the plan. 15a takes the next save version, whichever order Phases 14 and 15 are built in. After that, we do one sub-phase per session and stop for Robert's review after each, as in earlier phases.

## Context

The game's goal is a rich client base and a growing revenue. Every dollar still comes from selling a car, and a buyer is forgotten the moment they drive off. A real dealer leans on its service department: the people it sold to come back for oil changes and brakes, which brings in steady money in slow weeks. Phase 15 adds that department:

- a garage on the parcel next door;
- mechanics to work in it;
- service clients who drive in for repairs;
- reconditioning, which turns rough trade-ins into better stock;
- manufacturer recalls, which bring in a model's buyers on the factory's dime.

**Decisions made with Robert (2026-10-08):**

- **Service, not a client book.** Nobody is saved by name. The number of service visits grows with the cars you've sold over the game (13a's `Career.sales`), plus a base number from town. The more you sell, the busier the garage.
- **A Phase 13 expansion on the parcel.** The garage is a 2-bay building on the east parcel, bought in the Upgrades tab. It needs the rank Trusted Dealer and the east lot.
- **Mechanics do the work.** Mechanics are a new role, one per bay. The player or a service advisor checks clients in. The player never does repairs.
- **Reconditioning and recalls are in scope.** The garage can recondition used stock, which raises its condition and value. Manufacturer recalls bring a recalled model's buyers in, and the factory pays for the work.

## Levers that already exist

| Lever                                                                                  | Where                                                  | Phase 15 use                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `EXPANSIONS`, `buyExpansion`, `installed(owned, day)`, `roleLimits(expansions)`        | `sim/expansions.ts` (13d), `sim/staff.ts` (13e)        | A `service-bay` expansion. Mechanics are limited to one per bay                                               |
| `Career`, `rankOf`                                                                     | `sim/progression.ts` (13a)                             | Service demand reads `Career.sales`. The bay needs Trusted Dealer. `Career.soldByModel` feeds recalls         |
| The seller pattern: `toSeller`, `makeOffer`, `answerSeller`, `greet`/`offer`/`respond` | `sim/sellers.ts`, `sim/customers.ts`, `state/store.ts` | Check-in is a greet. The quote is an offer, and the client accepts or declines it                             |
| `inboundRoute`/`outboundRoute`, `DrivenCar` (a bought car outlives its customer)       | `sim/driving.ts`, `scene/DrivenCar.tsx`                | Service cars drive fixed legs: in, lane to bay, bay to the ready spots, and out                               |
| `planArrivals`, `takeDue`                                                              | `sim/spawner.ts`                                       | `planServiceVisits` builds its own schedule, released the same way                                            |
| `nextPorterTask`, `updatePorter`, `skillSeconds`                                       | `sim/staffAi.ts`, `scene/Staff.tsx`, `sim/staff.ts`    | `nextMechanicTask` and `updateMechanic` copy their shape                                                      |
| `UsedInfo.condition`, `marketValue`, `usedListPrice`, `conditionBonus`, `fairPrice`    | `sim/usedCars.ts`                                      | Reconditioning raises condition. Nothing writes it after `rollUsedCar` today. The car is re-listed afterwards |
| `availableCars`                                                                        | `sim/inventory.ts`                                     | Browsing, staff, Nazma, props and the grid all skip a car in the shop                                         |
| `washCar`                                                                              | `sim/cleanliness.ts`                                   | Reconditioning details the car too                                                                            |
| `DayStats`, `netIncome`, `grossSplit`, `DaySummary`                                    | `sim/deal.ts`, `ui/DaySummary.tsx`                     | `DayStats.service`, `serviceGross` and a Service block in the summary                                         |
| `REPUTATION_POINTS`, `reputationChange`                                                | `sim/reputation.ts`                                    | Serviced, late, turned-away and comeback clients move reputation                                              |
| `eventOn(day)`, `calendarOf`                                                           | `sim/events.ts`, `sim/calendar.ts`                     | `recallOn(day)` is derived from the day the same way. Nothing is saved                                        |
| `ComputerTab`, `TABS` in `ui/StockPanel.tsx`, the computer's actions                   | `state/store.ts`, `ui/`, `sim/interactables.ts`        | A **Service** tab (key B)                                                                                     |
| `ACTIONS` (timed), `findInteractable`                                                  | `sim/interactables.ts`, `scene/runtime.ts`             | New actions: `checkIn`, `recondition` and `recommend`                                                         |
| `sfxFor`, `conversationsOf`                                                            | `sim/sfxEvents.ts`, `sim/chatter.ts`                   | `wrench` and `lift` cues. A check-in conversation                                                             |
| `generateGoal`                                                                         | `sim/owner.ts`                                         | A `serviced` goal, once the bay is up                                                                         |
| `Tuning` / `TUNING`                                                                    | `sim/difficulty.ts`                                    | New levers `serviceDemand` and `comebackScale`, neutral on Medium                                             |
| Save `UPGRADES`                                                                        | `sim/save.ts`                                          | Next save version adds `service` and `Career.soldByModel`                                                     |

## Sub-phases

### 15a: Service foundation (pure + save)

- New `sim/service.ts` (pure, tested):
  - `JobKind`: `oil`, `tires`, `brakes`, `repair`, `recall` or `recon`.
  - `JOBS`: each kind's book minutes (30 to 150), parts cost range and label.
  - `ServiceJob`:
    - `id` and `kind`.
    - `customerId`, or null for recon.
    - `carId`, the stock car for recon, or null.
    - `bay`: the bay it's in, or null.
    - `status`: `waiting`, `inBay`, `ready` or `done`.
    - `worked` and `minutes`: game minutes done and needed.
    - `labor`, `parts` and `partsCost`.
    - `finding`: extra work (15d).
  - `jobMinutes(kind, skill)`: better mechanics are faster, like `skillSeconds`.
  - `quote(kind, rate, rng)`: labor at the shop rate plus marked-up parts.
  - `serviceDemand(day, career, opts)`: the day's expected service visits. It's computed as:
    - (`TOWN_SERVICE` + `Career.sales` × `SERVICE_PER_CAR`)
    - × `SERVICE_WEEKDAY` (Monday busiest, Sunday none)
    - × the shop rate's demand factor
    - × `Tuning.serviceDemand`
    - and capped by the number of bays.
  - `planServiceVisits(rng, expected)`: a schedule of minutes and jobs, released like `takeDue`.
  - `comebackChance(skill)`.
- Store:
  - `serviceJobs`: mid-day and never saved, like `purchases`.
  - `service`: `{ rate, autoRecon }`. It's saved, and it's added to `startAutosave`'s changed list, so a change in the Service tab after closing is kept.
  - `serviceRng`: service clients are rolled on their own rng, so a day without a garage plays exactly as before. This is the same trick `driveRng` uses for drive-ins.
- `DayStats.service`: `{ jobs, labor, parts, partsCost, warranty, overtime, turnedAway, declined, late, comebacks }`.
  - `serviceGross(stats)` is labor + parts − parts cost + warranty − overtime.
  - `netIncome` adds it.
  - `grossProfit` stays sales-only, so the summary's new/used split and `averageDiscount` don't change.
  - A new `totalGross(stats)` (sales + service) feeds `Career.gross` and the owner's `profit` goal. Service counts toward ranks.
- Save, next version:
  - Adds `service`.
  - Adds `Career.soldByModel`, counted in `sign` from now on, so 15e has data.
  - The upgrade splits an older save's `Career.sales` across the models, so recalls aren't empty for months.
  - New roles need no bump, because `isEmployee` only checks `ROLES`.
- Difficulty:
  - `Tuning.serviceDemand` (× service visits): Easy 1.2, Medium 1, Hard 0.8.
  - `Tuning.comebackScale` (× comeback odds): Easy 0.5, Medium 1, Hard 1.5.
- Nothing on screen yet.

### 15b: The garage, mechanics and reconditioning

- Layout: the garage sits on the parcel, in the corner 13c reserves for it. It's about 10×8: 2 bays with lifts, a service counter and 4 waiting chairs. It blocks its footprint each morning, as improvement footprints do in `scene/runtime`.
- `service-bay` in `EXPANSIONS`, about $90k. It needs Trusted Dealer and `east-lot`, and it goes up overnight. The Upgrades tab's Expansion section shows why it's locked.
- New `scene/ServiceBay.tsx`:
  - Hidden until the bay is installed.
  - Lifts that rise in `useFrame` when a car is on them, roll-up doors, and a SERVICE sign (a canvas texture).
  - Shared materials, and no shadows inside.
- The `mechanic` role:
  - Added to every role record: `ROLE_LABELS`, `ROLE_PLURALS`, `ROLE_BLURBS`, `ROLE_BADGES`, `ROLE_LIMITS`, `POSTS` and `WAGES`.
  - Wages are higher than a porter's.
  - `roleLimits(expansions)` allows one per bay, and none before the garage is up.
  - `generateCandidates` only offers roles whose limit is above 0. Otherwise mechanic applicants would show from day 1 and every day's applicant rolls would shift.
- The mechanic's work:
  - `nextMechanicTask(e, jobs, ctx)` in `sim/staffAi.ts` takes client jobs first (15c), then recall jobs (15e), then recon. A mechanic keeps their current job.
  - `updateMechanic` walks to the bay and reports `staffStartJob`, as the porter reports `staffWash`.
- Jobs finish on the clock:
  - `tickClock` adds to a job's `worked` while its mechanic is `atPost` and not fired or quitting.
  - The job is done when `worked` reaches `minutes`.
  - So pause and game speed work for free, and the Service tab can show when a job will be ready.
  - A mechanic who is fired or poached leaves the job stalled, not finished.
- Reconditioning:
  - **Starting a job:**
    - The player can recondition a used stock car with the `recondition` action on it, or from the Service tab's list. The list shows the value gained against the cost.
    - `service.autoRecon` reconditions trade-ins on its own.
    - `reconBlocker` refuses the car if it's a customer's `targetCarId` or `offer.carId`, or if the shop is closed.
  - **While it's in the shop:**
    - The car's `CarStatus` is `'recon'`. Everything that goes through `availableCars` skips it: browse picks, `chooseTarget`, interactables, `Props`, the porter's `dirtiestCar`, Nazma's `planVisit` and `planTheft`, and `applyToGrid`.
    - These places need fixing so the car isn't lost:
      - `ordering.freeSlots` and `inventory.dropSold` test `!== 'sold'`. Its space stays held, and the car survives the night.
      - `save.isCar` accepts `'recon'`, and `createSave` writes it back as `'available'` as a safeguard.
      - The Stock and Info panels say "In the shop", not "Sold".
      - The step-out check in `scene/runtime` covers a car coming back to its space.
    - The car pops out of its space the way a sold car does. `CarBody` draws it on the lift.
  - **When it's done:**
    - Condition rises by `RECON_STEP`, up to `RECON_MAX`. The paint shows it, since `Props` already fades paint by condition.
    - The car is washed.
    - It's re-listed at `msrp = max(msrp, usedListPrice(marketValue(…)))`.
    - The parts cost is added to `InventoryCar.cost`, so the used gross in `grossSplit` stays honest.
- At closing, `closeUp` finishes any job that has started "after hours". The overtime it charges is booked at the 18:00 tick, before `settleDay`.
- New `ui/ServiceTab.tsx`: `computerTab` `'service'`. Open it with key B or the office computer's new `service` action. It shows:
  - the bays and what's on them, with ETAs;
  - the recon list;
  - today's service income.
- New tips `serviceBay` and `recon`.

### 15c: Service customers and the service advisor

- The service drive, on the parcel:
  - `SERVICE_SPOTS`: 2 drop-off spots in a lane in front of the bays, and 2 ready spots.
  - A gate in the south fence.
  - Fixed routes: in, lane to bay, bay to ready spot, and out.
- `Customer.service`: `{ job, car, spot, promisedMinute }`.
  - `Customer.vehicle` stays null. `vehicle.spot` means a `CUSTOMER_PARKING` space everywhere it's read: `freeSpot`, `parkedPose`, `doorTile`, the footprint subscriber, `sfxBridge` and `walkerFor`.
  - Service clients get `service-N` ids from `serviceRng`, not `nextCustomerId`.
- `DrivenCar` gets a service branch:
  - The car drives itself along the legs when its job's status changes. Drivers are never visible anyway.
  - It outlives its customer while a `ServiceJob` names it, the way a bought car does while `purchases` holds it.
- Phases. One new phase, `servicing`, and new leave reasons `serviced` and `declined`.
  - **Check-in** uses the seller pattern: `greet`, then `offer` (the quote), then `respond`. The player's `checkIn` action at the counter is timed.
  - **Accept:** the client goes to `servicing`. `handlerId` is cleared, and `servicing` stays out of `DEAL_PHASES`, so nobody is tied to them for the whole job.
  - **Decline:** they leave `declined` and drive off.
  - **Waiting at the counter:** they lose patience by the existing `tick`. Leaving impatient costs −2 reputation, as for any customer.
- Service clients must be left out of:
  - `greet`'s "refused when there's no car" check;
  - `close` in the reducer, which `commit` re-applies after 18:00;
  - `pickSalesCustomer`;
  - `moodOf` and `bubbleOf`;
  - `announceWaiting`, which gets its own line;
  - `waitingOutside`;
  - `recordMissed` and `recordVisitors`;
  - `assignVehicles`, `assignSellers` and `assignTrades`;
  - 14c's `assignQuotes`;
  - Nazma's targets.
- Waiting for the car:
  - **Jobs of `WAIT_LIMIT` (60 minutes) or less:** the client sits in the waiting chairs.
  - **Longer jobs are drop-offs:**
    - The client walks off to the sidewalk and is removed there with a `wentAway` event, which isn't tallied.
    - `tickClock` respawns them from the job at `promisedMinute`.
    - At 18:00 an away client's car counts as collected after hours: the payment is booked and `DrivenCar` drives the car off.
    - Nobody is kept off screen, and `dayOver` doesn't change.
  - **Collecting:** the client walks to their car's ready spot, pays and drives off. `plan('leaving')` reads the spot live, not the walker's `exit`.
- The `advisor` role (Service advisor, at most 1, posted at the counter):
  - Checks clients in at the quote.
  - Without one, the player checks clients in, as the player signs buyers without a finance manager.
- Reputation (`REPUTATION_POINTS`):
  - Serviced: +1.
  - Late (collected after `promisedMinute`) or turned away for lack of time: −1.
  - The daily cap applies, as now.
- Sound and talk:
  - `sfxFor` plays `wrench` when a job starts and `lift` when a lift moves. Both are synthesized and get a level in the bridge's `VOLUME` and a line in `public/audio/LICENSE.md`.
  - A check-in conversation in `conversationsOf`.
- New tip `serviceClient`.

### 15d: Findings, the shop rate and comebacks

- **Findings.** When a job starts, `FINDING_CHANCE` of the time the mechanic finds extra work ("worn brake pads, $340"). It can be offered three ways:
  - The player uses the `recommend` action on a waiting client.
  - The player uses the Service tab's **Call** button for a client who's away.
  - The advisor offers it on their own.
  - Whether the client says yes is `upsellChance(rate, archetype, skill)`, where `skill` is the advisor's skill, or `PLAYER_SKILL`.
  - A finding nobody offers before the car is ready is lost.
- **`RATE_LEVELS`**: `budget`, `standard` and `premium`. Each sets:
  - the labor $/hour;
  - a demand factor on `serviceDemand`;
  - an accept factor on quotes and findings.
  - The rate is set in the Service tab and saved in `service.rate`.
- **Comebacks.**
  - Rolled when a job is done, at `comebackChance(skill) × Tuning.comebackScale`.
  - The client drives back in about `COMEBACK_DELAY` (90 game minutes) later for a free redo, through the same respawn path as drop-offs.
  - −1 reputation. Past closing, only the reputation is lost.
- **Owner goal.** A `serviced` goal kind ("Finish 4 service jobs"). It's added to `generateGoal`'s kinds only once the bay is up, as `model` is only added when models are in stock. Otherwise every owner day's goal would re-roll.
- New tip `finding`.

### 15e: Manufacturer recalls and balance

- New `sim/recalls.ts` (pure, tested):
  - `recallOn(day)` is derived from the day like `eventOn`, seeded by the month. Nothing is saved.
  - At most one recall a month, on one model, running from the 8th to the 28th.
  - It only starts once the bay is up.
  - Expected recall visits a day = `soldByModel[model]` × `RECALL_RESPONSE`, spread over the window. They come on top of `serviceDemand`, within the bays' cap.
- **Warranty pay.**
  - The manufacturer pays recall labor at `WARRANTY_RATE` (below the standard rate) and parts at cost.
  - This is booked as `DayStats.service.warranty`.
  - A finding on a recall job is ordinary paid work.
- **On screen.**
  - A notice when a recall starts: "Recall: sedans need a brake sensor. 9 of your buyers are due in."
  - The recall window in the Calendar tab, and a line in the Service tab.
- New tip `recall`.
- A balance pass toward the targets below.

## Performance

- The garage is a handful of static meshes with shared materials and no shadows inside. The lifts are two meshes moved in `useFrame`.
- **Extra cars.** Up to 6 more cars can be on screen: 2 in the bays, 2 in the lane and 2 in the ready spots. Each is a car clone, the heaviest prop.
- **Extra staff.** Up to 3 more skinned staff: 2 mechanics and an advisor.
- Re-run Phase 13's check (`?fps` and `renderer.info.render.calls`) with the wing built, the garage busy and a full lot. If it drops below about 50 fps on the phone, use 13's fallback: share car materials per model and tint step.
- Service planning runs once a day in `beginDay`. Job progress is added up in `tickClock`, every 10 game minutes. The only new per-frame work is the cars driving and the lifts.

## Help (every sub-phase)

- Update `ui/HowToPlay.tsx` as each feature lands, describing only what's built:
  - Business tab: a Service section (building the bay, the shop rate, findings, recalls and overtime).
  - People tab: the mechanic and the service advisor.
  - Selling tab: reconditioning, in the used-car section.
- `ui/controls.ts`: B for Service. The touch list's Office line mentions Service.
- Tips `serviceBay`, `recon`, `serviceClient`, `finding` and `recall` in `sim/tips.ts`.

## Tuning targets (Medium)

- By about day 60, service brings in 10–20% of the gross. It carries Sundays and rainy days, when sales are thin.
- A mechanic finishes about 4–6 jobs a day.
- A customer-pay job grosses about $150–400. About half of findings are accepted at the standard rate.
- Reconditioning pays back about twice its cost on a car under condition 0.5, and about breaks even near 0.75.
- About 1 in 4 of a recalled model's buyers come in during the window.
- Comebacks: about 15% at skill 1 and about 2% at skill 5.
- The bay pays for itself in about 25–35 days.
- Easy is busier and more forgiving, and Hard quieter and harsher, through `serviceDemand` and `comebackScale`.

## Verification (each sub-phase)

- `npm test`:
  - `service.test.ts`:
    - job minutes by skill;
    - quotes by rate;
    - demand rising with cars sold, following the weekday rhythm and capped by bays;
    - comeback odds.
  - Recon tests: the condition step and its cap; a re-list never lowers the price; parts added to the cost.
  - `recalls.test.ts`: deterministic per month, nothing without a bay, visits from `soldByModel`.
  - `staffAi.test.ts`: `nextMechanicTask` takes client jobs, then recalls, then recon, and keeps its current job.
  - `customers.test.ts`: a service client from parked to waiting, checked in, servicing and then leaving serviced. Also a decline, and a drop-off going away and coming back.
  - Store tests:
    - A job finishes on the clock, and only while its mechanic is at their post.
    - Overtime at closing.
    - `DayStats.service` and `netIncome`.
    - Reputation.
    - Reconditioning raises condition and re-lists the car.
    - A car in the shop isn't browsable, keeps its space and survives the night.
    - A day without a garage plays exactly as before.
  - `layout.test.ts`: the garage doesn't overlap 13d's spaces, and the lane and counter are reachable.
  - A save upgrade test: a save from the version before loads with empty `service` and `soldByModel`.
  - `difficulty.test.ts`: every level has the new levers, and Medium's are neutral.
- `npm run lint`, `npm run build`, `npm run e2e`.
- `npm run dev` / `/run`:
  - Force Trusted Dealer and the east lot, buy the bay, and see it go up overnight.
  - Hire a mechanic and recondition a rough trade-in.
  - Check a service client in, watch the car go onto the lift, and collect it.
  - Make a drop-off, and see the client come back.
  - Offer a finding, change the shop rate, and see a recall notice.
  - Take `?fps` and a draw-call count before and after.

## Left out

Robert left these out on 2026-10-08. Phase 16 (`docs/PHASE16_PLAN.md`) picks up the client book, clients who trade up, referrals by name, follow-up calls and pitching a service client, and its 16f draws service visits from the book. The rest could make a later phase:

- A saved client book with satisfaction scores.
- Named clients who come back to trade up.
- Referrals by name.
- Follow-up calls.
- Pitching a new car to a service client in the waiting area.
- The player doing repairs.
