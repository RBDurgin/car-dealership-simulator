/**
 * The dealership's name, picked at New game and put up on the sign. A game
 * keeps it for good: it's in the save, never changed after day 1.
 */
export const DEFAULT_DEALERSHIP_NAME = "Charles' Discount Automotive"

/** Short enough to fit the sign without squashing it much. */
export const MAX_NAME_LENGTH = 28

/**
 * `raw` as a name: control characters gone, runs of spaces made one, trimmed
 * and cut to `MAX_NAME_LENGTH`. Anything that leaves nothing (or isn't a
 * string) is the default name.
 */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_DEALERSHIP_NAME
  const name = raw
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return name.slice(0, MAX_NAME_LENGTH).trim() || DEFAULT_DEALERSHIP_NAME
}
