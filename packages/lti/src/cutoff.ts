/**
 * The assignment cutoff a launch carries. The standard LTI substitution
 * variable comes first — Modulus's deep-link content items map
 * `$ResourceLink.available.endDateTime` to the custom field of the same name —
 * and an adapter's own fallback is consulted only when it is not usable.
 */
export const STANDARD_CUTOFF_FIELD = 'ResourceLink.available.endDateTime'

/** The first value that is a `Date.parse`-able string, as a `Date`. */
export const firstDate = (values: unknown[]): Date | undefined => {
  for (const value of values) {
    if (typeof value === 'string') {
      const timestamp = Date.parse(value)
      if (!Number.isNaN(timestamp)) {
        return new Date(timestamp)
      }
    }
  }
}

export const effectiveCutoff = (
  custom: Record<string, unknown>,
  adapterFallback: unknown
): Date | undefined => firstDate([custom[STANDARD_CUTOFF_FIELD], adapterFallback])
