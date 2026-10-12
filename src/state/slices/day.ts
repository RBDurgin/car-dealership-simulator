import { dayAchievements, type EarnedAchievement } from '../../sim/achievements'
import { appreciationNotice, isAppreciationDay, planGuests } from '../../sim/appreciation'
import { calendarOf, DAYS_PER_MONTH } from '../../sim/calendar'
import { appointmentsNotice, planClientVisits, type ClientVisit } from '../../sim/calls'
import { planBookService, recallOwners } from '../../sim/clientService'
import {
  defaultPerks,
  defectNotice,
  emptyClientStats,
  emptyMonthCsi,
  isDue,
  newlyDefected,
  pruneBook,
  type Appreciation,
  type Client,
} from '../../sim/clients'
import { isClosed, startOfDay } from '../../sim/clock'
import { dirtyOvernight } from '../../sim/cleanliness'
import { csiFactor, csiOf } from '../../sim/csi'
import { arrivalScale, type Customer } from '../../sim/customers'
import { emptyStats, type DayStats } from '../../sim/deal'
import { cleanName, DEFAULT_DEALERSHIP_NAME } from '../../sim/dealershipName'
import { DEFAULT_DIFFICULTY, TUNING, type Difficulty } from '../../sim/difficulty'
import { eventNotice, eventOn } from '../../sim/events'
import { installedExpansions, type OwnedExpansion } from '../../sim/expansions'
import { dailyInterest } from '../../sim/floorPlan'
import {
  heldByCsi,
  heldNotice,
  nextTier,
  START_TIER,
  TIER_PERKS,
  tierNotice,
} from '../../sim/franchise'
import { dropSold } from '../../sim/inventory'
import { activeCampaigns, trafficBoost, unfinished } from '../../sim/marketing'
import {
  emptyNazmaStats,
  isNazmaDay,
  planTheft,
  planVisit,
  stolenRecord,
  theftNightAfter,
  theftSeed,
  visitSeed,
} from '../../sim/nazma'
import { BASE_SLOTS, deliver } from '../../sim/ordering'
import { generateGoal, isOwnerDay, judgeDay } from '../../sim/owner'
import { addDay, emptyCareer, rankById, rankUp, rankUpNotice } from '../../sim/progression'
import { emptyMonthSales, holdback, monthlyQuota } from '../../sim/quota'
import { recallDemand, recallNotice, recallOn, recallStarts } from '../../sim/recalls'
import { countFriends, planReferrals } from '../../sim/referrals'
import {
  applyChange,
  campaignScale,
  reputationChange,
  START_REPUTATION,
} from '../../sim/reputation'
import {
  blitzScale,
  BUST_REPUTATION,
  bustBoost,
  emptyRival,
  emptyRivalStats,
  marketShare,
  rivalDay,
  rivalDefected,
  rivalHired,
  rivalMorning,
  rivalNotice,
  rivalStole,
  sabotageScale,
} from '../../sim/rival'
import { createRng } from '../../sim/rng'
import type { Purchase } from '../../sim/sellers'
import {
  bayCount,
  defaultService,
  demandScale,
  emptySchedule,
  JOBS_PER_BAY,
  planServiceVisits,
  SERVICE_WEEKDAY,
  serviceDemand,
  withBookVisits,
  type Comeback,
  type ServiceJob,
} from '../../sim/service'
import { planArrivals } from '../../sim/spawner'
import { generateCandidates, isGuarded, payroll, reduceStaff } from '../../sim/staff'
import { stockPurchases } from '../../sim/sellers'
import {
  addDay as addToLifetime,
  dayRecord,
  emptyLifetime,
  emptyRecords,
  tupleToRecord,
  updateRecords,
  type DayRecord,
} from '../../sim/stats'
import type { TipId } from '../../sim/tips'
import { WEATHER_EFFECTS, weatherOn } from '../../sim/weather'
import { commit, notify, setRoster, tuning, type Kit } from '../core'
import { repScale, visitOdds } from '../derived'
import { bailoutNotice, deliveryNotice, theftNotice } from '../notices'
import { DELIVERY_SEED, OWNER_SEED, resetRng, RIVAL_SEED, rng, seedDay } from '../rng'
import type { GameState, ReceptionCall } from '../types'
import { autoRecon, closeShop } from './service'
import { tallyNazma } from './world'

type DayKeys = 'dayStats' | 'missedYesterday' | 'startNextDay' | 'newGame' | 'loadGame'

/**
 * What a new game's day 1 starts with at `difficulty`, as the dealership
 * `name`. The day's rng streams start afresh, so day 1 plays out the same
 * however often it's built.
 */
export function dayOne(difficulty: Difficulty, name: string = DEFAULT_DEALERSHIP_NAME) {
  seedDay(1)
  const tuning = TUNING[difficulty]
  return {
    difficulty,
    dealershipName: cleanName(name),
    cash: tuning.startingCash,
    bailoutUsed: false,
    career: emptyCareer(),
    log: [] as DayRecord[],
    lifetime: emptyLifetime(),
    records: emptyRecords(),
    statsFrom: 1,
    franchise: START_TIER,
    won: false,
    rival: emptyRival(),
    expansions: [] as OwnedExpansion[],
    tipsSeen: [] as TipId[],
    achievements: [] as EarnedAchievement[],
    purchases: [] as Purchase[],
    // Day 1 has no garage.
    serviceJobs: [] as ServiceJob[],
    serviceVisits: emptySchedule(),
    serviceAway: [] as Customer[],
    serviceComebacks: [] as Comeback[],
    service: defaultService(),
    clients: [] as Client[],
    clientPerks: defaultPerks(),
    appreciation: null as Appreciation | null,
    monthCsi: emptyMonthCsi(),
    clientVisits: [] as ClientVisit[],
    callsTried: [] as string[],
    playerCall: null as string | null,
    receptionCall: null as ReceptionCall | null,
    quota: monthlyQuota(0, BASE_SLOTS, START_REPUTATION, tuning.quota),
    arrivals: planArrivals(
      rng.customer,
      {},
      { scale: arrivalScale(1, weatherOn(1), eventOn(1), tuning, START_REPUTATION) },
    ),
    candidates: generateCandidates(rng.staff, 1),
  }
}

/** Opening and closing the doors, settling the day, and starting or loading a game. */
export function daySlice(k: Kit): Pick<GameState, DayKeys> & ReturnType<typeof dayOne> {
  const { get, set } = k
  return {
    ...dayOne(DEFAULT_DIFFICULTY),
    dayStats: emptyStats(),
    missedYesterday: {},
    startNextDay: () =>
      k.batch(() => {
        const s = get()
        if (!isClosed(s.clock) || s.customers.length > 0) return
        // Settles the day, if nothing has yet.
        commit(k, s.customers)
        beginDay(k, s.clock.day + 1)
      }),
    // A new player gets the guide before day 1 starts.
    newGame: (difficulty = DEFAULT_DIFFICULTY, name) => {
      resetRng()
      set({ screen: 'playing', helpOpen: true, ...dayOne(difficulty, name) })
    },
    loadGame: (save) =>
      k.batch(() => {
        // Only offered before the clock has run, so there are no customers,
        // actions or panels to clear.
        set({
          screen: 'playing',
          difficulty: save.difficulty,
          dealershipName: save.dealershipName,
          cash: save.cash,
          inventory: save.inventory,
          roster: save.roster,
          orders: save.orders,
          campaigns: save.campaigns,
          improvements: save.improvements,
          expansions: save.expansions,
          reputation: save.reputation,
          monthSales: save.monthSales,
          quota: save.quota,
          bailoutUsed: save.bailoutUsed,
          career: save.career,
          log: save.log.map(tupleToRecord),
          lifetime: save.lifetime,
          records: save.records,
          statsFrom: save.statsFrom,
          franchise: save.franchise,
          won: save.won,
          rival: save.rival,
          tipsSeen: save.tipsSeen,
          achievements: save.achievements,
          service: save.service,
          clients: save.clients,
          clientPerks: save.clientPerks,
          appreciation: save.appreciation,
          monthCsi: save.monthCsi,
        })
        beginDay(k, save.day + 1)
      }),
  }
}

/**
 * Pays the day's staff once the doors are shut and the last customer has gone,
 * before the summary shows, so it reports cash after payroll. On an owner's
 * day the day is judged against their goal, and any bonus is paid too. The
 * day's customers move reputation. On the month's last day the manufacturer
 * pays the holdback on the month's sales (scaled by the franchise tier), and
 * the month's result moves the tier. The day's gross goes on the
 * career, which may earn a new rank. Nazma's lot across the road takes in
 * the day (see `rivalDay`). Used cars bought today go into stock, in the lot
 * spaces held for them, so the save keeps them.
 *
 * Only `commit`'s last step calls this.
 */
export function settleDay(k: Kit): void {
  const s = k.get()
  if (!isClosed(s.clock) || s.customers.length > 0 || s.dayStats.settled) return
  const { wages, commissions } = payroll(s.roster, s.dayStats.sales)
  const level = tuning(k)
  const interest = dailyInterest(s.inventory, level.interest)
  // A goal the player never heard (the owner didn't make it in) isn't judged.
  const owner = s.owner?.announced
    ? judgeDay(s.owner.goal, s.dayStats, s.clock.day, level.ownerBonus, repScale(level))
    : null
  const reputation = applyChange(s.reputation, reputationChange(s.dayStats, repScale(level)))
  const monthEnd = calendarOf(s.clock.day).dayOfMonth === DAYS_PER_MONTH
  const csi = csiOf(s.monthCsi)
  const career = addDay(s.career, s.dayStats, reputation, monthEnd, level.rankScale, csi)
  const quota = monthEnd
    ? {
        quota: s.quota,
        sold: s.monthSales.count,
        payout: holdback(
          s.monthSales.count,
          s.quota,
          s.monthSales.msrp,
          TIER_PERKS[s.franchise].holdback * csiFactor(csi),
        ),
        csi,
        tier: {
          from: s.franchise,
          to: nextTier(
            s.franchise,
            { quota: s.quota, sold: s.monthSales.count, csi },
            level.franchiseSlack,
          ),
        },
      }
    : null
  const cash = s.cash - wages - commissions - interest + (owner?.bonus ?? 0) + (quota?.payout ?? 0)
  // On Easy the bank covers the first time the day ends in the red.
  const bailout = level.safetyNet && !s.bailoutUsed && cash < 0 ? -cash : 0
  const settled: DayStats = {
    ...s.dayStats,
    wages,
    commissions,
    interest,
    owner,
    reputation: reputation - s.reputation,
    quota,
    bailout,
    rankUp: rankUp(s.career, career)?.id ?? null,
    settled: true,
  }
  const log = [...s.log, dayRecord(settled, s.clock.day, reputation, cash + bailout)]
  const records = updateRecords(s.records, log, settled)
  const inventory =
    s.purchases.length > 0
      ? [...s.inventory, ...stockPurchases(s.purchases, s.clock.day)]
      : s.inventory
  const franchise = quota?.tier.to ?? s.franchise
  // The day's achievements show in the summary, not as notices.
  const earned = dayAchievements(
    {
      day: s.clock.day,
      stats: settled,
      log,
      records: records.records,
      reputation,
      career,
      franchise,
      inventory,
    },
    s.achievements,
  ).map((id) => ({ id, day: s.clock.day, level: s.difficulty }))
  k.set({
    cash: cash + bailout,
    bailoutUsed: s.bailoutUsed || bailout > 0,
    reputation,
    career,
    log,
    lifetime: addToLifetime(s.lifetime, settled),
    records: records.records,
    franchise,
    ...(earned.length > 0 && { achievements: [...s.achievements, ...earned] }),
    rival: rivalDay(s.rival, s.dayStats, createRng(RIVAL_SEED + s.clock.day), level.rivalStrength),
    ...(s.purchases.length > 0 && { inventory, purchases: [] }),
    dayStats: { ...settled, newRecords: records.broken },
  })
}

/**
 * Closing time: the staff head home, and anyone still thinking of quitting
 * goes for good. The mechanics stay on to finish what's in the bays, paid
 * overtime, and cars still waiting for the shop go back on sale with their
 * parts money back.
 */
export function closeUp(k: Kit): void {
  closeShop(k)
  const before = k.get().roster
  setRoster(k, reduceStaff(before, { type: 'close' }))
  const quitters = before.filter((e) => e.quitting && !e.fired)
  if (quitters.length === 0) return
  const quit = quitters.map((e) => e.name)
  const s = k.get()
  const rival = rivalHired(s.rival, quitters, tuning(k).rivalStrength)
  const joined = rival === s.rival ? [] : quitters.map((e) => ({ name: e.name, role: e.role }))
  k.set({ rival })
  tallyNazma(k, {
    quit: [...s.dayStats.nazma.quit, ...quit],
    joined: [...s.dayStats.nazma.joined, ...joined],
    ...(joined.length > 0 && { rival: rival.name }),
  })
  notify(
    k,
    joined.length > 0
      ? `${quit.join(' and ')} quit to work for ${rival.name}.`
      : `${quit.join(' and ')} quit and won't be back.`,
  )
}

/**
 * Opens the doors on `day`: sold cars are gone, Nazma may have stolen one
 * off the lot (the bank calls in its loan if it was floored), the rest have
 * gathered a night's dust (more out on the lot after rain), yesterday's
 * orders are parked in their slots, finished ad campaigns end, there are new
 * arrivals (more while ads run, and more or fewer with reputation, the
 * weekday, the weather and any sale weekend) and applicants, and the staff
 * head in. On the 1st the manufacturer sets the month's quota, from
 * reputation. A sale weekend is announced a week ahead and on its first day.
 * Nazma announces his rival lot once the dealership is a Main Street one,
 * and while it's open it takes its share of the day's visitors, makes his
 * weekly move on Mondays, and the worse he does the more Nazma gets up to:
 * a car he steals goes on his lot. Kept under his bust floor for weeks, he
 * closes: the player's reputation goes up, his buyers come over for a week,
 * and Nazma stays away until he reopens. All stored with one `set`.
 */
export function beginDay(k: Kit, day: number): void {
  k.batch(() => morning(k, day))
}

function morning(k: Kit, day: number): void {
  const { get, set } = k
  const weather = weatherOn(day)
  const date = calendarOf(day)
  const event = eventOn(day)
  const effects = WEATHER_EFFECTS[weather]
  seedDay(day)
  const s = get()
  const delivered = deliver(s.orders, createRng(DELIVERY_SEED + day), day)
  const campaigns = unfinished(s.campaigns, day)
  // The shop hands every car back at closing; this is in case one wasn't.
  const kept = dropSold(s.inventory).map((c) =>
    c.status === 'recon' ? { ...c, status: 'available' as const } : c,
  )
  const level = tuning(k)
  const guarded = isGuarded(s.roster)
  const opening = rivalMorning(s.rival, day, s.career.rank, {
    strength: level.rivalStrength,
    undercut: level.rivalUndercut,
    comeback: level.rivalComeback,
  })
  // Driving him bust is worth reputation, and a mark on the career.
  const bust = opening.event === 'bust'
  // The more desperate his lot, the more Nazma gets up to.
  const sabotage = sabotageScale(opening.rival)
  const theftChance = level.theftChance * sabotage
  const last = s.rival.lastTheftDay
  const theft = planTheft(createRng(theftSeed(day)), day, kept, guarded, theftChance, last)
  const stolen = theft?.outcome === 'stolen' ? theft.car : null
  const tried = theftNightAfter(day, last, theftChance)
  const rival = stolen
    ? { ...rivalStole(opening.rival, stolen.model), lastTheftDay: day }
    : tried
      ? { ...opening.rival, lastTheftDay: day }
      : opening.rival
  const share = marketShare(rival, {
    reputation: s.reputation,
    campaigns: activeCampaigns(campaigns, day).length,
    day,
  })
  const inventory = [
    ...dirtyOvernight(stolen ? kept.filter((c) => c !== stolen) : kept, effects.lotDirt),
    ...delivered,
  ]
  const salesStaff = s.roster.filter((e) => e.role === 'sales' && !e.fired).length
  const nazma = isNazmaDay(day, guarded, visitOdds(level, sabotage))
    ? planVisit(createRng(visitSeed(day)), inventory, s.roster, level.poachChance * sabotage)
    : null
  const newMonth = date.dayOfMonth === 1
  const bays = bayCount(installedExpansions(s.expansions, day))
  const demand = serviceDemand(day, { bays, rate: s.service.rate, factor: level.serviceDemand })
  const recall = recallStarts(day, bays, bayCount(installedExpansions(s.expansions, day - 1)))
    ? recallOn(day, bays)
    : null
  // The book's day, all on its own rng: who leaves it (to Nazma's, while
  // he's open), appointments and due clients, the friends happy clients send
  // in, on appreciation day the guests, and the cars we sold due for service.
  const open = rival.status === 'open'
  const pruned = pruneBook(s.clients, day, open ? { share, rng: rng.client } : undefined)
  const defectors = newlyDefected(s.clients, pruned)
  const coming = planClientVisits(
    pruned,
    day,
    rng.client,
    level.clientReturn,
    s.clientPerks.loyaltyDiscount,
  )
  const friends = planReferrals(pruned, day, rng.client, {
    fee: s.clientPerks.referralFee,
    reputation: s.reputation,
    scale: level.clientReturn,
  })
  const guests = isAppreciationDay(s.appreciation, day)
    ? planGuests(pruned, rng.client, {
        scale: level.clientReturn,
        weather: effects.traffic,
        skip: new Set(coming.map((v) => v.clientId)),
      })
    : []
  const clientVisits = [...coming, ...friends, ...guests].sort((a, b) => a.minute - b.minute)
  const clients = countFriends(pruned, clientVisits)
  const cap = bays * JOBS_PER_BAY
  const bookService = planBookService(clients, day, rng.client, {
    scale: demandScale(day, s.service.rate, level.serviceDemand),
    clientReturn: level.clientReturn,
    max: bays > 0 ? cap - demand : 0,
    skip: new Set(clientVisits.map((v) => v.clientId)),
  })
  // Recall visits come on top, within what the bays can take.
  const recalls = Math.min(recallDemand(day, s.career, bays), cap - demand - bookService.length)
  const returning = clients.filter((c) => isDue(c, day) || c.appointment?.day === day).length
  const owner = isOwnerDay(day)
    ? {
        goal: generateGoal(
          createRng(OWNER_SEED + day),
          inventory,
          salesStaff,
          !!event,
          SERVICE_WEEKDAY[date.weekday] > 0 ? bays : 0,
          returning,
        ),
        announced: false,
      }
    : null
  // GameClock picks up the new day and resyncs the running time.
  set({
    clock: startOfDay(day),
    weather,
    monthSales: newMonth ? emptyMonthSales() : s.monthSales,
    monthCsi: newMonth ? emptyMonthCsi() : s.monthCsi,
    quota: newMonth ? monthlyQuota(date.month, BASE_SLOTS, s.reputation, level.quota) : s.quota,
    inventory,
    orders: [],
    campaigns,
    arrivals: planArrivals(
      rng.customer,
      trafficBoost(campaigns, day, campaignScale(s.reputation) * blitzScale(rival)),
      {
        scale:
          arrivalScale(day, weather, event, level, s.reputation) *
          (1 - share) *
          bustBoost(rival, day),
      },
    ),
    cash: s.cash - (stolen?.floored ? stolen.cost : 0),
    purchases: [],
    serviceJobs: [],
    serviceAway: [],
    serviceComebacks: [],
    serviceVisits: withBookVisits(planServiceVisits(rng.service, demand, recalls), bookService),
    clients,
    clientVisits,
    callsTried: [],
    playerCall: null,
    receptionCall: null,
    rival: rivalDefected(rival, defectors.length, level.rivalStrength),
    ...(bust && {
      reputation: applyChange(s.reputation, BUST_REPUTATION),
      career: { ...s.career, rivalsBeaten: s.career.rivalsBeaten + 1 },
    }),
    dayStats: {
      ...emptyStats(),
      nazma: {
        ...emptyNazmaStats(),
        stolen: stolen ? [stolenRecord(stolen)] : [],
        foiled: theft?.outcome === 'foiled',
        rival: rival.status === 'open' ? rival.name : null,
      },
      rival: rival.status === 'open' ? emptyRivalStats(share) : null,
      clients: { ...emptyClientStats(), defected: defectors.length },
    },
    missedYesterday: s.dayStats.missed,
    candidates: generateCandidates(rng.staff, day, installedExpansions(s.expansions, day)),
    owner,
    nazma,
  })
  setRoster(k, reduceStaff(get().roster, { type: 'open' }))
  const shop = autoRecon(k, day)
  const notices = [
    s.dayStats.rankUp && rankUpNotice(rankById(s.dayStats.rankUp)),
    s.dayStats.quota && tierNotice(s.dayStats.quota.tier.from, s.dayStats.quota.tier.to),
    s.dayStats.quota && heldByCsi(s.dayStats.quota) && heldNotice(s.dayStats.quota),
    s.dayStats.bailout > 0 && bailoutNotice(s.dayStats.bailout),
    opening.event && rivalNotice(rival, opening.event),
    eventNotice(day),
    recall &&
      recallNotice(
        recall,
        s.career.soldByModel[recall.model] ?? 0,
        recallOwners(clients, recall.model),
      ),
    defectors.length > 0 && defectNotice(defectors, rival.name),
    theft && theftNotice(theft, rival.status === 'open' ? rival.name : null),
    delivered.length > 0 && deliveryNotice(delivered),
    appointmentsNotice(clients, day),
    appreciationNotice(s.appreciation, day),
    shop > 0 && `${shop === 1 ? 'A used car' : `${shop} used cars`} went to the shop.`,
  ].filter((t): t is string => !!t)
  if (notices.length > 0) notify(k, notices.join(' '))
}
