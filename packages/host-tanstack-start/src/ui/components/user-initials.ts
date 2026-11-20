/**
 * Initials shown in the user menu triggers. Characters are taken by code point
 * (`Array.from`), so a name that starts with an astral character keeps it whole.
 */

const leading = (value: string | null | undefined, count: number): string =>
  Array.from(value?.trim() ?? '')
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
