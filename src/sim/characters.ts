/** Character models available to people in the world. The salesperson is the player. */
export const CUSTOMER_VARIANTS = [
  'male-a',
  'male-b',
  'female-b',
  'female-c',
  'female-d',
  'female-f',
] as const

/** Models only staff wear, so employees never look like customers. */
export const STAFF_VARIANTS = ['male-c', 'male-e', 'male-f', 'female-a', 'female-e'] as const

export type CustomerVariant = (typeof CUSTOMER_VARIANTS)[number]
export type StaffVariant = (typeof STAFF_VARIANTS)[number]
export type CharacterVariant = 'salesperson' | CustomerVariant | StaffVariant

/** Animation clips a character can play. Names match the Kenney Mini Characters clips. */
export type CharacterAnim = 'idle' | 'walk' | 'sprint' | 'sit' | 'emote-yes' | 'emote-no'

/** How far a seated character is raised so they sit on the chair rather than in it. */
export const SEAT_HEIGHT = 0.28
