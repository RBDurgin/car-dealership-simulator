# Phase 16 Plan: Client Book and Loyalty

**Status:** planned 2026-10-08. Phases 13, 14 and 15 come first:

- the month's satisfaction score can hold back 13b's franchise tier;
- unhappy clients defect to 14's rival lot;
- 15's service clients come from the book.

16a takes the next save version. If one of those phases hasn't been built yet, 16f leaves out its ties to that phase until the phase lands. After that, we do one sub-phase per session and stop for Robert's review after each, as in earlier phases.

## Context

The game's goal is a rich client base and growing revenue. Today there's no client base at all. A buyer is forgotten when they drive off, and a shopper who walks out is gone for good. Reputation (7d) is one number, and the referrals it sends in are strangers. Phase 15 left the client book out on purpose.

Real dealers live on repeat and referral business: the buyer from two years ago who comes back to trade up, the friend they send in, and the be-back who walked out on Saturday and is called on Monday. Phase 16 adds that:

- a book of clients and prospects, kept by name;
- a satisfaction score from how each visit went;
- follow-up calls from the desk phone, which book appointments;
- clients who come back to trade up the car you sold them;
- friends sent in by name;
- loyalty levers to spend on;
- the manufacturer's satisfaction survey (CSI).

**Decisions made with Robert (2026-10-08):**

- **Buyers and walk-outs.** Everyone who buys becomes a client. A shopper who talked to you or your staff and left without buying is kept as a prospect for `PROSPECT_DAYS` (14). Sellers, service-only visitors and anyone nobody greeted aren't kept: you never got their details.
- **Timed calls at the desk phone.** You stand at a phone on the office desk and call one person at a time. Each call takes game minutes, so it's time off the floor. A receptionist with nobody waiting works the call list too, slower and less persuasively than you. There's no new role.
- **Clients come back four ways.** They trade up the car you sold them, refer friends by name, bring their car in for service (Phase 15), and, if they're unhappy, take their next purchase to Nazma's (Phase 14).
- **Satisfaction per client, plus the manufacturer's CSI.** Each visit scores 0–100 from the wait, the haggle, the price against what they hoped, how clean the car was and the trade-in. Scores drive returns and referrals. The month's average over new-car buyers is the CSI, which scales the holdback and can block a franchise tier-up.
- **Trade-ups after about 30–60 days.** A Medium run reaches Dealer of the Year around day 70–90, so most early buyers come back about once.
- **Three loyalty levers:** a referral fee, a client appreciation day booked in the Calendar tab, and a loyalty discount for returning clients.

## Levers that already exist

| Lever                                                                                               | Where                                                  | Phase 16 use                                                                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `recordDepartures`, `commit`                                                                        | `sim/deal.ts`, `state/store.ts`                        | `recordClients` runs beside it: buyers become clients, greeted walk-outs become prospects                     |
| `generateCustomer`, `CustomerOptions`, `randomName`                                                 | `sim/customers.ts`                                     | A `client` option rebuilds a returning client from their record: name, look, archetype and taste              |
| `planArrivals`, `takeDue`, `ArrivalSchedule`                                                        | `sim/spawner.ts`                                       | `planClientVisits` builds its own schedule, released the same way                                             |
| `referralVisitors`, `REFERRAL_SKEW`, `Word.referrals`                                               | `sim/reputation.ts`, `sim/spawner.ts`                  | Anonymous referrals are replaced by friends of clients. Reputation scales how often clients refer             |
| `assignVehicles`, `toTrader`, `marketValue`, `UsedInfo`                                             | `sim/driving.ts`, `sim/tradeIns.ts`, `sim/usedCars.ts` | A trade-up client drives in with the car you sold them, aged by `clientCarInfo`                               |
| `sellerBonusFor`, `acceptChance`, `hopePrice`, `askRange`, `suggestedAsk`, `staffAsk`, `dealWarmth` | `state/store.ts`, `sim/negotiation.ts`                 | Loyalty adds to the accept odds. The loyalty discount lowers the sticker a client is priced from              |
| `patienceFactor`, `POSTS`, the receptionist                                                         | `sim/staff.ts`                                         | A receptionist at their post with nobody waiting works the call list                                          |
| `ACTIONS` (timed), `findInteractable`, layout props                                                 | `sim/interactables.ts`, `sim/layout.ts`                | A desk phone with a timed `call` action. The office computer's `clients` action                               |
| `ComputerTab`, `TABS` in `ui/StockPanel.tsx`                                                        | `state/store.ts`, `ui/`                                | A **Clients** tab (key L)                                                                                     |
| `ui/CalendarTab.tsx`                                                                                | `ui/`                                                  | Booking a client appreciation day. Tomorrow's appointments. The month's CSI beside the quota                  |
| `holdback`, `QuotaResult`, `monthSales`                                                             | `sim/quota.ts`                                         | The holdback is scaled by the month's CSI. `monthCsi` is kept beside `monthSales`                             |
| `nextTier` (13b)                                                                                    | `sim/franchise.ts`                                     | No tier-up while the month's CSI is under `CSI_TIER_MIN`                                                      |
| `serviceDemand`, `Customer.service`, `recallOn` (15)                                                | `sim/service.ts`, `sim/recalls.ts`                     | Service visits come from clients due for service. Recall notices name your clients. Pitching a service client |
| `assignQuotes`, `rivalDay`, the Rival tab (14)                                                      | `sim/rival.ts`, `ui/RivalTab.tsx`                      | Loyal clients carry no quote. Defectors add to his strength and are listed                                    |
| `bubbleOf`, `CustomerBubble`, `ui/CustomerPanel.tsx`                                                | `sim/customers.ts`, `scene/`, `ui/`                    | A star over a returning client, and a history line in their panel                                             |
| `WEATHER_EFFECTS`, `planPedestrians`' `walkInScale`                                                 | `sim/weather.ts`, `sim/pedestrians.ts`                 | Rain thins an appreciation day. The cookout draws a few more passers-by in                                    |
| `sfxFor`, `conversationsOf`, `reactionsFor`                                                         | `sim/sfxEvents.ts`, `sim/chatter.ts`                   | A `ring` cue, a phone conversation and a "good to see you again" greeting                                     |
| `generateGoal`                                                                                      | `sim/owner.ts`                                         | A `returning` goal, once clients are due                                                                      |
| `DayStats`, `netIncome`, `salesBySource`, `DaySummary`                                              | `sim/deal.ts`, `ui/DaySummary.tsx`                     | `DayStats.clients`. Referral fees and the cookout come off `netIncome`. A Clients block in the summary        |
| `Tuning` / `TUNING`                                                                                 | `sim/difficulty.ts`                                    | New levers `clientReturn` and `satisfactionShift`, neutral on Medium                                          |
| Save `UPGRADES`                                                                                     | `sim/save.ts`                                          | Next save version adds `clients`, `clientPerks`, `appreciation` and `monthCsi`                                |

## Sub-phases

### 16a: Client book foundation (pure + save)

- New `sim/clients.ts` (pure, tested):
  - `ClientCar`: the car they bought from us. It holds `model`, `used`, `price`, `boughtDay`, and the `year`, `miles` and `condition` it left with.
  - `Client`:
    - `id`: `client-<day>-<n>`, like used-car ids, so it's stable across saves.
    - `name`, `variant`, `companion` and `archetype`, so a returning client looks and shops like before.
    - `status`: `prospect`, `client`, `lapsed` or `defected`.
    - `since` and `lastVisit` (days), `visits` and `bought` (cars bought from us).
    - `car`: a `ClientCar`, or null for a prospect or a lapsed client.
    - `budget` and `preferredModels`.
    - `lastDeal`: for a prospect, the model they wanted, our last ask and their last counter, so a be-back can pick up where they left off.
    - `satisfaction`: 0–100. Each visit's score is blended in (`VISIT_WEIGHT`, about 0.4), so one bad visit hurts without wiping out the good ones before it.
    - `reasons`: the last visit's top reasons ("Waited 40 minutes", "Great price"), for the Clients tab.
    - `dueDay`: when they're due to trade up, or null. `expires`: a prospect's last day.
    - `lastCall`, `callsThisCycle` and `appointment` (16c). `referredBy` and `referrals` (16e). `serviceDue` (16f).
  - `visitScore(c, outcome, ctx)`: a score and its reasons.
    - The base depends on how they left: bought, refused, impatient or sent home at closing.
    - The wait counts against it, from `1 − patienceLeft / patience`. The receptionist and the lounge upgrades already slow the drain, so they help here for free.
    - Haggle rounds count against it. A price under their `hopePrice` counts for it.
    - So do a clean car (`cleanliness`), and an allowance at or over the trade-in's `hope`.
    - Plus `Tuning.satisfactionShift`, clamped to 0–100.
  - `recordVisit(book, c, outcome, score, day, rng)`. A buyer becomes a client and a greeted walk-out becomes a prospect. A returning visitor (`Customer.clientId`) updates their entry instead of making a new one.
  - `pruneBook(book, day)`: expired prospects go. The book is capped at `CLIENT_CAP` (about 200), dropping defected clients first, then lapsed, then the oldest prospects.
  - `TRADE_UP_DAYS` (30–60), rolled at the sale. `isDue(client, day)`. `LAPSE_DAYS` (about 21) after `dueDay`, a client who hasn't come back has bought elsewhere: they become `lapsed` and lose `car`.
  - `clientCarInfo(car, day)`: the car as it is today, as a `UsedInfo`. The game's year is 336 days, so a car bought 40 days ago would come back as new. Client cars instead age `CLIENT_YEAR_DAYS` (about 14) days to the year. That makes a 30–60 day trade-up a 2–4 year old car with matching miles and wear.
- `Customer.clientId` (null for a stranger) and `Source` `'client'` (labelled "Returning clients").
- `generateCustomer` takes a `client` option. The name, look, archetype and models come from the record. Their budget is raised by `TRADE_UP_BUDGET` for a client trading up.
- **Unique names.** `randomName`'s pool is 16 × 18 names, too tight for a book of 200, so `FIRST_NAMES` grows to about 32. A new stranger's name is re-rolled while it matches someone in the book. With an empty book nothing is re-rolled, so the rest of the day's rolls don't shift.
- Store:
  - `clients`: saved.
  - `recordClients(prev, next)` in `commit`, beside `recordDepartures`. A sold car is still in `inventory` until the next morning's `dropSold`, so its cleanliness is there to read.
  - `clientRng`: everything about clients is rolled on its own rng seeded by the day, so a game with an empty book plays exactly as before. It's the same trick `driveRng` uses.
  - `clientPerks`: `{ loyaltyDiscount, referralFee, receptionCalls }`, saved. Nothing reads it until 16c–16e.
  - `appreciation` and `monthCsi`: saved, and empty until 16e and 16f.
  - `clients`, `clientPerks` and `appreciation` are added to `startAutosave`'s changed list, so a change made in the Clients or Calendar tab after closing is kept.
- `DayStats.clients`: `{ added, prospects, returned, calls, booked, referrals, referralFees, appreciation, defected, scores }`.
- Save, next version:
  - Adds `clients`, `clientPerks`, `appreciation` and `monthCsi`.
  - An older save starts with an empty book, since no sale history is saved.
- Difficulty:
  - `Tuning.clientReturn` (× every return chance: trade-ups, bookings, referrals and attendance): Easy 1.2, Medium 1, Hard 0.8.
  - `Tuning.satisfactionShift` (added to every visit score): Easy +5, Medium 0, Hard −5.
- Nothing on screen yet.

### 16b: The Clients tab and recognition

- New `ui/ClientsTab.tsx` (`computerTab` `'clients'`; key L, or the office computer's new `clients` action):
  - At the top: the book's size, average satisfaction and this month's CSI (from 16f; hidden until then).
  - Filters: All, Due, Prospects and Unhappy.
  - A row per person:
    - name, a satisfaction face and score;
    - their car and how long they've had it, or what they were after;
    - their status: "Due in 5 days", "Due now", "Prospect, 9 days left", "Lapsed" or "At Nazma's";
    - their last visit's reasons and their last call.
  - A **Call** button per row, disabled until 16c.
  - The list renders only the current filter, memoised on `clients`.
- **The office computer's actions.** With Phase 14's `rival` and Phase 15's `service`, the computer offers 7 actions. If the ring doesn't fit on a phone, fold them into one **Office** action that opens the panel on its last tab, as the top-bar button does.
- **Recognition:**
  - A returning client keeps their look from the first visit.
  - `bubbleOf` gives them a star while they wait (`bubble-client`), so you can spot them.
  - `ui/CustomerPanel.tsx` shows a Client badge and a history line: "Bought a Summit Sedan 41 days ago · 😊 82". A prospect's line reads "Back about the SUV: you asked $31,500".
  - `reactionsFor` adds a "good to see you again" line when a returning client is greeted.
- The day summary gets a Clients block: new clients, new prospects, returning buyers and the day's average buyer score. It also names the reason that cost the most: "Long waits: 3 buyers waited over 30 minutes."
- Dev: Shift+L brings back a random client (or prospect) from the book, like Shift+R, so recognition can be checked before 16c.
- New tip `clientBook`, shown the first time someone goes in the book.

### 16c: Calls and appointments

- **The desk phone.** A phone prop sits on the office desk's free end, built from a few boxes like `TubeMan`, or from a furniture kit model if one fits. It's its own interactable, approached from the side, so it works with the finance manager in the chair. Its timed `call` action takes `CALL_MINUTES` (about 15 game minutes, about 10 seconds at normal speed).
  - The phone's action calls the top of `callList`.
  - The Clients tab's **Call** button walks you to the phone and calls that person.
  - Walking off mid-call cancels it, as getting up mid-paperwork does.
- `CallKind`:
  - `thanks`: a buyer from the last `THANKS_DAYS` (3) days who hasn't been thanked.
  - `beBack`: a prospect.
  - `checkIn`: an unhappy client (under `UNHAPPY`, about 50).
  - `tradeUp` comes in 16d, and win-backs in 16f.
- `callList(book, day)`: who to call, the likeliest to pay first. It leaves out anyone called in the last `CALL_GAP_DAYS` (3), anyone with an appointment and anyone on the lot today.
- `callOutcome(client, kind, skill, rng, opts)` gives `booked`, `thanked`, `notNow`, `noAnswer` or `annoyed`, with a change in satisfaction:
  - **No answer:** about 30% of calls. Nothing changes, and they can be called again tomorrow.
  - **Booked:** odds by kind, satisfaction, the caller's skill and `Tuning.clientReturn`.
  - **Thanked:** a thank-you call adds `THANKS_BOOST` to satisfaction. In 16e it also raises their referral odds.
  - **Annoyed:** more than `MAX_CALLS` calls in one cycle is pestering, and costs satisfaction.
- **Appointments.**
  - `Client.appointment` is `{ day, minute, reason }`, usually the next open day, at a minute rolled on `clientRng`. It's saved with the book, so an appointment booked today survives the end-of-day save.
  - `planClientVisits(book, day, rng)` builds the day's client schedule in `beginDay`, separate from `arrivals`, and `tickClock` releases it like `takeDue`. Clients are built on `clientRng`, so strangers' rolls on `customerRng` don't change.
  - Clients with appointments come by car when parking is free. `assignVehicles` gives them first pick.
  - A be-back comes back ready to deal. Their `expect` is set so their hope sits near their last counter, and the panel shows their last ask.
  - Waiting hurts an appointment twice as much in `visitScore`. Being kept waiting after booking a time is worse than waiting on a walk-in day.
  - The morning notice lists the day's appointments: "2 appointments today: Alex B. at 10:30, Sam K. at 14:00." The Calendar tab shows tomorrow's.
- **The receptionist calls between customers.**
  - In `tickClock`, while `clientPerks.receptionCalls` is on, a receptionist at their post with nobody `waiting` works through `callList`, skipping anyone the player is calling.
  - A call takes `CALL_MINUTES × receptionCallTime(skill)`: 1.5× at skill 1, down to 1× at skill 5. It's judged at `callSkill(skill)`, which is below the player's.
  - They stop while anyone waits: keeping waiting customers patient comes first, as now.
  - Only bookings make a notice ("Dana booked Alex B. for 10:30 tomorrow"). Everything else shows in the Clients tab.
  - A toggle in the Clients tab turns their calls off.
- Sound and talk:
  - `sfxFor` plays `ring` (synthesized) when a call connects. It gets a level in the bridge's `VOLUME` and a line in `public/audio/LICENSE.md`.
  - `conversationsOf` adds a one-sided `phone` conversation for whoever is calling.
- Tips `followUp` (the first prospect) and `appointment` (the first booking).

### 16d: Trade-ups and the loyalty discount

- **Due clients.**
  - `dueDay` is rolled at the sale.
  - From then on, each morning `planClientVisits` rolls `RETURN_DAILY` × `returnFactor(satisfaction)` × `Tuning.clientReturn` × the loyalty discount's `LOYALTY_RETURN` for each due client. That's the chance they come in on their own today.
  - A new `tradeUp` call kind books them, with much better odds than waiting.
  - Not back by `dueDay + LAPSE_DAYS`, they lapse.
- **A returning client:**
  - drives in with their car: `Vehicle.car` is `clientCarInfo(client.car, day)`;
  - always brings it to trade (`toTrader`);
  - shops their old model, or the next one up the `UPGRADE_PATH` (hatchback, sedan, SUV, luxury SUV) with `UPGRADE_CHANCE`;
  - comes on foot without the trade when parking is full.
- **Loyalty in the deal.**
  - `loyaltyBonus(satisfaction)` is added through `sellerBonusFor`. It's 0 at 50, up to `LOYALTY_ACCEPT` (about +0.08) at 100, and negative below 50.
  - So Easy's `dealWarmth` chip and the staff's haggle pick it up for free.
  - A happy client also hopes for a smaller discount (`LOYAL_EXPECT_CUT`).
- **The loyalty discount** (Clients tab: none, 2% or 4%):
  - A returning client is priced from a lower sticker, `msrp × (1 − discount)`, kept as `Customer.loyaltyCut`.
  - `hopePrice`, `askRange`, `suggestedAsk` and `staffAsk` read it, so asks top out at the loyalty price and the client haggles from there.
  - The panel shows "Loyalty price $29,400 (−2%)".
  - It raises trade-up odds (`LOYALTY_RETURN`: ×1.2 at 2%, ×1.4 at 4%) and adds to the visit score.
  - It costs gross on every returning sale. The summary's per-seller `averageDiscount` counts it as discount.
- A buyer's next `dueDay` is rolled when they sign, so a client can come back again.
- `Sale.returning`, `DayStats.clients.returned`, and a `client` row in the summary's source table through `bySource`.
- Easy: the safety net and tips are unchanged. New tip `tradeUpDue`, when the first client falls due.

### 16e: Referrals by name and client appreciation day

- **Referrals come from clients.**
  - `referralVisitors(reputation)` stops adding anonymous referrals to `Word`.
  - Instead, `planReferrals(book, day, rng, opts)` gives each client a daily chance to send a friend. It applies within `REFER_WINDOW` (about 21) days of their last purchase, with satisfaction at least `REFER_MIN` (about 70), and up to `MAX_FRIENDS` (2) per purchase.
  - The chance is `referChance(satisfaction, fee) × referralScale(reputation)`, and it's higher after a thank-you call.
  - `referralScale` takes over reputation's part: 0.5 at 0, 1 at 50, 1.5 at 100.
  - **Balance change.** Today there are no referrals at or below reputation 50. Now a happy book sends friends at any reputation, just fewer while it's low. This changes the arrival rolls of existing games from 16e on, and that's intended.
- **A friend.**
  - A stranger with `referredBy`, `source: 'referral'` and the usual `REFERRAL_SKEW`, rolled on `clientRng`.
  - The panel shows "Sent by Alex B."
  - If they buy, the referrer gains satisfaction and a referral, the referral fee is paid, and the friend joins the book with `referredBy` set.
- **Referral fee** (Clients tab: $0, $100 or $250). It's paid when a referred friend buys, and booked as `DayStats.clients.referralFees` off `netIncome`. It multiplies `referChance` by ×1, ×1.5 or ×2.
- **Client appreciation day.**
  - **Booking.** It's booked in the Calendar tab for a day 3–14 days ahead, at most once a month.
    - It costs `APPRECIATION_COST` (about $1,200, plus a little per client invited), paid when booked and recorded as `DayStats.clients.appreciation`.
    - It's saved as `appreciation: { day, month }`.
  - **Guests.**
    - Every client in good standing is invited. Each comes with `ATTEND_CHANCE` × their satisfaction factor × `Tuning.clientReturn` × the day's weather traffic, so rain thins the crowd.
    - Guests come through `planClientVisits` with reason `appreciation`.
    - Due and nearly due guests come ready to trade up. Some bring a friend.
    - Every guest gains `APPRECIATION_BOOST` satisfaction, whether or not they buy.
  - **Not tallied as a refusal.** A guest nobody greets eats at the grill, looks at a car or two, and leaves with a new leave reason, `visited`. It isn't tallied as refused and doesn't touch reputation.
  - **On the lot.** New `scene/Appreciation.tsx` puts a cookout on the forecourt that day.
    - It has a grill, two tables, balloons on the sign, and a banner made from a canvas texture.
    - Static meshes with shared materials and no shadows.
    - It blocks its footprint that morning, as improvement footprints do, in an area `layout.test.ts` checks is clear of stock spaces, walkways and customer parking.
    - `planPedestrians`' `walkInScale` rises a little that day.
  - A notice a few days ahead, and on the morning itself.
- Tips `referral` (the first friend) and `appreciation` (the first day the book has 10 clients).

### 16f: CSI, service, Nazma and balance

- **Manufacturer CSI.**
  - `monthCsi` adds up the visit scores of the month's new-car buyers, as the quota counts only new cars. It's reset on the 1st with `monthSales`.
  - `csiOf(monthCsi)` is the average.
  - On the month's last day, `holdback` is multiplied by `csiFactor(csi)`: ×0.75 under `CSI_FLOOR` (70), ×1 at 80, and up to ×1.15 at 90 and over. This is recorded in `DayStats.quota.csi`.
  - 13b's `nextTier` doesn't move up a tier while the CSI is under `CSI_TIER_MIN` (80). The summary says why.
  - The Calendar tab and the Clients tab show the month's CSI so far. The `QuotaMeter`'s tooltip adds a CSI line.
- **Service comes from the book (Phase 15).**
  - In `serviceDemand`, the `Career.sales × SERVICE_PER_CAR` term is replaced by the clients due for service.
  - Each client with a car is due every `SERVICE_INTERVAL` (about 12) days after their purchase. A due client comes in with `serviceChance(satisfaction)`, named and recognised.
  - `TOWN_SERVICE` strangers stay anonymous and aren't kept.
  - A serviced client gains satisfaction, and their car's wear is partly undone (`SERVICE_WEAR_SAVED`), so their trade-in is worth more. A comeback (15d) costs satisfaction.
  - Recalls (15e) draw their visitors from the book's clients with that model first, and the notice names how many: "9 of your clients drive Summit Sedans". `Career.soldByModel` still covers buyers pruned from the book.
- **Pitching a service client.**
  - The player's new `pitch` action can be used on a client in the service waiting chairs whose trade-up is due within `DUE_SOON` (7) days. Phase 15 left this out.
  - If they agree, they become a shopper, and their car in the bay is their trade, with its allowance taken from its condition after the job.
  - The job still finishes. The traded car then moves into stock, holding a lot space as a `Purchase` does.
  - Salespeople don't pitch.
- **Nazma (Phase 14).**
  - While his lot is open, a client who lapses goes to Nazma's with `defectChance(satisfaction, share)` instead of lapsing quietly. They're marked `defected`, counted in `DayStats.clients.defected`, and add `DEFECT_STRENGTH` to his strength in `rivalDay`.
  - An unhappy prospect who expires can go the same way.
  - The Rival tab lists "Clients lost to Nazma", and the Clients tab shows them as "At Nazma's".
  - Loyal clients (satisfaction at least `LOYAL`, about 80) never carry a `rivalQuote`, since 14c's `assignQuotes` skips them. Other returning clients carry one at the usual odds.
  - A `winBack` call to a defected client can make them a prospect again (`WIN_BACK_CHANCE`).
- **Owner goal.** A `returning` goal kind: "Sell to 2 returning clients". It's added to `generateGoal`'s kinds only when at least 4 clients are due or booked that day, as `model` is only added when models are in stock. Otherwise every owner day's goal would re-roll.
- Phase 13's win screen adds the book's size, its average satisfaction and the best month's CSI.
- New tip `csi`, the first month the CSI is under `CSI_FLOOR`.
- A balance pass toward the targets below.

## Performance

- The book is at most `CLIENT_CAP` (about 200) records:
  - `planClientVisits` and `planReferrals` run once a day, in `beginDay`.
  - `recordClients` only looks at customers who started leaving since the last `commit`.
  - Receptionist calls are added up in `tickClock`, every 10 game minutes.
  - Nothing new runs per frame apart from the cookout's grill smoke, if it has any.
- The save grows by about 50 KB at the cap, well inside localStorage. Check that `createSave` and `parseSave` stay quick at 200 clients.
- The Clients tab renders only the filtered rows, memoised on `clients`. If 200 rows are slow on a phone, render the first 50 with a **More** button.
- An appreciation day adds a handful of static meshes and about 4–8 extra customers. Check `?fps` with the cookout up and a full lot, as in Phase 13.

## Help (every sub-phase)

- Update `ui/HowToPlay.tsx` as each feature lands, describing only what's built:
  - Selling tab: a Clients section covering the book, satisfaction, calls, appointments, trade-ups and the loyalty price.
  - Business tab: the referral fee, the loyalty discount, client appreciation day and CSI.
  - People tab: the receptionist's calls.
- `ui/controls.ts`: L for Clients. The touch list's Office line mentions Clients.
- Tips `clientBook`, `followUp`, `appointment`, `tradeUpDue`, `referral`, `appreciation` and `csi` in `sim/tips.ts`.
- What's new (12.5): one `UPDATES` entry per sub-phase that changes play, under `phase: '16'` (16b through 16f; 16a puts nothing on screen).

## Tuning targets (Medium)

- By day 30 the book holds about 40–60 clients and 10–15 prospects.
- A typical buyer scores 70–80 with decent service. Waits over 30 minutes or a hard haggle pull a score into the 50s.
- About 1 in 3 be-back calls books an appointment, and about half of those appointments buy.
- About 60% of clients over 70 satisfaction trade up with you, and about 20% of those under 50 do.
- By day 60, returning clients and their friends make up 25–35% of sales.
- A player's call takes about 10 seconds at normal speed. A receptionist makes 6–10 calls on a quiet day.
- At $100, the referral fee costs under 3% of the gross from referral sales.
- An appreciation day costs about $1,500–2,000 and brings 4–8 guests and 1–3 sales.
- A 2% loyalty discount about pays for itself in extra returns. A 4% one only does with a big book.
- A CSI of 80 is reachable without perfect play. Under 70, the holdback loses a quarter.
- Easy is more forgiving and Hard harsher, through `clientReturn` and `satisfactionShift`.

## Verification (each sub-phase)

- `npm test`:
  - `clients.test.ts`:
    - who goes in the book (buyers, greeted walk-outs; not sellers or the never-greeted);
    - visit scores by wait, haggle, price, cleanliness and trade;
    - satisfaction blending;
    - prospects expiring, and the cap's pruning order;
    - `clientCarInfo`'s compressed aging;
    - unique names;
    - due, lapse and defection;
    - `callList` order and gaps, and `callOutcome` odds by kind, satisfaction and skill;
    - `planClientVisits` and `planReferrals` are deterministic per day.
  - `negotiation.test.ts`: the loyalty price in `askRange`, `suggestedAsk` and `staffAsk`, and the loyalty bonus.
  - `quota.test.ts`: `csiFactor` and the scaled holdback. `franchise.test.ts`: no tier-up under `CSI_TIER_MIN`.
  - Store tests:
    - A sale adds a client, and a greeted walk-out adds a prospect.
    - A call books an appointment that arrives the next day, and the receptionist calls only while nobody waits.
    - A trade-up client drives in with the car you sold them.
    - The referral fee is paid only when the friend buys.
    - Appreciation day guests come, and leaving as `visited` doesn't touch reputation.
    - The CSI scales the month-end holdback.
    - A game with an empty book plays exactly as before.
  - `service.test.ts` (15): demand from clients due for service. `rival.test.ts` (14): defectors add strength, and loyal clients carry no quote.
  - A save upgrade test: a save from the version before loads with an empty book.
  - `difficulty.test.ts`: every level has the new levers, and Medium's are neutral.
- `npm run lint`, `npm run build`, `npm run e2e`.
- `npm run dev` / `/run`:
  - Sell a car and see the buyer in the Clients tab with a score. Let a greeted shopper walk out and see them as a prospect.
  - Call a prospect from the desk phone, book them, and greet them the next morning by the star over their head.
  - Hire a receptionist and watch them book calls on a quiet afternoon.
  - Force a client due (or use Shift+L), and sell to them with their old car as the trade.
  - Set a referral fee and meet a friend sent by name.
  - Book an appreciation day and see the cookout.
  - Check the month-end CSI line in the summary.
  - Take `?fps` and a draw-call count with the cookout up.

## Left out

Robert left these out on 2026-10-08. They could make a later phase:

- Paid mailers or email campaigns to the book.
- A thank-you gift at delivery.
- A dedicated BDC rep role.
- Online reviews.
- Keeping sellers and service-only visitors in the book.
- Salespeople pitching service clients.
