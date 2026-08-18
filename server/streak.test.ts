import assert from 'node:assert/strict'
import { isoDateKey, streakFromDayTotals, streakWindowStart } from './streak.ts'

assert.equal(isoDateKey('2026-08-17'), '2026-08-17')
assert.equal(isoDateKey('2026-08-17T00:00:00.000Z'), '2026-08-17')
assert.equal(isoDateKey(new Date('2026-08-17T00:00:00.000Z')), '2026-08-17')

assert.equal(streakWindowStart('2026-08-17', 90), '2026-05-20')

assert.equal(streakFromDayTotals('2026-08-17', []), 0)
assert.equal(streakFromDayTotals('2026-08-17', [{ date: '2026-08-17', c: 0 }]), 0)

assert.equal(
  streakFromDayTotals('2026-08-17', [
    { date: '2026-08-17', c: 2 },
    { date: '2026-08-16', c: 1 },
    { date: '2026-08-15', c: 3 },
  ]),
  3,
)

assert.equal(
  streakFromDayTotals('2026-08-17', [
    { date: '2026-08-17', c: 1 },
    { date: '2026-08-16', c: 0 },
    { date: '2026-08-15', c: 1 },
  ]),
  1,
)

assert.equal(
  streakFromDayTotals('2026-08-17', [
    { date: '2026-08-17', c: 1 },
    { date: '2026-08-15', c: 1 },
  ]),
  1,
)

assert.equal(
  streakFromDayTotals('2026-08-17', [
    { date: new Date('2026-08-17T00:00:00.000Z'), c: '1' },
    { date: '2026-08-16T00:00:00.000Z', c: 4 },
  ]),
  2,
)

const ninety = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(2026, 7, 17)
  d.setDate(d.getDate() - i)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return { date: `${y}-${m}-${day}`, c: 1 }
})
assert.equal(streakFromDayTotals('2026-08-17', ninety), 90)
assert.equal(streakFromDayTotals('2026-08-17', [...ninety, { date: '2026-05-19', c: 1 }]), 90)

console.log('streak tests passed')
