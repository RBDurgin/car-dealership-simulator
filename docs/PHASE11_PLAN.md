# Phase 11 Plan: Difficulty levels

**Status:** planned 2026-10-06. 11a done 2026-10-07. 11b done 2026-10-07. We do one sub-phase per session and stop for Robert's review after each, the same as earlier phases.

## Context

SPEC Phase 11 adds difficulty levels: Easy, Medium and Hard. Today every game uses one tuning: $25k starting cash, the same customers, Nazma, quota and so on. Phase 11 lets the player pick a level when starting a new game. Medium stays exactly today's game. Easy and Hard scale the existing levers, and Easy also adds some help for learning the game.

**Decisions made with Robert (2026-10-06):**

- **All four lever groups scale:** money, customers, adversaries and targets.
- **Picked at New game only.** The level is saved with the game and shown on the title screen's Continue line and in the summary. Old saves load as Medium.
- **Easy gets help as well as easier numbers:** a deal hint while haggling, a one-time bank safety net, and guided tips the first time things happen. Hard is just tougher numbers, with no fail state.

## Levers that already exist

| Group       | Lever               | Where                                                                             |
| ----------- | ------------------- | --------------------------------------------------------------------------------- |
| Money       | Starting cash       | `STARTING_CASH` in `state/store.ts`                                               |
| Money       | Invoice cost        | `orderCost(model, day)` in `sim/ordering.ts`                                      |
| Money       | Floor plan interest | `dailyInterest(inventory)`, `FLOOR_PLAN_DAILY_RATE` in `sim/floorPlan.ts`         |
| Customers   | Traffic             | `Word.scale` in `beginDay` (and day 1's plan), `planArrivals` in `sim/spawner.ts` |
| Customers   | Patience            | `generateCustomer` (`PATIENCE_MINUTES`) in `sim/customers.ts`                     |
| Customers   | Hoped-for discount  | `expect` in `generateCustomer`, through the store's `arrivalOpts`                 |
| Customers   | Accept odds         | the store's `sellerBonus` into `acceptChance` / `respondToAsk`                    |
| Adversaries | Nazma's visits      | `isNazmaDay(day, guarded)`, `FIRST_NAZMA_DAY`, `VISIT_CHANCE` in `sim/nazma.ts`   |
| Adversaries | Theft               | `isTheftNight(day)`, `THEFT_CHANCE`                                               |
| Adversaries | Poaching            | `planVisit`'s `POACH_CHANCE`                                                      |
| Targets     | Quota               | `monthlyQuota(month, slots, reputation)` in `sim/quota.ts`                        |
| Targets     | Owner bonus         | `judgeDay` (`OWNER_BONUS`) in `sim/owner.ts`                                      |
| Targets     | Reputation          | `reputationChange(stats)` in `sim/reputation.ts`                                  |
| Help        | End-of-day cash     | `settleDay` in `state/store.ts`                                                   |
| Help        | Notices             | the store's `notify` / `showNotice`                                               |
| Save        | Format and upgrades | `sim/save.ts` (`SAVE_VERSION` 9, `UPGRADES`)                                      |

## Sub-phases

### 11a: Difficulty foundation and money

- `sim/difficulty.ts` (pure, tested):
  - `Difficulty = 'easy' | 'medium' | 'hard'`, `DIFFICULTIES`, `DEFAULT_DIFFICULTY = 'medium'`.
  - `TUNING: Record<Difficulty, Tuning>`, one flat record of every lever in this phase. Medium's values are all neutral (factor 1, shift 0, help off), so a Medium game is exactly today's. Starting values, to be tuned:

    | Lever                           | Easy    | Medium | Hard       |
    | ------------------------------- | ------- | ------ | ---------- |
    | `startingCash`                  | 40,000  | 25,000 | 15,000     |
    | `invoice` (× cost)              | 0.98    | 1      | 1.02       |
    | `interest` (× rate)             | 0.6     | 1      | 1.5        |
    | `traffic`                       | 1.2     | 1      | 0.85       |
    | `patience`                      | 1.25    | 1      | 0.8        |
    | `expect` (+ discount)           | −0.01   | 0      | +0.015     |
    | `acceptBonus`                   | +0.05   | 0      | −0.04      |
    | `nazmaChance` (×)               | 0.5     | 1      | 1.4        |
    | `firstNazmaDay`                 | 7       | 4      | 3          |
    | `theftChance` (×)               | 0.5     | 1      | 1.5        |
    | `poachChance` (×)               | 0.5     | 1      | 1.3        |
    | `quota` (×)                     | 0.8     | 1      | 1.15       |
    | `ownerBonus` (×)                | 1.33    | 1      | 0.67       |
    | `repGain` / `repLoss`           | 1 / 0.6 | 1 / 1  | 0.85 / 1.3 |
    | `dealHint`, `safetyNet`, `tips` | on      | off    | off        |

  - `difficultyLabel(d)` and `difficultyBlurb(d)` for the picker ("More cash, friendlier customers, help along the way").
- Store: `difficulty` in `GameState` and a `tuning()` helper next to `upEffects()`.
  - `newGame(difficulty)` sets it and rebuilds day 1 for it. Move the day-1 fields of the initial state (cash, quota, arrivals) into a `dayOne(difficulty)` helper used both at store creation and by `newGame`. Day 1's arrivals use a fresh `createRng(CUSTOMER_SEED)` so the plan stays deterministic whichever way it's built.
  - Money levers: cash starts at `startingCash`. `orderCost` takes a `factor` (default 1) for `invoice`. `dailyInterest` takes a `rate` factor for `interest`.
- Title screen (`ui/TitleScreen.tsx`): **New game** opens a second step in the same panel with three buttons (Easy, Medium, Hard), each with its blurb, plus Back. Medium is focused. The start-over confirm stays. The Continue line adds the level ("Saturday, week 2 of March · $31,200 · Easy").
- Summary (`ui/DaySummary.tsx`): the level shows in the kicker.
- Save: `difficulty` goes in `SaveData` and `SaveSource`, read back in `loadGame`. Bump `SAVE_VERSION` to 10 with an `UPGRADES[9]` step that sets `'medium'`. `parseSave` rejects an unknown level.
- Help: a "Difficulty" paragraph in the Basics tab of `ui/HowToPlay.tsx`, listing only the money effects so far. No new keys.

### 11b: Customers, adversaries and targets

All of these thread a tuning value into an existing pure function, keeping its default at Medium so callers and tests that don't pass it are unchanged.

- Customers:
  - `beginDay` (and `dayOne`) multiply `traffic` into `Word.scale`. Walk-ins and passers-by stay as they are, so the street looks the same.
  - `arrivalOpts` passes `patience` and `expect`. `CustomerOptions` gets `patienceFactor` (applied before `MIN_PATIENCE`) and `expectShift` (added to `expect` before the showroom's `expectCut`, like an event's `extraDiscount`).
  - `sellerBonus` adds `acceptBonus`, for the player and staff alike.
- Adversaries:
  - `isNazmaDay(day, guarded, odds?)` takes `{ chance, firstDay }`.
  - `isTheftNight(day, chance?)`. It replays earlier nights with the same chance; that holds because the level never changes mid-game.
  - `planVisit(…, poachChance?)`.
- Targets:
  - `monthlyQuota(month, slots, reputation, factor?)` scales after the `QUOTA_RANGE` clamp and rounds, with at least 1 car. The v9 upgrade step keeps calling it without a factor (Medium).
  - `judgeDay(goal, stats, day, bonus?)` pays `OWNER_BONUS × ownerBonus`, rounded to $100.
  - `reputationChange(stats, scale?)` scales gains and losses separately (`repGain`, `repLoss`) before the `MAX_DAILY_CHANGE` cap. The owner's `reputation` goal is judged on the same scaled number.
- Help: fill in the rest of the Difficulty paragraph.

### 11c: Easy help

Only on when `tuning().dealHint`, `.safetyNet` or `.tips` is set (Easy).

- **Deal hint** (`sim/negotiation.ts`, tested): `dealWarmth(c, car, price, bonus) → 'cold' | 'warm' | 'hot'`, from the same numbers `respondToAsk` uses (the gap to `expect` and `acceptChance`). `ui/CustomerPanel.tsx` shows it as a coloured chip by the ask controls and updates it as the ask changes. Staff deals don't show it.
- **Safety net** (store):
  - In `settleDay`, if cash would end below zero and the net hasn't been used, the bank tops it up to $0 once per game.
  - `bailoutUsed` goes in the store and the save. `DayStats.bailout` holds the amount. It is not income, so `netIncome` leaves it out.
  - The summary adds a line ("The bank covered your $3,400 shortfall. It won't next time."), and a notice says it the next morning.
- **Guided tips** (`sim/tips.ts`, tested):
  - `TipId` and a `TIPS` catalogue of short texts.
  - `tipFor(prev, next, seen)` diffs two store states like `sfxFor` and returns the first unseen tip that applies. Initial set:
    - a car drops below `WASH_BELOW`: Wash car / hire a porter
    - first counter-offer: how haggling works
    - a slot frees up after a sale: order from the office computer
    - first `missed` customer: stock more body types
    - Nazma arrives: confront him
    - the owner announces a goal
    - cash goes below $5k: floor plan and payoffs
  - The subscription lives in `state/tips.ts` (started next to `startAudioPref` and persistence). It calls `showNotice` with "Tip: …" when no other notice is up, and marks the tip in the store's `tipsSeen`.
  - `tipsSeen` is saved, so a resumed game doesn't repeat tips.
- Save: v11 adds `bailoutUsed` and `tipsSeen`. The `UPGRADES[10]` step sets `false` and `[]`.
- Help: Easy's extras in the Difficulty paragraph.

## Tuning targets

- Easy: a new player who sells at about MSRP − 4% and hires one salesperson by week 2 doesn't run out of cash in the first month, and hits the quota.
- Medium: unchanged from Phase 10.
- Hard: needs a guard, a porter and real haggling to finish month 1 in profit. About 70% of Medium's visitors, with Nazma about every other day.

## Verification (each sub-phase)

- `npm test`:
  - `difficulty.test.ts`: Medium is neutral, and every level has every lever.
  - Lever tests (11b): each threaded function gives today's result with no argument and the scaled result with one, e.g. `isNazmaDay` on Easy before day 7, and the quota clamp and scale.
  - Store tests: `newGame('easy')` starts with $40k and more day-1 arrivals than `'hard'`. Medium's day 1 is identical to today's. The safety net fires once only.
  - `negotiation.test.ts` covers `dealWarmth`, and `tips.test.ts` covers each trigger and that a seen tip is never repeated.
  - Save tests: a v9 save loads as Medium; v10 → v11 sets `bailoutUsed: false` and `tipsSeen: []`.
- `npm run lint`, `npm run build`.
- `npm run dev` / `/run`:
  - Start each level from the title screen and check cash, the Continue line after a day, and the summary kicker.
  - On Easy: haggle and watch the hint change, overspend to trip the safety net, and see tips appear once.
  - On Hard: check fewer visitors and an early Nazma.
  - Check the title-screen picker on a phone-size viewport.
