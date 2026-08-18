import type { BudgetDayPoint } from '../types'
import { formatHoursShort } from '../utils/date'
import { analyticsCopy } from './analytics-copy'

type Props = {
  series: BudgetDayPoint[]
  selectedDate: string
  onSelectDate?: (date: string) => void
}

function dayNum(dateISO: string): string {
  const d = Number(dateISO.slice(8, 10))
  return Number.isFinite(d) ? String(d) : ''
}

export function BudgetChart({ series, selectedDate, onSelectDate }: Props) {
  const hasAny = series.some(
    (p) => p.workHours > 0 || p.habitBudgetHours > 0 || p.habitTotal > 0,
  )

  if (!hasAny) {
    return (
      <p className="panel-empty">
        No work hours or habit check-ins in this range yet. Start a timer or check
        off a habit on Today.
      </p>
    )
  }

  return (
    <div className="budget-chart-wrap">
      <div className="budget-chart-legend" aria-hidden>
        <span>
          <i className="budget-swatch is-work" />
          {analyticsCopy.chartLegendWork}
        </span>
        <span>
          <i className="budget-swatch is-habit" />
          {analyticsCopy.chartLegendHabits}
        </span>
      </div>
      <div
        className="budget-chart"
        role="img"
        aria-label={analyticsCopy.chartAria}
      >
        {series.map((point) => {
          const selected = point.date === selectedDate
          const workH = Math.max(
            0,
            Math.min(100, point.workPercent || (point.workHours > 0 ? 6 : 0)),
          )
          const habitH = Math.max(
            0,
            Math.min(
              100,
              point.habitPercent || (point.habitBudgetHours > 0 ? 6 : 0),
            ),
          )
          return (
            <button
              key={point.date}
              type="button"
              className={`budget-bar${selected ? ' is-selected' : ''}${point.totalHours > 0 ? ' has-data' : ''}`}
              title={analyticsCopy.chartDayTitle(point)}
              aria-label={analyticsCopy.chartDayTitle(point)}
              aria-pressed={selected}
              onClick={() => onSelectDate?.(point.date)}
            >
              <span className="budget-bar-label">{point.label}</span>
              <span className="budget-bar-tracks" aria-hidden>
                <span className="budget-bar-track">
                  <span
                    className="budget-bar-fill is-work"
                    style={{ height: `${workH}%` }}
                  />
                </span>
                <span className="budget-bar-track">
                  <span
                    className="budget-bar-fill is-habit"
                    style={{ height: `${habitH}%` }}
                  />
                </span>
              </span>
              <span className="budget-bar-day">{dayNum(point.date)}</span>
              <span className="budget-bar-meta">
                {point.totalHours > 0
                  ? `${formatHoursShort(point.totalHours)}h`
                  : '·'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
