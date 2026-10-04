/** Character models available to people in the world. The salesperson is the player. */
export const CUSTOMER_VARIANTS = [
  'male-a',
  'male-b',
  'female-b',
  'female-c',
  'female-d',
  'female-f',
] as const

export type CharacterVariant = 'salesperson' | (typeof CUSTOMER_VARIANTS)[number]

/** Animation clips a character can play. Names match the Kenney Mini Characters clips. */
export type CharacterAnim = 'idle' | 'walk' | 'sprint' | 'sit'
