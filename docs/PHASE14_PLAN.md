# Phase 14 Plan: Nazma's Rival Dealership

**Status:** planned 2026-10-08. Phase 13 comes first: the rival opens at one of 13a's ranks, and his lot sits beside 13c's wider map. After that, we do one sub-phase per session and stop for Robert's review after each, as in earlier phases. This phase builds on everything through Phase 13. 14a takes the next save version.

## Context

Nazma (Phase 9) is a nuisance with no business behind him. He smudges cars, steals one now and then and poaches staff, but nothing else in town competes with you. Every shopper who doesn't buy from you just goes home. Phase 14 gives him a business: Nazma opens a rival lot across the road. He takes a share of the town's buyers and undercuts your prices, and his sabotage now comes from that business. Beating him, for a while, becomes a goal you can see.

**Decisions made with Robert (2026-10-08):**

- **Nazma owns the rival.** It's his lot, under his name, and his grudge.
- **He opens at a rank.** His lot opens once you reach Main Street (13a's `rankOf`), around day 15 on Medium, with a week's warning. Until then, Phase 9's Nazma plays as he does now.
- **A backdrop across the road.** His lot is drawn past the road at the map's south edge. You can see it but not walk there. The grid doesn't change, and pathfinding has nothing new to search.
- **He can go bust and reopen.** Keep his market share under a floor for a few weeks and he closes, with a reward and a break from his sabotage. Some weeks later he reopens under a new name, a little stronger.
- **His sabotage runs from his lot.** Smudging, theft and poaching come more often while he's losing. Cars he steals turn up for sale on his lot. Staff he poaches go to work for him and make him stronger. The guard still deters him.

## Levers that already exist

| Lever                                                                                                        | Where                                   | Phase 14 use                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Word.scale` in `beginDay` and `dayOne`                                                                      | `state/store.ts`, `sim/spawner.ts`      | Multiplied by `1 − share`. His share is the visitors you lose                                                  |
| `trafficBoost`, `CHANNELS`, `campaignScale`                                                                  | `sim/marketing.ts`, `sim/reputation.ts` | Your ads and reputation push his share down. His ad blitz cuts your boost                                      |
| `arrivalOpts`, `generateCustomer`                                                                            | `state/store.ts`, `sim/customers.ts`    | Some new shoppers bring a `rivalQuote`                                                                         |
| `respondToAsk`, `dealWarmth`, `askRange`, `staffAsk`, `STAFF_FLOOR_MARGIN`                                   | `sim/negotiation.ts`                    | An ask well over the quote risks a walk "to Nazma's". **Match his price** in the stepper. Staff match by skill |
| `isNazmaDay(day, guarded, VisitOdds)`, `planVisit(…, poachChance)`, `isTheftNight(day, chance)`, `planTheft` | `sim/nazma.ts`                          | The odds come from his `desperation` while he's open, and drop to zero while he's closed                       |
| `StolenCar`, `DayStats.nazma`, `nazmaSummary`                                                                | `sim/nazma.ts`                          | A stolen car joins his lot. The summary line says where it went                                                |
| `reduceStaff`'s `poached` event, `Employee.quitting`                                                         | `sim/staff.ts`                          | A quitter joins his `hires` and adds to his strength                                                           |
| `eventOn(day)`, `EVENTS`                                                                                     | `sim/events.ts`                         | His sale weekend lands on yours when you have one                                                              |
| `sfxFor` (`fanfare`), `reactionsFor`                                                                         | `sim/sfxEvents.ts`, `sim/chatter.ts`    | The bust fanfare. A grumbled "Nazma's is cheaper" line                                                         |
| `rankOf`, `Career`                                                                                           | `sim/progression.ts` (13a)              | The opening trigger. `Career.rivalsBeaten`                                                                     |
| `SIDEWALK_ENDS`, `scene/Nazma.tsx`                                                                           | `sim/layout.ts`, `scene/`               | Once his lot is open, he crosses the road from it instead of walking in along the sidewalk                     |
| `Tuning` / `TUNING`                                                                                          | `sim/difficulty.ts`                     | New levers `rivalStrength`, `rivalUndercut` and `rivalComeback`, neutral on Medium                             |
| `computerTab`, `ui/CalendarTab.tsx`                                                                          | `state/store.ts`, `ui/`                 | A new **Rival** tab (key K)                                                                                    |
| Save `UPGRADES`                                                                                              | `sim/save.ts`                           | Next save version adds `rival` and `Career.rivalsBeaten`                                                       |

## Sub-phases

### 14a: Rival foundation (pure + save)

- New `sim/rival.ts` (pure, tested):
  - `Rival`:
    - `status`: `unopened`, `announced`, `open` or `closed`.
    - `name`, `generation`, `openDay` and `closedUntil`.
    - `strength`, from 0 to 100.
    - `undercut`: his discount off MSRP.
    - `ourDiscount`: a running average of your discount off MSRP on new cars.
    - `shares`: the last 7 days' shares, for the weekly check and the sparkline.
    - `stolen`: the models he took. `hires`: the names of staff he poached.
  - `shouldAnnounce(rank, rival)`: Main Street or higher. He opens 7 days after the notice ("Nazma's Motors opens across the road next Monday").
  - `marketShare(rival, us)`: a logistic of his strength and undercut against your reputation, your active campaigns and `ourDiscount`, clamped to `MAX_SHARE` (about 0.35). It rises with his strength and falls as your reputation rises. Test both.
  - `rivalDay(rival, stats, rng)`: the daily step in `settleDay`.
    - His strength drifts up with the share he took and down with each of his quote-holders you sold to.
    - It records the day's share and updates `ourDiscount` from the day's new-car `Sale`s.
- Store: `rival`. `beginDay` multiplies `Word.scale` by `1 − share` while he's open. `DayStats.rival` is `{ share, lost, matched }`.
- Save, next version: `rival`. An older save starts it `unopened`, so a save already at Main Street gets the notice the next morning.
- Difficulty: `Tuning.rivalStrength` (× his opening strength and growth: Easy 0.75, Medium 1, Hard 1.25).
- Nothing on screen yet except the notices and the traffic change.

### 14b: The lot across the road and the Rival tab

- `scene/RivalLot.tsx`: past the road, south of `GRID_HEIGHT`, placed in world space with no tiles.
  - A small building, a fence, a sign with his name, and a banner with this week's offer ("5% under MSRP!", "SALE WEEKEND").
  - A few parked cars for his stock, plus one for each model in `stolen`.
  - Static meshes with shared materials and no shadows. The sign and banner are canvas textures, not drei `<Html>`.
  - No pointer handlers, so clicks fall through to the ground as they do now.
  - Hidden while `unopened`. Under construction while `announced`, then open. Boarded up with a CLOSED sign while `closed`.
  - The camera follows the player, so the lot shows from the sidewalk and the front of the lot. The ground plane (`SIZE` 160) already reaches past the road.
- New `ui/RivalTab.tsx` (`computerTab` `'rival'`; key K, or the office computer's new `rival` action):
  - His name and status, and his price for each model.
  - Today's share, a 7-day share sparkline and his strength.
  - This week's move (14d), the staff he's hired and the cars he stole.
- A Monday notice: "Nazma's took 18% of buyers last week (↑3)".
- Top bar: a small share chip beside the `QuotaMeter` while he's open. On `COMPACT`, it folds into the Office button's badge.

### 14c: Customers who know his prices

- `assignQuotes`: while he's open, about `share × QUOTE_RATE` of new shoppers carry a `Customer.rivalQuote` for one new model they want. It's his price, the MSRP less his undercut, rounded to `PRICE_STEP`. Used-car shoppers and sellers never carry one.
- `ui/CustomerPanel.tsx` shows a badge: "Nazma's quoted $31,200".
- `respondToAsk` reads `c.rivalQuote` itself, so its signature doesn't change:
  - An ask more than `QUOTE_TOLERANCE` over the quote adds a chance to walk ("I'll go to Nazma's"). With a trade in the deal, the price before the allowance is what's compared.
  - An ask at or under the quote adds `MATCH_BONUS` to the accept chance.
- The haggle stepper gets a **Match his price** button. It sets the ask to the quote, clamped by `askRange`.
- `staffAsk`: from skill 3, salespeople match when the gross stays over cost + `STAFF_FLOOR_MARGIN`. Green ones match whenever the quote is above cost.
- A buyer who walks over a quote counts in `DayStats.rival.lost` and adds to his strength. A matched sale counts in `matched` and takes from it.
- Chatter: a grumble line in `reactionsFor` when an ask goes over the quote.
- Easy: `dealWarmth` takes the quote into account. New tip `rivalQuote`.
- Difficulty: `Tuning.rivalUndercut` (× his undercut: Easy 0.8, Medium 1, Hard 1.2).

### 14d: His moves and sabotage from the lot

- `planRivalWeek(rival, week, rng)` picks one move each Monday. It's seeded by the week and his saved state, and kept as `rival.move` so loading a save mid-week keeps it.
  - **Price war**: his undercut deepens for the week.
  - **Ad blitz**: your `trafficBoost` is cut by `BLITZ_CUT`.
  - **Sale weekend**: his share rises Fri–Sun. When you have an `EVENTS` weekend coming, he picks that one, which eats into its `traffic`.
  - **Quiet week**.
  - The move shows on his banner, in the Rival tab and in the Monday notice.
- `desperation(rival)` rises as his share falls. While he's open, it scales:
  - `isNazmaDay`'s `VisitOdds`.
  - `planVisit`'s `poachChance`.
  - The theft chance.
  - The guard's deterrence still applies on top, as it does now.
- **Theft without the replay.** Today `isTheftNight` replays every night with one chance to keep the `THEFT_GAP_DAYS` gap. Once the chance changes from night to night, that replay no longer matches what happened. Instead, save `lastTheftDay` in `rival` and check the gap against it. 14a's upgrade step fills it by replaying `isTheftNight` up to the save's day. Test that reloading a save never repeats a theft.
- A stolen car's model is added to `rival.stolen` and appears on his lot. The summary line says it's for sale at Nazma's.
- A poached employee who walks out at `close` is added to `rival.hires`. Their skill adds to his strength, and the summary says "Dana now sells for Nazma's".
- Once his lot is open, `scene/Nazma.tsx` starts and ends his visits at the sidewalk tile facing it. He crosses the road on a short fixed route off the grid, like `DrivenCar`'s routes.
- Before he opens, his visits, thefts and poaching play exactly as in Phase 9.

### 14e: Going bust and reopening

- **Bust.** His weekly share is under `BUST_SHARE` (about 8%) on `BUST_WEEKS` (3) Mondays in a row.
  - He closes: a `fanfare`, a notice, and the lot is boarded up.
  - The reward is a reputation bump, and his buyers come to you: `Word.scale` is raised by `BUST_TRAFFIC` for 7 days.
  - There are no visits, thefts or poaching while he's closed.
  - `Career.rivalsBeaten` goes up by 1.
- **Reopening.** After `CLOSED_DAYS` (about 21, × `Tuning.rivalComeback`: Easy 1.5, Medium 1, Hard 0.7), he reopens, again with a week's notice.
  - He takes the next name in `RIVAL_NAMES` ("Nazma's Motors", "N-Z Auto Outlet", "Discount Dreams by Nazma", …).
  - His `generation` goes up by 1, so he starts a little stronger and undercuts a little deeper.
  - His `hires` and `stolen` are cleared.
- Phase 13's win screen and the Rival tab show "Rivals beaten: N".
- New tips `rivalOpens` and `rivalBust`.

## Performance

- The lot across the road is a handful of static meshes with shared materials and no shadows, about as many draw calls as two or three cars. It isn't on the grid, so pathfinding and the crowd don't change.
- The rival runs once a day (`beginDay`, `settleDay`). Nothing new runs per frame apart from Nazma's short road crossing.
- Check `?fps` and `renderer.info.render.calls` with the lot in view, as in Phase 13.

## Help (every sub-phase)

- Update `ui/HowToPlay.tsx` as each feature lands, describing only what's built:
  - Business tab: a Rival section (his share, the Rival tab, his weekly moves, going bust).
  - Selling tab: quotes and **Match his price**.
  - People tab: poached staff go to work for him.
- `ui/controls.ts`: K for Rival.
- Tips `rivalOpens`, `rivalQuote` and `rivalBust` in `sim/tips.ts`.
- What's new (12.5): one `UPDATES` entry per sub-phase that changes play, under `phase: '14'` (14a through 14e; 14a's is the opening notice and the quieter days).

## Tuning targets (Medium)

- His share usually sits at 10–20%. It tops out near 35% if you neglect ads and reputation.
- A reputation over about 75, with steady ads, drives him bust in about 3–5 weeks.
- About 1 in 5 shoppers carries a quote while his share is around 20%.
- Matching his price usually costs 2–4% of the gross on that sale.
- A desperate Nazma visits about twice as often as a calm one.
- Easy is gentler and Hard tougher, through `rivalStrength`, `rivalUndercut` and `rivalComeback`.

## Verification (each sub-phase)

- `npm test`:
  - `rival.test.ts`: announcing and opening, share bounds, share falls as reputation rises, the daily strength step, bust after `BUST_WEEKS`, reopening with a new name, and deterministic week plans.
  - `negotiation.test.ts`: the quote's walk risk and bonus, **Match** within `askRange`, and staff matching by skill.
  - `nazma.test.ts`: desperation scales the odds, nothing while he's closed, and the theft gap with `lastTheftDay`.
  - Store tests:
    - Traffic scaled by his share.
    - A stolen car on his lot.
    - A poached hire raises his strength.
    - The bust reward and the reopening.
    - Reloading never repeats a theft.
  - A save upgrade test: a save from the version before loads with `rival` unopened.
  - `difficulty.test.ts`: every level has the new levers, and Medium's are neutral.
- `npm run lint`, `npm run build`, `npm run e2e`.
- `npm run dev` / `/run`:
  - Force Main Street, see the notice, and see his lot go up across the road.
  - Meet a shopper with a quote and use **Match his price**.
  - Open the Rival tab with K, and read the Monday report.
  - Force a bust, see the boarded-up lot, then the reopening under a new name.
  - Take `?fps` and a draw-call count before and after.
