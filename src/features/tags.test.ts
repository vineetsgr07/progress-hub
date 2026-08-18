import assert from 'node:assert/strict'
import { TAG_SWATCHES, resolveTagSwatch, DEFAULT_TAG_COLORS } from './tags.ts'

const varRe = /^var\(--tag-[a-z]+-(bg|ink|line)\)$/

for (const swatch of TAG_SWATCHES) {
  assert.match(swatch.bg, varRe, `${swatch.key}.bg should be a tag CSS var`)
  assert.match(swatch.fg, varRe, `${swatch.key}.fg should be a tag CSS var`)
  assert.match(swatch.border, varRe, `${swatch.key}.border should be a tag CSS var`)
  assert.equal(swatch.bg, `var(--tag-${swatch.key}-bg)`)
  assert.equal(swatch.fg, `var(--tag-${swatch.key}-ink)`)
  assert.equal(swatch.border, `var(--tag-${swatch.key}-line)`)
}

const blue = resolveTagSwatch('project', 'Development', DEFAULT_TAG_COLORS)
assert.equal(blue.key, 'blue')
assert.equal(blue.bg, 'var(--tag-blue-bg)')

console.log('tags tests passed')
