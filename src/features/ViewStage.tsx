import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  /** Remount key — active hub nav tab only (not date; day changes soft-refresh in place). */
  stageKey: string
  children: ReactNode
}

/** Short enter animation when the primary hub view changes. */
export function ViewStage({ stageKey, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const clearEnter = () => {
      el.classList.remove('view-stage-enter')
    }

    // Drop the enter class so no animation-fill transform can become a
    // containing block for DragOverlay (position: fixed).
    el.addEventListener('animationend', clearEnter)
    return () => el.removeEventListener('animationend', clearEnter)
  }, [stageKey])

  return (
    <div ref={ref} key={stageKey} className="view-stage view-stage-enter">
      {children}
    </div>
  )
}
