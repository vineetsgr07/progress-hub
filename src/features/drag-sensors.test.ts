import assert from 'node:assert/strict'
import {
  isNoDndTarget,
  TASK_DRAG_DISTANCE,
  TASK_TOUCH_DELAY_MS,
  TASK_TOUCH_TOLERANCE,
} from './drag-sensors.ts'

type Stub = {
  closest: (selector: string) => Stub | null
}

function stub(opts: {
  tag?: string
  attrs?: Record<string, string>
  parent?: Stub | null
}): Stub {
  const tag = (opts.tag || 'div').toLowerCase()
  const attrs = opts.attrs || {}
  const parent = opts.parent ?? null

  const node: Stub = {
    closest(selector: string) {
      const parts = selector.split(',').map((s) => s.trim())
      for (const part of parts) {
        if (part.startsWith('[') && part.endsWith(']')) {
          const body = part.slice(1, -1)
          const [rawKey, rawVal] = body.split('=')
          const key = rawKey.trim()
          if (rawVal === undefined) {
            if (key in attrs || Object.prototype.hasOwnProperty.call(attrs, key)) {
              return node
            }
          } else {
            const want = rawVal.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '')
            if (attrs[key] === want) return node
          }
        } else if (part === tag) {
          return node
        }
      }
      return parent ? parent.closest(selector) : null
    },
  }
  return node
}

assert.equal(TASK_DRAG_DISTANCE, 8)
assert.equal(TASK_TOUCH_DELAY_MS, 250)
assert.equal(TASK_TOUCH_TOLERANCE, 5)

assert.equal(isNoDndTarget(null), false)

assert.equal(
  isNoDndTarget(stub({ tag: 'input' }) as unknown as EventTarget),
  true,
)
assert.equal(
  isNoDndTarget(stub({ tag: 'textarea' }) as unknown as EventTarget),
  true,
)
assert.equal(
  isNoDndTarget(stub({ tag: 'button' }) as unknown as EventTarget),
  false,
)
assert.equal(
  isNoDndTarget(
    stub({ tag: 'button', attrs: { class: 'task-title-open' } }) as unknown as EventTarget,
  ),
  false,
)
assert.equal(
  isNoDndTarget(
    stub({ tag: 'span', attrs: { 'data-no-dnd': 'true' } }) as unknown as EventTarget,
  ),
  true,
)

{
  const host = stub({ tag: 'div', attrs: { 'data-no-dnd': '' } })
  const nested = stub({ tag: 'span', parent: host })
  assert.equal(isNoDndTarget(nested as unknown as EventTarget), true)
}

console.log('drag-sensors.test.ts: ok')
