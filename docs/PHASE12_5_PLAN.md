# Phase 12.5 Plan: What's new

**Status:** planned 2026-10-08. We do one sub-phase per session and stop for Robert's review after each, the same as earlier phases. Both sub-phases are small, so they can go in one session if review allows. It builds on everything through Phase 12. The save is v12 today, so 12.5a makes it v13.

## Context

The game changes quickly, and a returning player has no way to see what changed since they last played. Phase 12.5 adds a **What's new** dialog. When the title screen finds a save that's older than the current build, it lists the updates since that save was written.

**Decisions made with Robert (2026-10-08):**

- **An update number, not the save version alone.** Many features shipped without a save bump: touch input, haggling, audio, Nazma's visits, weather, sales events, driving in, sellers and trade-ins. If the dialog went by save version alone, a player on a v7 save would never hear about audio or Nazma. And 12b–12e couldn't be announced until something else bumped the save. Instead:
  - The save keeps `news`, the number of the latest update the player has been shown.
  - Older saves get their `news` from their save version, which is how this ties back to save versions.
  - From now on, any player-facing change can be announced, whether or not it bumps the save.
- **On the title screen.** The dialog opens over the title screen as soon as an out-of-date save is found. Closing it leaves the player on the title screen with **Continue**. Nothing is running yet, so there's no pause to handle.
- **The log goes back to the first save (Phase 3f, v2).** Any save that still loads gets a complete list. It's shown newest first, with the latest few open and older ones folded.
- **It can be reopened** from a **What's new** button on the title screen.

## Levers that already exist

| Lever                                 | Where                        | Phase 12.5 use                                                                                                |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `SAVE_VERSION`, `UPGRADES`, `upgrade` | `sim/save.ts`                | Bump to 13 and add `news`. The upgrade step needs the version the save started from (see 12.5a)               |
| `createSave`                          | `sim/save.ts`                | Always writes `news: LATEST_NEWS`                                                                             |
| `readSave`, `writeSave`               | `state/persistence.ts`       | New `markNewsSeen()` rewrites the save with the latest `news` when the dialog closes                          |
| `TitleScreen`                         | `ui/TitleScreen.tsx`         | Opens the dialog for an out-of-date save, and gets a **What's new** button                                    |
| Modal panel styles                    | `ui/hud.css` (`day-summary`) | The dialog reuses the title screen's panel, scrolls inside on `COMPACT`, and clears the notch with `--edge-*` |
| `longDate`, `savedAt`                 | `sim/calendar.ts`, the save  | "Since you last played" line: the in-game date and the real date it was saved                                 |
| `playUiCue`                           | `audio/`                     | Button clicks, like every other HUD button                                                                    |
| e2e smoke                             | `e2e/smoke.spec.ts`          | Seed an old save in localStorage and check the dialog shows once                                              |

## Why the save, and not a separate localStorage key

The `news` number lives in the save, not in a per-device key like the audio settings. "What's new to you" belongs to the game you're resuming. A new game has nothing to catch up on, and clearing the save clears it as well. The only gap is a player who closes the tab mid-day, because the save is only written at the end of a day. `markNewsSeen()` covers that gap: it stamps the save as soon as the dialog closes.

## Mapping old save versions to an update

A save of version N was written by some build between the bump to N and the bump to N+1. We don't know which one, so we assume the earliest. That means a player may be shown something they've already seen, but they're never left without something new. An update counts as seen only if its whole phase had shipped by the time version N appeared.

| Save version | Bumped by | Phases fully shipped at that point | `legacyNews(version)` |
| ------------ | --------- | ---------------------------------- | --------------------- |
| 2            | 3f        | through 3                          | 0                     |
| 3            | 5a        | 4                                  | 1                     |
| 4            | 5b/5c     | 5                                  | 2                     |
| 5            | 7a        | 6                                  | 3                     |
| 6            | 7b        | 6                                  | 3                     |
| 7            | 7d        | 7                                  | 4                     |
| 8            | 9d        | 8, 9 (9d was the last of 9)        | 6                     |
| 9            | 10c       | 9 (10d not yet)                    | 6                     |
| 10           | 11a       | 10                                 | 7                     |
| 11           | 11c       | 11 (11c was the last of 11)        | 8                     |
| 12           | 12a       | 11 (12b–12e not yet)               | 8                     |

## Sub-phases

### 12.5a: Update log and save v13 (pure + save)

- New `sim/whatsNew.ts` (pure, tested):
  - `Update { id: number, phase: string, title: string, items: string[] }`.
    - `id` counts up from 1.
    - `phase` is shown as a group heading, for example `'12'` shows as "Phase 12". It's how several updates from one phase are grouped together.
    - `items` are short, player-facing lines that say what you can do, not how it's built.
  - `UPDATES`: the backfill below, one update per finished phase (ids 1–9). From now on, add **one update per shipped sub-phase that changes play**. Sub-phases from the same phase share a `phase`, so the dialog shows them under one heading. Never edit the text of an update that has already shipped. A save that has seen it won't be shown it again.
  - `LATEST_NEWS` is the last update's `id`.
  - `updatesSince(news)` returns the updates with `id > news`, newest first. It's empty when you're up to date.
  - `groupByPhase(updates)` returns `{ phase, updates }[]` in the same order, so a phase's sub-phase updates show together.
  - `legacyNews(version)` is the table above. Unknown versions give 0, so they're shown everything.
- Save v13:
  - `SaveData.news: number`.
  - `createSave` writes `news: LATEST_NEWS`. Any build that writes a save has already shown its updates on the title screen, or it's a new game with nothing to catch up on, so no store state is needed.
  - `UPGRADES[12]` sets `news: legacyNews(from)`, where `from` is the version the save was read at. A chained upgrade (v3 → … → v13) has lost the original version by the time it reaches step 12, so `upgrade` passes the starting version to each step (`step(save, from)`). The other steps ignore it.
  - `parseSave` checks that `news` is a whole number from 0 up to `LATEST_NEWS`. A larger number, from a newer build, is clamped to `LATEST_NEWS`, not rejected.
- Tests:
  - Ids count up by 1 from 1, every update has a title and items, and no item is longer than about 120 characters.
  - `legacyNews` covers every version from 2 to 12, and never goes down as the version goes up.
  - `updatesSince(LATEST_NEWS)` is empty. `updatesSince(0)` is every update, newest first.
  - A v2, v8 and v12 save each parse with the `news` from the table.
  - A v13 save round-trips its `news`.
  - `createSave` writes `LATEST_NEWS`.
- Add a line to the CLAUDE.md conventions: a player-facing change adds an `UPDATES` entry in the same change, the same as keeping the how-to-play guide in sync.

### 12.5b: The dialog and the title screen

- New `ui/WhatsNew.tsx`, a dialog (`role="dialog"`, `aria-label="What's new"`) over the title screen:
  - Kicker "What's new". A heading such as "Since you last played" with the save's `longDate(save.day + 1)` and the real date from `savedAt` (for example "Day 23 · saved Oct 5").
  - Phase groups from `groupByPhase(updatesSince(news))`, newest first.
    - The newest two groups are open. Older ones are folded `<details>`, each showing its phase and title.
    - More than about 6 groups (a very old save) adds a line pointing to **How to play** for the full picture.
  - A **Got it** button (autofocused) closes the dialog. Esc closes it too.
  - The list scrolls inside the panel, so the button is always in view on a phone. Buttons are at least 44px on `COARSE`.
- `TitleScreen`:
  - It already reads the save once. If `updatesSince(save.news)` isn't empty, the dialog opens straight away (local state, not the store, since nothing in play depends on it).
  - Closing it calls `markNewsSeen()`, so it won't come back after a reload even if the player never finishes a day.
  - A **What's new** button, between **How to play** and **Sound**, opens the dialog at any time. With an up-to-date save or none at all, it shows the last 3 updates under the heading "Latest updates".
  - **New game** doesn't open it. A new player gets the how-to-play guide as now, and their first save writes `LATEST_NEWS`.
  - The title screen's own buttons stay hidden behind the dialog while it's open, so Enter can't Continue by accident.
- `persistence.ts`: `markNewsSeen()` reads the save, sets `news: LATEST_NEWS` and writes it back, keeping every other field. It does nothing if there's no save.
- How to play (Basics): one line saying the title screen's **What's new** lists recent updates. There's no key, so `ui/controls.ts` doesn't change.
- e2e (`e2e/smoke.spec.ts`):
  - Seed a v12 save through `addInitScript`. Built with `createSave` and then given `version: 12` and no `news` is enough.
  - Check that the dialog opens and lists "Used cars".
  - Close it, reload, and check that it doesn't open. Then **Continue** starts the day.
  - A fresh profile never sees the dialog.

## Backfill: the first nine updates

This is the draft text for review. Each line is one item. Update `id` = list number.

1. **Phase 4 · Play on phones and tablets**
   - Tap to walk and act. Pinch to zoom, and twist two fingers to turn the view.
   - Every key now has an on-screen button, and the screen fits phones.
   - Turn your phone sideways to play. The game pauses in portrait.
2. **Phase 5 · Profit and ordering stock**
   - Every car has a dealer cost, and the day summary shows your gross profit.
   - Order new cars from the office computer (or press I). They arrive the next morning.
   - Pay cash, or floor a car with the bank and pay daily interest until it sells.
   - Salespeople earn a commission on each sale.
3. **Phase 6 · Haggling**
   - Name your price. Customers accept, counter or walk away.
   - Each kind of customer haggles differently, and some won't budge much.
   - Your salespeople haggle too, and do it better the more skilled they are.
4. **Phase 7 · Marketing, upgrades and reputation**
   - Run newspaper, radio, TV and online ads from the computer's Marketing tab (M).
   - Buy upgrades (U), from a bigger sign and a tube man to a coffee bar and a waiting room TV.
   - Reputation rises with sales and falls with unhappy customers. A good one brings referrals.
5. **Phase 8 · Sound and music**
   - Sound effects, music that follows the day, and chattering voices.
   - Set the volume from the speaker on the top bar. N mutes.
6. **Phase 9 · Nazma**
   - Nazma turns up to smudge your cars. Chase him off before he finishes.
   - Hire a security guard to keep him away.
   - Watch out for cars stolen overnight, and for Nazma poaching your staff. A raise can keep them.
7. **Phase 10 · Calendar, weather and events**
   - A calendar with busier weekends. Check it on the computer's Calendar tab (C).
   - Weather: rain keeps people away and dirties the lot, and people waiting outside lose patience faster on hot or rainy days.
   - A monthly sales target from the manufacturer pays a bonus when you hit it.
   - Weekend sales events, and month-end closeouts on one model.
8. **Phase 11 · Difficulty levels**
   - Pick Easy, Medium or Hard when you start a new game. Older games carry on at Medium.
   - Easy adds a deal hint while you haggle, a one-time bank safety net and tips.
9. **Phase 12 · Used cars**
   - Some customers drive in and park out front.
   - Sellers want cash for their car. Look it over to appraise it, then make an offer.
   - Take a trade-in as part of a sale.
   - Used-car shoppers come by. Used stock loses value the longer it sits.
   - Classifieds ads bring more sellers and drive-ins.

Phase 12.5 doesn't announce itself. The dialog showing up is the announcement.

## Out of scope

- A changelog fetched from the network, or one tied to git tags. The log ships inside the build.
- Pictures or animated previews in the dialog.
- Showing updates mid-game, for example after a hot reload or a new deploy while a day is in progress.
