# Phase 10 Plan: Calendar & events

**Status:** planned 2026-10-06. 10a done 2026-10-06. 10b done 2026-10-06. 10c done 2026-10-06. 10d done 2026-10-06, awaiting review. We do one sub-phase per session and stop for Robert's review after each, the same as earlier phases.

## Context

SPEC Phase 10 gives the game a calendar. Today a day is only a number (`GameTime.day` in `sim/clock.ts`). Apart from ads, reputation and the owner's visits, every day plays the same. Phase 10 gives each day a weekday, week and month. Traffic follows the week, weather changes the lot, the manufacturer sets a monthly sales target, and sales events come round on holiday weekends.

Almost everything is derived from the day number, the same way `isOwnerDay` and `dailyIncentive` are, so the morning rebuild and the save stay simple. Only the month's sales count has to be saved.

**Decisions made with Robert (2026-10-06):**

- **7-day weeks and 28-day months (4 weeks).** Day 1 is Monday, week 1 of January, year 1. Months are named Jan–Dec and roll over into year 2. The top bar reads e.g. "Sat · Wk 2 · Mar".
- **Open every day.** Sunday is the slowest day, but nothing is skipped.
- **All four features:** weekly traffic rhythm, manufacturer quota, weather and sales events.
- **Weather shows in the scene:** rain, overcast light, wet ground and fewer passers-by.

## Levers that already exist

| Lever                    | Where                                                         | Phase 10 use                                                         |
| ------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Day number, morning step | `sim/clock.ts`, `state/store.ts` `beginDay`                   | `calendarOf(day)` is derived from the day number, never stored       |
| Arrival planning         | `sim/spawner.ts` `planArrivals(rng, boost, word)`             | `Word.scale` is multiplied by the weekday, weather and event factors |
| Passers-by               | `sim/pedestrians.ts` `planPedestrians`, `PEDESTRIANS_PER_DAY` | The count is scaled by weekday and weather                           |
| Overnight dust           | `sim/cleanliness.ts` `dirtyOvernight`, `NIGHTLY_DIRT`         | Rain multiplies the dirt on lot cars                                 |
| Daily incentive          | `sim/ordering.ts` `dailyIncentive`, `orderCost`               | A month-end closeout rebate on invoice                               |
| Customer expectations    | `generateCustomer` (`expect`, the 7c `expectCut`)             | Sale events cut `expect`                                             |
| Patience drain           | `tickClock` (`patienceSaved`)                                 | Heat and rain drain patience faster for customers out on the lot     |
| Seeded per-day rolls     | `sim/owner.ts` `isOwnerDay` (`OWNER_SEED + day`)              | `weatherOn(day)` and event days are seeded the same way              |
| Archetype skew           | `sim/marketing.ts` `sourceWeights`, `pickArchetype`           | Events skew toward bargain hunters                                   |
| Closing step, summary    | `settleDay`, `DayStats`, `netIncome`, `ui/DaySummary.tsx`     | Weather and event lines, quota progress and the holdback payout      |
| Owner goals              | `sim/owner.ts` `generateGoal`                                 | A bigger `sales` goal on event days                                  |
| Save                     | `sim/save.ts` (`SAVE_VERSION`, `UPGRADES`)                    | `monthSales` is saved (version 9, after Phase 9's 8)                 |
| Music and sound          | `sim/musicPlan.ts` `trackFor`, `sim/sfxEvents.ts`, `audio/`   | A rain ambience loop and an event jingle                             |
| Office computer tabs     | `computerTab`, `ui/StockPanel.tsx`                            | A new **Calendar** tab                                               |

## Sub-phases

### 10a: Calendar and weekly rhythm

- `sim/calendar.ts` (pure, tested):
  - `DAYS_PER_WEEK = 7`, `WEEKS_PER_MONTH = 4`, `DAYS_PER_MONTH = 28`.
  - `calendarOf(day) → { weekday, week, month, year, dayOfMonth }`, with `weekday` 0 = Monday.
  - `weekdayLabel`, `monthLabel`, `formatDate(day)` ("Sat · Wk 2 · Mar") and `longDate(day)` ("Saturday, week 2 of March").
  - `isMonthEnd(day)`: the last 3 days of the month.
- `WEEKDAY_TRAFFIC`, about: Mon 0.8, Tue 0.8, Wed 0.9, Thu 1.0, Fri 1.15, Sat 1.4, Sun 0.7. `beginDay` multiplies it into `Word.scale`, and `scene/Pedestrians` multiplies it into the day's passers-by.
- HUD: `ui/TopBar.tsx` shows `formatDate` instead of "Day N". The summary title (`ui/DaySummary.tsx`) and the title screen's resume line use `longDate`.
- Office computer: a **Calendar** tab (`computerTab` `'calendar'`, key C, or a new computer action `calendar`). It shows this week and next with each day's expected traffic as a bar. 10b–10d fill in weather, events and the quota.
- Help: the weekly rhythm in `ui/HowToPlay.tsx`, and the C key in `ui/controls.ts`.
- No save change: everything comes from the day number.

### 10b: Weather

- `sim/weather.ts` (pure, tested):
  - `Weather = 'sunny' | 'cloudy' | 'rain' | 'hot'`.
  - `weatherOn(day)` is seeded by day, with a month bias (more rain in spring and autumn, heat in summer) and some carry-over from the day before, so rainy spells last a couple of days. Like `isOwnerDay`, it replays a short window of earlier days, so nothing is saved.
  - `forecast(day, days = 3)` is right about 80% of the time; a seeded "forecast error" swaps a day's weather for a neighbouring type.
  - `WEATHER_EFFECTS`, about:
    - traffic: rain 0.6, hot 0.9, cloudy 1.0, sunny 1.05
    - nightly lot dirt: rain ×2.5
    - lot patience drain: hot ×1.3, rain ×1.5
    - walk-in chance: rain ×0.5
- Store and sim: `beginDay` passes the rain factor to `dirtyOvernight` and the traffic factor to `Word.scale`. `tickClock` drains patience faster for customers out on the lot when it rains or is hot. That makes showroom platforms and a fast porter matter more.
- Scene:
  - `scene/Weather.tsx`: rain streaks in one `InstancedMesh`, animated in `useFrame`, with fewer drops on `COARSE`.
  - Light and fog in `Scene.tsx` are tinted by weather: dimmer and bluer for rain, warmer for heat.
  - `Ground.tsx` makes the outdoor ground darker and shinier in rain.
  - The weather is read once a day from the store; nothing per frame goes through `setState`.
- Audio: a rain loop in `audio/` on the music bus, started and stopped from a store subscription. Credit it in `public/audio/LICENSE.md`.
- HUD: a weather icon next to the date. The Calendar tab shows the forecast.
- Help: what weather does.
- As built: `forecastFor(day, today)` is right 90/80/70% one, two and three days out. Weather is the store's `weather` (set in `beginDay`, not saved). Lot customers are `waitingOutside` (by a lot car or out front), passed to the customer `tick` as `outside`/`outsideFactor`. The rain loop is synthesized noise (`audio/rain.ts`, `rainPlays` in `sim/musicPlan.ts`), so there's no file to credit. Odds were tuned to about 24% rain overall (about 30% in spring and autumn, 6–15% in summer), with spells of about 2.3 days; the summary's kicker names the day's weather.

### 10c: Manufacturer quota

- `sim/quota.ts` (pure, tested):
  - `monthlyQuota(month, slots, reputation)`: about 12–20 cars, scaled to the number of stock slots and nudged by reputation.
  - `holdback(sold, quota, sales)`: nothing below 80% of quota. At 100% the manufacturer pays `HOLDBACK_RATE` (about 2%) of the month's sold MSRP. Past 120% it pays `HOLDBACK_STRETCH` (about 3%).
  - `quotaStatus(sold, quota, daysLeft)` gives the meter a label: on track, behind or hit.
- Store:
  - `monthSales` (`{ count, msrp }` since the 1st) goes up with each sale.
  - `settleDay` on the month's last day pays the holdback, records `DayStats.quota` (`{ quota, sold, payout }`) and resets `monthSales`.
  - `netIncome` adds the payout.
- HUD: a small quota meter (sold / target and days left) next to the date. The Calendar tab shows the month so far.
- Summary: a quota line every day ("9 of 16 this month, 6 days left") and the payout on month end.
- Save: `monthSales` goes in `SaveData`. Bump `SAVE_VERSION` to 9 with an `UPGRADES[8]` step that starts it at zero.
- Help: the quota and holdback.
- As built: the store keeps `monthSales` (`{ count, msrp }`, added to in `sign`) and the month's target as `quota`, both saved (v9). The target is set in `beginDay` on the 1st from that morning's reputation (`monthlyQuota(month, ALL_SLOTS.length, reputation)`: half a car per slot, a `MONTH_QUOTA` season factor, ±4 cars for reputation, held to 12–20), so it doesn't drift mid-month; `monthSales` resets at the same time, so a save from the 28th still carries the old month. The holdback was tuned to the $5–8k target: 0.6% of sold MSRP from 80%, `HOLDBACK_RATE` 1.25% at 100% and `HOLDBACK_STRETCH` 2% from 120% (a 16-car month at about $35k a car pays about $7k). The top bar's ⚑ meter shows sold/target and days left, coloured by `quotaStatus`; the Calendar tab shows the month and what the holdback would pay now. The v8 upgrade starts the month at zero with a target from the save's reputation.

### 10d: Sales events and closeouts

- `sim/events.ts` (pure, tested):
  - `EVENTS` is a catalogue of holiday sale weekends (Fri–Sun of a set week): Presidents' Day (Feb), Memorial Day (May), Fourth of July (Jul), Labor Day (Sep), Black Friday (Nov), Year-End (Dec).
  - Each event has a `traffic` factor (about 1.5–2), an `expectCut` (customers expect a bigger discount, about 4%), and archetype weights that lean toward bargain hunters.
  - `eventOn(day)` and `upcomingEvents(day, days)` are derived from the calendar.
- Month-end closeout: in the last 3 days of each month the manufacturer takes `CLOSEOUT_REBATE` (about 6%) off invoice for one seeded model. It sits alongside the daily incentive in `orderCost`, so it pairs with the quota push.
- Store: `beginDay` folds the event's `traffic` into `Word.scale`. `generateCustomer` takes the event's `expectCut` and archetype weights.
- Notices: a week ahead ("Memorial Day sale starts Friday") so the player can stock up and run ads, and an opening-day banner.
- The owner may set a bigger `sales` goal on an event day (`generateGoal` gets the event).
- Sound: a short jingle cue when an event day opens. It needs a `SfxCue`, a file, a level and a credit.
- Summary: an event line ("Memorial Day sale: 11 visitors").
- Help: events and closeouts.
- As built: `EVENTS` run Friday to Sunday of a set week (Presidents' Day Feb wk 3, Memorial Day May wk 4, Fourth of July Jul wk 1, Labor Day Sep wk 1, Black Friday Nov wk 4, Year-End Dec wk 4, which falls on month end), with `traffic` 1.5–2. The hoped-for discount is `extraDiscount` (3–5%), added to `expect` before the showroom's `expectCut` scales it; the archetype lean is `skew`, applied through `skewWeights` in `sim/archetypes.ts` (on top of an ad's `sourceWeights`, and for walk-ins too). The store's `arrivalOpts` gives every new customer the day's improvements and sale. `closeoutOn(day)` picks one model a month (seeded by month) for its last 3 days, `CLOSEOUT_REBATE` 6%, stacking with the daily incentive in `orderCost`. `eventNotice` gives the morning notice a week ahead and on opening day. `generateGoal(…, onSale)` makes a sales goal likelier and `EVENT_SALES_EXTRA` (2) cars bigger. The cue is `fanfare`, a synthesized arpeggio in `audio/samples.ts` that replaces the morning bell on sale days. The top bar shows a 🏷️ sale tag, the Calendar tab colours sale days and lists the next sale and the closeout, the stock panel badges the closeout model, and the summary names the sale in its kicker and visitor line. Nothing is saved.

## Tuning targets

- A week has about 6.8 times an average weekday's traffic. Saturday is about twice Sunday.
- A rainy day costs about 40% of traffic. A rainy spell makes the porter worth hiring.
- The quota should be reachable with two decent salespeople. The holdback on a 16-car month is roughly $5–8k, enough to make the last week a push.
- An event weekend roughly doubles visitors but trims gross per car, so stocking up and running ads beforehand should pay off.

## Verification (each sub-phase)

- `npm test`:
  - New tests: `calendar.test.ts` (date maths, labels, month end), `weather.test.ts` (deterministic, month bias, forecast accuracy), `quota.test.ts` (holdback thresholds), `events.test.ts` (event days, closeout model).
  - Store tests: traffic scaling in `beginDay`, the month-end holdback in `settleDay`.
  - A save test that a v8 save loads into v9.
- `npm run lint`, `npm run build`.
- `npm run dev` / `/run`:
  - Play through a week and check the date, the Saturday rush and the slow Sunday.
  - Find a rainy day: check the rain, the lighting and the dirtier lot, and check it on a phone-size viewport.
  - Finish a month and check the quota payout and the summary.
  - Skip to an event weekend and check the notice a week before, the crowd and the bigger discounts.
  - Resume a save mid-month and check the quota count.
