export function createQueryString<T extends Record<string, any>>(
  params: T | undefined
): string | null {
  if (params != null) {
    const searchParams = new URLSearchParams()
    for (const key in params) {
      // recommended safety against potential property shadowing.
      if (Object.hasOwn(params, key)) {
        const value = params[key]
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            searchParams.append(key, value[i])
          }
        } else if (value !== undefined) {
          searchParams.append(key, value)
        }
      }
    }
    return searchParams.toString()
  }
  return null
}
