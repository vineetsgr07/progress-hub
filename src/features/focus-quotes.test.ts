import assert from 'node:assert/strict'
import {
  FOCUS_QUOTES,
  FOCUS_SMILE_KICKERS,
  pickFocusQuote,
  pickFocusSmileKicker,
} from './focus-quotes.ts'

const t = 1_700_000_000_000
const quote = pickFocusQuote('task-1', t)
assert.ok(FOCUS_QUOTES.includes(quote as (typeof FOCUS_QUOTES)[number]))
assert.equal(pickFocusQuote('abc', t), pickFocusQuote('abc', t))
assert.notEqual(pickFocusQuote('alpha', t), pickFocusQuote('omega-different', t))

const kicker = pickFocusSmileKicker('task-1', t)
assert.ok(FOCUS_SMILE_KICKERS.includes(kicker as (typeof FOCUS_SMILE_KICKERS)[number]))
assert.equal(pickFocusSmileKicker('abc', t), pickFocusSmileKicker('abc', t))

for (const line of FOCUS_QUOTES) {
  assert.ok(line.length > 12, `quote too short: ${line}`)
  assert.ok(
    /smile|happy|joy|enjoy|gentle|bright|kind|good|warm|calm|light|soft|kindly|true/i.test(
      line,
    ),
    `quote should feel warm: ${line}`,
  )
}

console.log('focus-quotes tests passed')
