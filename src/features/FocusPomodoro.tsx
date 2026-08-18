import { IconChevronDown } from '@tabler/icons-react'
import {
  countdownRemainingFraction,
  formatCountdown,
} from './focus-countdown'
import { focusCopy } from './focus-copy'
import { prefersReducedMotion } from './motion'

type Props = {
  remainingMs: number
  durationMin: number
  ended?: boolean
  /** hero = larger header block; compact = header chip. */
  variant?: 'hero' | 'compact'
  className?: string
  expanded?: boolean
  onClick?: () => void
}

const URGENT_FRACTION = 0.2

/**
 * Compact Pomodoro chip — remaining time is the signal; progress bar shows
 * how much of the block is left. Live sessions get a soft pulse, not a race.
 */
export function FocusPomodoro({
  remainingMs,
  durationMin,
  ended,
  variant = 'compact',
  className,
  expanded,
  onClick,
}: Props) {
  const fraction = countdownRemainingFraction(remainingMs, durationMin)
  const label = formatCountdown(remainingMs)
  const reduceMotion = prefersReducedMotion()
  const pct = Math.round(fraction * 100)
  const live = !ended
  const urgent = live && fraction > 0 && fraction <= URGENT_FRACTION
  const rootClass = [
    'focus-pomodoro',
    variant === 'hero' ? 'is-hero' : 'is-compact',
    ended ? 'is-ended' : '',
    live ? 'is-live' : '',
    urgent ? 'is-urgent' : '',
    expanded ? 'is-expanded' : '',
    onClick ? 'is-interactive' : '',
    reduceMotion ? 'is-reduced-motion' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const aria = ended
    ? focusCopy.sessionEndedTitle
    : focusCopy.pomodoroAria(label, durationMin)

  const body = (
    <>
      <span className="focus-pomodoro-pulse" aria-hidden="true" />
      <div className="focus-pomodoro-copy">
        <span className="focus-pomodoro-kicker">
          {ended ? focusCopy.sessionEndedTitle : focusCopy.untilBreak}
        </span>
        <span className="focus-pomodoro-time">{label}</span>
      </div>
      <div className="focus-pomodoro-side">
        <span className="focus-pomodoro-live-dot" aria-hidden="true" />
        <span className="focus-pomodoro-alloc">{focusCopy.minutes(durationMin)}</span>
        {onClick ? (
          <IconChevronDown
            className="focus-pomodoro-chevron"
            size={14}
            stroke={2}
            aria-hidden
          />
        ) : null}
      </div>
      <div className="focus-pomodoro-track" aria-hidden="true">
        <div
          className="focus-pomodoro-fill"
          style={{
            width: `${pct}%`,
            transition: reduceMotion ? undefined : 'width 0.35s linear',
          }}
        />
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={rootClass}
        aria-live="polite"
        aria-atomic="true"
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-label={aria}
        title={focusCopy.durationLabel}
        onClick={onClick}
      >
        {body}
      </button>
    )
  }

  return (
    <div
      className={rootClass}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label={aria}
    >
      {body}
    </div>
  )
}
