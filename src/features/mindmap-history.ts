/** Immutable undo/redo stack for mindmap node/edge snapshots. */

export type MindmapSnapshot<N, E> = {
  nodes: N[]
  edges: E[]
}

export type MindmapHistory<N, E> = {
  past: MindmapSnapshot<N, E>[]
  future: MindmapSnapshot<N, E>[]
}

export const EMPTY_HISTORY = <N, E>(): MindmapHistory<N, E> => ({
  past: [],
  future: [],
})

const MAX_HISTORY = 50

export function pushHistory<N, E>(
  history: MindmapHistory<N, E>,
  snapshot: MindmapSnapshot<N, E>,
): MindmapHistory<N, E> {
  const past = [...history.past, snapshot]
  if (past.length > MAX_HISTORY) past.shift()
  return { past, future: [] }
}

export function undoHistory<N, E>(
  history: MindmapHistory<N, E>,
  current: MindmapSnapshot<N, E>,
): {
  history: MindmapHistory<N, E>
  snapshot: MindmapSnapshot<N, E> | null
} {
  if (history.past.length === 0) {
    return { history, snapshot: null }
  }
  const past = [...history.past]
  const snapshot = past.pop()!
  return {
    history: {
      past,
      future: [current, ...history.future],
    },
    snapshot,
  }
}

export function redoHistory<N, E>(
  history: MindmapHistory<N, E>,
  current: MindmapSnapshot<N, E>,
): {
  history: MindmapHistory<N, E>
  snapshot: MindmapSnapshot<N, E> | null
} {
  if (history.future.length === 0) {
    return { history, snapshot: null }
  }
  const [snapshot, ...future] = history.future
  return {
    history: {
      past: [...history.past, current],
      future,
    },
    snapshot,
  }
}

export function canUndo<N, E>(history: MindmapHistory<N, E>): boolean {
  return history.past.length > 0
}

export function canRedo<N, E>(history: MindmapHistory<N, E>): boolean {
  return history.future.length > 0
}
