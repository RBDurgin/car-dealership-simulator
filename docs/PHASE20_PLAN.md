# Phase 20 Plan: F&I (Finance and Warranties)

**Status:** planned 2026-10-10. Phase 20 comes after Phase 19 in the plan. It needs only Phase 15 (service), which is built.

- 20e's satisfaction hook needs Phase 16's CSI. If 16 isn't built when 20e is, that part waits for it.
- 20a adds nothing to the save. 20d takes the next free save version (`SAVE_VERSION` + 1).
- As in earlier phases, we do one sub-phase per session and stop for Robert's review after each.

## Context

A real dealership makes much of its profit after the price is agreed, in the finance and insurance office. There it:

- arranges the loan;
- earns a reserve on the rate;
- sells extended warranties, GAP and protection packages.

The game has a finance manager (Phase 3c), but today he only signs paperwork faster for a flat `FINANCE_FEE`. Every buyer pays as if in cash. A car's gross is only its price less its cost.

Phase 20 adds three things:

- **Credit:** every buyer either pays cash or finances, with a credit tier.
- **Lenders:** each lender approves by tier and pays the dealer a reserve on the rate markup.
- **An F&I menu:** the player runs it at the desk, and the finance manager runs it by skill.

The products reach into the rest of the game:

- A warranty brings paid repair work to the garage (Phase 15).
- Products sold too hard come back as chargebacks.
- Pressure and markup lower the buyer's satisfaction (Phase 16's CSI).

Scale: cars list for $24k–$68k, and the front gross is about $2–4k. A good F&I office adds about $800–1,200 per deal.

**Decisions made with Robert (2026-10-10):**

- **The menu is at the desk.**
  - When the player closes a deal, the F&I menu opens once the buyer is seated: pick the lender and the markup, then present products.
  - The buyer takes or declines each product according to their traits. Pushing too much sours them.
  - With a finance manager on duty, a hand-off has him run the menu by skill, and the player can stay on the floor.
  - Salespeople signing at their own desks arrange the loan at the buy rate and sell no products. This gives the finance manager his job.
- **Credit tiers and lenders.**
  - Each buyer pays cash or finances, has a credit tier A–D (skewed by archetype) and a down payment.
  - Three lenders approve by tier at a buy rate. The dealer adds a markup up to a cap and earns a reserve.
  - A buyer every lender declines can be saved by a bigger down payment if their budget allows. Otherwise they walk.
- **Ties:**
  - An extended warranty pays for service jobs, like recalls do.
  - Chargebacks take back product gross and reserve when a contract is cancelled early, more often when it was sold hard.
  - The markup and pressure lower the visit's satisfaction (CSI).

## Levers that already exist

| Lever                                                                        | Where                                    | Phase 20 use                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Finance manager, `FINANCE_FEE`, `financeSeconds`, `financeOnDuty`            | `sim/staff.ts`                           | Runs the menu by skill and earns a share of the F&I gross                             |
| `handOff` → `queued` → `call` → `signing`, `callNextBuyer`, `GUEST_CHAIR_ID` | `sim/customers.ts`, `sim/deal.ts`        | The menu sits between `seat` and `signed`                                             |
| `sign(c, e)`                                                                 | `state/store.ts`                         | The single place that builds the `Sale`, now with `Sale.fi`                           |
| `Sale`, `totalGross`, `netIncome`, `grossSplit`                              | `sim/deal.ts`                            | `fiGross` joins `totalGross`; the summary gets an F&I section                         |
| `ArchetypeTraits` (`budget`, `haggle`)                                       | `sim/archetypes.ts`                      | Each archetype gets `credit` odds and `finance` share                                 |
| `acceptChance`, `dealWarmth` (Easy's chip)                                   | `sim/customers.ts`, `sim/negotiation.ts` | `productTake` follows the same pattern; Easy's chip goes per product                  |
| `ServiceJob.warranty`, `warrantyPay`, `serviceDemand`, `upsellChance`        | `sim/service.ts`                         | Warranty claims are paid like recalls; contract holders return and say yes more often |
| Chatter `signing` conversation                                               | `sim/chatter.ts`                         | Carries on through the menu                                                           |
| Owner `profit` goal, `Career.gross`                                          | `sim/owner.ts`, `sim/progression.ts`     | Both read `totalGross`, so F&I counts toward ranks and goals                          |
| Phase 16 visit score and CSI                                                 | `sim/clients.ts` (16f)                   | `fiSatisfaction` adds to the score                                                    |
| `Tuning` / `TUNING`                                                          | `sim/difficulty.ts`                      | New levers `creditMix`, `productTake` and `chargebackScale`, neutral on Medium        |
| Office computer tabs, `computerTab`                                          | `ui/StockPanel.tsx`, store               | A Finance tab, key F                                                                  |
| Save `UPGRADES`                                                              | `sim/save.ts`                            | 20d adds `contracts` and `chargebacks`                                                |

## Sub-phases

### 20a: Credit and lenders (pure)

New `sim/credit.ts` (pure, tested):

- `CreditTier = 'A' | 'B' | 'C' | 'D'`.
- `Credit { tier, finance: boolean, down }`. `down` is a share of the price the buyer brings, from 0 to 0.2.
- `ArchetypeTraits.credit`: tier weights and a `finance` share (about 60% of buyers on Medium; bargain hunters and used shoppers lean C/D).
- `rollCredit(archetype, rng, mix)`.

New `sim/lenders.ts` (pure, tested):

- `LENDERS`:
  - Prime Bank: A and B, low buy rate.
  - Credit Union: A to C, and needs 10% down for C.
  - Subprime Auto: C and D, high buy rate, a lower reserve share, and it charges an acquisition fee on D.
- `approves(lender, credit, amount)`.
- `MAX_MARKUP`: 2.5 rate points.
- `reserve(amount, markup, lender)`: an up-front share of the extra interest over a 60-month term, about 1.5% of the amount per markup point.
- `buyerRate(lender, markup)`.
- `saveByDown(credit, budget, price)`: the down payment that would get one lender to approve, or null.

Store:

- `generateCustomer` gives each buyer `credit` from its own `creditRng`, like `driveRng`, so the rest of the day plays as before.
- Nothing is saved, since customers are rebuilt each day.
- The customer panel shows "Paying cash" or "Financing, tier B" after a greet.

Lever `Tuning.creditMix` shifts the tier weights: better on Easy, worse on Hard.

Tests: `credit.test.ts` (seeded rolls, archetype skew, mix), `lenders.test.ts` (approval by tier and down payment, reserve maths, `saveByDown`).

### 20b: The F&I menu (player)

New `sim/fi.ts` (pure, tested):

- `PRODUCTS`:
  - Extended warranty: $1,500–2,500, dealer cost about 45%, 36 months.
  - GAP: $600–900, financed buyers only.
  - Paint and fabric protection: $400–700.
  - Tyre and wheel: $500–800.
- `productTake(c, product, price, pressure, bonus)` gives the chance a buyer takes a product. It depends on:
  - the archetype (families like warranties; bargain hunters decline);
  - how far the price is above the low end;
  - `pressure`, which counts the products presented and markup points and lowers every later answer.
- `FiDeal { lender, markup, products: { id, price, cost, taken }[], down }`.
- `fiGross(deal, amount)` = reserve + Σ taken (price − cost) − acquisition fee.
- `fiWarmth` gives Easy's hot/warm/cold chip.

Customer flow:

- When the player finishes `closeDeal` with a seated buyer, the buyer goes to a new phase `menu` instead of `signed`. `signing` stays the timed paperwork.
- `menu` doesn't drain patience. `close` spares it, like `signing`.
- `cancel` from `menu` sends the buyer back to waiting.

UI: `ui/FinancePanel.tsx` opens in place of the customer panel while the player's buyer is in `menu`.

1. **Loan:** the lenders, with the declined ones greyed out with their reason. Pick one, set the markup with a stepper (0 to `MAX_MARKUP`), and see the reserve. If every lender declines, offer **Ask for more down** (`saveByDown`) or let the buyer go.
2. **Products:** a row per product, with a price stepper and **Present**. Each answer shows at once and adds to the pressure. GAP is hidden for cash buyers.
3. **Sign:** runs `sign`.

Store:

- `fiPresent(productId, price)`, `fiLender(id, markup)`, `fiSign()`.
- `sign` records `Sale.fi` (lender, markup, reserve, products taken, `fiGross`, pressure) and adds `fiGross` to cash.
- A buyer every lender declines and who can't put more down leaves (`leaving('declined')`, `DayStats.fi.declined`).

Money:

- `totalGross` adds `fiGross`, so the owner's profit goal, `Career.gross` and ranks count it.
- `grossSplit` gets an F&I line.
- `DayStats.fi`: financed, cash, declined, reserve, product gross, products sold per product.

Summary: an **F&I** block under Gross profit, showing financed/cash, reserve, products sold (penetration per product) and F&I gross.

Chatter: the `signing` conversation runs during `menu` too. A declined product gets a short `no` reaction line.

Tests:

- `fi.test.ts`: take odds by archetype, price and pressure, `fiGross`, warmth.
- `store.fi.test.ts`: menu → sign records `Sale.fi`; a declined buyer leaves; cash buyers have no GAP; `close` spares `menu`.
- `customers.test.ts`: the new phase transitions.

### 20c: The finance manager runs the menu, and the Finance tab

New `staffMenu(skill, customer, rng)` in `sim/fi.ts` (pure, tested):

- It picks the approving lender with the best reserve.
- The markup is `skill/5 × MAX_MARKUP`, eased off for tiers A and B.
- It presents products in order of likely take and stops once `pressure` would push the take chance under a skill-based floor.
- Higher skill means more products sold and less pressure.

Store: `staffSign` for the finance manager runs `staffMenu` and then `sign`. His paperwork timer (`financeSeconds`) grows by about 1 s per product presented.

Pay: the finance manager earns `FINANCE_FEE` plus `FI_COMMISSION` (15%) of the F&I gross, through `payroll`'s `sale.commission`.

Salespeople and their desks: `staffSign` at a salesperson's own desk arranges the loan at the buy rate (markup 0) and presents no products. A declined buyer there is queued for the finance manager if one is on duty, otherwise they walk.

Office computer **Finance** tab (`computerTab` `'finance'`, key F, or the office desk's `finance` action), `ui/FinanceTab.tsx`. It shows:

- the lenders and what each approves;
- today's and this month's F&I (penetration, reserve, product gross, average per deal);
- after 20d, the contracts in force and the chargebacks due.

Summary: the per-seller table gets an F&I column. The finance manager gets a row of his own when he signs deals.

Tests:

- `fi.test.ts` (`staffMenu`): monotone in skill, never above the cap, no GAP for cash buyers.
- `staff.test.ts`: the F&I commission.
- `store.fi.test.ts`: a hand-off runs the staff menu, and a salesperson's desk sells no products.

### 20d: Warranty contracts, warranty work and chargebacks (save)

New `sim/contracts.ts` (pure, tested):

- `Contract { id, model, soldDay, endDay, price, used }`. One is added in `sign` for each extended warranty taken.
- `contractVisits(contracts, day, rng)`: each live contract brings a warranty repair about every 45–90 days. It feeds `serviceDemand` as extra service clients with `payer: 'contract'`.
- Their repair job is paid like a recall: `warrantyPay` at `WARRANTY_HOURLY`, plus parts at cost.
- `ServiceStats.contract` keeps the totals apart from recalls.
- Contract holders take findings more often (`upsellChance` + `CONTRACT_UPSELL`).
- Expired contracts are dropped in `beginDay`.

Chargebacks:

- At `sign`, each taken product and the reserve rolls `chargebackChance(product, pressure, tier, scale)`. The chance is higher with pressure, high markup and tiers C/D.
- A hit becomes `Chargeback { day, amount, customerName, kind }`, 15–90 days ahead, from its own seeded rng.
- `settleDay` takes the ones that are due off cash (`DayStats.fi.chargebacks`, off `netIncome` and `totalGross`).
- When the finance manager signed the deal, his commission share is clawed back too.
- The morning notice says "Two chargebacks today: −$1,840".

Store: `contracts` and `chargebacks`.

Save, next version:

- adds `contracts` (capped by expiry, about 200 at most) and `chargebacks`;
- older saves start with both empty.

Lever `Tuning.chargebackScale`.

Tests:

- `contracts.test.ts`: visit cadence, expiry, pay.
- `chargebacks.test.ts`: odds rise with pressure, markup and tier; seeded days.
- `save.test.ts`: upgrade and round trip.
- `store.fi.test.ts`: a due chargeback in `settleDay` and the commission clawback.
- `service.test.ts`: a contract job is paid by the administrator.

### 20e: Satisfaction, tips and balance

- **CSI** (needs Phase 16): `fiSatisfaction(saleFi)` adds to the visit score:
  - a fair deal (markup ≤ 1, at most two products presented) adds a little;
  - every markup point over 1 and every declined product past the second takes points off;
  - a chargeback in the first 30 days marks that client's next visit as unhappy.

  If Phase 16 isn't built yet, this item waits for it.

- **Tips** in `sim/tips.ts`:
  - `fiMenu`: the first financed buyer the player closes;
  - `declinedCredit`: the first buyer every lender declines;
  - `chargeback`: the first chargeback;
  - `financeManager`: the first day with five financed deals and no finance manager.
- **Easy:** the `dealHint` warmth chip appears on every product row and on the markup stepper.
- **Balance** with the 18a bench, if it's built, or seeded runs. Hit the targets below on all three levels, then record the final constants in the Status line.

Tests: `tips.test.ts`, `fi.test.ts` (satisfaction), and a balance test in `store.fi.test.ts` (a 28-day seeded run lands in the target bands).

## Performance

All of this is per-deal maths with no per-frame work:

- `contractVisits` runs once a morning over at most about 200 contracts.
- Chargebacks are checked once in `settleDay`.
- The Finance tab reads month totals that are kept in the store, not recomputed per render.

## Help (every sub-phase)

- `ui/HowToPlay.tsx`:
  - Selling tab: credit and lenders (20a–b), the F&I menu, products and pressure (20b), warranty work (20d).
  - People tab: what the finance manager does now (20c).
  - Business tab: reserve, chargebacks and the Finance tab (20c–d).
- `ui/controls.ts`: F for Finance (20c). The touch list's Office line mentions Finance.
- Tips as in 20e.
- What's new (12.5): one `UPDATES` entry per sub-phase that changes play, under `phase: '20'`, for 20b, 20c, 20d and 20e. 20a only adds a line to the customer panel, so it goes in with 20b's entry.

## Tuning targets (Medium)

- About 55–65% of buyers finance. About 10% of financed buyers are declined by every lender, and about half of those are saved by more down.
- The player's own menu, played fairly, makes about $700–1,000 F&I gross per financed deal. Played hard, it makes more up front, but chargebacks take back 15–25% of it.
- A skill-3 finance manager averages about $800 per deal with chargebacks under 10%, and pays for his wage at three or more deals a day.
- Warranty penetration is about 30–40% of financed deals and lower for cash buyers. Each warranty brings about one paid garage visit every two months.
- F&I adds about 20–30% to a typical day's total gross, without making the front-end haggle pointless.

## Verification (each sub-phase)

- `npm test` (the new test files named above), `npm run lint`, `npm run build`, `npm run e2e`, plus CI if 18a has been built.
- `npm run dev` (or `/run`), with Shift+R and `T` for speed:
  - **20a:** greet buyers and check the credit line shows.
  - **20b:**
    - close a financed deal yourself: pick a lender, push the markup, present every product, and watch the answers sour;
    - close a cash deal and check there's no GAP;
    - have a buyer every lender declines walk, and save one with more down;
    - check the summary's F&I block.
  - **20c:** hire a finance manager, hand off, and check the summary's F&I column, his pay and the Finance tab (key F).
  - **20d:**
    - sell warranties and skip ahead until warranty clients come to the garage and are paid by the administrator;
    - sell hard and watch chargebacks land in the morning notice and the summary;
    - save, reload and check that contracts and chargebacks survive.
  - **20e:** with Phase 16 built, compare CSI on fair and pushy days; check the tips on Easy.

## Left out

Robert left these out on 2026-10-10. They could make a later phase:

- Buyers haggling over the monthly payment and term instead of the price.
- A compliance audit or fine for markups that are always at the cap.
- Leasing, residuals and lease returns.
- Buy-here-pay-here, where the dealer carries the loan and repossesses.
- Loan payoff and negative equity on trade-ins.
- Selling products to service clients.
- A second finance manager or a separate F&I office prop.
