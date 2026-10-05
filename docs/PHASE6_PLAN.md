# Phase 6 Plan — Sales negotiation

**Status:** Complete 2026-10-05. 6b and 6c are done (6a was folded into Phase 5a).

## Context

The spec's Phase 6 is "introduce sales negotiation with customers". Today every seller offers MSRP (`offerPrice` in `src/sim/deal.ts:192`) and the customer makes one yes/no roll (`decide` → `respond`). Price is never a choice, so the only lever is who sells and how clean the car is.

Haggling needs a cost basis: a discount should eat into a real margin, and the summary should show profit, not just revenue. Phase 5 provides it: `InventoryCar.cost`, gross profit, and commission on gross. **Decisions made with Robert:**

- **Cost basis from Phase 5:** each `InventoryCar` has a dealer `cost` (5a), and ordered cars cost their invoice price (5b).
- **Offer/counter rounds:** the player names a price. The customer accepts, counters or walks. 2–4 rounds depending on archetype.
- **Staff haggle by skill:** AI salespeople negotiate on their own. Skill decides how near MSRP they hold and how quickly they cave.

## Architecture additions

```
src/sim/
  negotiation.ts      # pure: hope price, customer response to an ask, counter maths, staffAsk(skill)
  negotiation.test.ts
```

Everything else extends existing modules: `customers.ts` (haggle state, `respond` outcomes), `deal.ts` (discount tallies), `archetypes.ts` (haggle traits), `staffAi.ts`/`scene/Staff.tsx` (re-offer loop), `ui/CustomerPanel.tsx` (price controls), `ui/DaySummary.tsx` (profit).

## Sub-phases

### 6a: Dealer cost and profit

Done in Phase 5a (see `docs/PHASE5_PLAN.md`). This covers `InventoryCar.cost`, gross profit in the summary, commission on gross and the owner's profit goal. Phase 6 starts at 6b.

### 6b: Player negotiation

**Done.** Differences from the plan below: `haggle` is null until the first counter (round 1), and `lastAsk` is recorded when they counter rather than on the `offer` event, so `respondToAsk` can tell whether the seller came down. A counter clears `offer`. Staff ask `suggestedAsk` (MSRP, then split the difference) until 6c gives them `staffAsk`. On compact screens the haggling panel drops the quote and takes the full height so the buttons stay in view. No keys changed, so `ui/controls.ts` is unchanged.

**Customer side (`sim/negotiation.ts`, pure):**

- `ArchetypeTraits` gains `haggle: { expect: number; rounds: number }`:
  - regular: 4%, 3 rounds
  - tire-kicker: 6%, 2 rounds
  - decisive: 2%, 2 rounds
  - bargain: 8%, 4 rounds
  - couple: 5%, 3 rounds
- `Customer` gains `expect` (archetype expect ± 2% jitter, rolled in `generateCustomer`) and `haggle: { round, lastAsk, counter } | null`. `offer` stays the price on the table, so `sign()` doesn't change.
- `hopePrice(c, car) = min(budget, msrp × (1 − expect))`, rounded to $100.
- `respondToAsk(c, car, ask, rng, bonus)` returns one of `accept`, `counter(price)` or `walk(reason)`:
  - **ask ≤ hope, or ask ≤ their counter:** roll the existing `acceptChance` (preference, cleanliness, archetype, skill), so tire-kickers still mostly pass. A yes accepts; a no walks ("I'll pass").
  - **Otherwise, with rounds left:** they counter. The first counter is hope − 3% of MSRP. Later counters move 40% of the way from their last counter toward the ask.
  - **The seller didn't come down from their last ask:** 25% chance they walk ("You're not moving at all").
  - **Out of rounds:** if ask ≤ budget, take a reduced roll (acceptChance × 0.5); otherwise walk ("More than I can spend").
- Counters never go above budget, and nobody pays more than the ask.

**Reducer (`sim/customers.ts`):**

- `respond` carries `answer: 'accept' | 'counter' | 'walk'` and an optional `counter`.
- `counter` returns the customer to `talking` with `haggle.round + 1` and `counter` set.
- Update the phase diagram comment: `considering ─respond(counter)─► talking`.
- The `offer` event records `lastAsk`. `cancel` clears `haggle`.

**Store:**

- `answerOffer` calls `respondToAsk` in place of `decide`, with notices like `"How about $26,400?"`.
- New `ask(price)` for the player's deal in `talking`. The price is clamped to [their counter, last ask], or ≤ MSRP in round 1.
- The action menu's `offer` uses `suggestedAsk(c, car)`: MSRP in round 1, then splitting the difference.
- `offerPrice` is removed. Its role moves to `suggestedAsk`/`staffAsk`.

**UI (`ui/CustomerPanel.tsx`):**

- Show MSRP, your cost, their counter (once made), and the margin at the price being asked (red when below cost).
- Buttons:
  - Round 1: **Ask MSRP** and **Offer −3%**.
  - Later rounds: **Hold at $last**, **Split the difference**, and **Accept $counter**.
  - A − / + $250 stepper with **Ask $X** for a custom price.
  - **Walk away**.
- Buttons must be big enough on `COARSE` and swallow `onPointerUp` per the touch rules.
- The `ActionMenu.tsx` offer label shows the suggested ask.

**Scene:**

- `scene/Customers.tsx`: on a counter, give a "hmm" reaction (reuse the head-shake/nod hook at line ~195) and stay put in conversation.
- `CustomerBubble`: a counter icon while in `talking` with a counter.

**Help:** update `ui/HowToPlay.tsx` (haggling, margin, rounds by shopper type) and `ui/controls.ts`.

### 6c: Staff haggle by skill

**Done.** Differences from the plan below: skill 3 never takes a counter outright (it only concedes 40%), and a counter under the floor is never taken. `staffAsk` keeps its answer inside the ask range (their counter up to the last ask), so when the floor sits above that range the salesperson holds and risks a walk-out. The pitch timer restarts whenever the customer isn't in `talking`, so the re-pitch waits for the answer. There was no sales role blurb, so the staff panel gains `ROLE_BLURBS` for applicants. No stale "negotiation (Phase 5)" comments were left in the code. No keys changed, so `ui/controls.ts` is unchanged.

- `staffAsk(skill, car, haggle)` in `sim/negotiation.ts`:
  - **Round 1:** MSRP at skill ≥ 3, MSRP − 2% below that.
  - **Later rounds:** concede `0.7 − 0.1 × skill` of the gap to the counter (skill 1 caves 60%, skill 5 caves 20%).
  - **Accepting a counter:** skill ≥ 4 accepts when it keeps gross ≥ 6% of MSRP; skill ≤ 2 accepts any counter from round 2.
  - **Floor:** never below cost + $300.
- `staffOffer` uses `staffAsk`. `scene/Staff.tsx` already maps `talking`/`considering` to the `offer` task. Reset `w.timer` when the customer comes back to `talking` with a counter, and use a shorter re-pitch time (`SALES_COUNTER_SECONDS`) for later rounds.
- `skillBonus` stays in `acceptChance`, so skill helps both price and close rate.
- DaySummary per-seller table: average discount off MSRP alongside Gross, so a weak salesperson's give-aways show up.
- StaffPanel: the sales role blurb mentions negotiation skill.
- Help text: staff negotiate, and commission is a share of gross.
- Fix the stale "negotiation (Phase 5)" comments.

## Files touched (main)

- `src/sim/`: `negotiation.ts` (new), `customers.ts`, `archetypes.ts`, `deal.ts`, `staffAi.ts`, plus tests.
- `src/state/store.ts` and the `store.deal`/`store.sales`/`store.save` tests.
- `src/scene/`: `Customers.tsx`, `Staff.tsx`, `CustomerBubble.tsx`.
- `src/ui/`: `CustomerPanel.tsx`, `ActionMenu.tsx`, `DaySummary.tsx`, `InfoPanel.tsx`, `HowToPlay.tsx`, `controls.ts`, `hud.css`.
- `docs/PHASE6_PLAN.md` and `CLAUDE.md`.

## Verification (each sub-phase)

- `npm test`, `npm run lint`, `npm run build` all pass.
- New Vitest coverage:
  - `negotiation.test.ts`:
    - counters rise monotonically and never exceed budget
    - the out-of-rounds case walks
    - ask ≤ hope uses acceptChance
    - `staffAsk` respects the floor and the per-skill concession
  - `save.test.ts`: only if a saved type changes shape (negotiation shouldn't change one).
  - `deal.test.ts`: gross profit and commission on gross.
  - store tests: a full counter → accept → sign flow for the player and for a salesperson.
- Manual in `npm run dev`:
  1. Greet a bargain hunter and ask MSRP. They counter.
  2. Split the difference, then accept their counter.
  3. Sign, and check that the summary shows revenue, cost, gross and net correctly.
  4. Hire a skill 1 and a skill 5 salesperson and play a day. The summary should show different average discounts.
  5. On a phone-sized viewport, check that the haggle buttons are tappable.

## Out of scope

- Trade-ins, financing and APR games.
- Add-ons and warranties.
- Price stickers set ahead of time.
