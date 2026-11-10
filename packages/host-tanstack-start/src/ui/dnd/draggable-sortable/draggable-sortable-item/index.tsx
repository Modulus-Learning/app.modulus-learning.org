import type React from 'react'
import { Fragment } from 'react'

import type { UseDraggableArguments } from '@dnd-kit/core'

import { useDraggableSortable } from '../use-draggable-sortable'
import type { ChildFunction } from './types.js'

export const DraggableSortableItem: React.FC<
  {
    children: ChildFunction
  } & UseDraggableArguments
> = (props) => {
  const { id, children, disabled } = props

  const { attributes, isDragging, listeners, setNodeRef, transform, transition } =
    useDraggableSortable({
      id,
      disabled,
    })

  return (
    <Fragment>
      {children({
        attributes: {
          ...attributes,
          style: {
            cursor: isDragging ? 'grabbing' : 'grab',
          },
        },
        isDragging,
        listeners,
        setNodeRef,
        transform,
        transition,
      })}
    </Fragment>
  )
}
