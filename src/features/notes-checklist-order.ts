/** Minimal block shape for same-hierarchy checklist reorder. */
export type CheckListBlockLike = {
  id: string
  type: string
  // BlockNote blocks have varied props; only `checked` matters here.
  props?: Record<string, unknown>
}

export function isCheckListItem(block: { type: string } | undefined | null): boolean {
  return block?.type === 'checkListItem'
}

export function checklistChecked(block: CheckListBlockLike | undefined | null): boolean {
  return block?.props?.checked === true
}

export function isNewlyCheckedChecklist(
  prev: CheckListBlockLike | undefined,
  next: CheckListBlockLike | undefined,
): boolean {
  if (!prev || !next) return false
  if (!isCheckListItem(next) || !isCheckListItem(prev)) return false
  return !checklistChecked(prev) && checklistChecked(next)
}

type ChecklistOrderEditor = {
  getBlock: (id: string) => CheckListBlockLike | undefined
  getNextBlock: (id: string) => CheckListBlockLike | undefined
  moveBlocksDown: (id?: string) => void
}

/**
 * Keep moving a checked checklist item down while the next sibling is still a
 * checklist item (same hierarchy run) — open items stay above, done at bottom.
 */
export function moveCheckedChecklistToBottomOfRun(
  editor: ChecklistOrderEditor,
  blockId: string,
): boolean {
  const block = editor.getBlock(blockId)
  if (!isCheckListItem(block) || !checklistChecked(block)) return false

  let moved = false
  // Cap moves to avoid pathological loops if siblings churn.
  for (let i = 0; i < 500; i++) {
    const next = editor.getNextBlock(blockId)
    if (!isCheckListItem(next)) break
    editor.moveBlocksDown(blockId)
    moved = true
  }
  return moved
}
