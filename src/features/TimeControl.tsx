import { NumberInput } from '@mantine/core'
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { formatDuration } from '../utils/date'
import { timerCopy } from './timer-copy'

type Props = {
  running: boolean
  hours: number
  busy?: boolean
  /** Show duration only — no play/stop or manual edit. */
  readOnly?: boolean
  compact?: boolean
  /** Play/stop icon only when idle with no hours — saves width on checklist rows. */
  idleIconOnly?: boolean
  onToggleTimer?: () => void
  onHoursChange?: (hours: number) => void
}

const ICON = { size: 13, stroke: 2 } as const

/** Single pill: play/stop + hours (or live duration while running). */
export function TimeControl({
  running,
  hours,
  busy,
  readOnly,
  compact,
  idleIconOnly,
  onToggleTimer,
  onHoursChange,
}: Props) {
  const showToggle = !readOnly && onToggleTimer
  const showEdit = !readOnly && !running && onHoursChange
  // Clock style (m:ss / h:mm:ss) must not sit next to an "h" unit — that reads as hours.
  const showClock = running || readOnly || !showEdit
  const iconOnly = Boolean(idleIconOnly && !running && hours <= 0 && showToggle)

  return (
    <div
      className={`time-control${running ? ' is-running' : ''}${compact ? ' is-compact' : ''}${readOnly ? ' is-readonly' : ''}${iconOnly ? ' is-idle-icon' : ''}`}
      data-no-dnd
    >
      {showToggle ? (
        <button
          type="button"
          className="time-control-toggle"
          disabled={busy}
          aria-label={running ? timerCopy.stop : timerCopy.start}
          title={running ? timerCopy.stop : timerCopy.start}
          onClick={onToggleTimer}
        >
          {running ? (
            <IconPlayerStop {...ICON} aria-hidden />
          ) : (
            <IconPlayerPlay {...ICON} aria-hidden />
          )}
        </button>
      ) : null}
      {iconOnly ? null : (
      <div className="time-control-value">
        {showClock ? (
          <span
            className="time-control-live"
            aria-live={running ? 'polite' : undefined}
            title={`${Number(hours.toFixed(2))} hours`}
          >
            {formatDuration(hours)}
          </span>
        ) : (
          <>
            <NumberInput
              min={0}
              step={0.1}
              decimalScale={2}
              value={Number(hours.toFixed(2))}
              aria-label={timerCopy.hoursLogged}
              disabled={busy}
              hideControls
              size="xs"
              variant="unstyled"
              classNames={{ input: 'time-control-input' }}
              onChange={(value) => {
                const next =
                  typeof value === 'number' ? value : Number(value) || 0
                onHoursChange?.(next)
              }}
            />
            <span className="time-control-unit" aria-hidden>
              h
            </span>
          </>
        )}
      </div>
      )}
    </div>
  )
}
