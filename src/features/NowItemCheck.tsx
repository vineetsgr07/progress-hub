import type { PointerEvent, ReactNode, TouchEvent } from 'react'

type Props = {
  children: ReactNode
}

function stopRowDrag(event: PointerEvent | TouchEvent) {
  event.stopPropagation()
}

/** Isolates the Now checkbox from row-drag so a thumb tap can mark the item done. */
export function NowItemCheck({ children }: Props) {
  return (
    <label
      className="now-item-check"
      data-no-dnd
      onPointerDown={stopRowDrag}
      onTouchStart={stopRowDrag}
    >
      {children}
    </label>
  )
}
