import { useEffect, useState } from 'react'
import { Button, Modal, Popover } from '@mantine/core'
import { DatePicker, TimeInput } from '@mantine/dates'
import { useMediaQuery } from '@mantine/hooks'
import { NARROW_MAX_WIDTH } from './notes-copy'
import { nowCopy } from './now-copy'
import { reminderWhenAria, reminderWhenChip } from './reminder-when'

type Props = {
  dueDate: string
  dueTime: string | null
  disabled?: boolean
  onChange: (next: { dueDate: string; dueTime: string | null }) => void
}

function WhenPanel({
  dueDate,
  dueTime,
  disabled,
  onChange,
}: Props) {
  return (
    <div className="reminder-when-panel" data-no-dnd>
      <DatePicker
        value={dueDate}
        onChange={(value) => {
          if (!value || disabled) return
          onChange({ dueDate: value, dueTime })
        }}
        size="sm"
      />
      <div className="reminder-when-time-row">
        <TimeInput
          size="xs"
          value={dueTime ?? ''}
          disabled={disabled}
          aria-label={nowCopy.timeAria}
          onChange={(event) => {
            const raw = event.currentTarget.value
            onChange({ dueDate, dueTime: raw || null })
          }}
        />
        <Button
          variant="subtle"
          size="xs"
          disabled={disabled || !dueTime}
          onClick={() => onChange({ dueDate, dueTime: null })}
        >
          {nowCopy.clearTime}
        </Button>
      </div>
    </div>
  )
}

export function ReminderWhen({ dueDate, dueTime, disabled, onChange }: Props) {
  const isNarrow = useMediaQuery(`(max-width: ${NARROW_MAX_WIDTH}px)`)
  const [opened, setOpened] = useState(false)
  const chip = reminderWhenChip(dueDate, dueTime)

  useEffect(() => {
    if (disabled) setOpened(false)
  }, [disabled])

  const trigger = (
    <button
      type="button"
      className="reminder-when-chip"
      data-no-dnd
      disabled={disabled}
      aria-label={reminderWhenAria(dueDate, dueTime)}
      aria-haspopup="dialog"
      aria-expanded={opened}
      onClick={() => setOpened((value) => !value)}
    >
      {chip}
    </button>
  )

  const panel = (
    <WhenPanel
      dueDate={dueDate}
      dueTime={dueTime}
      disabled={disabled}
      onChange={onChange}
    />
  )

  if (isNarrow) {
    return (
      <>
        {trigger}
        <Modal
          opened={opened}
          onClose={() => setOpened(false)}
          title={nowCopy.whenAria}
          size="sm"
          className="reminder-when-modal"
        >
          {panel}
        </Modal>
      </>
    )
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      withinPortal
    >
      <Popover.Target>{trigger}</Popover.Target>
      <Popover.Dropdown>{panel}</Popover.Dropdown>
    </Popover>
  )
}
