import type { TimeSession } from '../types'
import { formatHoursShort } from '../utils/date'
import { HoursBreakdown } from './HoursBreakdown'
import { progressCopy } from './progress-copy'

type Props = {
  completed: number
  total: number
  checklistDone: number
  checklistTotal: number
  completedPercent: number
  hours: number
  timerRunning: boolean
  sessions: TimeSession[]
  tick?: number
}

export function DaySnapshot({
  completed,
  total,
  checklistDone,
  checklistTotal,
  completedPercent,
  hours,
  timerRunning,
  sessions,
  tick = 0,
}: Props) {
  const hoursLabel = progressCopy.hoursValue(formatHoursShort(hours))
  const showChecklist = checklistTotal > 0

  return (
    <section
      className="day-snapshot"
      aria-label={progressCopy.daySnapshotAria(
        completed,
        total,
        checklistDone,
        checklistTotal,
        hoursLabel,
        timerRunning,
      )}
    >
      <div className="day-snapshot-compact">
        <div className="day-snapshot-primary">
          <strong className="day-snapshot-tasks">
            {progressCopy.dayCompactTasks(completed, total, completedPercent)}
          </strong>
          {showChecklist ? (
            <span className="day-snapshot-check">
              {progressCopy.checklistDone(checklistDone, checklistTotal)}
            </span>
          ) : null}
        </div>
        <div className="day-snapshot-time">
          <strong className="day-snapshot-hours-value">{hoursLabel}</strong>
          <span
            className={`day-snapshot-timer${timerRunning ? ' is-live' : ''}`}
            aria-label={
              timerRunning ? progressCopy.timerLive : progressCopy.timerIdle
            }
            title={
              timerRunning ? progressCopy.timerLive : progressCopy.timerIdle
            }
          >
            {timerRunning ? '●' : '⏱'}
          </span>
        </div>
      </div>
      <HoursBreakdown sessions={sessions} tick={tick} />
    </section>
  )
}
