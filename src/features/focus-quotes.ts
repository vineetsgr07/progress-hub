/** Short, smile-forward lines for Focus Mode — warm, not preachy. */
export const FOCUS_QUOTES = [
  'You’re allowed to enjoy this. Soft smile, then one more step.',
  'Good news: progress can feel light. Let your face catch up.',
  'A tiny smile resets the room. Then back to the next check.',
  'Happy focus is still focus. Unclench your jaw — you’ve got this.',
  'Be kind to the person doing the work. That’s you. Smile once.',
  'This block is yours. Make it gentle, and a little bright.',
  'Smile like you already finished — then finish one more thing.',
  'Joy doesn’t cancel deep work. It makes the hour feel shorter.',
  'Notice something good, even small. Then return to the list.',
  'You’re doing real work. A smile is part of the fuel.',
  'Steady breath. Soft eyes. One clear move.',
  'The work gets lighter when you do.',
  'Show up kindly. Finish something true.',
  'Brightness is allowed here — keep going.',
  'A calm smile is a power move. Then the next check.',
] as const

/** Tiny openers above the face — recognition, not instruction. */
export const FOCUS_SMILE_KICKERS = [
  'A little lift',
  'Brighten this hour',
  'Stay warm while you work',
  'Joy belongs in focus',
  'Soft face, clear mind',
] as const

function hashSeed(seed: string, day: number): number {
  let hash = day
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash
}

/** Stable pick for a focus session so the quote doesn’t flicker on re-render. */
export function pickFocusQuote(seed: string, now = Date.now()): string {
  const day = Math.floor(now / 86_400_000)
  const hash = hashSeed(seed, day)
  return FOCUS_QUOTES[hash % FOCUS_QUOTES.length]
}

export function pickFocusSmileKicker(seed: string, now = Date.now()): string {
  const day = Math.floor(now / 86_400_000)
  const hash = hashSeed(`${seed}:kicker`, day)
  return FOCUS_SMILE_KICKERS[hash % FOCUS_SMILE_KICKERS.length]
}
