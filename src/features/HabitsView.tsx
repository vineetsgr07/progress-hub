import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, SegmentedControl } from '@mantine/core'
import { api } from '../api'
import type {
  HabitProgressRow,
  HabitsDailySummary,
  HabitsProgress,
} from '../types'
import { localISODate } from '../utils/date'
import { habitsHistoryCopy } from './habits-copy'
import {
  attentionReasonLabel,
  dailyBarHeight,
  dayOfMonth,
  dayWeekdayLetter,
  habitInsight,
  habitsNeedingAttention,
  habitsOverview,
  shouldLabelChartDay,
  sortHabitsForAction,
  type HabitAttention,
  type HabitsOverview,
} from './habits-overview'

type Props = {
  /** Calendar day the insight focuses on (usually the Analytics date). */
  focusDate?: string
  /** Open Today so the user can check habits off. */
  onCheckInToday?: () => void
  onSelectDate?: (date: string) => void
  /** Hide the page-level title when nested under Analytics habit detail. */
  embedded?: boolean
  /** When parent already shows insight + needs-attention at the top. */
  hideActionQueue?: boolean
  /** 28-day payload from the analytics bootstrap — skip the extra GET. */
  initialData?: HabitsProgress | null
}

const RANGE_OPTIONS = [
  { value: '28', label: habitsHistoryCopy.range28 },
  { value: '56', label: habitsHistoryCopy.range56 },
] as const

function OverviewRing({ percent }: { percent: number }) {
  const size = 72
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = c - (clamped / 100) * c

  return (
    <svg
      className="habits-overview-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <circle
        className="habits-overview-ring-track"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className="habits-overview-ring-fill"
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
        className="habits-overview-ring-text"
      >
        {clamped}%
      </text>
    </svg>
  )
}

function HabitInsightCard({
  title,
  detail,
  ctaLabel,
  tone,
  onAction,
}: {
  title: string
  detail: string
  ctaLabel: string
  tone: 'action' | 'success' | 'start'
  onAction?: () => void
}) {
  return (
    <div
      className={`habits-insight analytics-nudge ${tone === 'success' ? 'success' : tone === 'start' ? 'start' : ''}`}
      role="status"
    >
      <div className="habits-insight-body">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {ctaLabel && onAction ? (
        <Button size="sm" onClick={onAction}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  )
}

function OverviewStrip({ overview }: { overview: HabitsOverview }) {
  return (
    <section
      className="habits-overview"
      aria-label={habitsHistoryCopy.overviewAria}
    >
      <div className="habits-overview-hero">
        <OverviewRing percent={overview.percent} />
        <div className="habits-overview-hero-copy">
          <p className="habits-overview-kicker">
            {habitsHistoryCopy.overviewHabits(overview.habitCount)}
          </p>
          <h3 className="habits-overview-title">
            {habitsHistoryCopy.overviewRate}
          </h3>
          <p className="habits-overview-hint">
            {habitsHistoryCopy.overviewRateHint(
              overview.completedDays,
              overview.trackedDays,
            )}
          </p>
        </div>
      </div>
      <div className="habits-overview-stats">
        <div className="habits-overview-stat">
          <span className="habits-overview-stat-label">
            {habitsHistoryCopy.overviewStreak}
          </span>
          <strong className="habits-overview-stat-value">
            {habitsHistoryCopy.overviewStreakValue(overview.bestStreak)}
          </strong>
        </div>
        <div className="habits-overview-stat">
          <span className="habits-overview-stat-label">
            {habitsHistoryCopy.overviewPerfect}
          </span>
          <strong className="habits-overview-stat-value">
            {overview.perfectDays}
          </strong>
          <span className="habits-overview-stat-hint">
            {habitsHistoryCopy.overviewPerfectHint(
              overview.perfectDays,
              overview.activeDays,
            )}
          </span>
        </div>
      </div>
    </section>
  )
}

export function AttentionList({
  items,
  onCheckIn,
  compact = false,
}: {
  items: HabitAttention[]
  onCheckIn?: () => void
  compact?: boolean
}) {
  if (items.length === 0) return null
  return (
    <section
      className={`habits-attention${compact ? ' is-compact' : ''}`}
      aria-label={habitsHistoryCopy.needsAttentionTitle}
    >
      <header className="habits-section-head">
        <div>
          <h3>{habitsHistoryCopy.needsAttentionTitle}</h3>
        </div>
      </header>
      <ul className="habits-attention-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="habits-attention-row"
              onClick={() => onCheckIn?.()}
            >
              <div className="habits-attention-main">
                <strong>{item.title}</strong>
                <span>{attentionReasonLabel(item.reason)}</span>
              </div>
              <span className="habits-attention-cta">
                {habitsHistoryCopy.openToday}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DailyChart({
  days,
  onSelectDate,
}: {
  days: HabitsDailySummary[]
  onSelectDate?: (date: string) => void
}) {
  return (
    <section className="habits-chart-card" aria-label={habitsHistoryCopy.chartAria}>
      <header className="habits-section-head">
        <div>
          <h3>{habitsHistoryCopy.chartTitle}</h3>
          <p>{habitsHistoryCopy.chartSubtitle}</p>
        </div>
      </header>
      <div
        className="habits-daily-chart"
        role="img"
        aria-label={habitsHistoryCopy.chartAria}
      >
        {days.map((day, index) => {
          const height = dailyBarHeight(day.percent, day.total)
          const complete = day.total > 0 && day.completed >= day.total
          const empty = day.total <= 0
          const showLabel = shouldLabelChartDay(day, index, days.length)
          return (
            <button
              key={day.date}
              type="button"
              className={[
                'habits-daily-bar',
                complete ? 'is-complete' : '',
                empty ? 'is-empty' : '',
                day.percent > 0 ? 'has-progress' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={empty}
              onClick={() => {
                if (!empty) onSelectDate?.(day.date)
              }}
              aria-label={habitsHistoryCopy.chartDayAria(
                day.date,
                day.completed,
                day.total,
                day.percent,
              )}
              title={habitsHistoryCopy.chartDayAria(
                day.date,
                day.completed,
                day.total,
                day.percent,
              )}
            >
              <span className="habits-daily-bar-wd" aria-hidden>
                {dayWeekdayLetter(day.date)}
              </span>
              <span className="habits-daily-bar-track" aria-hidden>
                <span
                  className="habits-daily-bar-fill"
                  style={{ height: `${height}%` }}
                />
              </span>
              <span
                className={`habits-daily-bar-day${showLabel ? '' : ' is-hidden'}`}
                aria-hidden
              >
                {dayOfMonth(day.date)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function HabitHeatRow({
  habit,
  atRisk,
  reason,
  onCheckIn,
  onSelectDate,
}: {
  habit: HabitProgressRow
  atRisk: boolean
  reason?: HabitAttention['reason']
  onCheckIn?: () => void
  onSelectDate?: (date: string) => void
}) {
  return (
    <div className={`habits-history-row${atRisk ? ' is-at-risk' : ''}`}>
      <div className="habits-history-row-meta">
        <div className="habits-history-row-heading">
          <strong className="habits-history-row-title">{habit.title}</strong>
          {habit.streak > 0 && (
            <span className="habits-history-streak-chip">
              {habitsHistoryCopy.streak(habit.streak)}
            </span>
          )}
          {atRisk && reason && (
            <span className="habits-history-risk-chip">
              {attentionReasonLabel(reason)}
            </span>
          )}
        </div>
        <div className="habits-history-row-side">
          <span className="habits-history-row-stats">
            {habitsHistoryCopy.rate(
              habit.completedDays,
              habit.trackedDays,
              habit.percent,
            )}
          </span>
          {atRisk && onCheckIn && (
            <Button size="compact-xs" variant="light" onClick={onCheckIn}>
              {habitsHistoryCopy.openToday}
            </Button>
          )}
        </div>
      </div>
      <div className="habits-history-row-progress" aria-hidden>
        <span
          className="habits-history-row-progress-fill"
          style={{ width: `${habit.percent}%` }}
        />
      </div>
      <div
        className="habits-history-cells"
        role="list"
        aria-label={`${habit.title} last ${habit.cells.length} days`}
      >
        {habit.cells.map((cell) => {
          const state = !cell.tracked
            ? 'untracked'
            : cell.completed
              ? 'done'
              : 'missed'
          return (
            <button
              key={cell.date}
              type="button"
              role="listitem"
              className={`habits-history-cell is-${state}`}
              title={habitsHistoryCopy.cellAria(
                habit.title,
                cell.date,
                cell.completed,
                cell.tracked,
              )}
              aria-label={habitsHistoryCopy.cellAria(
                habit.title,
                cell.date,
                cell.completed,
                cell.tracked,
              )}
              disabled={!cell.tracked}
              onClick={() => {
                if (cell.tracked) onSelectDate?.(cell.date)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

export function HabitsView({
  focusDate,
  onCheckInToday,
  onSelectDate,
  embedded = false,
  hideActionQueue = false,
  initialData = null,
}: Props) {
  const [days, setDays] = useState(28)
  const [data, setData] = useState<HabitsProgress | null>(
    initialData && initialData.days === 28 ? initialData : null,
  )
  const [loading, setLoading] = useState(
    !(initialData && initialData.days === 28),
  )
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const activeDate = focusDate || localISODate()

  useEffect(() => {
    if (days === 28 && initialData && initialData.days === 28) {
      setData(initialData)
      setLoading(false)
      setError(null)
      return
    }
    if (days === 28 && !initialData) {
      setLoading(true)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    void api
      .getHabitsProgress(days)
      .then((res) => {
        if (requestId.current !== id) return
        setData(res)
      })
      .catch(() => {
        if (requestId.current !== id) return
        setData(null)
        setError(habitsHistoryCopy.error)
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false)
      })
  }, [days, initialData])

  async function retry() {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const res = await api.getHabitsProgress(days)
      if (requestId.current !== id) return
      setData(res)
    } catch {
      if (requestId.current !== id) return
      setData(null)
      setError(habitsHistoryCopy.error)
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }

  const overview = data ? habitsOverview(data) : null
  const insight = useMemo(
    () => (data ? habitInsight(data, activeDate) : null),
    [data, activeDate],
  )
  const attention = useMemo(
    () => (data ? habitsNeedingAttention(data, activeDate) : []),
    [data, activeDate],
  )
  const attentionById = useMemo(() => {
    const map = new Map<string, HabitAttention>()
    for (const item of attention) map.set(item.id, item)
    return map
  }, [attention])
  const sortedHabits = useMemo(
    () =>
      data
        ? sortHabitsForAction(data.habits, insight?.focusHabitIds ?? [])
        : [],
    [data, insight?.focusHabitIds],
  )

  function runInsightAction() {
    if (!insight) return
    if (insight.action === 'check_in_today') {
      onCheckInToday?.()
      return
    }
    if (insight.action === 'open_day' && insight.date) {
      onSelectDate?.(insight.date)
    }
  }

  const insightTone =
    insight?.action === 'none'
      ? 'success'
      : insight?.action === 'check_in_today'
        ? 'action'
        : 'start'

  return (
    <div className={`habits-history-view${embedded ? ' is-embedded' : ''}`}>
      <header className="habits-history-header">
        <div>
          {!embedded && <h2>{habitsHistoryCopy.title}</h2>}
          <p className="habits-history-subtitle">{habitsHistoryCopy.subtitle}</p>
        </div>
        <SegmentedControl
          size="xs"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          data={[...RANGE_OPTIONS]}
          aria-label={habitsHistoryCopy.rangeAria}
        />
      </header>

      {loading && <p className="panel-empty">{habitsHistoryCopy.loading}</p>}

      {!loading && error && (
        <div className="empty">
          <p>{error}</p>
          <Button variant="default" size="xs" onClick={() => void retry()}>
            {habitsHistoryCopy.retry}
          </Button>
        </div>
      )}

      {!loading && !error && data && data.habits.length === 0 && (
        <p className="panel-empty">{habitsHistoryCopy.empty}</p>
      )}

      {!loading && !error && data && overview && insight && data.habits.length > 0 && (
        <>
          {!hideActionQueue && (
            <div className="habits-action-band">
              <div className="habits-action-primary">
                <HabitInsightCard
                  title={insight.title}
                  detail={insight.detail}
                  ctaLabel={insight.ctaLabel}
                  tone={insightTone}
                  onAction={
                    insight.action === 'none'
                      ? undefined
                      : () => runInsightAction()
                  }
                />
                <AttentionList items={attention} onCheckIn={onCheckInToday} />
              </div>
              <OverviewStrip overview={overview} />
            </div>
          )}

          {hideActionQueue && <OverviewStrip overview={overview} />}

          <div className="habits-evidence-band">
            <DailyChart days={data.daily} onSelectDate={onSelectDate} />

            <section
              className="habits-per-habit"
              aria-label={habitsHistoryCopy.perHabitTitle}
            >
              <header className="habits-section-head">
                <div>
                  <h3>{habitsHistoryCopy.perHabitTitle}</h3>
                  <p>{habitsHistoryCopy.perHabitSubtitle}</p>
                </div>
                <div className="habits-history-legend" aria-hidden>
                  <span>
                    <i className="habits-history-swatch is-done" />
                    {habitsHistoryCopy.legendDone}
                  </span>
                  <span>
                    <i className="habits-history-swatch is-missed" />
                    {habitsHistoryCopy.legendMissed}
                  </span>
                  <span>
                    <i className="habits-history-swatch is-untracked" />
                    {habitsHistoryCopy.legendFuture}
                  </span>
                </div>
              </header>

              <div className="habits-history-list">
                {sortedHabits.map((habit) => {
                  const item = attentionById.get(habit.id)
                  return (
                    <HabitHeatRow
                      key={habit.id}
                      habit={habit}
                      atRisk={Boolean(item)}
                      reason={item?.reason}
                      onCheckIn={onCheckInToday}
                      onSelectDate={onSelectDate}
                    />
                  )
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
