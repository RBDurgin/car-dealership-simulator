/**
 * Difficulty levels. Picked when a new game starts and kept with the save; it
 * never changes mid-game. Medium is the game as tuned before levels existed,
 * so every Medium lever is neutral (a factor of 1, a shift of 0, help off).
 */
export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']

export const DEFAULT_DIFFICULTY: Difficulty = 'medium'

/** Every lever a level sets. Factors multiply today's number, shifts add to it. */
export interface Tuning {
  /** Cash on day 1. */
  startingCash: number
  /** × each car's invoice when ordering. */
  invoice: number
  /** × the floor plan's daily interest rate. */
  interest: number
  /** × the day's planned visitors. */
  traffic: number
  /** × a new customer's patience. */
  patience: number
  /** Added to the discount a new customer hopes for. */
  expect: number
  /** Added to the odds a customer takes a deal. */
  acceptBonus: number
  /** × the odds Nazma visits on a given day. */
  nazmaChance: number
  /** The day Nazma first turns up. */
  firstNazmaDay: number
  /** × the odds of a theft night. */
  theftChance: number
  /** × the odds a visit is a poaching one. */
  poachChance: number
  /** × the manufacturer's monthly quota. */
  quota: number
  /** × the owner's bonus for a goal met. */
  ownerBonus: number
  /** × reputation gained in a day. */
  repGain: number
  /** × reputation lost in a day. */
  repLoss: number
  /** × what a seller hopes to get for their car. */
  sellerHope: number
  /** × how far off the player's estimate of a used car's value may be. */
  appraisalNoise: number
  /** × the allowance a buyer hopes for on their trade-in. */
  tradeHope: number
  /** × the lifetime gross each dealer rank needs. */
  rankScale: number
  /** × Nazma's rival lot's opening strength and how fast it grows. */
  rivalStrength: number
  /** How far under the holdback floor (as a share of the quota) a month may fall and keep the franchise tier. */
  franchiseSlack: number
  /** Show how warm a customer is to the ask (or a seller to the offer) while haggling. */
  dealHint: boolean
  /** The bank covers a negative end-of-day balance, once. */
  safetyNet: boolean
  /** Guided tips the first time things happen. */
  tips: boolean
}

export const TUNING: Record<Difficulty, Tuning> = {
  easy: {
    startingCash: 40_000,
    invoice: 0.98,
    interest: 0.6,
    traffic: 1.2,
    patience: 1.25,
    expect: -0.01,
    acceptBonus: 0.05,
    nazmaChance: 0.5,
    firstNazmaDay: 7,
    theftChance: 0.5,
    poachChance: 0.5,
    quota: 0.8,
    ownerBonus: 1.33,
    repGain: 1,
    repLoss: 0.6,
    sellerHope: 0.95,
    appraisalNoise: 0.7,
    tradeHope: 0.95,
    rankScale: 0.75,
    rivalStrength: 0.75,
    franchiseSlack: 0.1,
    dealHint: true,
    safetyNet: true,
    tips: true,
  },
  medium: {
    startingCash: 25_000,
    invoice: 1,
    interest: 1,
    traffic: 1,
    patience: 1,
    expect: 0,
    acceptBonus: 0,
    nazmaChance: 1,
    firstNazmaDay: 4,
    theftChance: 1,
    poachChance: 1,
    quota: 1,
    ownerBonus: 1,
    repGain: 1,
    repLoss: 1,
    sellerHope: 1,
    appraisalNoise: 1,
    tradeHope: 1,
    rankScale: 1,
    rivalStrength: 1,
    franchiseSlack: 0,
    dealHint: false,
    safetyNet: false,
    tips: false,
  },
  hard: {
    startingCash: 15_000,
    invoice: 1.02,
    interest: 1.5,
    traffic: 0.85,
    patience: 0.8,
    expect: 0.015,
    acceptBonus: -0.04,
    nazmaChance: 1.4,
    firstNazmaDay: 3,
    theftChance: 1.5,
    poachChance: 1.3,
    quota: 1.15,
    ownerBonus: 0.67,
    repGain: 0.85,
    repLoss: 1.3,
    sellerHope: 1.05,
    appraisalNoise: 1.2,
    tradeHope: 1.05,
    rankScale: 1.15,
    rivalStrength: 1.25,
    franchiseSlack: 0,
    dealHint: false,
    safetyNet: false,
    tips: false,
  },
}

const LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

const BLURBS: Record<Difficulty, string> = {
  easy: 'More cash, friendlier customers, help along the way',
  medium: 'The dealership as it comes',
  hard: 'Tight cash, tough customers, Nazma on your case',
}

/** "Easy". */
export function difficultyLabel(d: Difficulty): string {
  return LABELS[d]
}

/** One line for the level picker. */
export function difficultyBlurb(d: Difficulty): string {
  return BLURBS[d]
}

export function isDifficulty(v: unknown): v is Difficulty {
  return (DIFFICULTIES as readonly unknown[]).includes(v)
}
