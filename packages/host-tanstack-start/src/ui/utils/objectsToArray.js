export default function objectsToArray(object) {
  let result = []

  for (const value of Object.values(object)) {
    if (typeof value === 'string') {
      result = [...result, value]
    } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      result = [...result, ...objectsToArray(value)]
    }
  }

  return result
}
