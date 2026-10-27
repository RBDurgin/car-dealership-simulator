# Phase 23 Plan: Walkthroughs as Features Unlock

**Status:** planned 2026-10-26. Phase 23 comes after Phase 22 (dealer auctions and wholesale). It needs only built phases: 11c (Easy's tips, which it builds on), 12.5 (what's new), 13 (ranks and expansions), 17 (achievements) and 18 (the store slices, `subscribeDiff`/`subscribeTo`, lazy panels and the bench).

- 23a changes the save (`SAVE_VERSION` + 1 when it's built). The other sub-phases shouldn't.
- As in earlier phases, we do one sub-phase per session and stop for Robert's review after each.

## Context

The game has grown to 22 phases of systems: F&I, test drives, the client book, service, Nazma's rival lot, staff growth, the dealer auction. Today it teaches them in two ways:

- The how-to-play guide (`ui/HowToPlay.tsx`), which the player has to go looking for.
- Easy's guided tips (`sim/tips.ts`, `state/tips.ts`): one line as a notice the first time something happens, and only on Easy.

A player who reaches Main Street gets the east lot, Nazma's announcement, the auction and a new role in the same evening, with a one-line notice at most. Phase 23 adds **walkthroughs**: a short card when a feature first becomes available or first comes up, and, if the player wants, a few guided steps that point at the right button or thing in the world and move on when they do it.

**Decisions made with Robert (2026-10-26):**

- **Layered: a card, then guided steps.**
  - On unlock a **card** comes up: a title and 3–4 bullets, with **Walk me through it**, **Later** and **Don't show these**. The card pauses the game like the guide.
  - **Walk me through it** starts the **guided steps**: a small coach panel with 2–5 steps. Each step points at a HUD element or a thing in the world (a highlight ring, or an arrow over it) and advances when the player does it, or on **Next** for a step that only explains.
  - The game keeps running during the steps, and every step can be skipped.
  - **Later** puts it in the guide's Tutorials tab.
- **All levels, with a toggle.**
  - On by default on Easy and Medium, off on Hard (`Tuning.tutorials`).
  - It's a per-game setting: a checkbox on the title screen's New game step, and a toggle in the sound panel to change it any time. Saved.
  - Easy's tips stay. A tip a walkthrough has already covered isn't shown again, so with walkthroughs off the tips work as today.
- **Onboarding.** A new game opens with a walkthrough of the core loop on day one.
- **A replay list.** The how-to-play guide gets a **Tutorials** tab with every walkthrough the game has unlocked, to start again at any time.
- **Catch-up on older saves.** A save that's already past some unlocks gets one offer, on resuming, of the walkthroughs it never saw.

## Levers that already exist

| Lever                                                                           | Where                                                                         | Phase 23 use                                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `TIPS`, `tipFor`, `TipState`, `applies`, `tipsSeen`, `markTipSeen`, `startTips` | `sim/tips.ts`, `state/tips.ts`                                                | `tutorialFor` diffs two states the same way; shared trigger helpers lifted from `applies` |
| `subscribeDiff`, `subscribeTo`, `sameFields`                                    | `state/subscribe.ts`                                                          | The watcher, and the step checks                                                          |
| `isPaused`, `isMuffled`, `sceneIdle`                                            | `state/derived.ts`, `sim/musicPlan.ts`                                        | An open card pauses and muffles like the guide                                            |
| `Tuning`/`TUNING`, `levelTuning`                                                | `sim/difficulty.ts`                                                           | `Tuning.tutorials` (the default)                                                          |
| `unlockedBy`, `installedExpansions`, `bayCount`, `auctionOpen`, `rankUp`        | `sim/expansions.ts`, `sim/service.ts`, `sim/auction.ts`, `sim/progression.ts` | Unlock triggers and `unlocked`                                                            |
| `bubbleOf`, `financing`, `DEAL_PHASES`, rival `status`                          | `sim/customers.ts`, `sim/fi.ts`, `sim/rival.ts`                               | First-encounter triggers                                                                  |
| `COARSE`/`COMPACT`, `--edge-*`, `onPointerUp` rule                              | `input/useMediaQuery.ts`, `ui/hud.css`                                        | Touch wording and placement of the coach panel                                            |
| `lazyPanels`, `prefetchPanels`                                                  | `ui/lazyPanels.tsx`                                                           | The card loads lazily                                                                     |
| `tileToWorld`, live `layout.props`                                              | `sim/grid.ts`, `scene/runtime.ts`                                             | World targets for the arrow                                                               |
| `UPDATES`, `ACHIEVEMENTS`, `playUiCue`                                          | `sim/whatsNew.ts`, `sim/achievements.ts`, `audio/`                            | What's new, an achievement, a cue on each step                                            |

## The design

### The catalogue: `sim/tutorials.ts` (pure, tested)

- `TutorialId` and `TUTORIALS: Record<TutorialId, Tutorial>`. A `Tutorial` has:
  - `title` and `card` (the bullets). Text that names a key has a touch wording, like the hints on `COARSE`.
  - `steps`: each `Step` is `text`, an optional `target` and an optional `done(s)`. Without `done` the step shows **Next**.
  - `when`: `'event'` (shown when it happens) or `'morning'` (rank and expansion unlocks wait for the next `beginDay`, so they never land mid-deal).
  - `unlocked(s)`: whether the feature is available now, for the Tutorials tab and the catch-up.
  - `covers`: the `TipId`s it replaces.
- `CoachTarget` is one of:
  - `{ ui: CoachAnchor }`: a HUD element carrying `data-coach="<anchor>"`.
  - A world target, resolved in the scene from the live `layout.props`, customers and inventory, never a hardcoded position: `desk`, `computer`, `phone`, `kiosk`, `counter`, a waiting customer (any, a seller, a 🔑 shopper), a car (dirty, used).
- `tutorialFor(prev, next, seen)`: the first unseen walkthrough the change calls for, or null. Like `tipFor` it reads a narrow `CoachState` and returns early unless what it reads changed. Triggers that today's tips already compute move into shared helpers in `sim/tips.ts` rather than being written twice.
- `stepDone(id, step, s)` and `catchUpList(s, seen)` (unlocked but unseen).

### The store: `state/slices/tutorials.ts`

- Saved: `tutorialsOn`, `tutorialsSeen`, `tutorialsLater`, `catchUp`.
- Mid-day, never saved: `tutorialCard` (the id on the card, or null) and `coach` (`{ id, step }` or null).
- Actions: `offerTutorial`, `startTutorial(id)`, `laterTutorial`, `advanceCoach`, `skipStep`, `endTutorial`, `setTutorialsOn`.
- `newGame(difficulty, name, tutorialsOn)` takes the title screen's choice, defaulting to the level's `Tuning.tutorials`.
- `isPaused` includes an open `tutorialCard`, so the clock, chatter, the music's muffle and the demand frameloop follow. An active `coach` doesn't pause.

### The watcher: `state/tutorials.ts`

- `startTutorials`, started beside `startTips`, through `subscribeDiff`:
  - Queues what `tutorialFor` finds. A `morning` walkthrough waits for the next day to start.
  - Shows a card only when no card, coach or guide is up and the player isn't in a deal.
  - Marks the walkthrough seen when its card is shown, and its `covers` tips with it.
- While `coach` is set, `subscribeTo` selects only what the step's `done` reads and calls `advanceCoach` when it passes, with a `playUiCue`.

### UI and scene

- `ui/TutorialCard.tsx` (lazy, through `ui/lazyPanels.tsx`).
- `ui/Coach.tsx`: the step text, "Step 2 of 4", **Next** or **Skip**, placed with the `--edge-*` variables.
- `ui/CoachHighlight.tsx`: a ring around `[data-coach=…]`, measured with a `ResizeObserver` and a `requestAnimationFrame` loop only while a UI step is active. It never sets store state per frame. It swallows `onPointerUp` as well as clicks.
- `scene/CoachMarker.tsx`: a bobbing arrow over a world target, its position in a ref and `useFrame`.
- `data-coach` anchors on the Office button and each office computer tab, the Staff button, the auction's Bid, Inspect and max bid, the customer panel's ask stepper and offer, the F&I panel's lender and products, the Service and Clients tabs, Upgrades' buy, and the sound panel's toggle.
- `ui/HowToPlay.tsx`: a **Tutorials** tab listing the unlocked walkthroughs (Later ones first) with **Start**.

## The walkthroughs

| Group            | Walkthrough       | Trigger                                       | Steps (in short)                                                                   |
| ---------------- | ----------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Onboarding       | `firstSale`       | A new game, day one                           | Move, greet a waiting customer, make an offer, haggle, close the deal at your desk |
| Onboarding       | `firstEvening`    | The first `dayOver`                           | Read the day summary: gross, wages, reputation                                     |
| Onboarding       | `runningThePlace` | Day two's morning                             | Order stock on the Stock tab, hire on the Staff panel                              |
| Early encounters | `usedCars`        | The first seller or trade-in parks            | Appraise the car, make an offer or set an allowance                                |
| Early encounters | `testDrive`       | The first 🔑 shopper                          | Choose Test drive, pick a talking point                                            |
| Early encounters | `fiMenu`          | The player's first financed buyer at the menu | Pick a lender and markup, present a product, sign                                  |
| Early encounters | `clientBook`      | The first client in the book                  | The Clients tab, a call from the desk phone                                        |
| Early encounters | `marketing`       | Day four's morning                            | The Marketing tab, the Upgrades tab                                                |
| Rank unlocks     | `mainStreet`      | The morning after reaching Main Street        | The east lot on the Upgrades tab                                                   |
| Rank unlocks     | `auction`         | The first auction morning once it's open      | The Auction tab, inspect a lot, bid (max bids with a used-car manager)             |
| Rank unlocks     | `rival`           | Nazma's lot opens                             | The Rival tab, Match his price                                                     |
| Rank unlocks     | `garage`          | The morning the service bay is up             | Hire a mechanic, the Service tab, check in at the counter                          |
| Rank unlocks     | `showroomWing`    | The morning the wing is up                    | The new platforms, desks and staff limits                                          |
| Running a team   | `staffGrowth`     | The first raise ask                           | The Staff panel: raises, the schedule, training                                    |
| Running a team   | `monthEnd`        | The first month's last day                    | The Calendar tab: the quota, the franchise tier, CSI                               |

Tips covered (shown as seen once the walkthrough is): `haggle`, `restock`, `seller`, `tradeIn`, `testDrive`, `fiMenu`, `clientBook`, `followUp`, `expansion`, `auction`, `rivalOpens`, `serviceBay`, `serviceClient`, `levelUp`, `franchise`.

## Sub-phases

### 23a: The foundation (save)

- `sim/tutorials.ts`: the types, `tutorialFor`, `stepDone`, `catchUpList`, and the shared trigger helpers lifted from `sim/tips.ts`.
- The slice, the watcher, `isPaused`, and `Tuning.tutorials` (Easy and Medium true, Hard false).
- The card, the coach panel, the highlight and the world marker.
- The title screen's checkbox, the sound panel's toggle and the guide's Tutorials tab.
- One walkthrough end to end: `auction`.
- Built (2026-10-26): the title screen's choice is **By level** / **On** / **Off** rather than a checkbox (a checkbox can't show the level's default before a level is picked). The auction's trigger is a morning predicate, so no trigger helpers moved out of `sim/tips.ts` yet; each later sub-phase lifts the ones it reuses. Save v42.
- Save, next version: `tutorialsOn`, `tutorialsSeen`, `tutorialsLater` and `catchUp`. An older save gets `tutorialsOn` by its level, nothing seen, and `catchUp: true` (unused until 23e).
- What's new entry. Help: Basics (walkthroughs and the toggle).
- Tests: `tutorials.test.ts` (triggers, `stepDone`, morning queueing), a store test that a card pauses the clock and a coach doesn't, and `save.test.ts` (upgrade and round trip).

### 23b: Day-one onboarding

- `firstSale`, `firstEvening` and `runningThePlace`, with the customer and desk world targets.
- The e2e smoke tests turn walkthroughs off (or skip onboarding) so they don't change.
- What's new entry. Tests: onboarding's steps advance on the store changes they wait for.
- Built (2026-10-26): `firstEvening` and `runningThePlace` come up only within `ONBOARDING_DAYS` (3), so turning walkthroughs on later doesn't bring them back; `ONBOARDING` is left out of `catchUpList`. A walkthrough's `lasts` (`day`, `evening`) ends its steps at closing or the next morning, so `firstSale` never holds up the evening's card. `firstSale` covers tips `haggle` and `restock`. No save change.

### 23c: Early encounters

- `usedCars`, `testDrive`, `fiMenu`, `clientBook` and `marketing`, and `covers` for their tips.
- What's new entry. Tests: each trigger, and a covered tip no longer shows.

### 23d: Rank unlocks and the team

- `mainStreet`, `rival`, `garage`, `showroomWing`, `staffGrowth` and `monthEnd`.
- What's new entry. Tests: each trigger, and morning walkthroughs wait for `beginDay`.

### 23e: Catch-up, an achievement and polish

- On resuming a save with `catchUp`, `catchUpList` is offered once: "You've unlocked N features with walkthroughs", opening the Tutorials tab or **Not now**. Then `catchUp` is cleared.
- Achievement `quick-study` (finish onboarding), group `basics`.
- Mobile check: touch wording, the notch, the highlight on a phone-width screen.
- What's new entry. Tests: `catchUpList`, the offer shows once.

## Performance

- `tutorialFor` returns early unless what it reads changed, like `tipFor` and `achievementsFor`.
- The step check selects only what the active step reads, through `subscribeTo`.
- The highlight measures the DOM only while a UI step is active; the marker moves in `useFrame` and never sets state.
- The bench bot plays with walkthroughs off. `npm run bench` shouldn't move; record it in `docs/PERF.md` if it does.

## Help (every sub-phase)

- `ui/HowToPlay.tsx`: Basics (walkthroughs, the toggle) and the Tutorials tab.
- `ui/controls.ts`: nothing new unless a key is added.
- Convention for later phases: a phase that adds or changes a player-facing feature adds or updates its walkthrough in the same change.
- What's new: one `UPDATES` entry per sub-phase, under `phase: '23'`.

## Verification (each sub-phase)

- Run the checks: `npm test`, `npm run lint`, `npx prettier --check .`, `npm run build`, `npm run e2e`, `npm run bench`, and CI.
- `npm run dev` (or `/run`):
  - **23a:** on a Main Street save, the auction card comes up on a Wednesday morning; walk through it, skip a step, choose Later and start it from the Tutorials tab; turn the toggle off and on; Hard starts with it off.
  - **23b:** a new Medium game plays through onboarding; Skip works at every step.
  - **23c–23d:** each trigger once; the Easy tip it covers doesn't follow it.
  - **23e:** an older save gets the catch-up offer once; a phone-width viewport.
  - Save and reload after each sub-phase, including mid-walkthrough: it comes back seen (in the Tutorials tab), never stuck.

## Left out

Left out on 2026-10-26 (proposed; Robert can bring any back at review):

- Voice-over for the walkthroughs (the gibberish voices could read a card).
- Walkthroughs that set up a staged scenario (a scripted customer), rather than waiting for the real thing.
- A tutorial-only sandbox game.
- Per-device memory of walkthroughs seen across games (like the trophy case).
