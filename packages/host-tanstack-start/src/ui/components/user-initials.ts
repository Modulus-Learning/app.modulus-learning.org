/**
 * Initials shown in the user menu triggers. Names are split into graphemes
 * (what a reader sees as one character), so a decomposed accent stays with its
 * letter and an astral character stays whole. Spaces and punctuation are
 * skipped: only letters and digits count.
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const visible = /^[\p{L}\p{N}]/u

const leading = (value: string | null | undefined, count: number): string =>
  Array.from(segmenter.segment(value ?? ''), ({ segment }) => segment)
    .filter((grapheme) => visible.test(grapheme))
    .slice(0, count)
    .join('')
    .toLocaleUpperCase()

/** Admin users: the first letter of the given name and of the family name. */
export function initialsFromNames(
  givenName: string | null | undefined,
  familyName: string | null | undefined
): string {
  return `${leading(givenName, 1)}${leading(familyName, 1)}`
}

/** Learners, who have only a full name: its first two letters. */
export function initialsFromFullName(fullName: string | null | undefined): string {
  return leading(fullName, 2)
}
