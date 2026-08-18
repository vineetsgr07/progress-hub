import { ActionIcon, Button } from '@mantine/core'
import { format, parseISO } from 'date-fns'
import type { NowProgress } from '../types'
import { localISODate, shiftISODate } from '../utils/date'
import { nowCopy } from './now-copy'
import { nowProgressTotals } from './now-progress'

type Props = {
  date: string
  progress: NowProgress
  onDateChange?: (date: string) => void
  onOpenReminders?: () => void
}

function CompletionRing({ percent }: { percent: number }) {
  const size = 72
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = c - (clamped / 100) * c

  return (
    <svg
      className="week-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <circle
        className="week-ring-track"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className="week-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="week-ring-text"
      >
        {clamped}%
      </text>
    </svg>
  )
}

function Meter({
  label,
  completed,
  total,
}: {
  label: string
  completed: number
  total: number
}) {
  const percent = total ? Math.round((completed / total) * 100) : 0
  return (
    <div
      className="now-pulse-meter"
      aria-label={nowCopy.pulseMeter(label, completed, total)}
    >
      <span className="now-pulse-meter-label">{label}</span>
      <span className="now-pulse-meter-track" aria-hidden>
        <span
          className="now-pulse-meter-fill"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="now-pulse-meter-count">
        {completed}/{total}
      </span>
    </div>
  )
}

export function NowPulse({
  date,
  progress,
  onDateChange,
  onOpenReminders,
}: Props) {
  const today = localISODate()
  const { completed, total } = nowProgressTotals(progress)
  const empty = total <= 0
  const done = !empty && progress.percent >= 100

  return (
    <aside
      className="now-pulse progress-panel panel"
      aria-label={nowCopy.pulseAria(completed, total, progress.percent)}
    >
      <div className="now-pulse-header">
        <div className="week-panel-title-block">
          <h3>{nowCopy.pulseTitle}</h3>
          <p className="week-panel-range">{format(parseISO(date), 'EEE d MMM')}</p>
        </div>
        {onDateChange ? (
          <div className="date-nav" aria-label={nowCopy.dateAria}>
            <ActionIcon
              variant="default"
              aria-label={nowCopy.prevDay}
              onClick={() => onDateChange(shiftISODate(date, -1))}
            >
              ‹
            </ActionIcon>
            <ActionIcon
              variant="default"
              aria-label={nowCopy.nextDay}
              onClick={() => onDateChange(shiftISODate(date, 1))}
            >
              ›
            </ActionIcon>
            {date !== today ? (
              <Button
                variant="default"
                size="xs"
                onClick={() => onDateChange(today)}
              >
                {nowCopy.jumpToday}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="now-pulse-hero">
        <CompletionRing percent={empty ? 0 : progress.percent} />
        <div className="now-pulse-summary">
          {empty ? (
            <p className="now-pulse-empty">{nowCopy.pulseEmpty}</p>
          ) : (
            <>
              <strong>
                {nowCopy.pulseSummary(completed, total, progress.percent)}
              </strong>
              {done ? <p className="now-pulse-done">{nowCopy.pulseDone}</p> : null}
            </>
          )}
        </div>
      </div>

      <div className="now-pulse-meters">
        <Meter
          label={nowCopy.pulseChecklist}
          completed={progress.checklist.completed}
          total={progress.checklist.total}
        />
        <Meter
          label={nowCopy.pulseHabits}
          completed={progress.habits.completed}
          total={progress.habits.total}
        />
        <Meter
          label={nowCopy.pulseReminders}
          completed={progress.reminders.completed}
          total={progress.reminders.total}
        />
      </div>

      {progress.overdueOpen > 0 && onOpenReminders ? (
        <button
          type="button"
          className="now-pulse-overdue"
          aria-label={nowCopy.overdueAria}
          onClick={onOpenReminders}
        >
          {nowCopy.overdueOpen(progress.overdueOpen)}
        </button>
      ) : null}
    </aside>
  )
}
