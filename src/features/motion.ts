/** Shared motion timing — keep in sync with CSS `--motion-*` tokens. */
export const MOTION_FAST_MS = 120
export const MOTION_BASE_MS = 220
export const MOTION_PENDING_MS = 150

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
