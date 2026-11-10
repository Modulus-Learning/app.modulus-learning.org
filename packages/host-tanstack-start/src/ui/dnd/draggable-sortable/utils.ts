export function moveItem(items: any[], moveFromIndex: number, moveToIndex: number) {
  if (
    moveFromIndex < 0 ||
    moveFromIndex >= items.length ||
    moveToIndex < 0 ||
    moveToIndex >= items.length
  ) {
    throw new Error('Index out of bounds')
  }

  const updatedItems = [...items] // Create a copy of the original array
  const [itemToMove] = updatedItems.splice(moveFromIndex, 1)
  updatedItems.splice(moveToIndex, 0, itemToMove)

  return updatedItems
}
