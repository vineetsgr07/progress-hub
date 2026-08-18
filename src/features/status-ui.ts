import type { TagSwatch } from './tags'
import { taskCopy } from './task-copy'

export type TaskStatus = 'todo' | 'doing' | 'done'

/** Fixed workflow swatches — not customisable in Tags. */
export const STATUS_SWATCHES: Record<TaskStatus, TagSwatch> = {
  todo: {
    key: 'todo',
    label: taskCopy.statusTodo,
    bg: '#f3f6fb',
    fg: '#4a5d7a',
    border: '#e6ebf3',
  },
  doing: {
    key: 'doing',
    label: taskCopy.statusDoing,
    bg: '#eaf1ff',
    fg: '#1c49b0',
    border: '#c9d9ff',
  },
  done: {
    key: 'done',
    label: taskCopy.statusDone,
    bg: '#e6f7ef',
    fg: '#0f7a4a',
    border: '#c7ebd9',
  },
}

export const STATUS_OPTIONS: Array<{
  value: TaskStatus
  label: string
  swatch: TagSwatch
}> = (
  [
    ['todo', taskCopy.statusTodo],
    ['doing', taskCopy.statusDoing],
    ['done', taskCopy.statusDone],
  ] as const
).map(([value, label]) => ({
  value,
  label,
  swatch: STATUS_SWATCHES[value],
}))

export function statusSwatch(status: TaskStatus): TagSwatch {
  return STATUS_SWATCHES[status] ?? STATUS_SWATCHES.todo
}

export function isTaskStatus(value: string): value is TaskStatus {
  return value === 'todo' || value === 'doing' || value === 'done'
}
