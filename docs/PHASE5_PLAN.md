# Phase 5 Plan — Buying inventory from the manufacturer

**Status:** Planned 2026-10-05. 5a done 2026-10-05 (awaiting review); next is 5b. We do one sub-phase per session and stop for Robert's review after each, the same as earlier phases.

## Context

The spec's Phase 5 is "the ability to buy inventory from the manufacturer". Today the dealership starts with 19 cars (`buildInventory` in `src/sim/inventory.ts`) and never gets more. A sold car's footprint is freed, and the only way back is the dev `R` restock cheat. Cars have an MSRP but no dealer cost, so the summary shows revenue and not profit. Without a cost there's nothing to decide when buying.

**Decisions made with Robert:**

- **Cost basis lives in Phase 5.** The cost and profit work drafted as Phase 6a moves here (5a), and `PHASE6_PLAN.md` is trimmed to match.
- **Paying for stock: cash or floor plan, chosen per order.**
  - Cash pays the invoice up front.
  - Floor plan is a credit line: the bank pays the manufacturer, you pay daily interest on each unsold car, and the loan is repaid out of the sale price.
  - Starting cash stays $25k, so the floor plan is how a new dealer grows.
- **Delivery next morning.** Cars ordered today are parked in free spots when the next day opens. This fits the save model (end-of-day only).
- **Where to order:** the office computer (walk over, **Order stock**) plus a top-bar **Stock** button and a key, the same way Staff works.

## Architecture additions

```
src/sim/
  ordering.ts         # pure: catalog/invoice, daily incentive, free slots, place/cancel order, deliver
  ordering.test.ts
  floorPlan.ts        # pure: limit, balance, daily interest, payoff on sale
  floorPlan.test.ts
src/ui/
  StockPanel.tsx      # catalog + pending orders + cars in stock (like StaffPanel)
```

- `sim/` stays pure. The store holds discrete state only: `orders`, `stockOpen`.
- Slot occupancy is worked out by comparing rects against `DISPLAY_CARS` and `parkedCarRect(PARKING_SPACES[i])`. The showroom-car shape doesn't change, and `spaceIndex` keeps its current meaning.
- Saves migrate rather than being dropped (the chain lives in `UPGRADES` in `sim/save.ts`; v2→v3 is in from 5a). `parseSave` gets a small upgrade chain (v2→v3→v4) so Robert's current save survives both bumps.

## Sub-phases

### 5a: Dealer cost and profit (moved from Phase 6a)

- **`InventoryCar.cost`:**
  - Rolled in `buildInventory` as MSRP × U(0.86, 0.92), rounded to $100 (`COST_FRACTION` in `sim/inventory.ts`).
  - The opening stock is owned outright.
- **Save:**
  - `SAVE_VERSION` → 3.
  - The upgrade fills v2 cars with `cost = round(msrp × 0.89)`.
  - `isCar` checks `cost`.
- **Sales and income (`deal.ts`):**
  - `Sale` gains `msrp` and `cost`.
  - New `grossProfit(stats)`.
  - `netIncome` = gross profit − wages − commissions + owner bonus.
  - Cash still receives the full sale price.
- **Commission on gross:**
  - `SALES_COMMISSION` changes from 3% of price to 25% of (price − cost), with a $100 floor (a "mini").
  - Lives in `sim/staff.ts` `payroll`. Update `staff.test.ts`.
- **DaySummary:**
  - Rows: Revenue, Cost of cars sold, Gross profit, Wages, Commissions, Net.
  - The per-seller table gains a Gross column.
- **Owner:** add a `profit` goal kind in `sim/owner.ts`. The amount is `(rng.int(6, 9) + 3 × salesStaff) × 1_000`. Update `goalLabel`, `goalProgress` and `judgeDay`.
- **Cost shown:** the car `InfoPanel` and `CustomerPanel` show "Your cost" under MSRP.
- **Help:** `HowToPlay` covers cost, gross profit and commission on gross.
- **Done when:** a sale shows the correct gross in the summary, commission follows gross, and an old save loads with costs filled in.

### 5b: Ordering, delivery and floor plan (sim + store)

**`sim/ordering.ts`:**

- **Catalog:**
  - `invoicePrice(model) = round(BASE_MSRP × 0.88, 100)`.
  - A delivered car's MSRP is rolled ±5% with the existing `rollMsrp` (export it). Its `cost` is the invoice it was ordered at.
- **Daily incentive:** `dailyIncentive(day)` picks one model at −5% invoice, seeded by day (`createRng(INCENTIVE_SEED + day)`). It gives the player a reason to check the catalog.
- **Free slots:**
  - `freeSlots(inventory, orders)` lists empty showroom platforms first, then empty lot spaces.
  - A slot counts as taken if an available car's rect sits on it or a pending order has claimed it.
  - The total is 30 (3 platforms + 27 spaces).
- **`Order`:** `{ id, model, cost, financing: 'cash' | 'floor', slot, day }`.
  - `placeOrder` fails with a reason if no slot is free, if cash < cost (cash orders), or if the floor plan would go over its limit.
  - `cancelOrder` refunds cash or frees credit. Cancelling is allowed the same day only, which is always true because orders deliver next morning.
- **`deliver(inventory, orders, rng, day)`:** makes an `InventoryCar` per order in its slot.
  - The car is clean, with `arrivedDay = day` (a new field) and `floored`.
  - Ids are `stock-<day>-<n>`.
  - Sold cars are dropped from `inventory` when the day opens, so the array doesn't grow forever. `DayStats.sales` already keeps the history the summary needs.

**`sim/floorPlan.ts`:**

- `FLOOR_PLAN_LIMIT = 200_000`.
- `FLOOR_PLAN_DAILY_RATE = 0.002` (0.2%/day, about $80/day on a $40k car).
- `floorBalance(inventory, orders)` = the cost of floored cars in stock plus floored pending orders.
- `dailyInterest(inventory)` = rate × the cost of floored cars in stock (pending orders accrue nothing).
- `payoffOnSale(car)` = `car.floored ? car.cost : 0`.

**Store (`state/store.ts`):**

- **State:** `orders: Order[]`.
- **New actions:**
  - `orderCar(model, financing)`: cash is taken now.
  - `cancelOrder(id)`.
  - `payOff(carId)`: pays a floored car's cost from cash, so it stops accruing interest.
- **`sellCar`:** cash += price − payoff. The sale still records the full price, and payoff is cash flow, not profit.
- **`settleDay`:** charges `dailyInterest`, records `interest` on `DayStats`, and takes it off cash. `netIncome` subtracts interest.
- **`beginDay`:** delivers the orders, clears them, and drops sold cars before `dirtyOvernight`. A notice: "3 cars delivered: 2 on the lot, 1 in the showroom".
- **Missed demand:**
  - When a customer is generated (arrivals, `walkIn`, the dev spawn) and none of their `preferredModels` is in stock, bump `DayStats.missed[model]` for their first preference.
  - This gives the player a reason to order the right body types.
  - Check how `chooseTarget` behaves with an empty or near-empty lot, and make sure customers still leave sensibly.
- **Owner:** `generateGoal` already reads the inventory. Check that it handles a lot with fresh deliveries.

**Save:**

- `SAVE_VERSION` → 4. `SaveData` gains `orders` (an order placed late in the day is delivered on resume).
- `InventoryCar` gains `arrivedDay` and `floored`.
- The upgrade fills v3 cars with `arrivedDay: 1, floored: false` and `orders: []`.

**Done when:** store tests cover a full day: order (both financing types) → save/resume → delivery into the right slots → sell a floored car → payoff and interest are correct.

### 5c: Stock panel, office computer, help

- **`ui/StockPanel.tsx`** (modelled on `StaffPanel`, with `stockOpen`/`toggleStockPanel` in the store):
  - **Header:** cash, floor plan used out of the limit, and free slots ("Lot: 4 free · Showroom: 1 free").
  - **Catalog:** one row per model, showing:
    - invoice price, MSRP and margin
    - the incentive badge
    - yesterday's "asked for, not in stock" count
    - **Buy (cash)** and **Floor plan** buttons, disabled with the reason as a tooltip or label
  - **Arriving tomorrow:** pending orders with **Cancel**.
  - **In stock:** each car's name, location, days on lot, MSRP/cost, a "Floor plan · $X/day" badge, and **Pay off**.
  - Compact/coarse layout: `max-height` plus scroll, ≥44px buttons, and it swallows `onPointerUp` per the touch rules.
- **Office computer:**
  - `office-monitor` becomes an interactable in `buildInteractables` (`sim/interactables.ts`) with a new `orderStock` action (instant, opens the panel on arrival).
  - It's approached from the desk chair side. Check the approach tiles, since the monitor sits on the desk.
- **Opening it:**
  - A top-bar **Stock** button next to Staff.
  - The `I` key (inventory) in `ui/HUD.tsx`.
  - Add both to `CONTROLS` and `TOUCH_CONTROLS` in `ui/controls.ts`.
- **DaySummary:**
  - An "Floor plan interest" row.
  - A "Missed: Summit Ridge ×2, Summit Hauler ×1" line when demand went unmet.
  - An "Arriving tomorrow: N cars" line.
- **Help (`ui/HowToPlay.tsx`):**
  - Ordering, next-morning delivery, slots, and cash vs floor plan (interest, payoff on sale).
  - Incentives, and using missed demand.
- **Dev restock:** the `R` cheat keeps working. It only restores sold cars whose slot is still free; check that against `freeSlots`.
- **Done when:** on desktop and at 667×375 touch, the player can order from the computer and from the button, see the cars next morning, and read interest and missed demand in the summary.

## Files touched (main)

- `src/sim/`:
  - new: `ordering.ts`, `floorPlan.ts`
  - changed: `inventory.ts`, `deal.ts`, `staff.ts`, `owner.ts`, `save.ts`, `interactables.ts`
  - plus tests
- `src/state/store.ts` and `persistence.ts` (if needed), plus the store tests (`store.sales`, `store.deal`, a new `store.stock.test.ts`).
- `src/ui/`: `StockPanel.tsx` (new), `TopBar.tsx`, `HUD.tsx`, `DaySummary.tsx`, `InfoPanel.tsx`, `CustomerPanel.tsx`, `HowToPlay.tsx`, `controls.ts`, `hud.css`.
- `docs/PHASE5_PLAN.md`, `docs/PHASE6_PLAN.md` and `CLAUDE.md` (pointer and conventions line, when 5a starts).

## Reuse

- Rolling prices: `rollMsrp` and `BASE_MSRP` (`sim/inventory.ts`).
- Slot geometry: `PARKING_SPACES`, `parkedCarRect` and `DISPLAY_CARS` (`sim/layout.ts`).
- Grid updates: `applyToGrid` already blocks and frees footprints from inventory status.
- Rendering: `Cars` in `scene/Props.tsx` renders from `availableCars`, so delivered cars appear with no scene work.
- Panel pattern: `StaffPanel` and `toggleStaffPanel` (store, `TopBar`, `HUD` key handler).
- Seeded RNG: `createRng`, with per-day seeds like `OWNER_SEED`.

## Verification (each sub-phase)

- `npm test`, `npm run lint` and `npm run build` all pass.
- **New Vitest coverage:**
  - `ordering.test.ts`:
    - showroom slots fill first
    - orders and cars never share a slot
    - placing an order fails when full, short of cash or over the limit
    - cancel refunds
    - deliveries get the right rect and facing per slot
    - the incentive is deterministic by day
  - `floorPlan.test.ts`: balance, interest only on stocked floored cars, payoff.
  - `save.test.ts`: v2→v3→v4 upgrades, and orders round-trip.
  - `deal.test.ts`/`staff.test.ts`: gross profit, commission on gross with its $100 floor, net with interest.
  - `owner.test.ts`: the profit goal.
  - Store tests: the full order → resume → deliver → sell flow.
- **Manual in `npm run dev`:**
  1. Sell a car and check that the summary shows revenue, cost, gross and net.
  2. Walk to the office computer and order one car with cash and one on the floor plan.
  3. Cancel and re-order. End the day.
  4. Reload and continue: both cars are parked (showroom first) and clean, and the morning notice shows.
  5. Sell the floored car. Cash goes up by price − cost.
  6. End the day and check the interest row and missed demand.
  7. Check the Stock panel at a phone-sized landscape viewport.

## Out of scope

- Delivery trucks or animation.
- Used cars and trade-ins.
- Choosing a specific slot for a delivery.
- Moving cars between the lot and the showroom.
- Manufacturer allocation limits or backorders.
- Negotiation (Phase 6) and marketing (Phase 7).
