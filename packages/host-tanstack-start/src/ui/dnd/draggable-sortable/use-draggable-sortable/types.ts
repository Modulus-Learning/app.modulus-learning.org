import type { HTMLAttributes } from 'react'

import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'

export type UseDraggableSortableReturn = {
  attributes: HTMLAttributes<unknown>
  isDragging?: boolean
  listeners: SyntheticListenerMap
  setNodeRef: (node: HTMLElement | null) => void
  transform: string
  transition: string
}
