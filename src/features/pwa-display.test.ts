import assert from 'node:assert/strict'
import { isStandalonePwa, type StandaloneProbe } from './pwa-display.ts'

function probe(partial: StandaloneProbe): StandaloneProbe {
  return partial
}

assert.equal(
  isStandalonePwa(probe({ navigator: { standalone: true } })),
  true,
  'iOS navigator.standalone',
)
assert.equal(
  isStandalonePwa(
    probe({
      navigator: {},
      matchMedia: () => ({ matches: true }),
    }),
  ),
  true,
  'display-mode standalone',
)
assert.equal(
  isStandalonePwa(
    probe({
      navigator: { standalone: false },
      matchMedia: () => ({ matches: false }),
    }),
  ),
  false,
  'safari tab',
)
assert.equal(
  isStandalonePwa(probe({ navigator: {} })),
  false,
  'no matchMedia',
)
assert.equal(
  isStandalonePwa(
    probe({
      navigator: {},
      matchMedia: () => {
        throw new Error('matchMedia failed')
      },
    }),
  ),
  false,
  'matchMedia throws',
)

console.log('pwa-display tests passed')
