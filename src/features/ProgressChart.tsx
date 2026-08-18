import type { ProgressPoint, ProgressRange } from '../types'
import { analyticsCopy } from './analytics-copy'
import { isSelectedBucket, progressCopy } from './progress-copy'

type Props = {
  range: ProgressRange
  series: ProgressPoint[]
  selectedDate: string
}

export function ProgressChart({ range, series, selectedDate }: Props) {
  const hasAny = series.some(
    (p) => p.total > 0 || p.completed > 0 || (p.hours ?? 0) > 0,
  )

  if (!hasAny) {
    return <p className="panel-empty">{progressCopy.empty}</p>
  }

  const maxHours = Math.max(...series.map((p) => p.hours ?? 0), 0)

  return (
    <div
      className={`progress-chart progress-chart-${range}`}
      role="img"
      aria-label={progressCopy.chartAria(range)}
    >
      {series.map((point) => {
        const selected = isSelectedBucket(point, range, selectedDate)
        const hours = point.hours ?? 0
        const height =
          point.total > 0
            ? Math.max(8, point.percent)
            : hours > 0 && maxHours > 0
              ? Math.max(8, Math.round((hours / maxHours) * 100))
              : 0
        return (
          <div
            key={point.key}
            className={`progress-bar ${selected ? 'selected' : ''} ${point.completed > 0 || hours > 0 ? 'has-progress' : ''}`}
            title={analyticsCopy.chartPointTitle(
              point.label,
              point.completed,
              point.total,
              point.percent,
              hours,
            )}
          >
            <span className="progress-bar-label">{point.label}</span>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ height: `${height}%` }}
              />
              {hours > 0 && maxHours > 0 && (
                <div
                  className="progress-bar-hours-mark"
                  style={{
                    bottom: `${Math.max(4, Math.round((hours / maxHours) * 100))}%`,
                  }}
                  aria-hidden
                />
              )}
            </div>
            <span className="progress-bar-count">
              {analyticsCopy.chartCount(point.completed, point.total, hours)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
