import assert from 'node:assert/strict'
import {
  EMPTY_MINDMAP_DOCUMENT,
  MINDMAP_DOCUMENT_MAX_BYTES,
  parseMindmapDocument,
} from './mindmap-document.js'

{
  const ok = parseMindmapDocument(EMPTY_MINDMAP_DOCUMENT)
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.deepEqual(ok.document.nodes, [])
    assert.deepEqual(ok.document.edges, [])
  }
}

{
  const ok = parseMindmapDocument({
    nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [{ id: 'e1', source: 'a', target: 'a' }],
    viewport: { x: 0, y: 0, zoom: 1 },
  })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.document.nodes.length, 1)
    assert.ok(ok.document.viewport)
  }
}

{
  const ok = parseMindmapDocument(
    JSON.stringify({ nodes: [], edges: [], viewport: { x: 1, y: 2, zoom: 0.5 } }),
  )
  assert.equal(ok.ok, true)
}

{
  const bad = parseMindmapDocument(null)
  assert.equal(bad.ok, false)
}

{
  const bad = parseMindmapDocument({ edges: [] })
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.error, /nodes/)
}

{
  const bad = parseMindmapDocument({ nodes: [] })
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.error, /edges/)
}

{
  const bad = parseMindmapDocument('{')
  assert.equal(bad.ok, false)
}

{
  const huge = 'x'.repeat(MINDMAP_DOCUMENT_MAX_BYTES + 10)
  const bad = parseMindmapDocument(huge)
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.error, /size/)
}

{
  const bad = parseMindmapDocument(
    { nodes: [{ id: 'a' }], edges: [] },
    { maxBytes: 20 },
  )
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.error, /size/)
}

console.log('mindmap-document tests passed')
