/** Character models available to people in the world. The salesperson is the player. */
export const CUSTOMER_VARIANTS = [
  'male-a',
  'male-b',
  'female-b',
  'female-c',
  'female-d',
  'female-f',
] as const

/**
 * Models staff wear. The men's are staff-only; the women's are shared with
 * customers (the role badge tells staff apart), as Kenney's other female
 * model, female-a, holds crutches.
 */
export const STAFF_VARIANTS = [
  'male-c',
  'male-e',
  'male-f',
  'female-b',
  'female-c',
  'female-d',
  'female-e',
  'female-f',
] as const

/** Kenney's police officer: every security guard, and nobody else on staff. */
export const GUARD_VARIANT: StaffVariant = 'male-c'

/** The dealership's owner, in a dark suit (see scene/Owner). */
export const OWNER_VARIANT: StaffVariant = 'male-f'

export type CustomerVariant = (typeof CUSTOMER_VARIANTS)[number]
export type StaffVariant = (typeof STAFF_VARIANTS)[number]
export type CharacterVariant = 'salesperson' | CustomerVariant | StaffVariant

/** Animation clips a character can play. Names match the Kenney Mini Characters clips. */
export type CharacterAnim =
  'idle' | 'walk' | 'sprint' | 'sit' | 'emote-yes' | 'emote-no' | 'interact-right'

/** How far a seated character is raised so they sit on the chair rather than in it. */
export const SEAT_HEIGHT = 0.28
