function findMatch(data, find, defaultValue) {
  const founded = data.indexOf(find)

  return founded >= 0 ? find : defaultValue
}

export default findMatch
