import { MouseSensor, PointerSensor, TouchSensor } from '@dnd-kit/core'
import type {
  MouseSensorOptions,
  PointerSensorOptions,
  TouchSensorOptions,
} from '@dnd-kit/core'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from 'react'

/**
 * True when the event target should keep the pointer (inputs, menus, explicit opt-outs).
 * Buttons are allowed so title/row clicks still convert to a drag after the distance threshold.
 */
export function isNoDndTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false
  return Boolean(
    (target as Element).closest(
      'input, textarea, select, option, [contenteditable="true"], [data-no-dnd]',
    ),
  )
}

/**
 * Whole-row / whole-card drag: ignore form fields and `data-no-dnd`,
 * activate after a short move so clicks still work (Todoist / Linear pattern).
 */
export class TaskPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        { nativeEvent }: ReactPointerEvent,
        { onActivation }: PointerSensorOptions,
      ) => {
        if (!nativeEvent.isPrimary || nativeEvent.button !== 0) return false
        if (isNoDndTarget(nativeEvent.target)) return false
        onActivation?.({ event: nativeEvent })
        return true
      },
    },
  ]
}

/** Mouse-only so touch can use a delay without PointerSensor blocking scroll. */
export class TaskMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: (
        { nativeEvent }: ReactMouseEvent,
        { onActivation }: MouseSensorOptions,
      ) => {
        if (nativeEvent.button !== 0) return false
        if (isNoDndTarget(nativeEvent.target)) return false
        onActivation?.({ event: nativeEvent })
        return true
      },
    },
  ]
}

/** Long-press on touch so a finger on a row can still scroll the list. */
export class TaskTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: (
        { nativeEvent }: ReactTouchEvent,
        { onActivation }: TouchSensorOptions,
      ) => {
        if (nativeEvent.touches.length > 1) return false
        if (isNoDndTarget(nativeEvent.target)) return false
        onActivation?.({ event: nativeEvent })
        return true
      },
    },
  ]
}

/** Short move before drag so a click still opens / toggles. */
export const TASK_DRAG_DISTANCE = 8

/** Hold before a touch drag starts — shorter than a long-press menu. */
export const TASK_TOUCH_DELAY_MS = 250

/** Cancel the pending touch drag if the finger moves this far (scroll instead). */
export const TASK_TOUCH_TOLERANCE = 5

export const TASK_MOUSE_SENSOR_OPTIONS = {
  activationConstraint: { distance: TASK_DRAG_DISTANCE },
} as const

export const TASK_TOUCH_SENSOR_OPTIONS = {
  activationConstraint: {
    delay: TASK_TOUCH_DELAY_MS,
    tolerance: TASK_TOUCH_TOLERANCE,
  },
} as const
