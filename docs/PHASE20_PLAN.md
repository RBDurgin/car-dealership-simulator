# Phase 20 Plan: Test Drives

**Status:** planned 2026-10-10. Phase 20 comes after Phase 19 (F&I) in the plan. It needs only built phases: 12b (driving in), 13c (the bigger map) and 15 (the garage, for fixing dings).

- 20d's satisfaction hook needs Phase 16's visit score. If 16 isn't built when 20d is, that part waits for it.
- Only 20c touches the save. It takes the next free save version (`SAVE_VERSION` + 1).
- As in earlier phases, we do one sub-phase per session and stop for Robert's review after each.

## Context

Shoppers look at a car, talk and buy, but nobody ever drives one. On a real lot the test drive is where many deals are won. It also costs a salesperson's time and puts miles on the stock.

Phase 20 adds a test drive between the pitch and the price:

- A shopper asks to drive the car they're talking about, or the player offers.
- The player or a salesperson rides along. The car drives out of the gate and off the map, is gone for a while, and comes back to its space.
- A good drive warms the buyer. It raises the accept odds and softens the discount they expect.
- Each drive has a cost. Whoever rides along is off the floor, the car can't be browsed or sold while it's out, it comes back dirtier, a used car gains a few miles, and now and then it comes back with a ding.

Scale: a day is 6 real minutes, about 1.5 game minutes per real second. A drive takes 20–35 game minutes, about 15–25 s at normal speed.

**Decisions made with Robert (2026-10-10):**

- **Someone always rides along.** It's the player or a salesperson, and a shopper never goes alone.
  - When the player rides along, the player is hidden and can't act on the floor. The camera stays on the lot, and a drive bar in the HUD shows the time left. **Head back** (✕ or Esc) cuts the drive short, for a smaller bonus.
  - A salesperson riding along is off the floor in the same way.
  - This makes a salesperson worth having for drives: the player can stay on the floor and sell.
- **The car leaves the map.** It drives out through the lot gate onto the road and off the map's edge, then back in to its own space. No town is built.
- **Talking points while the player rides along.** Twice per drive, a small prompt offers 3 things to point out. One that suits the buyer's archetype and the car's body type warms them more. A salesperson picks by skill.
- **What can go wrong:**
  - **Mud and wear:** the car comes back dirtier (more in rain), and a used car gains miles.
  - **Minor dings:** rarely, the car comes back with a small dent. It lowers the car's appeal until the garage fixes it (or until it's sold at a discount).
- **No fleet deals** in this phase. They go in Left out.

## Levers that already exist

| Lever                                                                                                                                                  | Where                                                      | Phase 20 use                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inboundRoute`/`outboundRoute`, `Leg`, `smoothCorners`, `LANE`, `ROAD_WEST`/`ROAD_EAST`, `GATE_IN_X`/`GATE_OUT_X`, `AISLE_Z`, `blockedAhead`, `poseIn` | `sim/driving.ts`                                           | New `stockOutbound(space, to)`/`stockInbound(space, from)` leave and return to a stock `PARKING_SPACES` pose, joined to the existing gate and road legs |
| `DrivenCar` stages, `drive()`, `CarBody`, `runtime.vehiclePos`, crowd agents for moving cars                                                           | `scene/DrivenCar.tsx`, `scene/Props.tsx`                   | A `testDrive` record drives the stock car's own `CarBody` out and back                                                                                  |
| `CarStatus` `'recon'` (out of `availableCars`, kept by `freeSlots`/`dropSold`, saved back as available)                                                | `sim/inventory.ts`, `sim/save.ts`                          | A new status `'out'` works the same way                                                                                                                 |
| `acceptChance(c, car, price, bonus, day)`, `sellerBonusFor`, `dealWarmth`, `expect`                                                                    | `sim/customers.ts`, `state/store.ts`, `sim/negotiation.ts` | `driveBonus` joins the bonus, and `driveExpect` narrows `expect`                                                                                        |
| `ArchetypeTraits`                                                                                                                                      | `sim/archetypes.ts`                                        | New `drive` (chance to ask) and `topics` (liked talking points)                                                                                         |
| `cleanliness`, `smudgeCar`, `WEATHER_EFFECTS`                                                                                                          | `sim/cleanliness.ts`, `sim/weather.ts`                     | `driveDirt` (more on a rainy day)                                                                                                                       |
| `UsedInfo.miles`, `marketValue`                                                                                                                        | `sim/usedCars.ts`                                          | A drive adds `DRIVE_MILES`, so the value drops a little                                                                                                 |
| `JobKind`, `recondition`, `reconBlocker`, `nextMechanicTask` (`jobPriority`)                                                                           | `sim/service.ts`, `sim/staffAi.ts`, store                  | A `ding` job fixes a dent                                                                                                                               |
| `nextSalesTask`/`SalesTask`/`SalesContext`, `updateSales`, `skillSeconds`                                                                              | `sim/staffAi.ts`, `scene/Staff.tsx`                        | A new `drive` task, before the pitch                                                                                                                    |
| `customerActions`, `CUSTOMER_ACTIONS`, `actionBlocker`, `bubbleOf`                                                                                     | `sim/deal.ts`, `sim/customers.ts`                          | The `testDrive` action and a 🔑 bubble                                                                                                                  |
| Chatter `ConversationKind`, `reactionsFor`                                                                                                             | `sim/chatter.ts`                                           | A short `drive` exchange as they leave and return                                                                                                       |
| `sfxFor` cues `engine` and `door`                                                                                                                      | `sim/sfxEvents.ts`                                         | Played for the car leaving and coming back                                                                                                              |
| Phase 16 `visitScore`                                                                                                                                  | `sim/clients.ts` (16a)                                     | "Loved the test drive" or "Never got to drive it"                                                                                                       |
| `Tuning` / `TUNING`                                                                                                                                    | `sim/difficulty.ts`                                        | New `driveBonus` and `dingChance`, neutral on Medium                                                                                                    |

## Sub-phases

### 20a: Test drives (player)

New `sim/testDrive.ts` (pure, tested):

- `TestDrive { carId, by: PLAYER_ID | employeeId, minutes, points: { topic, fit }[], cut: boolean, ding: boolean }`.
- `drivableCar(c, inventory)` returns the car to drive or a reason it can't be driven:
  - The car is the shopper's target, if it's on a lot space.
  - A showroom car can't leave its platform, so a lot car of the same model is taken instead.
  - Otherwise there's nothing to drive, and the reason is shown.
- `driveMinutes(rng)`: 20–35 game minutes.
- `driveScore(drive, c, car)` runs from 0 to 1. It's built from:
  - a base for any drive;
  - the talking points (20b), which add to it;
  - a cut-short drive, which loses part of it;
  - the car's cleanliness and, for a used car, its condition.
- `driveBonus(score, scale)` adds about +0.05 to +0.15 to `acceptChance`.
- `driveExpect(c, score)` cuts `expect` (the discount they hope for) by up to a third.
- `Customer.wantsDrive` is rolled from the archetype's `drive` trait on its own `driveAskRng`, so the rest of the day plays as before.
  - Couples and regulars ask more, and decisive buyers less.
  - Tire-kickers ask often and rarely buy. That's the trap.
- `NO_DRIVE_PENALTY` applies to a shopper who asked for a drive and got a price instead.

Customers:

- New phase `driving`, from `talking` and back to `talking`.
  - The event `testDrive { carId, by }` sends them out. While walking to the car they stay in `talking` with `Customer.drive` set; the phase becomes `driving` once they're in.
  - The event `droveBack { drive }` brings them back.
  - `Customer.drive` is null until they've driven. Each visit gets one drive.
- `driving` drains no patience.
- `cancel` can't happen mid-drive, and neither can a walk-away.
- A drive still out at `close` comes back at once, and the customer is closed like one in `talking`.
- The 🔑 bubble shows over a shopper who `wantsDrive` and hasn't driven yet.

Inventory:

- A new `CarStatus` `'out'`. The store's `takeOut(carId)` and `bringBack(carId)` set it.
- A car that's out:
  - leaves `availableCars`, so it can't be browsed, offered or bought, and its tiles are freed;
  - is kept by `freeSlots` and `dropSold`;
  - is written back as available by the save.
- `closeUp` brings back any car that's still out.

Driving:

- `stockOutbound(space, to)` and `stockInbound(space, from)` in `sim/driving.ts`. They go out of the stock space (reversing where needed), down the aisle, through the gate and off the map by `ROAD_EAST` or `ROAD_WEST`. They reuse the gate legs from `outboundRoute`/`inboundRoute`.
- `scene/DrivenCar` gains a test-drive record:
  1. The shopper and the rider walk to the car's door side and get in.
  2. The car drives out and is hidden off the map for the drive's minutes, counted in game time so pause and `T` apply.
  3. It drives back into its own space, and they get out.
- The car yields to walkers (`blockedAhead`) and counts as crowd agents while it moves.
- `sfxFor` plays `door` and `engine` with a `vehicle` subject.

Player ride-along:

- `runtime.riding` hides the player's walker while they're in the car or off the map. `playerPos` stays at the door tile, so the camera waits on the lot.
- The HUD's drive bar shows the time left and **Head back** (✕, Esc). Head back shortens the time left to a quick return and sets `cut`.
- Clicks on the floor do nothing while riding. The office panels can still be opened.

UI and summary:

- `CustomerPanel` in `talking` gets **Test drive**. When `actionBlocker` blocks it, the button is disabled and shows the reason: nothing to drive, already driven, or the car is out with someone else.
- The summary shows "Test drives: N (M bought)". `DayStats.drives` holds `{ taken, bought, cut }`.

What's new: one `UPDATES` entry, `phase: '20'`.

Tests:

- `testDrive.test.ts`: `drivableCar`, the score, the bonus and expect maths, and the asking rates per archetype.
- `customers.test.ts`: the phase transitions, no patience drain, no cancel while driving, and close.
- `driving.test.ts`: the stock routes join the gate and both road ends for every open space.
- `store.testDrive.test.ts`: the bonus reaches `respondToAsk` and `dealWarmth`; a car that's out can't be sold, browsed or ordered over; `closeUp` brings it back.

### 20b: Talking points

New `sim/talkingPoints.ts` (pure, tested):

- `TOPICS`: safety, power, economy, comfort, space, tech, handling.
- `TOPIC_FIT` lists the liked topics by archetype (`ArchetypeTraits.topics`) and by body type. For example, a truck likes space and power, and a compact likes economy.
- `offerTopics(c, car, rng)` gives 3 topics, at least one of them a good fit.
- `topicFit(c, car, topic)` gives `good`, `ok` or `poor`. A prompt left unanswered counts as `ok`.

`ui/DrivePrompt.tsx`:

- It shows two prompts per drive, at a third and two thirds of the way. Each has 3 large buttons above the drive bar, with keys 1–3, and it's mobile friendly.
- It doesn't pause the game, and it's gone at the next prompt or when the car is back.
- The buyer's reaction shows as a small line ("Loves it" or "Hmm").

Chatter:

- A short `drive` exchange (`ConversationKind`, `FIRST_GAP_MS`, `nextLine`) while they walk to the car and again when they get out.
- A happy or flat reaction to each pick, through `reactionsFor`.

Easy (`dealHint`): the warmth chip marks the best topic.

What's new entry.

Tests: `talkingPoints.test.ts` (every archetype and body type has a good option; offers are seeded) and `chatter.test.ts`.

### 20c: Salespeople take drives, mud, wear and dings (save)

Salespeople:

- A new `SalesTask` `drive`.
  - `nextSalesTask` gives it to a salesperson whose claimed shopper `wantsDrive` and has a `drivableCar`. It comes before the pitch.
  - `SalesContext.carsOut` makes sure no car goes out twice.
- `scene/Staff` walks them to the car and calls the store's `staffTestDrive`.
  - Their `staffPos` is cleared while they're out, so they can't be greeted and take no tasks.
  - When they're back, they go straight on to the pitch.
- `staffTopics(skill, c, car, rng)`: the chance of picking a good topic rises with skill, from about 40% at skill 1 to about 85% at skill 5.
- From the panel, the player can hand a 🔑 shopper to a free salesperson with **Send with …**, which claims the shopper for them.

Mud and wear:

- `driveDirt(weather)` takes cleanliness down by about 0.15, or about 0.35 in rain.
- A used car's `UsedInfo.miles` goes up by `DRIVE_MILES` (about 10–20), which takes `marketValue` down a little.

Dings:

- At return, the drive rolls `dingChance(by, skill, weather, scale)` on its own seeded rng. It's about 3% a drive. It's lower with a skilled salesperson or the player riding along, a little higher in rain, and scaled by `Tuning.dingChance`.
- `InventoryCar.ding: boolean` gives `DING_PENALTY` (about −0.08) to `acceptChance` and shows a dent decal on `CarBody`.
- The fix is a `ding` `JobKind` in `JOBS` (short book time, small parts), booked through a `fixDing` action on the car.
  - Like `recondition`, the car goes to `'recon'` while it's worked on, and mechanics take it at recon priority.
  - Without a garage, the action is greyed out with a reason. The car can still be sold dinged, at the lower odds.
- `DayStats.drives.dings`. The parts go off `netIncome` as recon parts do now.

Save, next version:

- `InventoryCar.ding` is saved. Older saves load with `false`.
- `UsedInfo.miles` is already saved.

What's new entry. Help: the People tab (salespeople's drives) and the Business tab (dings).

Tests:

- `staffAi.test.ts`: the drive comes before the pitch, no car goes out twice, and topic picks rise with skill.
- `testDrive.test.ts`: dirt, miles and ding odds.
- `service.test.ts`: the `ding` job.
- `save.test.ts`: upgrade and round trip.

### 20d: Satisfaction, tips and balance

- **Visit score** (needs Phase 16):
  - `visitScore` gets the reason "Loved the test drive" (a high `driveScore`).
  - It also gets "Never got to drive it" (a shopper who asked and didn't drive).
  - If 16 isn't built yet, this item waits for it.
- **Tips** in `sim/tips.ts`:
  - `testDrive`: the first shopper with 🔑.
  - `ding`: the first car that comes back dinged.
  - `driveStaff`: three drives the player took in one day while a salesperson stood idle.
- **Balance** with the 18a bench if it's built, or with seeded runs, against the targets below on all three levels. The final constants go in the Status line.

Tests: `tips.test.ts`, and a balance test in `store.testDrive.test.ts` (a 28-day seeded run lands in the target bands).

## Performance

- At most one car is out for the player and one per salesperson.
- A car off the map isn't drawn and has no `vehiclePos`.
- Each drive is a handful of store events: out, two prompts and back.
- Nothing is computed per frame beyond what `DrivenCar` already does for a moving car.

## Help (every sub-phase)

- `ui/HowToPlay.tsx`:
  - Selling tab: test drives and Head back (20a), and talking points (20b).
  - People tab: salespeople's drives and **Send with …** (20c).
  - Business tab: mud, miles and dings, and the `ding` job (20c).
- `ui/controls.ts`:
  - The Esc line becomes "Cancel / walk away / head back".
  - Add `1–3` for a talking point.
  - In the touch list, ✕ becomes "Cancel / head back".
- Tips as in 20d.
- What's new: one `UPDATES` entry per sub-phase that changes play (20a, 20b, 20c), under `phase: '20'`.

## Tuning targets (Medium)

- About 35% of shoppers ask for a drive.
- A full drive with good talking points lifts the close rate by about 10–15 points and halves the haggle rounds. A drive cut short or with poor points lifts it by about 5.
- Asking for a price without the drive a shopper wanted costs about 5 points.
- About 1 ding in 30 drives, costing $200–500 to fix.
- Taking every drive yourself should cost more floor sales than it wins, so that a salesperson's drives pay for themselves.

## Verification (each sub-phase)

- `npm test` (the new test files above), `npm run lint`, `npm run build`, `npm run e2e`, plus CI if 18a has been built.
- `npm run dev` (or `/run`), with `T` for speed:
  - **20a:** take a 🔑 shopper out and check that:
    - the car leaves its space, the gate and the map, and comes back to the same space;
    - the player is hidden and the drive bar counts down;
    - Head back works;
    - a car that's out can't be browsed or sold;
    - the summary line shows.
  - **20b:** pick good and poor topics and compare the panel's warmth chip on Easy.
  - **20c:**
    - watch a salesperson take a 🔑 shopper out;
    - check dirt and miles after a drive on a rainy day;
    - force a ding with the dev rng, then fix it in the garage;
    - save and reload.
  - **20d:** with Phase 16 built, check the drive reasons in the visit score; check the tips on Easy.

## Left out

Robert left these out on 2026-10-10. They could make a later phase:

- Fleet deals: business accounts buying several cars on a contract.
- A town and road loop to watch the drive, with the camera following the car.
- Shoppers taking a car out alone, and joyriders.
- The player steering the car.
- Long or overnight drives (taking a car home for the weekend).
- Stopping at Nazma's lot on the way back.
