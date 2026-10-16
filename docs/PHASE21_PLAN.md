# Phase 21 Plan: Staff Growth and Morale

**Status:** planned 2026-10-12. 21a built on 2026-10-13 (save v33; `XP_PER_DAY` 6, `XP_TO_LEVEL` 200/240/280/320, `XP_VALUES` sale 4, signing 2, drive 1, wash 1, check-in 2, finding 2, call 0.5, booking 2, job 3, chase 5; potential +0/+1/+2/+3 at 15/40/35/10%; `RAISE_ASK_DAYS` 3; `staffGrowth` 1.3/1/0.85). `raiseAsk` is `{ wage, day }` so it can lapse, and `DayStats.raisesLapsed` names who gave up. 21b built on 2026-10-14 (save v34; `START_MORALE` 70, `MORALE_HOME` 65 with a 10% daily drift, `MAX_DAILY_MORALE` 8; pay ±1.5 per 10% off `wageFor` (at most +1 over), a declined or lapsed raise −8, wins +0.5 each up to +2, walk-outs and comebacks −1 each down to −3, a coworker leaving −2 down to −4; `moralePace` ×1 from 50 to 70, ×0.95 at 85+, ×1.15 at 0; `moraleXp` ×1 from 50 to 80, ×0.8 at 0, ×1.1 at 100; `LOW_MORALE` 25, warn at 3 low days, notice 2 later, `KEEP_MORALE` 15; `moraleShift` +2/0/−1). The resignation is decided each morning in `beginDay` from the saved `lowDays` (the save never keeps `quitting`), and the reasons are kept on the employee as `moraleWhy`. 21c built on 2026-10-16 (save v35; one day off each, two with 3+ in a role, on the quiet days spread by load, never Friday or Saturday, mechanics and the advisor on Sunday; `FATIGUE_DAYS` 6, then −1 morale a day down to −3 and +3% work time a day up to +9%). Rota edits take effect the next morning, so who's off is recorded at opening in `DayStats.off` and payroll reads that. The risk noted while planning was real: a quitter who walked off before `settleDay` went unpaid, so `closeUp` now records their wage in `DayStats.quitWages`. Nazma only visits, poaches and counts the guard by who's on shift; the overnight theft still counts any guard. 21d built on 2026-10-16 (save v36; `TRAINING_XP` 140, fees $200–$500 by role, the advanced course ×2.5 and also worth the experience; `SENIOR_DAYS` 28, `SENIOR_MORALE` 50, `SENIOR_RAISE` 1.15, `PROMOTE_MORALE` 15, `MENTOR_XP` 1.25 only on days the senior comes in, `SENIOR_POACH` 0.5; porter washes ×0.75). The booking is `Employee.training` (`{ day, course }`) rather than `trainingDay`, since it has to say which course. The fee is paid the morning of the course, not at booking, so calling one off costs nothing; the day is their next working one, clear of Friday and Saturday where it can be. Phase 21 comes after Phase 20 (test drives) in the plan. It needs only built phases: 3 (staff), 7c (indoor improvements), 9 (poaching), 10a (the calendar), 11 (`Tuning`), 17 (stats and achievements) and 18 (the store slices, the bench and CI).

- Phases 19 (F&I) and 20 (test drives) don't need to be built first. Where one adds staff work (the finance manager's menu in 19c, a salesperson's drive in 20c), it counts toward that employee's work tally once both are in.
- Most sub-phases add saved fields to `Employee`. Each takes the next free save version (`SAVE_VERSION` + 1) when it's built.
- As in earlier phases, we do one sub-phase per session and stop for Robert's review after each.

## Context

Staff are hired at a skill of 1–5, which comes from a uniform roll, and never change after that. Their wage is `wageFor(role, skill)` for good, they work every day from opening to closing, and nothing they do changes how they feel about the job. The only per-employee history is a salesperson's lifetime sales in `lifetime.bySeller`.

Phase 21 makes the staff people you develop:

- **They grow.** Work earns experience, and skill rises slowly up to each hire's `potential`. A level-up comes with a request for a raise.
- **They have a mood.** Morale moves with pay, workload, wins and the way they're treated. High morale works a little faster. Low morale works slower, attracts Nazma's poaching and, if it's left too long, ends in notice.
- **They have days off.** A weekly rota keeps every role covered, and the player can change it. Off days aren't paid, and working every day tires people out.
- **You invest in them.** Training courses, a Senior title per role, praise, a morning huddle, a break room and Employee of the Month.
- **You can see their record.** Each employee has a page with their history.

**Decisions made with Robert (2026-10-12):**

- **All four parts are in:** experience and skill growth, morale, shifts and days off, and training and promotions.
- **All four extras are in:** per-employee pages, a break room where staff take visible breaks, praise and a morning huddle, and Employee of the Month.
- **Gentle.** This is mostly upside: good management makes staff better.
  - Neglect costs a little speed and raises the chance of someone quitting.
  - Easy turns quitting over morale off.
- **An auto rota with overrides.** The game picks days off that keep each role covered, and the player can toggle any day.
- **Skill stays capped at 5.** No skill formula changes.
  - Growth is slow, about one level per 3–4 game weeks of work.
  - Each hire has a `potential` ceiling, so candidates differ in more than today's skill.
- **Promotion is a Senior title, one per role.**
  - It's open at skill 5 after enough service.
  - It brings a wage bump, a morale lift, a mentor perk and a small role perk.
  - A senior is half as likely to be poached.
- **Quitting over morale gives a warning first.** If the warning is ignored, the employee hands in notice through the existing `quitting` flow, and **Keep** (a raise) can still save them.

## Levers that already exist

| Lever                                                                                          | Where                                                     | Phase 21 use                                                                                              |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Employee` (`skill`, `wage`, `status`, `fired`, `quitting`), `MIN_SKILL`/`MAX_SKILL`           | `sim/staff.ts`                                            | Gains `xp`, `potential`, `hiredDay`, `morale`, `daysOff`, `streak`, `senior` and more (below)             |
| `skillSeconds` (every timed staff task), `jobMinutes`/`jobMinutesFor`                          | `sim/staff.ts`, `sim/service.ts`                          | Wrapped by `workSeconds(base, e)`, which adds the morale and fatigue pace                                 |
| `generateCandidates` (`rng.staff`), `wageFor`, `WAGES`                                         | `sim/staff.ts`, `state/rng.ts`                            | `potential` is rolled on its own `rng.growth`, so the existing draws don't shift                          |
| `reduceStaff` events (`open`, `close`, `poached`, `keep`, `left`), `retentionRaise`, `payroll` | `sim/staff.ts`                                            | New events `resign`, `promote` and `train`; `open` leaves off-shift staff at home; payroll skips off days |
| `isPoachable`, `pickPoachTarget` (weighted by skill²), `POACH_CHANCE`                          | `sim/staff.ts`, `sim/nazma.ts`                            | Weighted by morale too, halved for a senior                                                               |
| `calendarOf`, `WEEKDAYS`, `WEEKDAY_TRAFFIC`, `SERVICE_WEEKDAY`                                 | `sim/calendar.ts`, `sim/service.ts`                       | The rota keeps busy days full and gives mechanics Sunday off (the shop is shut)                           |
| `IMPROVEMENTS`, `Effects`, `ImprovementArea`, `improvementProps`                               | `sim/improvements.ts`                                     | A `break-room` in a new `staff` area, with a new `staffMorale` effect                                     |
| `employeeActions`, `ui/InfoPanel.tsx`, `StaffBadge`, `ui/StaffPanel.tsx`                       | `sim/deal.ts`, `ui/`, `scene/Staff.tsx`                   | The `praise` action, a mood badge, raise and training buttons, the Schedule view and the employee page    |
| `Lifetime.bySeller`, `sellerKey`, `sellerRows`, `salesBySeller`                                | `sim/stats.ts`, `sim/deal.ts`                             | Generalised to `byEmployee` for every role                                                                |
| The timed player actions (`call`, `pitch`; `CALL_MINUTES`)                                     | `sim/calls.ts`, store                                     | The `huddle` action works the same way                                                                    |
| `ACHIEVEMENTS` (group `people`), `TIPS`, `Tuning`/`TUNING`                                     | `sim/achievements.ts`, `sim/tips.ts`, `sim/difficulty.ts` | New achievements, tips and the levers `staffGrowth`, `moraleShift` and `moraleQuits`                      |
| `conversationsOf`, `reactionsFor`                                                              | `sim/chatter.ts`                                          | A `huddle` conversation, and happy lines on praise                                                        |

## Sub-phases

### 21a: Work tally, experience and skill growth (save)

The work tally:

- `DayStats.staffWork: Record<string, WorkTally>`, keyed by employee id.
- `WorkTally` counts sales, signings, washes, check-ins, calls, bookings, jobs, findings sold, chases and whether they came in.
- The existing store actions fill it: `staffSign`, `staffWash`, `staffCheckIn`, `receptionCall`, `staffStartJob` and job finish, `staffRecommend`, `nazmaRunOff('guard')`, and the finance manager's signing.

New `sim/growth.ts` (pure, tested):

- `xpFor(role, tally)`: `XP_VALUES` per piece of work, plus `XP_PER_DAY` for coming in, so a quiet role like security still grows.
- `XP_TO_LEVEL[skill]`: the experience to reach the next level, tuned to about 3–4 weeks of steady work.
- `grow(e, xp, scale)` adds experience and raises `skill` one step at a time. It never goes past `potential` or `MAX_SKILL`.
- `potentialOf(rng, skill)`: never below the current skill, and usually 1–2 above it. A skill-5 hire has potential 5.

The day:

- `settleDay` runs `growStaff` once, guarded by `settled` like the day log.
- A level-up goes in `DayStats.levelUps` (`{ id, name, role, skill }`), the day summary and the next morning's notice.
- After a level-up the employee asks for the new wage: `Employee.raiseAsk` is `wageFor(role, skill)`.
  - **Grant** or **Decline** in the Staff panel.
  - A decline keeps the old wage. From 21b on it also costs morale.
  - An unanswered ask lapses after `RAISE_ASK_DAYS`, which counts as a decline.

Candidates:

- Applicants show their potential as hollow stars after their skill.
- Potential is rolled on `rng.growth` (seeded by the day), so the rest of each applicant roll doesn't change.

Other:

- Lever `Tuning.staffGrowth`: Easy 1.3, Medium 1, Hard 0.85.
- Dev: Shift+G gives every employee on the lot a level's worth of experience.
- Save, next version: `xp`, `potential`, `hiredDay` and `raiseAsk`. An older save's staff get `xp` 0, a `potential` from a hash of their id (never below their skill), `hiredDay` set to the save's day, and no ask.
- What's new entry. Help: the People tab (growth and raises).
- Tests: `growth.test.ts`, the store's settle (a level-up, the raise ask, Grant and Decline) and `save.test.ts` (upgrade and round trip).

### 21b: Morale (save)

New `sim/morale.ts` (pure, tested):

- `Employee.morale` runs 0–100. A hire starts at 70, and morale drifts toward `MORALE_HOME` (65).
- `moraleChange(e, ctx)` runs in `settleDay` and returns `{ delta, reasons }`. The reasons are shown to the player.
- What moves it:
  - pay against `wageFor(role, skill)`: underpaid lowers it a little each day, and overpaid raises it a little;
  - a declined or lapsed raise;
  - wins: a sale, a finished job, Nazma run off;
  - rough days: shoppers lost after a long pitch, a comeback;
  - a coworker poached or fired;
  - the drift toward home;
  - from 21c, fatigue; from 21e, the break room, praise, the huddle and Employee of the Month.
- `MAX_DAILY_MORALE` caps each day's change, so one bad day never ruins anyone.

Gentle effects:

- `moralePace(morale)` scales work time: about ×0.95 at high morale and up to ×1.15 at low.
  - It's folded into `workSeconds(base, e)`, which the six `skillSeconds` calls in `scene/Staff.tsx` move to.
  - The mechanic's `jobMinutes` takes the same pace.
- `moraleXp(morale)`: experience ×0.8 to ×1.1.
- `pickPoachTarget` weighs a low-morale employee up to ×1.5.

Quitting:

- `Employee.lowDays` counts days ending under `LOW_MORALE` (25), and resets above it.
- At `QUIT_WARN_DAYS` (3), the morning notice warns that they're unhappy, and a 😟 badge shows over them.
- Two days later, a `resign` event sets `quitting`. That runs through the existing flow:
  - **Keep** with `retentionRaise` stops them and lifts their morale.
  - Otherwise they leave at `close`, and go to Nazma's lot through `rivalHired` while he's open.
- `DayStats.nazma` already lists the quitters. The summary says whether they left over morale or were poached.
- Levers:
  - `Tuning.moraleQuits` is false on Easy.
  - `Tuning.moraleShift` adds to each day's change: Easy +2, Medium 0, Hard −1.

UI:

- The Staff panel and `InfoPanel` show a mood face and the last day's reasons.
- `StaffBadge` shows 😟 for a warned employee and keeps the quitting badge.

Save, next version: `morale` and `lowDays`. Older saves load with 70 and 0. What's new entry. Help: the People tab (morale).

Tests: `morale.test.ts` (each reason, the cap and the drift), `nazma.test.ts` (the poach weight), and the store (warn, then resign, then Keep on Medium, and no resignation on Easy).

### 21c: Shifts and days off (save)

New `sim/rota.ts` (pure, tested):

- `Employee.daysOff: number[]` holds the weekdays (`calendarOf(day).weekday`, 0 = Monday) they don't work. The pattern repeats each week.
- `autoRota(roster)` gives everyone one day off, or two for a role with spare cover. It:
  - keeps each role covered every day it can;
  - keeps Friday and Saturday full (`WEEKDAY_TRAFFIC`);
  - spreads the rest over the quiet days first;
  - gives mechanics Sunday off, since the shop is shut (`SERVICE_WEEKDAY`).
- `onShift(e, day)`.
- `coverageGaps(roster)` lists the days a role has nobody, such as "No salesperson on Tuesday".

The day:

- `reduceStaff`'s `open` leaves an off-shift employee `off` for the day. They don't come in, take no tasks and can't be poached.
- `payroll(roster, sales, day)` doesn't pay a day off.
  - Also check the risk noted while planning: a quitter removed by `left` before `settleDay` may not be paid for their last day.
- Fatigue:
  - `Employee.streak` counts consecutive days worked, and a day off resets it.
  - Past `FATIGUE_DAYS` (6), each day costs a little morale and pace.
- A new hire gets their day off from `autoRota`.
- The morning notice names who's off today.

UI:

- The Staff panel gains a **Schedule** view: a grid of employees × weekdays.
  - Click a cell to toggle a day off.
  - **Auto** re-runs `autoRota`.
  - A row under the grid shows the coverage gaps.
- The Calendar tab marks days with a gap.

Save, next version: `daysOff` and `streak`. An older save runs `autoRota` on its roster. What's new entry. Help: the People tab (the schedule and fatigue).

Tests: `rota.test.ts` (coverage, Friday and Saturday kept full, mechanics' Sunday, gaps), `staff.test.ts` (payroll on a day off) and the store (an off-shift employee stays home).

### 21d: Training and promotions (save)

Training:

- `TRAINING` per role: a course fee and one day away. The day away is paid, and they're off the floor.
- The course grants `TRAINING_XP`, about two weeks' worth, up to `potential`.
- An advanced course, once per employee, raises `potential` by 1 up to 5 (`Employee.trained`).
- Book it from the Staff panel for a coming day (`Employee.trainingDay`). The Schedule view shows that day, and its coverage gaps count it.
- `trainingBlocker` refuses a course with nothing left to learn, or if one is already booked.
- The fee goes in `DayStats.training` and comes off `netIncome`.

Promotion:

- `canPromote(e, roster, day)`: skill 5, at least `SENIOR_DAYS` (28) since `hiredDay`, morale at least 50, and no other senior in the role.
- **Promote** in the Staff panel (the `promote` event) sets `Employee.senior`. It brings:
  - a title from `SENIOR_TITLES` (Senior Salesperson, Lead Mechanic, Head of Security, …);
  - the wage × `SENIOR_RAISE`;
  - morale +15;
  - half the poach weight;
  - mentoring: others in the role gain experience × `MENTOR_XP` (1.25);
  - one small role perk from `SENIOR_PERKS`. For example: a salesperson +0.02 on the accept chance; a mechanic's comebacks ×0.7; the guard's sight +2; the receptionist's booking chance +0.05; the advisor's upsell +0.03; the porter washes faster; the finance manager's fee +$50.
- `SENIOR_PERKS` are read where the base value is read now (`sellerBonusFor`, `comebackChance`, `guardSight`, `bookChance`, `upsellChance`, `PORTER_WASH_SECONDS`, `FINANCE_FEE`), each through a small helper in `sim/growth.ts`.

Save, next version: `trainingDay`, `trained` and `senior`. Older saves load with null, false and false. What's new entry. Help: the People tab (training and promotion).

Tests: `growth.test.ts` (training up to potential, the advanced course, `canPromote`, the perks) and the store.

### 21e: Morale tools: praise, huddle, break room and Employee of the Month (save)

Praise:

- A `praise` action in `employeeActions`, which the player uses up close.
- It gives `PRAISE_MORALE`, at most once per employee per day. Praise repeated within `PRAISE_GAP` days is worth half (`Employee.praisedDay`).
- The employee answers with a happy line through `reactionsFor`.

Morning huddle:

- A timed `huddle` action at the player's desk, once a day and before `HUDDLE_LATEST` (10:30).
- Everyone at their post gains `HUDDLE_MORALE`. The player is busy for `HUDDLE_MINUTES`.
- A `huddle` conversation in `sim/chatter.ts`.

Break room:

- A `break-room` improvement in a new `ImprovementArea`, `staff` ("Staff room"), with a table, chairs and a fridge.
  - Its props go in a free corner of the office or the garage side. Check the tiles against the live `layout.props` and the player's desk from 19b.
- It's a new `Effects` field, `staffMorale`: daily morale for everyone on shift, and fatigue costs less.
- Idle staff take short visible breaks there:
  - The decision is pure: `wantsBreak(e, ctx)` in `sim/staffAi.ts`, at most once a morning and once an afternoon.
  - Nobody takes a break while customers are waiting.
  - `scene/Staff` walks them there with the existing walker and calls the store through `report`.

Employee of the Month:

- `Employee.monthXp` adds up each employee's experience over the month. It's reset on the 1st in `beginDay`.
- On the month's last day, `settleDay` runs `employeeOfMonth(roster)`, which picks the highest `monthXp` scaled by role (`ROLE_XP_SCALE`, so every role has a fair chance).
  - The winner gets `EOTM_BONUS` in cash (`DayStats.staffBonus`, off `netIncome`) and morale +.
  - Everyone else gets a small morale +.
- The store's `eotm` keeps the winners (`{ name, role, month }[]`, the last 12).
- A plaque in the showroom shows the latest winner's name on a canvas texture.

Save, next version: `praisedDay` and `monthXp` per employee, and `eotm`. Older saves load with null, 0 and an empty list. What's new entry. Help: the People tab (praise, the huddle, the break room and Employee of the Month).

Tests: `morale.test.ts` (praise falls off, the huddle, the break room's effect), `staffAi.test.ts` (`wantsBreak`), `growth.test.ts` (`employeeOfMonth`) and the store.

### 21f: Employee pages, tips, achievements and balance (save)

Records:

- `Lifetime.byEmployee: Record<string, EmployeeTotal>` holds days worked, experience, sales, gross, washes, jobs, check-ins, calls and chases.
  - `addDay` (`sim/stats.ts`) fills it from `DayStats.staffWork`.
  - `bySeller` stays as it is for the Stats tab.
  - An older save seeds `byEmployee` from `bySeller` for its salespeople.
- `Employee.levels: { skill, day }[]` keeps each level-up.

`ui/EmployeePage.tsx` opens from a Staff panel row or the Stats tab's seller rows. It shows:

- the hire day and days worked;
- skill and potential, with the level history;
- morale and the last day's reasons;
- the role's lifetime totals;
- whether they're senior, and their Employee of the Month wins.

Tips in `sim/tips.ts`:

- `levelUp`: the first raise ask.
- `lowMorale`: the first 😟 warning.
- `rota`: the first coverage gap.
- `training`: the first employee who could train.
- `promote`: the first employee who could be promoted.

Achievements, group `people`:

- `homegrown`: someone hired at skill 1 reaches skill 5.
- `first-senior`: promote someone.
- `eotm`: name an Employee of the Month.
- `happy-team`: everyone at 80 or more for 7 days in a row.
- `huddle-up`: hold 10 huddles.

Balance:

- `state/bench/bot.ts` grants raises, keeps the auto rota and huddles each morning.
- Run seeded games on all three levels against the targets below with the 18a bench. The final constants go in the Status line.

Save, next version: `byEmployee` and `levels`. What's new entry. Help: the People tab (the employee page).

Tests: `stats.test.ts` (`byEmployee`), `tips.test.ts`, `achievements.test.ts`, `save.test.ts`, and a balance test in `store.staff.test.ts` (a 56-day seeded run lands in the target bands).

## Performance

- Growth, morale and Employee of the Month are worked out once a day in `settleDay`, and the rota in `beginDay` and when it's edited.
- The work tally is one field bumped in store actions that already run.
- Nothing new runs per frame except a break walk, which uses the existing walker and `report`.
- Panels and the employee page select only what they draw (18c).
- Check `npm run bench` before and after 21b, 21c and 21f, and record the numbers in `docs/PERF.md` if they move.

## Help (every sub-phase)

- `ui/HowToPlay.tsx`, People tab:
  - growth, potential and raises (21a);
  - morale and notice (21b);
  - the schedule and fatigue (21c);
  - training and promotion (21d);
  - praise, the huddle, the break room and Employee of the Month (21e);
  - the employee page (21f).
- `ui/controls.ts`: the praise and huddle actions, and Shift+G in the dev list.
- Tips as in 21f.
- What's new: one `UPDATES` entry per sub-phase, under `phase: '21'`.

## Tuning targets (Medium)

- Growth:
  - A skill-1 hire with average potential reaches skill 3 in about 6–8 weeks of work.
  - Training saves about a week per level.
- Morale:
  - A fairly paid, rested team sits at about 60–80.
  - A neglected employee drifts to about 30 over two weeks. Neglected means a declined raise and seven-day weeks.
  - Low morale costs at most about 15% in pace.
- Quitting: fewer than 1 resignation over morale per 2 game months for a neglectful player on Medium, and none on Easy.
- Money: the wages saved on days off roughly pay for training and the raises growth brings.

## Verification (each sub-phase)

- Run the checks: `npm test` (with the new test files above), `npm run lint`, `npx prettier --check .`, `npm run build`, `npm run e2e`, and CI.
- `npm run dev` (or `/run`), with `T` for speed:
  - **21a:**
    - Use Shift+G to level someone up.
    - Grant one raise and decline another.
    - Check that applicants show their potential.
  - **21b:**
    - Watch the morale reasons over a few days.
    - Underpay someone on Medium and follow the warn, resign and Keep path.
    - Check that nobody resigns on Easy.
  - **21c:**
    - Toggle days off and check the coverage row.
    - Check who comes in each morning and that off days aren't paid.
  - **21d:** book a course, and promote someone at skill 5.
  - **21e:**
    - Praise someone and hold a huddle.
    - Buy the break room and watch a break.
    - Play to the month's end and check the Employee of the Month plaque.
  - **21f:** open an employee page from the Staff panel and from the Stats tab.
  - Save and reload after each sub-phase.

## Left out

Robert left these out on 2026-10-12. They could make a later phase:

- Sick days and random absences.
- Hourly shifts within a day, and split shifts.
- A sales-manager role over the team.
- Staff personalities or traits.
- A choice of commission plan per employee.
- Unions or strikes.
- Owner goals about the staff.
