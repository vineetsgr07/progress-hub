import assert from 'node:assert/strict'
import {
  NODE_SIZE,
  childOffsetForSide,
  defaultSizeForKind,
  oppositeSide,
  parseEdgeMarker,
  parseMindmapColor,
  parseMindmapEdgeData,
  parseMindmapKind,
  parseMindmapNodeData,
  parseMindmapShape,
  parseNodeSize,
  sourceHandleId,
  targetHandleId,
} from './mindmap-model.ts'

assert.equal(parseMindmapShape('diamond'), 'diamond')
assert.equal(parseMindmapShape('nope'), 'rounded')
assert.equal(parseMindmapKind('sticky'), 'sticky')
assert.equal(parseMindmapKind('nope'), 'idea')
assert.equal(parseMindmapColor('amber'), 'amber')
assert.equal(parseMindmapColor('neon'), 'default')
assert.equal(parseMindmapNodeData({ label: 'A' }).shape, 'rounded')
assert.equal(parseMindmapNodeData({ label: 'A' }).kind, 'idea')
assert.equal(parseMindmapNodeData({ label: 'A' }).color, 'default')
assert.equal(parseMindmapNodeData({ label: 'A' }).body, '')
assert.equal(
  parseMindmapNodeData({
    label: 'A',
    shape: 'ellipse',
    body: '<p>x</p>',
    color: 'blue',
  }).body,
  '<p>x</p>',
)
assert.equal(parseMindmapNodeData({ kind: 'sticky', color: 'amber' }).kind, 'sticky')
assert.equal(parseMindmapNodeData({ kind: 'frame' }).shape, 'rounded')
assert.deepEqual(defaultSizeForKind('sticky'), { width: 168, height: 168 })
assert.equal(parseEdgeMarker('none'), 'none')
assert.equal(parseMindmapEdgeData({ marker: 'arrow', dashed: true }).dashed, true)
assert.equal(oppositeSide('left'), 'right')
assert.equal(sourceHandleId('top'), 's-top')
assert.equal(targetHandleId('bottom'), 't-bottom')
assert.deepEqual(childOffsetForSide('right'), { x: NODE_SIZE.width + 88, y: 0 })
assert.deepEqual(childOffsetForSide('top', { width: 200, height: 100 }), {
  x: 0,
  y: -(100 + 88),
})
assert.deepEqual(parseNodeSize({ width: 240, height: 120 }), {
  width: 240,
  height: 120,
})
assert.deepEqual(parseNodeSize({ width: '180px' }, { height: 90 }), {
  width: 180,
  height: 90,
})

console.log('mindmap-model tests passed')
