# Phase 22 Plan: Dealer Auctions and Wholesale

**Status:** planned 2026-10-12. Phase 22 comes after Phase 21 (staff growth and morale) in the plan. It needs only built phases: 10a (the calendar), 12 (used cars), 13a (ranks), 13b (the franchise tier), 14 (the rival), 15b (reconditioning), 17 (stats and achievements) and 18 (the store slices, the bench and CI).

- Phases 19 (F&I), 20 (test drives) and 21 (staff growth) don't need to be built first. Once 21 is in, the used-car manager's inspections and auction buys count toward their work tally.
- 22d, 22e and maybe 22f change the save. Each takes the next free save version (`SAVE_VERSION` + 1) when it's built.
- As in earlier phases, we do one sub-phase per session and stop for Robert's review after each.

## Context

Used stock comes from two places today: sellers who drive in (12c) and trade-ins (12d). Both become a `Purchase` that `settleDay` turns into stock through `stockPurchases`. A used car that won't sell only gets an `isStale` badge and keeps losing `DAILY_DEPRECIATION` a day. A rough trade-in can be reconditioned once there's a garage (15b), and otherwise the only way out is to sell it.

Phase 22 adds the dealer auction, the trade's wholesale market:

- **A weekly auction.** Every Wednesday a run list of used cars is sold one lot at a time. You bid live from the office computer against other dealers while the floor keeps running.
- **Cars aren't always what the sheet says.** Each lot shows a grade and its miles, but the true condition can be worse. Inspection narrows it, and a car that comes in rough is a job for the garage.
- **A used-car manager.** A new role who inspects the run list, bids up to the limits you set while you're busy, and suggests cars to wholesale.
- **A way out.** Consign a stale or rough used car to the next auction and take what the other dealers pay, less a fee.
- **Nazma at the auction.** While his lot is open he bids against you, harder when he's losing. A car you wholesale can end up on his lot, and a car he stole from you can turn up in the run.

**Decisions made with Robert (2026-10-12):**

- **A live bidding panel.**
  - The auction opens on the office computer's new **Auction** tab. Lots come up one at a time, the price climbs, and you **Bid** or **Pass** against AI bidders.
  - The game isn't paused. The office computer panel never pauses the game, so the floor keeps running while you bid.
- **Weekly, on a fixed weekday.** The auction is on Wednesdays. It's derived from the day number like `eventOn`, so nothing about the schedule is saved, and the run list can be previewed from the Monday before.
- **Graded, with surprises.**
  - Each lot shows a grade (Good, Fair, Worn, Rough) and its miles.
  - The true condition is hidden and can be a step worse.
  - Inspection narrows the gap, and the next morning's notice names any car that came in worse than its grade.
- **Wholesale means consigning to the next auction.**
  - A used car you send runs as a lot like any other and sells to the highest bidder, less a seller fee.
  - A floor price is optional. Under it, the car comes back with a run fee.
- **A new used-car manager role.** One hire, once the auction is open. They inspect the run list the day before, bid with your max bids whenever you aren't bidding yourself, and suggest stale cars to wholesale.
- **Rank-gated.** The auction opens at Main Street (`main-street`, the rank that announces Nazma), so the early game stays as it is. Robert can move the gate at review.
- **Nazma bids while his lot is open.**
  - He's an aggressive bidder, more so when `desperation` is high.
  - A wholesale car he wins goes on his lot.
  - A car he stole from you can come up at the auction for you to buy back.

## Levers that already exist

| Lever                                                                                                        | Where                                                                | Phase 22 use                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `UsedInfo`, `rollUsedCar`, `marketValue`, `DAILY_DEPRECIATION`                                               | `sim/usedCars.ts`                                                    | Lots are rolled with `rollUsedCar`, and `wholesaleValue` is a share of `marketValue`                |
| `appraise`, `appraisalNoise`, `PLAYER_SKILL`, `shapeLabel`                                                   | `sim/usedCars.ts`                                                    | The lot's grade is a noisy `shapeLabel`, narrowed by inspection at the inspector's skill            |
| `usedStockCar`, `nextUsedId`, `isStale`, `STALE_DAYS`                                                        | `sim/usedCars.ts`                                                    | Auction buys become stock through `usedStockCar`; stale cars are suggested for wholesale            |
| `Purchase`, `reservedSlots`, `lotSlotFor`, `buyBlocker`, `boughtRecord`, `stockPurchases`, `DayStats.bought` | `sim/sellers.ts`, `state/slices/customers.ts`, `state/slices/day.ts` | Auction wins hold a lot slot like a purchase and are stocked in `settleDay` beside `stockPurchases` |
| `freeSlots`, `OrderBook.reserved`                                                                            | `sim/ordering.ts`                                                    | Won lots are reserved, so an order can't take their space                                           |
| `finishRecon`, `reconBlocker`, `autoRecon`, `RECON_MAX`                                                      | `sim/service.ts`, `state/slices/service.ts`                          | A rough arrival can go straight to the garage                                                       |
| `calendarOf`, `weekStart`, `eventOn`/`closeoutOn` (seeded, nothing saved)                                    | `sim/calendar.ts`, `sim/events.ts`                                   | `isAuctionDay` and `runList` follow the same pattern with their own seed                            |
| `desperation`, `sabotageScale`, `strength`, `rival.stolen`, `rivalStole`, `isRival`                          | `sim/rival.ts`                                                       | Nazma's bidding, his lot stock and the stolen-car buy-back                                          |
| `RANKS`, `rankOf`, `TIER_PERKS`, `MODEL_TIER`                                                                | `sim/progression.ts`, `sim/franchise.ts`                             | The auction's rank gate, more lots at higher ranks, and luxury lots at Gold                         |
| `Role`, `ROLE_LABELS`/`ROLE_BADGES`/`ROLE_BLURBS`, `roleLimits`, `WAGES`, `POSTS`                            | `sim/staff.ts`                                                       | The new `buyer` role                                                                                |
| `nextSalesTask`, `nextPorterTask`, `report`                                                                  | `sim/staffAi.ts`, `scene/Staff.tsx`, `scene/walker.ts`               | `nextBuyerTask` for the used-car manager                                                            |
| `ComputerTab`, `TABS`, `TAB_HINTS`, `toggleStockPanel`                                                       | `state/types.ts`, `ui/StockPanel.tsx`, `ui/HUD.tsx`                  | The **Auction** tab on key J                                                                        |
| `netIncome`, `totalGross`, `grossSplit`                                                                      | `sim/deal.ts`                                                        | Wholesale gross (which can be negative) is added to `totalGross`                                    |
| `Tuning`/`TUNING`, `ACHIEVEMENTS`, `TIPS`, `SfxCue`, `speak`                                                 | `sim/difficulty.ts`, `sim/achievements.ts`, `sim/tips.ts`, `audio/`  | The levers, achievements, tips, the gavel and the auctioneer                                        |

## Sub-phases

### 22a: The auction foundation and the run list (no save)

New `sim/auction.ts` (pure, tested):

- `AUCTION_WEEKDAY` (Wednesday) and `isAuctionDay(day)`, from `calendarOf`.
- `auctionOpen(career)`: true from `AUCTION_RANK` (`main-street`).
- `runList(day, { rank, tier })`: the week's lots.
  - It's seeded by `weekStart(day)` with a new `AUCTION_SEED`, like `closeoutOn`, so the same week always gives the same list and nothing is saved.
  - It gives `RUN_SIZE[rank]` lots (6 at Main Street, up to 10 at the top rank).
  - A `Lot` is `id` (`lot-<day>-<n>`), `model`, `UsedInfo` from `rollUsedCar`, `grade` (a noisy `shapeLabel` reading of the hidden `condition`; until 22c the grade is the truth) and `order` in the run.
  - Luxury models (`MODEL_TIER`) appear only at Gold.
- `wholesaleValue(model, info, day)`: `marketValue` × `WHOLESALE_FACTOR` (about 0.8). This is what the trade pays a dealer for a car that still has to be retailed.
- `BUYER_FEE` (a flat fee plus a share of the price) and `auctionCost(price)`.
- `bidBlocker(book, price)`: the reason a bid can't be made. Either there's no lot space (`lotSlotFor` with every reserved slot) or not enough cash for the price plus the fee. Lot cars are paid in cash, like every used car.

The store:

- `auctionWins` (mid-day, never saved): each win holds its lot slot. `reservedSlots` (or a sibling) takes them, so `freeSlots`, `OrderBook` and `BuyBook` see the space as taken.
- `settleDay` stocks the wins beside `stockPurchases`, through `usedStockCar` at the price plus the fee, so the car is on the lot the next morning.
- `DayStats.auction` (`AuctionStats`): `bought` (model, year, price, fee and value). The spend is stock, not an expense, so like `bought` it stays off `netIncome`.

UI:

- **Auction** tab (`computerTab` `'auction'`, key J; A is movement): the week's run list with grade, miles, an estimate range from `wholesaleValue`, and how long until the auction. Before `auctionOpen` it says which rank opens it.
- The Calendar tab marks auction days.

Other:

- There's no live bidding yet. Dev: Shift+J buys the first lot still in the run at its wholesale value, to test the pipeline.
- What's new entry. Help: the Business tab (the auction).
- Tests: `auction.test.ts` (the weekday, the seeded list, the gate, the blocker) and the store's settle (a win is stocked the next morning and holds its slot).

### 22b: Live bidding

New `sim/bidding.ts` (pure, tested):

- `AuctionState`: `lotIndex`, `price`, `high` (`'player'`, a bidder id or null), `call` (open → once → twice → sold) and `results`.
- `bidderMaxes(lot, rng, heat)`: three to five AI dealers, each with a top bid spread around `wholesaleValue` and scaled by `heat`.
- `stepAuction(state, lots, minutes)`:
  - AI bidders raise by `BID_STEP` until past their top bid.
  - The call advances while nobody raises.
  - A lot is sold at `sold`. It's passed if nobody opened it.
- `playerBid(state)` raises by `BID_STEP` to the player, refused through `bidBlocker`.

The day:

- On auction day the run goes from `AUCTION_START` to `AUCTION_END`. It's kept in the store's `auction` (never saved) and stepped in `tickClock`'s batch, so it stops while the game is paused. The rngs live in `state/rng.ts` (`rng.auction`, seeded by the day), so nothing else in the day shifts.
- Lots the player doesn't bid on go to the AI bidders.
- A morning notice on auction day, and "The auction is starting" when the window opens.

UI:

- The Auction tab's live view: the lot on the block (model, year, miles, grade), the price, the high bidder, the call, **Bid** and **Pass** (skip this lot), and the lots still to come.
- After the run it lists what sold and for how much, which shows the player the going prices.
- The top bar shows a small live-auction chip while the run is on, so the player can leave the panel and come back.

Audio:

- A new `SfxCue` `gavel` (synthesized) on each sale.
- A fast `auctioneer` gibberish line through `audio/voice.ts` while the panel is open on a live lot.

Other:

- What's new entry. Help: the Business tab (bidding).
- Tests: `bidding.test.ts` (AI stops at its top bid, the call, the player's bid and blocker, a pass) and the store's tick (the run advances only on auction day, inside the window).

### 22c: Inspection and surprises (no save)

- The lot's hidden `condition` and its shown `grade` now differ: the grade reads `condition` plus a `gradeNoise` that leans optimistic. It's usually right and sometimes a step better than the truth.
- The player's **Inspect** on a run-list lot (a small fee, any day before the run) narrows the reading to `appraisalNoise(PLAYER_SKILL)` and shows a tighter estimate. Inspections are kept in the store's `inspected` (never saved, so an inspection is lost on reload; the list itself is seeded and doesn't change).
- On arrival in `settleDay` the car is stocked at its true condition. The next morning's notice names any car that came in worse ("The Hatch you bought graded Good, arrived Worn").
- With a garage and `service.autoRecon`, rough arrivals go to recon the next morning the same way yesterday's buys already do.
- `DayStats.auction.surprises`.
- What's new entry. Help: the Business tab (grades and inspection).
- Tests: grade noise stays within its range, inspection narrows it, and the surprise notice.

### 22d: The used-car manager (save)

The role:

- New `Role` `'buyer'` (Used-car manager), with its entries in the `ROLE_*` tables, `WAGES` and `POSTS`.
- `roleLimits` gives one once `auctionOpen`, and none before (so `generateCandidates` doesn't shift earlier days' rolls).
- Their post is a small used-car kiosk prop on the lot (added to `layout.props`, its footprint blocked).
- The save accepts the new role.

The work:

- `nextBuyerTask` in `sim/staffAi.ts` (pure):
  - The day before an auction they inspect the run list, narrowing every lot to `appraisalNoise(skill)`.
  - On auction day they leave through the gate before `AUCTION_START`, are away for the run (off the grid, their position in `runtime.ambientPos` like Nazma's crossing) and come back after `AUCTION_END`.
- Max bids: the player sets a top bid per lot in the Auction tab, kept in the store's `auctionBids`. They're set before auction day, so they're saved.
- While the manager is at the auction, they bid for any lot with a max bid whenever the player isn't bidding, up to that max. A lot they win is the player's, like any other.
- Without a manager, max bids aren't offered.

Other:

- Save, next version: `auctionBids` (an older save starts with none).
- What's new entry. Help: the People tab (the used-car manager).
- Tests: the role limit, `nextBuyerTask`, proxy bidding up to the max, and `save.test.ts` (upgrade and round trip).

### 22e: Wholesale (save)

Consigning:

- The `wholesale` action on a used car (through `findInteractable`) and a **Wholesale** button in the Stock tab mark it for the next auction. The store's `consigned` keeps `{ carId, floor }` (saved). The car stays for sale until auction morning, and selling it cancels the consignment.
- A trade-in can be sent straight to wholesale from the deal: the purchase is consigned the moment it's stocked.

The day:

- On auction morning the consigned cars leave the lot in `beginDay` and are added to the run as lots badged **Yours**. The player can't bid on them.
- AI bids decide the price. If it sells, cash is the price less `SELLER_FEE` and the car's floor-plan balance (used cars are never floored, so this is 0 today).
- `DayStats.wholesale` records model, price, cost and fee. Wholesale gross (`price − fee − cost`, which can be negative) goes into `totalGross` and `grossSplit`, so the career and the summary count it.
- A car that doesn't reach its floor comes back the next morning, less `RUN_FEE`.

The manager:

- The manager suggests stale cars (`isStale`) in the Auction tab.
- With `autoWholesale` on (the Auction tab's toggle, saved), they consign used cars older than `AUTO_WHOLESALE_DAYS` the morning before an auction.

Other:

- Save, next version: `consigned` and `autoWholesale` (an older save starts with none consigned and the toggle off).
- What's new entry. Help: the Business tab (wholesale).
- Tests: consigning, cancelling on a sale, the floor and the run fee, wholesale gross in `netIncome`, and the save.

### 22f: Nazma, tips, achievements and balance (save if needed)

Nazma:

- While his lot is open he's a named bidder (`rival.name`). His top bid is `wholesaleValue` × (1 + `NAZMA_EAGER` × `desperation(rival)` + a strength term). He skips some lots, so he isn't on every one.
- A wholesale car of yours he wins goes on his lot. `rival.stolen` is generalised to `rival.lotCars` (stolen and bought), drawn by `scene/RivalLot.tsx` as today. The save takes a version step and `isRival` its check.
- A car he stole from you this month can come up in the run ("Yours, stolen"). Buying it back gives `BUYBACK_REPUTATION`.

Balance and levers:

- `Tuning.auctionHeat` (AI top bids): Easy 0.95, Medium 1, Hard 1.05.
- `Tuning.gradeNoise`: Easy 0.7, Medium 1, Hard 1.3.
- The bench bot buys at the auction under a margin and wholesales stale cars. Check the long-game bench before and after.

Other:

- Tips `auction` (the first auction day), `inspect` (the first lot that arrived worse) and `wholesale` (the first stale used car once the auction is open).
- Achievements: a first auction win, a steal (under 80% of wholesale), a buy-back from Nazma, and a wholesale that made money.
- What's new entry. Help: Nazma at the auction.
- Tests: Nazma's bids by desperation, his lot cars, the buy-back, and the levers.

## Performance

- The auction steps a few times per game minute inside `tickClock`'s batch, never per frame, and only on auction day inside the window.
- The run list is derived from the week and memoised through `memoLast` in `state/selectors.ts`.
- The Auction tab selects whether the run is live and mounts a body that selects only the lot on the block (18c). The top-bar chip selects only `auction.lotIndex` and `auction.call`.
- The used-car manager's walk uses the existing walker and `report`.
- Check `npm run bench` before and after 22b and 22f, and record the numbers in `docs/PERF.md` if they move.

## Help (every sub-phase)

- `ui/HowToPlay.tsx`:
  - Business tab: the auction and run list (22a), bidding (22b), grades and inspection (22c), and wholesale (22e).
  - People tab: the used-car manager (22d).
- `ui/controls.ts`: J for the Auction tab (and the Office line in `TOUCH_CONTROLS`), and Shift+J in the dev list.
- Tips as in 22f.
- What's new: one `UPDATES` entry per sub-phase, under `phase: '22'`.

## Tuning targets (Medium)

- Buying:
  - A won lot at the going price makes about $1.5–3k gross when retailed, more after recon on a rough car.
  - Winning at more than about 95% of retail value loses money, and the list shows that.
  - A surprise costs about one condition step, on about 1 lot in 5 uninspected and 1 in 15 inspected.
- Wholesale: a stale car brings back about 85–95% of its cost, so it beats holding only once the car is well past `STALE_DAYS`.
- Nazma: while he's desperate, lots he bids on go for about 5–10% more.
- Supply: a weekly auction stocks 2–4 used cars for a player who bids sensibly, alongside sellers and trade-ins.

## Verification (each sub-phase)

- Run the checks: `npm test` (with the new test files above), `npm run lint`, `npx prettier --check .`, `npm run build`, `npm run e2e`, and CI.
- `npm run dev` (or `/run`), with `T` for speed, on a save at Main Street:
  - **22a:** read the run list on Monday, use Shift+J on Wednesday, and see the car on the lot the next morning.
  - **22b:** bid on a lot, let one go, run out of lot space and cash, and pause mid-run.
  - **22c:** inspect a lot, buy an uninspected one, and read the surprise notice.
  - **22d:** hire a used-car manager, set max bids, stay on the floor through the run, and see what they won.
  - **22e:** consign a stale car with and without a floor, and check the summary's wholesale line.
  - **22f:** with Nazma open, watch his bids, and buy back a stolen car.
  - Save and reload after each sub-phase.

## Left out

Left out on 2026-10-12 (proposed; Robert can bring any back at review). They could make a later phase:

- A daily online auction.
- Arbitration: returning a lemon after the sale.
- Floor-planning auction buys.
- Trading new cars with other dealers.
- A choice of transport, with its cost and delay.
- The player travelling to the auction in person.
