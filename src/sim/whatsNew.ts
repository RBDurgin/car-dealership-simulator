/**
 * The update log behind the title screen's What's new. Each save keeps `news`,
 * the id of the latest update its player has been shown, and the dialog lists
 * the ones after it.
 *
 * Add one update per shipped sub-phase that changes play, in the same change,
 * with the next id. Sub-phases of one phase share a `phase` so they show under
 * one heading. Never edit the text of an update that has shipped: a save that
 * has seen it won't be shown it again.
 */
export interface Update {
  /** Counts up from 1. */
  id: number
  /** The phase it shipped in, shown as "Phase <phase>". */
  phase: string
  title: string
  /** Short, player-facing lines: what you can do, not how it's built. */
  items: string[]
}

export const UPDATES: readonly Update[] = [
  {
    id: 1,
    phase: '4',
    title: 'Play on phones and tablets',
    items: [
      'Tap to walk and act. Pinch to zoom, and twist two fingers to turn the view.',
      'Every key now has an on-screen button, and the screen fits phones.',
      'Turn your phone sideways to play. The game pauses in portrait.',
    ],
  },
  {
    id: 2,
    phase: '5',
    title: 'Profit and ordering stock',
    items: [
      'Every car has a dealer cost, and the day summary shows your gross profit.',
      'Order new cars from the office computer (or press I). They arrive the next morning.',
      'Pay cash, or floor a car with the bank and pay daily interest until it sells.',
      'Salespeople earn a commission on each sale.',
    ],
  },
  {
    id: 3,
    phase: '6',
    title: 'Haggling',
    items: [
      'Name your price. Customers accept, counter or walk away.',
      'Each kind of customer haggles differently, and some won’t budge much.',
      'Your salespeople haggle too, and do it better the more skilled they are.',
    ],
  },
  {
    id: 4,
    phase: '7',
    title: 'Marketing, upgrades and reputation',
    items: [
      'Run newspaper, radio, TV and online ads from the computer’s Marketing tab (M).',
      'Buy upgrades (U), from a bigger sign and a tube man to a coffee bar and a waiting room TV.',
      'Reputation rises with sales and falls with unhappy customers. A good one brings referrals.',
    ],
  },
  {
    id: 5,
    phase: '8',
    title: 'Sound and music',
    items: [
      'Sound effects, music that follows the day, and chattering voices.',
      'Set the volume from the speaker on the top bar. N mutes.',
    ],
  },
  {
    id: 6,
    phase: '9',
    title: 'Nazma',
    items: [
      'Nazma turns up to smudge your cars. Chase him off before he finishes.',
      'Hire a security guard to keep him away.',
      'Watch out for cars stolen overnight, and for Nazma poaching your staff. A raise can keep them.',
    ],
  },
  {
    id: 7,
    phase: '10',
    title: 'Calendar, weather and events',
    items: [
      'A calendar with busier weekends. Check it on the computer’s Calendar tab (C).',
      'Weather: rain keeps people away and dirties the lot.',
      'People waiting outside lose patience faster on hot or rainy days.',
      'A monthly sales target from the manufacturer pays a bonus when you hit it.',
      'Weekend sales events, and month-end closeouts on one model.',
    ],
  },
  {
    id: 8,
    phase: '11',
    title: 'Difficulty levels',
    items: [
      'Pick Easy, Medium or Hard when you start a new game. Older games carry on at Medium.',
      'Easy adds a deal hint while you haggle, a one-time bank safety net and tips.',
    ],
  },
  {
    id: 9,
    phase: '12',
    title: 'Used cars',
    items: [
      'Some customers drive in and park out front.',
      'Sellers want cash for their car. Look it over to appraise it, then make an offer.',
      'Take a trade-in as part of a sale.',
      'Used-car shoppers come by. Used stock loses value the longer it sits.',
      'Classifieds ads bring more sellers and drive-ins.',
    ],
  },
  {
    id: 10,
    phase: '13',
    title: 'Dealer ranks',
    items: [
      'Earn dealer ranks from your lifetime gross profit and reputation. A rank, once earned, is kept.',
      'The top bar shows your rank and how far you are from the next one. The day summary tells you when you rank up.',
    ],
  },
  {
    id: 11,
    phase: '13',
    title: 'Franchise tiers',
    items: [
      'The manufacturer ranks you Bronze, Silver or Gold. Meet the quota to move up a tier; fall well short to drop one.',
      'Silver and Gold dealers pay less for stock and earn a bigger holdback.',
      'The Summit Vela GT now needs Silver and the Summit Ridge Platinum Gold. Locked models are greyed out on the Stock tab.',
      'The Calendar tab shows your tier and what it takes to move.',
    ],
  },
  {
    id: 12,
    phase: '13',
    title: 'The east lot',
    items: [
      'From Main Street, buy the parcel next door on the Upgrades tab. It’s built overnight with 12 more parking spaces.',
      'Stock goes there once the old lot is full, and your security guard adds it to their rounds.',
    ],
  },
  {
    id: 13,
    phase: '13',
    title: 'The showroom wing',
    items: [
      'From Regional Name, with the east lot bought, build a showroom wing next to the lounge on the Upgrades tab.',
      'It adds 2 display platforms, sales desks 3 and 4 and a second sofa for buyers waiting on finance.',
      'With the wing up you can hire up to 4 salespeople and 2 lot porters. Porters split the washing between them.',
    ],
  },
  {
    id: 14,
    phase: '13',
    title: 'Dealer of the Year',
    items: [
      'Reach the top rank, Dealer of the Year, to win: a trophy screen sums up your career.',
      'Keep playing afterwards as long as you like. A save that has won shows a trophy on the title screen.',
    ],
  },
  {
    id: 15,
    phase: '14',
    title: 'A rival across the road',
    items: [
      'Reach Main Street and Nazma buys the lot across the road. You get a week’s notice before his dealership opens.',
      'Once it’s open, some shoppers go to him instead. A good reputation, running ads and fair prices win them back.',
    ],
  },
  {
    id: 16,
    phase: '14',
    title: 'Keeping an eye on Nazma',
    items: [
      'His lot goes up across the road, in view from the sidewalk: a building site, then his showroom, stock and price banner.',
      'The new Rival tab on the office computer (K) shows his share of buyers day by day, his strength and his prices.',
      'The top bar shows his share of today’s buyers, and each Monday morning you hear how he did last week.',
    ],
  },
  {
    id: 17,
    phase: '14',
    title: 'Shoppers with his price',
    items: [
      'Some shoppers have been to Nazma’s lot first, and the customer panel shows the price he quoted them.',
      'Ask well over his price and they may walk out to him. Match his price for a likelier yes.',
      'Your salespeople match him too, as long as the sale still pays.',
    ],
  },
  {
    id: 18,
    phase: '14',
    title: 'Nazma’s weekly moves',
    items: [
      'Each Monday Nazma picks a move: a price war, an ad blitz against yours, a sale weekend or a quiet week.',
      'The worse his lot does, the more desperate he gets, and the more often he comes over to cause trouble.',
      'Cars he steals go up for sale on his lot, and staff he poaches go to work for him.',
    ],
  },
  {
    id: 19,
    phase: '14',
    title: 'Driving Nazma out of business',
    items: [
      'Keep Nazma’s share of buyers low for three weeks running and his lot goes bust.',
      'Beating him lifts your reputation, sends his buyers to you for a week and keeps him away for a while.',
      'He comes back a few weeks later under a new name, a little stronger. The Rival tab counts the rivals you’ve beaten.',
    ],
  },
  {
    id: 20,
    phase: '15',
    title: 'The service garage',
    items: [
      'From Trusted Dealer, with the east lot bought, build a 2-bay service garage on the Upgrades tab.',
      'Hire a mechanic per bay. They recondition worn used cars, which go back on sale in better shape and for more.',
      'Pick Recondition on a used car, or use the new Service tab on the office computer (B).',
      'The Service tab can also send the used cars you take in to the shop on its own.',
    ],
  },
  {
    id: 21,
    phase: '15',
    title: 'Service clients',
    items: [
      'With a garage built, people drive in for oil changes, tires, brakes and repairs, through a new east gate.',
      'Check them in at the garage counter to quote the job, or hire a service advisor. They pay on collecting.',
      'Short jobs: they sit and wait. Long ones: they leave the car and come back at the time promised.',
      'Happy clients raise your reputation; a late car or a client turned away lowers it.',
    ],
  },
  {
    id: 22,
    phase: '15',
    title: 'Extra work, the shop rate and comebacks',
    items: [
      'Mechanics sometimes find more work. Pick Recommend work on the client, or Call from the Service tab.',
      'A service advisor offers the extra work too.',
      'Set the shop rate on the Service tab: Budget brings more clients, Premium earns more from fewer.',
      'A job that doesn’t hold brings the client back for a free redo and costs reputation.',
      'The owner may now ask for a number of service jobs finished.',
    ],
  },
  {
    id: 23,
    phase: '15',
    title: 'Manufacturer recalls',
    items: [
      'Some months the manufacturer recalls a model, from the 8th to the 28th.',
      'The people you sold one to bring it to your garage. The manufacturer pays for the work.',
      'The Calendar and Service tabs show the recall on now.',
      'Service clients come in more often, and the service garage costs less to build.',
    ],
  },
]

/** The id of the latest update: what a save written by this build has seen. */
export const LATEST_NEWS = UPDATES[UPDATES.length - 1].id

/** The updates after `news`, newest first. Empty when it's up to date. */
export function updatesSince(news: number): Update[] {
  return UPDATES.filter((u) => u.id > news).reverse()
}

/** `updates` grouped by phase, keeping their order, so a phase's sub-phases show together. */
export function groupByPhase(updates: readonly Update[]): { phase: string; updates: Update[] }[] {
  const groups: { phase: string; updates: Update[] }[] = []
  for (const u of updates) {
    const last = groups[groups.length - 1]
    if (last?.phase === u.phase) last.updates.push(u)
    else groups.push({ phase: u.phase, updates: [u] })
  }
  return groups
}

/** Each old save version: the sub-phase that bumped it, and the phases fully shipped by then. */
const LEGACY_NEWS: Record<number, number> = {
  2: 0, // 3f: through Phase 3
  3: 1, // 5a: Phase 4
  4: 2, // 5b/5c: Phase 5
  5: 3, // 7a: Phase 6
  6: 3, // 7b
  7: 4, // 7d: Phase 7
  8: 6, // 9d: Phases 8 and 9
  9: 6, // 10c
  10: 7, // 11a: Phase 10
  11: 8, // 11c: Phase 11
  12: 8, // 12a
  13: 9, // 13a: Phase 12
}

/**
 * The news a save of `version` (from before saves kept it) has already had:
 * the updates whose whole phase had shipped when that version first appeared.
 * A save may have been written later than that, so this can show a player
 * something they've seen, but never leaves out anything new. Unknown versions
 * have seen nothing.
 */
export function legacyNews(version: number): number {
  return LEGACY_NEWS[version] ?? 0
}
