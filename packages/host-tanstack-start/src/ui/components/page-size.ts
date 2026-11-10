// Rows-per-page options for the list views.
//
// The selectors are uncontrolled, so a view keys them on the effective page
// size and passes it as the default: the selector then shows what the server
// actually used, after a reload or back/forward navigation as well.

export const PAGE_SIZES = ['15', '30', '50', '100'] as const

/** The preset page sizes, plus the effective one when it is not a preset. */
export function pageSizeItems(pageSize: number | string): { value: string; label: string }[] {
  const current = String(pageSize)
  const sizes: string[] = (PAGE_SIZES as readonly string[]).includes(current)
    ? [...PAGE_SIZES]
    : [...PAGE_SIZES, current].sort((a, b) => Number(a) - Number(b))
  return sizes.map((value) => ({ value, label: value }))
}
