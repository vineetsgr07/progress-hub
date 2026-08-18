import { useEffect, useState } from 'react'
import { MOTION_PENDING_MS } from './motion'

/** True only after `active` stays true for `delayMs` — avoids loading flashes. */
export function useDelayedFlag(active: boolean, delayMs = MOTION_PENDING_MS) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const id = window.setTimeout(() => setShown(true), delayMs)
    return () => window.clearTimeout(id)
  }, [active, delayMs])

  return shown
}
