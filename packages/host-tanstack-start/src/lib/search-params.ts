// Search handling for the list routes ported from Next.
//
// The Next pages received every search value as a string, and their schemas
// still expect that. The conversion must not happen in `validateSearch`: the
// router serialises the validated search back into the URL, and a string that
// looks like a boolean or number (`"true"`, `"2"`) is written with JSON quotes
// (`desc=%22true%22`). Components that read the raw query string then see
// `"true"` rather than `true`, which broke the sortable headings.
//
// So `validateSearch` keeps the parsed values as they are (`keepSearch`), and
// the loader receives strings through `loaderDeps` (`searchAsStrings`).

export type ParsedSearch = Record<string, unknown>

/** A `validateSearch` that keeps parsed values unchanged, optionally limited to `keys`. */
export const keepSearch =
  (keys?: readonly string[]) =>
  (search: ParsedSearch): ParsedSearch =>
    keys == null
      ? { ...search }
      : Object.fromEntries(Object.entries(search).filter(([key]) => keys.includes(key)))

/** Converts each search value to a string, for a loader whose schema expects strings. */
export const searchAsStrings = (search: ParsedSearch): Record<string, string> =>
  Object.fromEntries(Object.entries(search).map(([key, value]) => [key, String(value)]))
