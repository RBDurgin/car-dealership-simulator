# Phase 17 Plan: Stats and Achievements

**Status:** planned 2026-10-08. Phase 17 doesn't need Phases 13–16, but it comes after them in the plan. It reads their numbers when they're there:

- 13's `Career` and rank;
- 14's rival;
- 15's service jobs;
- 16's client book.

An achievement that needs a phase that hasn't been built yet stays out of the catalogue until that phase lands. 17a takes the next save version. After that, we do one sub-phase per session and stop for Robert's review after each, as in earlier phases.

## Context

Once a day is over, the game forgets it. The end-of-day summary shows that one day, and Phase 13's `Career` will keep a few running totals, but there's no way to look back:

- the player can't see how this week compares with last week;
- they can't see whether ads paid off over a month;
- they can't see what their best day was.

Nothing marks the small wins along the way either: the first sale at full sticker price, chasing Nazma off the lot yourself, a month that beats the quota. Phase 17 keeps a short log of every day, shows it in a **Stats** tab with charts and personal records, and adds **achievements** that pop up as you earn them.

**Decisions made with Robert (2026-10-08):**

- **Achievements are a record only.** They give no cash, reputation or unlocks, so balance doesn't change and nobody has to chase them. Earning one shows a notice and plays a sound, and that's all.
- **They're kept in two places:**
  - Each save keeps its own achievements, stats and records, so a new game starts with none.
  - A device-wide **trophy case** in localStorage (kept like the audio settings, not in the save) holds every achievement ever earned on this device, with the hardest level it was earned on, and the best records across all runs. It's shown on the title screen.
- **A day log with charts.** A compact record of every past day: sales, gross, net, visitors, walk-outs, reputation and cash. The Stats tab shows:
  - lifetime totals;
  - records (best day, best week, best month);
  - charts for the last 28 days or the whole game.
- **No year-end report** in this phase (see Left out).

## Levers that already exist

| Lever                                                                 | Where                                                | Phase 17 use                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DayStats`, `grossProfit`, `netIncome`                                | `sim/deal.ts`                                        | `dayRecord(stats, …)` boils a settled day down to a `DayRecord`                                                     |
| `settleDay`                                                           | store                                                | Appends the day's record and updates `lifetime` and `records`, once per day                                         |
| `Sale` (`price`, `msrp`, `cost`, `soldBy`, `source`, `trade`, `used`) | `sim/deal.ts`                                        | Lifetime counts by model, source and seller, and the biggest single deal                                            |
| `NazmaStats`, `QuotaResult`, `reputation`                             | `sim/nazma.ts`, `sim/quota.ts`                       | Inputs to the day-end achievements                                                                                  |
| `calendarOf`, `longDate`, `weatherOn`, `eventOn`                      | `sim/calendar.ts`, `sim/weather.ts`, `sim/events.ts` | Week and month records, and achievements tied to the weather and sale weekends                                      |
| `tipFor(prev, next, seen)` / `startTips`                              | `sim/tips.ts`, `state/tips.ts`                       | `achievementsFor(prev, next, earned)` copies its shape, and `state/achievements.ts` copies `startTips`              |
| `showNotice`, notice timing by text length                            | store                                                | "Achievement: Full Sticker" notices                                                                                 |
| `sfxFor`, `SfxCue`, `audio/samples.ts`                                | `sim/sfxEvents.ts`, `audio/`                         | New `trophy` cue (synthesized), played on unlock                                                                    |
| `computerTab`, office computer actions                                | store, `ui/`                                         | New `'stats'` tab, key P, and a `stats` action on the computer                                                      |
| `startAudioPref`, localStorage helpers                                | `state/persistence.ts`                               | `startTrophyCase` keeps the device-wide case the same way                                                           |
| `TitleScreen`                                                         | `ui/TitleScreen.tsx`                                 | **Trophies** button and a count ("23 / 40")                                                                         |
| `DaySummary`                                                          | `ui/DaySummary.tsx`                                  | "New record" lines and the day's achievements                                                                       |
| `Difficulty`, `tuning()`                                              | `sim/difficulty.ts`                                  | Each earned achievement keeps the level it was earned on. The trophy case keeps the hardest.                        |
| Save `UPGRADES`, `UPDATES` (12.5)                                     | `sim/save.ts`, `sim/whatsNew.ts`                     | Next save version adds `log`, `lifetime`, `records` and `achievements`. Each player-facing sub-phase adds an update |

## Sub-phases

### 17a: Day log, lifetime totals and records (pure + save)

- New `sim/stats.ts` (pure, tested):
  - `DayRecord { day, sales, usedSales, gross, net, visitors, walkOuts, reputation, cash, marketing }`. These are whole numbers, and the record is built by `dayRecord(stats, day, reputation, cash)` from a settled `DayStats`. `walkOuts` is refused + impatient + closing. `gross` is `grossProfit`, `net` is `netIncome`.
  - `Lifetime`:
    - `sales`, `usedSales`, `gross`, `net`, `visitors`;
    - `byModel`, `bySource`;
    - `bySeller` (keyed by employee id, plus the player): sales and gross;
    - `trades`, `bought` (cars bought from sellers), `nazmaRunOffs`, `theftsFoiled`.
  - `addDay(lifetime, stats)` folds one day in.
  - `Records`:
    - `bestDay` (gross, `{ value, day }`) and `bestSalesDay`;
    - `bestWeek` and `bestMonth` (gross, by calendar week and month);
    - `biggestDeal` (one sale's gross, with the model and day);
    - `longestStreak` (days in a row with a sale), with the streak running now.
  - `updateRecords(records, log, stats)` returns the new records and the list of keys that changed (`brokenRecords`), so the summary can say "New record".
  - Week and month totals are summed from the log through `calendarOf`, never stored.
- Store: `log: DayRecord[]`, `lifetime`, `records`. `settleDay` appends and folds them in once, guarded by `settled` as payroll is. `newGame` and `dayOne` start them empty.
- Save, next version:
  - `log` is saved as an array of number tuples in a fixed field order (`LOG_FIELDS`), to stay small. `parseSave` checks each tuple's length and that its `day` counts up.
  - `lifetime`, `records`, and `statsFrom` (the first day the log covers).
  - An older save starts with an empty log and zero totals, and `statsFrom` is the save's next day, so the Stats tab can say "Since day 23".
  - When Phase 13's `Career` exists, `lifetime.gross` and `career.gross` both come from the same `grossProfit` in `settleDay`. A test checks that they agree on a fresh game, but neither replaces the other, because the rank only reads `career`.
- Tests:
  - `dayRecord` from a hand-built `DayStats`.
  - `addDay` totals by model, source and seller.
  - Records: a best day replaced only by a strictly higher one, streaks broken by a day with no sales, week and month sums across a month boundary, and `brokenRecords`.
  - The save round-trips `log`, `lifetime` and `records`, and an old save upgrades with `statsFrom` set.

### 17b: The Stats tab and charts

- The office computer gets a **Stats** tab: `computerTab` `'stats'`, key P, the computer's `stats` action, and the top-bar **Office** button reaches it as it reaches the other tabs. If the computer's action ring is already full (Phases 14–16 add three more), the tab is still reached through **Office** and P.
- `ui/StatsTab.tsx`:
  - **Totals**: lifetime sales (new and used), gross, net, visitors, close rate (sales ÷ visitors), and average gross per sale. "Since day N" when `statsFrom` > 1.
  - **Records**: best day, best week, best month, biggest deal, longest streak (and the current one), each with its date in `longDate`.
  - **Chart**:
    - a metric picker (sales, gross, net, visitors, reputation, cash) and a range picker (last 28 days, or the whole game);
    - past 84 days, the whole game is summed by week (by its last day for reputation and cash), so a chart never has more than 84 bars or points.
  - **Breakdowns**: lifetime sales by model, by source and by seller (today's roster plus "Former staff" for ids no longer on it).
- `ui/Chart.tsx`: a small inline SVG chart with no chart library. Bars for counts and money (gross, net and sales, with negatives below a zero line), and a line for levels (reputation and cash). It has a hover or tap readout for one point, uses colours from `hud.css` variables, and works at `COMPACT` width.
- Pure helpers in `sim/stats.ts`, tested: `series(log, metric, range)` returns `{ label, value }[]`, already bucketed, and `closeRate`.
- `DaySummary`: a "New record: best day ($8,420)" line for each key in `brokenRecords`.

### 17c: Achievements (pure + store + notice)

- New `sim/achievements.ts` (pure, tested):
  - `Achievement { id, title, text, group, hidden?, check }`. `group` is Selling, Business, People, Adversaries, Calendar or Used cars. `hidden` ones show as "???" until earned.
  - `ACHIEVEMENTS`: about 30–40 at first, listed below. Only achievements for features that are built go in the catalogue. When a later phase lands, it adds its own in the same change (see the CLAUDE.md line below).
  - Two kinds of trigger, the same split as tips:
    - **Live**: `achievementsFor(prev, next, earned)` diffs two store states, as `tipFor` and `sfxFor` do. Used for moments that happen during the day, such as a sale signed, Nazma run off by the player, a wash or a keep.
    - **Day-end**: `dayAchievements(stats, log, lifetime, records, ctx, earned)` runs in `settleDay`, for totals, streaks, the quota and reputation.
  - Both return only ids that aren't already in `earned`, so an achievement is never earned twice.
  - `EarnedAchievement { id, day, level }`, where `level` is the `difficulty` it was earned on.
- Store: `achievements: EarnedAchievement[]`, saved. `earnAchievements(ids)` adds them and queues a notice for each ("🏆 Full Sticker: sold a new car at full MSRP"). Several in one moment are one notice ("🏆 3 achievements"). The day-end ones show in the summary instead of as notices.
- `state/achievements.ts` (`startAchievements`) subscribes as `state/tips.ts` does and calls `earnAchievements`. It skips while `isPaused`, and it stays cheap: it returns early unless the slices it reads (`dayStats.sales`, `nazma`, `roster`, `cash`, `inventory`) have changed identity.
- Sound: a `trophy` `SfxCue`, synthesized like `fanfare`, played on unlock. It needs a level in the bridge's `VOLUME`, and a line in `public/audio/LICENSE.md` saying it's synthesized.
- Achievements on Easy count the same as on Hard. The level is a record only, for the trophy case.

**The first catalogue (Medium tuning in brackets where it matters):**

- **Selling:**
  - First Sale.
  - Ten, Fifty and Two Hundred sales (three entries).
  - Full Sticker: a new car at full MSRP.
  - Closer: 5 sales in one day.
  - Patient: close after the customer's last counter round.
  - Big Ticket: one sale with $5,000+ gross.
  - Every Model: sold one of each model.
- **Business:**
  - In the Black: the first day with positive net.
  - Six Figures: $100,000 cash.
  - Holdback: meet the monthly quota.
  - Ad Man: a sale from every ad channel.
  - No Debt: end a day with 10+ cars and none floored.
  - Fully Loaded: every lot space and platform full at opening.
- **People:**
  - First Hire.
  - Full House: every role filled at once.
  - Star Seller: one salesperson reaches 25 lifetime sales.
  - Loyal: keep a poached employee.
  - Hands Off: a day where staff made every sale.
- **Adversaries:**
  - Not On My Lot: run Nazma off yourself.
  - Guard Dog: the guard runs him off.
  - Fort Knox: a theft foiled.
  - Spotless: close a day with every car's cleanliness ≥ 0.9.
- **Calendar:**
  - Rain or Shine: 3 sales on a rainy day.
  - Sale Weekend: 10 sales over one event weekend.
  - Busy Saturday: 20 visitors on a Saturday.
  - One Year: reach the end of month 12.
  - Streak: 14 days in a row with a sale.
- **Used cars:**
  - Trade-In: a sale with a trade.
  - Bought Low: buy from a seller under their first hope.
  - Flipper: $2,000+ gross on a used sale.
  - Fresh Lot: sell a used car within 3 days of buying it.
- **Reputation:**
  - Well Known: reputation 75.
  - Beloved: reputation 95.
- **Hidden (2–3):**
  - Car Wash: wash 5 cars yourself in a day.
  - Tube Man Fan: own every outdoor improvement.

Phases 13–16 add their own when built:

- 13: a rank-up each, Gold Franchise, Dealer of the Year;
- 14: Rival Bust;
- 15: First Service Job, Comeback Free Month;
- 16: 50 Clients, a Trade-Up, a Referral by Name, CSI 90.

- Tests:
  - Ids are unique, every achievement has a title, text and group, and texts stay under about 80 characters.
  - Each `check` fires on a hand-built state and not on the one just short of it. For example, 4 sales in a day isn't Closer, and an MSRP − $1 sale isn't Full Sticker.
  - Already-earned ids are never returned.
  - Loading a save and replaying the morning earns nothing new.
  - The diff is a no-op when nothing it reads has changed.

### 17d: Achievements tab, trophy case and title screen

- The Stats tab gets a second view, **Achievements**: a toggle at the top, no new key.
  - It's grouped by `group`, and each one shows earned (date and a level medal) or not yet earned (greyed, with its text). A hidden one shows "???".
  - A count at the top: "18 of 36".
- The device-wide trophy case:
  - `sim/trophyCase.ts` (pure, tested):
    - `TrophyCase { earned: Record<id, { first: number, level: Difficulty }>, best: { day, week, month, deal, streak } }`;
    - `mergeCase(case, achievements, records, level)` keeps the earliest real date and the **hardest** level for each id, and the highest of each record;
    - `parseCase` drops ids that aren't in `ACHIEVEMENTS` and anything badly formed.
  - `state/persistence.ts` `startTrophyCase()`: reads the `dealership.trophies` key, merges in each unlock as it happens and each day's records at `settleDay`, and writes it back. Every read and write is wrapped in try/catch, so a private window just has no case.
  - Achievements earned before 17d (in a save from 17c) are merged into the case when that save loads.
- Title screen:
  - A **Trophies** button with the case's count ("23 / 36").
  - It opens `ui/TrophyCase.tsx`: the same grouped grid (with the hardest level's medal) and the best-ever records. It reuses the title screen's panel styles and scrolls inside on `COMPACT`.
  - Clearing the save doesn't clear the case. A **Reset trophies** link at the bottom, with a confirm, does.

## Performance

- The log adds one record a day. At 10 numbers a day, a year of play adds about 15 KB to the save, which is fine for localStorage. `parseSave` stays quick at 500 days. Check it.
- Week and month records and the chart series are worked out from the log only when the Stats tab is open (memoised on `log`) and once in `settleDay`. Nothing is added per frame.
- `startAchievements` runs on store changes, not per frame, and returns early unless its slices changed. The live checks look only at what's new since `prev`: the latest sale, the latest Nazma status.
- The chart draws at most 84 points as plain SVG. Check that the tab opens without a stutter on a phone with a 300-day log.

## Help (every sub-phase)

- Update `ui/HowToPlay.tsx` as each feature lands, describing only what's built:
  - Business tab: a Stats section covering the tab, records and charts.
  - Basics tab: a short Achievements section covering the notice, the Achievements view and the trophy case on the title screen.
- `ui/controls.ts`: P for Stats. The touch list's Office line mentions stats.
- Tips `stats` (on the first day that sets a record) and `achievement` (on the first unlock, pointing to the tab) in `sim/tips.ts`.
- What's new (12.5): one `UPDATES` entry per sub-phase that changes play (17b, 17c and 17d).

## Tuning targets (Medium)

- In the first game day, a new player earns 1–3 achievements (First Sale, and maybe First Hire and In the Black). It shouldn't be a flood.
- By day 30, about 12–16 of the first ~36 are earned. By day 90, about 25. A few (Two Hundred Sales, One Year, Beloved) take a long game.
- Easy and Hard need the same thresholds. Only the level medal differs.
- A record line shows up in the summary on about 1 day in 5 after the first week, often enough to notice but not every day.

## Verification (each sub-phase)

- `npm test`:
  - `stats.test.ts`: `dayRecord`, `addDay`, records and streaks, week and month sums, `series` bucketing past 84 days, `closeRate` with no visitors.
  - `achievements.test.ts`: catalogue checks, each `check` at and just short of its threshold, no repeats, and the no-op diff.
  - `trophyCase.test.ts`: merge keeps the earliest date, the hardest level and the highest records, and parse drops unknown ids.
  - Store tests:
    - `settleDay` adds exactly one log record per day, even when called twice.
    - A sale at MSRP earns Full Sticker once.
    - The day-end achievements land in the summary, not as notices.
    - A new game starts empty.
  - `save.test.ts`: the new fields round-trip, and an older save upgrades with an empty log and `statsFrom`.
- `npm run lint`, `npm run build`, `npm run e2e`. The e2e smoke opens the Stats tab with P, and opens the title screen's Trophies.
- `npm run dev` / `/run`:
  - Play a few days and watch the chart fill, then switch metrics and ranges.
  - Sell at full MSRP and see the notice and hear the sound.
  - Break a record and see the summary line.
  - Start a new game and see the trophy case keep what the last run earned.
  - Check the tab and the trophy case at phone width.

## Left out

Robert left these out on 2026-10-08. They could make a later phase:

- Rewards for achievements: cash, reputation or cosmetic unlocks such as a trophy shelf or sign colours.
- A year-end report screen with a grade and highlights.
- Online leaderboards, or sharing a run.
- Exporting the day log (CSV).
- Per-employee stat pages.
