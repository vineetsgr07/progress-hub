import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { Priority } from '../types'
import { NARROW_MAX_WIDTH } from './notes-copy'
import { PRIORITY_TAGS } from './tags'
import { useTagColors } from './TagColorsContext'

export type TaskDraft = {
  title: string
  notes: string
  category: string
  projectTag: string
  priority: Priority
  subtasks: string[]
  /** Weekly: 0=Sun…6=Sat */
  cadenceWeekday: number
  /** Monthly: 1–28 */
  cadenceMonthDay: number
}

const WEEKDAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => {
  const d = i + 1
  return { value: String(d), label: String(d) }
})

type Props = {
  value: TaskDraft
  onChange: (v: TaskDraft) => void
  onClose: () => void
  onSave: () => void
  busy: boolean
}

export function TaskModal({ value, onChange, onClose, onSave, busy }: Props) {
  const isNarrow = useMediaQuery(`(max-width: ${NARROW_MAX_WIDTH}px)`)
  const { frequencies, projects } = useTagColors()
  const projectData = projects.includes(value.projectTag)
    ? projects
    : [...projects, value.projectTag]
  const frequencyData = frequencies.includes(value.category)
    ? frequencies
    : [...frequencies, value.category]

  return (
    <Modal
      opened
      onClose={onClose}
      title="Add task"
      size="lg"
      fullScreen={Boolean(isNarrow)}
      classNames={{ body: 'mantine-task-modal-body' }}
    >
      <Text size="sm" c="dimmed" mb="md">
        Name the task, add optional notes, then tag it.
      </Text>

      <Stack gap="lg">
        <Stack gap="xs">
          <TextInput
            label="Task name"
            placeholder="What needs to get done?"
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.currentTarget.value })}
            autoFocus
            size="md"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && value.title.trim() && !busy) {
                e.preventDefault()
                onSave()
              }
            }}
          />

          <Textarea
            label="Notes"
            description="optional"
            placeholder="Context, links, or reminders…"
            rows={3}
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.currentTarget.value })}
          />
        </Stack>

        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Tags
          </Text>
          <Group grow align="flex-start">
            <Select
              label="Frequency"
              data={frequencyData}
              value={value.category}
              onChange={(v) =>
                v &&
                onChange({
                  ...value,
                  category: v,
                })
              }
              size="sm"
            />
            <Select
              label="Project"
              data={projectData}
              value={value.projectTag}
              onChange={(v) => v && onChange({ ...value, projectTag: v })}
              size="sm"
            />
            <Select
              label="Priority"
              data={PRIORITY_TAGS}
              value={value.priority}
              onChange={(v) => v && onChange({ ...value, priority: v as Priority })}
              size="sm"
            />
          </Group>
          {value.category === 'Weekly' && (
            <Select
              label="Repeats on"
              description="Surfaces on this weekday in Today → All"
              data={WEEKDAYS}
              value={String(value.cadenceWeekday)}
              onChange={(v) =>
                v && onChange({ ...value, cadenceWeekday: Number(v) })
              }
              size="sm"
              w={220}
            />
          )}
          {value.category === 'Monthly' && (
            <Select
              label="Repeats on day"
              description="Day of month (1–28) for Today → All"
              data={MONTH_DAYS}
              value={String(value.cadenceMonthDay)}
              onChange={(v) =>
                v && onChange({ ...value, cadenceMonthDay: Number(v) })
              }
              size="sm"
              w={220}
            />
          )}
        </Stack>

        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Checklist
          </Text>
          <Stack gap={6}>
            {value.subtasks.map((line, index) => (
              <TextInput
                key={`new-${index}`}
                placeholder={
                  index === 0 ? 'Add a checklist item…' : '+ Another item'
                }
                value={line}
                aria-label={
                  index === value.subtasks.length - 1
                    ? 'New checklist item'
                    : `Checklist item ${index + 1}`
                }
                onChange={(e) => {
                  const next = [...value.subtasks]
                  next[index] = e.currentTarget.value
                  if (index === next.length - 1 && e.currentTarget.value.trim()) next.push('')
                  onChange({ ...value, subtasks: next })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault()
                }}
              />
            ))}
          </Stack>
        </Stack>
      </Stack>

      <Group justify="flex-end" mt="xl" gap="sm">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy || !value.title.trim()}
          loading={busy}
          onClick={onSave}
          color="dark"
        >
          Add task
        </Button>
      </Group>
    </Modal>
  )
}
