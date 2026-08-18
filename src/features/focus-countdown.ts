/** Pure countdown helpers for Focus Mode. */

export function endAtFromNow(
  durationMin: number,
  nowMs: number = Date.now(),
): number {
  const minutes = Math.max(0, durationMin)
  return nowMs + minutes * 60_000
}

export function remainingMs(endAt: number, nowMs: number = Date.now()): number {
  return Math.max(0, endAt - nowMs)
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function isCountdownDone(endAt: number, nowMs: number = Date.now()): boolean {
  return remainingMs(endAt, nowMs) <= 0
}

/** Fraction of the allocated block still remaining (1 = full, 0 = ended). */
export function countdownRemainingFraction(
  remaining: number,
  durationMin: number,
): number {
  const total = Math.max(0, durationMin) * 60_000
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, remaining / total))
}

/** Push the session end forward by `addMin` minutes (floor at now). */
export function extendEndAt(
  endAt: number,
  addMin: number,
  nowMs: number = Date.now(),
): number {
  const addMs = Math.max(0, addMin) * 60_000
  const base = Math.max(endAt, nowMs)
  return base + addMs
}
