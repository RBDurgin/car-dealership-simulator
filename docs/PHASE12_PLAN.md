# Phase 12 Plan: Trade-ins and Used Cars

**Status:** planned 2026-10-07. 12c done 2026-10-07. 12d done 2026-10-07. We do one sub-phase per session and stop for Robert's review after each, the same as earlier phases. It builds on everything built through Phase 11: Nazma, the calendar, weather, quota, events and difficulty. The save is v11 today, so 12a makes it v12.

## Context

Every car on the lot today is new, ordered from the manufacturer. Phase 12 adds a second, cheaper market: used cars. They come in two ways. Buyers trade in their old car as part of a deal, and sellers come in wanting cash for theirs. That gives the player appraisal decisions, a haggle over two numbers (price and trade-in allowance), and stock that loses value the longer it sits.

**Decisions made with Robert (2026-10-07):**

- **Both kinds of intake.** Trade-ins are part of a sale. Sellers who only want cash are their own kind of visitor.
- **Trade-in and seller customers drive in.** They park in a new customer-parking strip, so you can look at the car, and appraise it, before you talk to them. Everyone else still arrives on foot.
- **No reconditioning and no auction.** A used car is sold as it is, though washing still works. It goes to **used-car buyers**, and it **loses value each day** on the lot.

## Levers that already exist

| Lever                                          | Where                                                                     | Phase 12 use                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `InventoryCar`, `BASE_MSRP`, `rollMsrp`        | `sim/inventory.ts`                                                        | Add `used: UsedInfo \| null`. A used car's `cost` is what we paid for it                                                                       |
| `freeSlots` / `placeOrder`                     | `sim/ordering.ts`                                                         | Trade-ins and bought cars reserve a lot slot (never a showroom platform), the same way orders do                                               |
| `respondToAsk`, `askRange`, `staffAsk`         | `sim/negotiation.ts`                                                      | `respondToBuyOffer` mirrors `respondToAsk` for sellers. The trade allowance is a second haggle number                                          |
| `acceptChance`, archetypes, `sourceWeights`    | `sim/customers.ts`, `sim/archetypes.ts`                                   | New `used-shopper` archetype. Accept on a used car depends on condition and on price against market value                                      |
| `Sale`, `DayStats`, `grossProfit`, `netIncome` | `sim/deal.ts`                                                             | `Sale.trade`, `DayStats.bought`, used and new gross shown apart in the summary                                                                 |
| Cleanliness, porter                            | `sim/cleanliness.ts`, `nextPorterTask`                                    | Used cars arrive dirty, so the porter's washing keeps mattering                                                                                |
| `CHANNELS`                                     | `sim/marketing.ts`                                                        | A Classifieds channel that skews toward used shoppers and sellers                                                                              |
| Ambient walkers, `runtime` blocking            | `scene/walker.ts`, `scene/runtime.ts`                                     | Drivers walk from their parked car; a moving or parked car blocks its tiles                                                                    |
| Save `UPGRADES`                                | `sim/save.ts`                                                             | Bump the version and default `used: null`                                                                                                      |
| Manufacturer quota, `addSale`                  | `sim/quota.ts`, the store's `sign`                                        | Used sales don't count toward the quota or the holdback                                                                                        |
| Day's traffic scale (weekday, weather, event)  | `Word.scale` in `beginDay`                                                | Applies to driven-in visitors and sellers like everyone else; nothing new needed                                                               |
| Overnight dirt with rain                       | `dirtyOvernight(inventory, lotDirt)`                                      | Used cars on the lot get it the same way                                                                                                       |
| Sales events, incentives                       | `sim/events.ts` `extraDiscount`, `sim/ordering.ts` incentive and closeout | An event's discount applies to a used car's price too. Incentives and closeouts stay new-car only                                              |
| Nazma                                          | `sim/nazma.ts` (`planVisit`, `planTheft`, `stolenRecord`)                 | Used lot cars can be smudged or stolen, and a stolen one writes off what we paid. A car in customer parking isn't stock, so it can't be stolen |
| Difficulty                                     | `sim/difficulty.ts` `Tuning` / `TUNING`                                   | New levers in 12c and 12d, with Medium neutral                                                                                                 |
| Easy help                                      | `dealWarmth` in `sim/negotiation.ts`, `sim/tips.ts` `TIPS`                | The deal hint covers buy offers and the net after a trade. New first-time tips                                                                 |

## Sub-phases

### 12a: Used stock foundation (pure + save + stock panel)

- New `sim/usedCars.ts` (pure, tested):
  - `UsedInfo { year, miles, condition (0–1), acquiredDay }`.
  - `rollUsedCar(rng, day)`:
    - The model is weighted like the catalogue.
    - The age is 2–10 years.
    - Miles are about 12k a year, with some jitter.
    - The condition is rolled too, and older or higher-mileage cars tend to roll worse.
  - `marketValue(car, day)` is `BASE_MSRP × ageCurve(years) × mileFactor × conditionFactor`. It then loses `DAILY_DEPRECIATION` (about 0.6%) for each day since `acquiredDay`. That daily loss is the aging pressure.
  - `appraise(info, skill, rng)` returns an estimate whose noise shrinks as skill rises. The player counts as `PLAYER_SKILL`.
  - `usedListPrice(value)` is the market value plus about 12%, rounded to $100. It becomes the used car's `msrp`, the sticker price the haggle opens from.
- `InventoryCar.used` defaults to null.
  - Used car ids are `used-<day>-<n>`.
  - Used cars are always paid in cash, never floored.
- Save:
  - Bump `SAVE_VERSION` to 12.
  - Add an `UPGRADES[11]` step that sets `used: null`.
  - Teach `isCar` to accept `used`.
- Stock panel: each used car in the in-stock list gets:
  - A "Used · 2019 · 64k mi" tag.
  - Days on the lot.
  - Its current market value, with a hint that it's falling.
  - Used cars aren't in the order catalogue.
- Quota: the store's `sign` skips `addSale` for a used car, so only new cars count toward the manufacturer's quota and holdback.
- Scene: a used car's paint is slightly faded by `condition`, on top of the cleanliness tint in `scene/Props.tsx`. Its price label reads "Used".

### 12b: Driving in and customer parking

- In `layout.ts`, `CUSTOMER_PARKING` is 3 spaces in the open asphalt between the building and the east front row (around tx 25–31, tz 15–18).
  - It must stay clear of the walkway, `PORTER_STANDBY_TILES` and the improvement footprints. Check this in `layout.test.ts`.
  - These spaces are never stock slots.
- `Customer.vehicle: { car: UsedInfo & { model }, spot: number } | null` is set when the customer spawns, and only if a spot is free. That means at most 3 driven-in visitors at once.
- `scene/DrivenCar.tsx` drives the car along the road, in through the driveway gate and into its spot on a fixed path.
  - It's eased in `useFrame`, and the car's position lives in a ref.
  - The driver gets out and walks in as usual.
  - If the visitor leaves without a deal, they walk back and drive off.
  - While a car is moving, walkers wait at the gate: `scene/runtime` blocks the tiles along its path. A parked car blocks its spot.
- Sound: new `SfxCue`s `engine` and `door`, with the car as subject, played through `spatialMix`. Credit both in `public/audio/LICENSE.md`.
- No per-frame store state. The store only gets `parked` and `droveOff` events.
- Drive-ins come out of the day's planned arrivals, so weekday, weather and event traffic already applies to them.
- **As built (2026-10-07):**
  - The spaces are tx 26–31, tz 15–18, noses to the showroom, and the driver gets out at the tile behind the car (`doorTile`).
  - About 35% of planned arrivals drive in (`DRIVE_IN_CHANCE`), rolled on their own `driveRng` so the rest of the day is unchanged. Passers-by who walk in never drive.
  - `Customer.vehicle` also has `parked`. `parked` stands in for `arrive`, and `droveOff` for `despawn`.
  - Changed from the plan: a moving car doesn't block its path on the grid, because walkers aiming for the gate would find no path and give up. Instead the car stops for anyone in front of it (`blockedAhead`) and pushes on after 4 seconds, and walkers step around it as crowd agents.
  - `engine` and `door` are synthesized, like the spray and the fanfare.

### 12c: Sellers (we buy your car)

- A new `seller` visitor kind drives in and waits by their car (a new waiting spot) for an offer. They want cash only. The receptionist points them out like any other waiting customer.
- Interacting with a seller:
  - Clicking the parked car gives **Appraise**. The player walks over and looks for `APPRAISE_SECONDS`, which narrows the value estimate shown in the panel.
  - Clicking the seller gives **Make offer**. You can make an offer without appraising, but your estimate is wider.
- `respondToBuyOffer(seller, offer, rng)` in `sim/negotiation.ts` answers accept, counter or walk.
  - It works from the seller's `hope` (market value × archetype jitter) and their rounds.
  - It mirrors `respondToAsk` and reuses the `Haggle` shape.
  - The controls go in `ui/CustomerPanel.tsx`, worded "Buy for $X", with a margin line against the estimated market value.
- Buying a car needs a free lot slot. Without one, the panel says "No room on the lot".
  - Cash goes down straight away.
  - The car stays in customer parking until closing. Then `settleDay` puts it in the reserved slot as an `InventoryCar`, dirty and with `cost` set to what we paid, so the end-of-day save keeps it.
  - `freeSlots` gets a `reserved` argument so that orders and trades can't claim the same space.
- Summary:
  - A "Bought 2 used cars ($18,400)" line, with the cars listed in `DayStats.bought`.
  - The spend is a stock purchase, not an expense, so it stays off `netIncome`.
- Staff: in 12c, salespeople ignore sellers. They start buying in 12d.
- Difficulty:
  - Add `Tuning.sellerHope` (× a seller's hope: Easy 0.95, Medium 1, Hard 1.05) to `TUNING`.
  - Add `Tuning.appraisalNoise` (× appraisal noise: Easy 0.7, Medium 1, Hard 1.2) to `TUNING`.
  - On Easy, the deal hint shows how warm a seller is to your offer (a `dealWarmth` for buy offers).
  - A first-time `TipId` `seller`: "A seller drove in wanting cash for their car. Appraise it before you make an offer."

- **As built (2026-10-07):**
  - 30% of drivers are sellers (`SELLER_CHANCE`). A seller hopes for the car's market value plus their archetype's haggle `expect` (± jitter), so bargain hunters want most. They wait at their car's door tile.
  - Before appraising, the player sees a glance estimate (±25%, `GLANCE_NOISE`); **Appraise** (4 s) narrows it to the player's skill (±12%), both × `Tuning.appraisalNoise`.
  - `respondToBuyOffer`: at or over their hope (or their counter) they sell 90% of the time (plus half their archetype's `accept`); under 70% of hope they may leave insulted; the first counter is 3% over hope and later ones come down; on the last round they walk under 92% of hope.
  - We open 15% under our estimate (`suggestedBuy`). Appraising the car of the seller you're talking to doesn't end the conversation.
  - The bought car stays parked (held in the store's `purchases`, not saved) and holds both its parking space and a lot slot; the seller walks off down the sidewalk. Its cleanliness comes from `drivenCleanliness`, so the stock car matches what was parked.
  - The summary lists each car with what it was really worth, so the player can judge their appraisals.

### 12d: Trade-ins in a sale

- About 35% of driven-in buyers have a trade (`Customer.trade`). Each one has a `hope` for its allowance, usually 5–15% over its real value.
- The haggle has two numbers, price and allowance.
  - The customer judges the net (price − allowance) against the net they expect.
  - An allowance far below their hope (under about 80%) insults them and costs a haggle round.
  - So a big allowance with a firm price is a real tactic. It works best on regulars and couples.
  - `respondToAsk` gains an optional `trade` argument, and `askRange` and `suggestedAsk` work on the net.
- The haggle controls get an allowance stepper and a "You pay $X after trade" line. **Appraise** works on the buyer's parked car too.
- When the deal is signed:
  - Cash comes in as `price − allowance`, less any floor plan payoff as now.
  - `Sale.trade = { model, allowance, value }` is recorded.
  - The traded car goes onto the lot overnight, as in 12c, with `cost` set to the allowance.
  - Over-allowing isn't a loss when the deal is signed. It shows up later as a thin or negative gross when the used car sells.
- No room on the lot means no trade. The customer still shops, but is less likely to accept (`NO_TRADE_PENALTY`).
- Staff:
  - `staffAllowance(skill, appraisal, hope)` in `sim/negotiation.ts` sets a salesperson's allowance. A green salesperson over-allows. A skilled one anchors low and concedes toward the appraisal.
  - Salespeople now buy from sellers through `staffBuyOffer`, never above the appraisal. `nextSalesTask` treats sellers like any other waiting customer.
- Summary: the per-seller table gets a "trade over/under" column (allowance − true value).
- An event's `extraDiscount` applies to the price, not the allowance.
- Difficulty:
  - Add `Tuning.tradeHope` (× the allowance a buyer hopes for: Easy 0.95, Medium 1, Hard 1.05).
  - On Easy, the deal hint judges the net (price − allowance).
  - A first-time `TipId` `tradeIn` the first time a buyer brings a trade.

- **As built (2026-10-07):**
  - `sim/tradeIns.ts`: 35% of drivers who aren't sellers have a trade (`TRADE_CHANCE`), hoping for 5–15% over its value (× `Tuning.tradeHope`). It starts with a glance estimate, and **Appraise** works on their parked car as for a seller.
  - The haggle is in nets: `respondToAsk(…, allowance)` weighs `price − allowance` against `hopePrice − trade.hope`, and with a trade `Haggle.lastAsk`/`counter` are nets (`Haggle.allowance` keeps the last allowance). The customer counters with a net ("…after my trade").
  - An allowance under 80% of their hope (`TRADE_INSULT`) gets a counter that costs an extra round (`respond`'s `insulted`), or a walk on the last round. At or over their hope, `TRADE_PRIDE` adds to the odds (regulars +8%, couples +10%). No lot space: the trade is left out and `NO_TRADE_PENALTY` (15%) comes off the odds.
  - The player opens at 95% of their estimate (`suggestedAllowance`). The panel has an allowance stepper, "They pay after trade" and an estimated trade margin.
  - At signing, the trade takes a lot space through `purchaseOf` (no space left: the deal falls through). Cash comes in as price − allowance, `Sale.trade` records it, `DayStats.bought` lists it with `trade: true`, and the buyer walks off down the sidewalk (`signed`'s `traded` clears `vehicle`).
  - Staff: `staffAllowance` (skill ≤ 2 gives the buyer's hope; better ones open 3% per skill over 2 under their appraisal and come up half the gap a round, never past it). `staffBuyOffer` opens 5–15% under the appraisal, never offers over it. A salesperson's appraisal is seeded by customer and employee (`staffAppraisal`). They take sellers only while `buyBlocker` is clear (`SalesContext.buying`).
  - The per-seller summary table has a "Trades ±" column (allowance − value), shown once a trade was taken.

### 12e: Used-car buyers and aging

- A new `used-shopper` archetype in `sim/archetypes.ts`:
  - Their budget is about 0.45–0.6 of new MSRP, and they want a wider range of models.
  - Their browse picks weight used cars 4×.
  - They haggle for more rounds (`haggle.rounds`).
  - Regular and bargain buyers look at used cars too, at a lower weight.
- `acceptChance` judges a used car's price against `marketValue`, not MSRP, and adds ± by condition (`CONDITION_BONUS`, up to ±10%). The expectation in `respondToAsk` is anchored on market value too.
- Aging pressure:
  - `marketValue` falls every day, so a car priced at yesterday's value gets harder to sell.
  - The stock panel shows days on the lot and a red flag past `STALE_DAYS` (about 10).
  - The summary shows used gross apart from new gross (`grossProfit` split by `used`).
- Marketing: a Classifieds channel that's cheap, gives a small boost, and has `sourceWeights` toward `used-shopper` and sellers.
- Reputation: no change. A used sale counts the same as a new one, and so does the owner's `sales` goal. It doesn't count toward the quota (12a).

## Help (every sub-phase)

- Update `ui/HowToPlay.tsx` (used cars, appraising, trade-ins, sellers, aging) and `ui/controls.ts` (Appraise, Make offer, allowance) as each feature lands, describing only what's built. Add the new Easy tips to `sim/tips.ts`.

## Tuning targets

- A trade-in's market value is about $6–30k. A fair allowance leaves about 10–15% gross on the resale.
- A used car loses about 6% of its value over 10 days, so holding stock longer than that should hurt.
- Used shoppers are about 20% of visitors without Classifieds and about 35% with it.
- On Hard, over-allowing on trade-ins should be the usual way to lose money.

## Verification (each sub-phase)

- `npm test`:
  - `usedCars.test.ts`: valuation, depreciation and appraisal noise by skill.
  - `negotiation.test.ts`: `respondToBuyOffer`, trade allowance and staff allowance.
  - `ordering.test.ts`: reserved slots.
  - `layout.test.ts`: customer parking is clear.
  - `deal.test.ts`: the used and new gross split.
  - Store tests: buying a car, a trade-in and overnight placement.
  - A store test that a used sale leaves `monthSales` alone.
  - `difficulty.test.ts`: every level has the new levers and Medium's are neutral.
  - A save upgrade test: a v11 save loads into v12.
- `npm run lint`, `npm run build`.
- `npm run dev` / `/run`:
  - Watch a car drive in and park.
  - Appraise it, buy it, and see it on the lot the next morning.
  - Sell a car with a trade-in, and check the cash and the summary.
  - Let a used car sit and watch its value fall.
  - Resume a save and confirm the used stock is still there.
