import { useState } from 'react'
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { NARROW_MAX_WIDTH } from './notes-copy'
import { TAG_SWATCHES, type TagKind } from './tags'
import { useTagColors } from './TagColorsContext'
import { taskCopy } from './task-copy'

type Props = {
  opened: boolean
  onClose: () => void
}

const ICON = { size: 14, stroke: 1.5 } as const

function TagColorRow({
  kind,
  value,
  locked,
  onRenamed,
  onRemoved,
}: {
  kind: TagKind
  value: string
  locked?: boolean
  onRenamed?: (from: string, to: string) => Promise<void>
  onRemoved?: (value: string) => void
}) {
  const { swatchFor, setColor } = useTagColors()
  const current = swatchFor(kind, value)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)

  async function commitRename() {
    const next = draft.trim()
    if (!next || next === value || !onRenamed) {
      setEditing(false)
      setDraft(value)
      return
    }
    setBusy(true)
    try {
      await onRenamed(value, next)
      setEditing(false)
    } catch {
      setDraft(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tag-color-row">
      <div className="tag-color-label-col">
        {editing ? (
          <TextInput
            size="xs"
            value={draft}
            disabled={busy}
            autoFocus
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void commitRename()
              }
              if (e.key === 'Escape') {
                setDraft(value)
                setEditing(false)
              }
            }}
          />
        ) : (
          <span
            className="tag-color-preview"
            style={{
              background: current.bg,
              color: current.fg,
              borderColor: current.border,
            }}
          >
            {value}
          </span>
        )}
        {(onRenamed || onRemoved) && (
          <div className="tag-row-actions">
            {onRenamed && !locked && (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={`Rename ${value}`}
                disabled={busy}
                onClick={() => {
                  setDraft(value)
                  setEditing(true)
                }}
              >
                <IconPencil {...ICON} />
              </ActionIcon>
            )}
            {onRemoved && !locked && (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label={`Remove ${value}`}
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove “${value}” from the list? Existing tasks keep this tag until you change them.`,
                    )
                  ) {
                    onRemoved(value)
                  }
                }}
              >
                <IconTrash {...ICON} />
              </ActionIcon>
            )}
          </div>
        )}
      </div>
      <div className="tag-swatch-list" role="group" aria-label={`${value} colour`}>
        {TAG_SWATCHES.map((swatch) => {
          const selected = current.key === swatch.key
          return (
            <button
              key={swatch.key}
              type="button"
              className={`tag-swatch${selected ? ' selected' : ''}`}
              style={{ background: swatch.bg, borderColor: swatch.border }}
              aria-label={swatch.label}
              aria-pressed={selected}
              title={swatch.label}
              onClick={() => setColor(kind, value, swatch.key)}
            />
          )
        })}
      </div>
    </div>
  )
}

function EditableTagSection({
  title,
  kind,
  values,
  hint,
  lockedValues,
}: {
  title: string
  kind: 'category' | 'project'
  values: readonly string[]
  hint?: string
  lockedValues?: readonly string[]
}) {
  const { addTag, renameTag, removeTag } = useTagColors()
  const [draft, setDraft] = useState('')

  function submitAdd() {
    const next = draft.trim()
    if (!next) return
    addTag(kind, next)
    setDraft('')
  }

  return (
    <Stack gap="xs">
      <div>
        <Text size="sm" fw={600}>
          {title}
        </Text>
        {hint && (
          <Text size="xs" c="dimmed" mt={2}>
            {hint}
          </Text>
        )}
      </div>
      <Stack gap={8}>
        {values.map((value) => (
          <TagColorRow
            key={value}
            kind={kind}
            value={value}
            locked={lockedValues?.includes(value)}
            onRenamed={(from, to) => renameTag(kind, from, to)}
            onRemoved={(v) => removeTag(kind, v)}
          />
        ))}
      </Stack>
      <Group gap="xs" mt={4} wrap="nowrap">
        <TextInput
          style={{ flex: 1 }}
          size="xs"
          placeholder={taskCopy.tagsAddPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitAdd()
            }
          }}
        />
        <Button
          size="xs"
          variant="light"
          color="gray"
          leftSection={<IconPlus size={12} stroke={2} />}
          disabled={!draft.trim()}
          onClick={submitAdd}
        >
          {taskCopy.tagsAdd}
        </Button>
      </Group>
    </Stack>
  )
}

function PrioritySection() {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {taskCopy.priority}
      </Text>
      <Text size="xs" c="dimmed">
        {taskCopy.tagsPriorityHint}
      </Text>
      <Stack gap={8}>
        {(['High', 'Medium', 'Low'] as const).map((value) => (
          <TagColorRow key={value} kind="priority" value={value} locked />
        ))}
      </Stack>
    </Stack>
  )
}

/** Modal to manage tag colours and Frequency / Project values. */
export function TagsPanel({ opened, onClose }: Props) {
  const isNarrow = useMediaQuery(`(max-width: ${NARROW_MAX_WIDTH}px)`)
  const { frequencies, projects, resetDefaults, isLockedFrequency } = useTagColors()
  const locked = frequencies.filter((f) => isLockedFrequency(f))

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={taskCopy.tagsTitle}
      size="lg"
      fullScreen={Boolean(isNarrow)}
      classNames={{ body: 'tags-panel-body' }}
    >
      <Text size="sm" c="dimmed" mb="md">
        {taskCopy.tagsIntro}
      </Text>

      <Stack gap="xl">
        <EditableTagSection
          title={taskCopy.frequency}
          kind="category"
          values={frequencies}
          lockedValues={locked}
          hint={taskCopy.tagsFrequencyHint}
        />
        <EditableTagSection
          title={taskCopy.project}
          kind="project"
          values={projects}
          hint={taskCopy.tagsProjectHint}
        />
        <PrioritySection />
      </Stack>

      <Group justify="space-between" mt="xl">
        <Button variant="default" onClick={resetDefaults}>
          {taskCopy.tagsReset}
        </Button>
        <Button color="dark" onClick={onClose}>
          {taskCopy.tagsDone}
        </Button>
      </Group>
    </Modal>
  )
}
