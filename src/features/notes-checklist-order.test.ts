import assert from 'node:assert/strict'
import {
  isCheckListItem,
  isNewlyCheckedChecklist,
  moveCheckedChecklistToBottomOfRun,
  type CheckListBlockLike,
} from './notes-checklist-order.ts'

assert.equal(isCheckListItem({ type: 'checkListItem' }), true)
assert.equal(isCheckListItem({ type: 'paragraph' }), false)
assert.equal(isCheckListItem(undefined), false)

assert.equal(
  isNewlyCheckedChecklist(
    { id: 'a', type: 'checkListItem', props: { checked: false } },
    { id: 'a', type: 'checkListItem', props: { checked: true } },
  ),
  true,
)
assert.equal(
  isNewlyCheckedChecklist(
    { id: 'a', type: 'checkListItem', props: { checked: true } },
    { id: 'a', type: 'checkListItem', props: { checked: true } },
  ),
  false,
)
assert.equal(
  isNewlyCheckedChecklist(
    { id: 'a', type: 'checkListItem', props: { checked: true } },
    { id: 'a', type: 'checkListItem', props: { checked: false } },
  ),
  false,
)
assert.equal(
  isNewlyCheckedChecklist(
    { id: 'a', type: 'paragraph' },
    { id: 'a', type: 'paragraph' },
  ),
  false,
)

function fakeEditor(order: CheckListBlockLike[]) {
  const blocks = order.map((b) => ({ ...b, props: { ...b.props } }))
  return {
    blocks,
    getBlock(id: string) {
      return blocks.find((b) => b.id === id)
    },
    getNextBlock(id: string) {
      const i = blocks.findIndex((b) => b.id === id)
      if (i < 0) return undefined
      return blocks[i + 1]
    },
    moveBlocksDown(id?: string) {
      if (!id) return
      const i = blocks.findIndex((b) => b.id === id)
      if (i < 0 || i >= blocks.length - 1) return
      const [item] = blocks.splice(i, 1)
      blocks.splice(i + 1, 0, item)
    },
  }
}

{
  const ed = fakeEditor([
    { id: '1', type: 'checkListItem', props: { checked: true } },
    { id: '2', type: 'checkListItem', props: { checked: false } },
    { id: '3', type: 'checkListItem', props: { checked: false } },
    { id: 'p', type: 'paragraph' },
  ])
  assert.equal(moveCheckedChecklistToBottomOfRun(ed, '1'), true)
  assert.deepEqual(
    ed.blocks.map((b) => b.id),
    ['2', '3', '1', 'p'],
  )
}

{
  const ed = fakeEditor([
    { id: '1', type: 'checkListItem', props: { checked: false } },
    { id: '2', type: 'checkListItem', props: { checked: true } },
    { id: '3', type: 'checkListItem', props: { checked: false } },
  ])
  assert.equal(moveCheckedChecklistToBottomOfRun(ed, '2'), true)
  assert.deepEqual(
    ed.blocks.map((b) => b.id),
    ['1', '3', '2'],
  )
}

{
  const ed = fakeEditor([
    { id: '1', type: 'checkListItem', props: { checked: false } },
    { id: '2', type: 'checkListItem', props: { checked: true } },
  ])
  assert.equal(moveCheckedChecklistToBottomOfRun(ed, '2'), false)
  assert.deepEqual(
    ed.blocks.map((b) => b.id),
    ['1', '2'],
  )
}

{
  const ed = fakeEditor([
    { id: '1', type: 'checkListItem', props: { checked: false } },
  ])
  assert.equal(moveCheckedChecklistToBottomOfRun(ed, '1'), false)
}

console.log('notes-checklist-order tests passed')
