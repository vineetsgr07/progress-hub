import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Button, Text, TextInput } from '@mantine/core'
import {
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react'
import { api } from '../api'
import type { WeekDayPoint, WeekProgress } from '../types'
import { formatHoursShort, localISODate } from '../utils/date'
import {
  deltaLabel,
  shiftISODateLocal,
  startOfIsoWeek,
  weekCopy,
  weekRangeLabel,
} from './progress-copy'

type Props = {
  date: string
  week: WeekProgress | null
  onWeekChange?: (week: WeekProgress) => void
  onOpenAnalytics?: () => void
  onSelectDate?: (date: string) => void
  onError?: (message: string) => void
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

function WeekBars({
  days,
  selectedDate,
  onSelectDate,
}: {
  days: WeekDayPoint[]
  selectedDate: string
  onSelectDate?: (date: string) => void
}) {
  return (
    <div className="week-bars" role="img" aria-label={weekCopy.chartAria}>
      {days.map((day) => {
        const selected = day.date === selectedDate
        const height =
          day.isFuture || day.total <= 0 ? 0 : Math.max(8, day.percent)
        const hasGoal = Boolean(day.goal.trim())
        return (
          <button
            key={day.date}
            type="button"
            className={[
              'week-bar',
              selected ? 'selected' : '',
              day.isToday ? 'is-today' : '',
              day.isFuture ? 'is-future' : '',
              day.percent >= 100 && day.total > 0 ? 'is-complete' : '',
              day.total > 0 && !day.isFuture ? 'has-progress' : '',
              hasGoal ? 'has-goal' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelectDate?.(day.date)}
            aria-label={weekCopy.dayAria(
              day.label,
              day.dayOfMonth,
              day.completed,
              day.total,
              day.percent,
            )}
            aria-current={selected ? 'date' : undefined}
          >
            <span className="week-bar-wd">{day.label.slice(0, 1)}</span>
            <div className="week-bar-track">
              <div
                className="week-bar-fill"
                style={{ height: `${height}%` }}
              />
            </div>
            <span className="week-bar-day">{day.dayOfMonth}</span>
            {hasGoal ? <span className="week-bar-goal-dot" aria-hidden /> : null}
          </button>
        )
      })}
    </div>
  )
}

export function ProgressPanel({
  date,
  week: weekProp,
  onWeekChange,
  onOpenAnalytics,
  onSelectDate,
  onError,
}: Props) {
  /** Local week cursor — chevrons move this without changing App `date`. */
  const [viewWeekAnchor, setViewWeekAnchor] = useState(date)
  const [pagedWeek, setPagedWeek] = useState<WeekProgress | null>(null)
  const [loading, setLoading] = useState(weekProp == null)
  const [error, setError] = useState<string | null>(null)
  const [goalDraft, setGoalDraft] = useState('')
  const [goalSaving, setGoalSaving] = useState(false)
  const requestId = useRef(0)
  const savedGoalRef = useRef('')
  const viewingStart = startOfIsoWeek(viewWeekAnchor)
  const usingBootstrap = weekProp != null && weekProp.weekStart === viewingStart
  const waitingForBootstrap =
    weekProp == null && viewingStart === startOfIsoWeek(date)
  const week = usingBootstrap ? weekProp : pagedWeek
  const weekRef = useRef<WeekProgress | null>(week)
  weekRef.current = week

  // Toolbar / day-bar selection follows into the panel’s week cursor.
  useEffect(() => {
    setViewWeekAnchor(date)
  }, [date])

  // Instantly swap the goal when the selected day is in the loaded week.
  useEffect(() => {
    const current = weekRef.current
    if (!current) return
    const day = current.days.find((d) => d.date === date)
    if (!day) return
    savedGoalRef.current = day.goal
    setGoalDraft(day.goal)
  }, [date, week])

  useEffect(() => {
    if (waitingForBootstrap) {
      setLoading(true)
      setError(null)
      return
    }
    if (usingBootstrap) {
      setPagedWeek(null)
      setLoading(false)
      setError(null)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    void api
      .getWeekProgress(viewWeekAnchor)
      .then((res) => {
        if (requestId.current !== id) return
        setPagedWeek(res)
        setError(null)
        const dayGoal = res.days.find((d) => d.date === date)?.goal
        if (dayGoal !== undefined) {
          savedGoalRef.current = dayGoal
          setGoalDraft(dayGoal)
        }
      })
      .catch(() => {
        if (requestId.current !== id) return
        if (!weekRef.current) setPagedWeek(null)
        setError(weekCopy.error)
      })
      .finally(() => {
        if (requestId.current !== id) return
        setLoading(false)
      })
  }, [viewWeekAnchor, usingBootstrap, waitingForBootstrap, date])

  function applyWeek(next: WeekProgress) {
    if (usingBootstrap) onWeekChange?.(next)
    else setPagedWeek(next)
  }

  async function retry() {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const res = await api.getWeekProgress(viewWeekAnchor)
      if (requestId.current !== id) return
      applyWeek(res)
      const dayGoal = res.days.find((d) => d.date === date)?.goal ?? ''
      if (res.days.some((d) => d.date === date)) {
        savedGoalRef.current = dayGoal
        setGoalDraft(dayGoal)
      }
    } catch {
      if (requestId.current !== id) return
      if (!weekRef.current && !usingBootstrap) setPagedWeek(null)
      setError(weekCopy.error)
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }

  async function saveGoal(next: string) {
    const trimmed = next.trim()
    const previous = savedGoalRef.current
    if (trimmed === previous.trim()) {
      setGoalDraft(previous)
      return
    }
    setGoalSaving(true)
    const current = weekRef.current
    if (current) {
      applyWeek({
        ...current,
        days: current.days.map((d) =>
          d.date === date ? { ...d, goal: trimmed } : d,
        ),
      })
    }
    savedGoalRef.current = trimmed
    try {
      const res = await api.setGoal(date, trimmed)
      savedGoalRef.current = res.goal
      setGoalDraft(res.goal)
      const latest = weekRef.current
      if (latest) {
        applyWeek({
          ...latest,
          days: latest.days.map((d) =>
            d.date === date ? { ...d, goal: res.goal } : d,
          ),
        })
      }
    } catch {
      savedGoalRef.current = previous
      setGoalDraft(previous)
      const latest = weekRef.current
      if (latest) {
        applyWeek({
          ...latest,
          days: latest.days.map((d) =>
            d.date === date ? { ...d, goal: previous } : d,
          ),
        })
      }
      onError?.(weekCopy.error)
    } finally {
      setGoalSaving(false)
    }
  }

  const today = localISODate()
  const thisWeekStart = startOfIsoWeek(today)
  const viewingWeekStart =
    week?.weekStart ?? startOfIsoWeek(viewWeekAnchor)
  const isCurrentWeek = viewingWeekStart === thisWeekStart
  const isViewingToday = date === today
  const canGoNext = viewingWeekStart < thisWeekStart
  const showJumpToday =
    !isViewingToday || viewingWeekStart !== thisWeekStart
  const selectedDay = week?.days.find((d) => d.date === date) ?? null

  function goPrevWeek() {
    setViewWeekAnchor(shiftISODateLocal(viewingWeekStart, -7))
  }

  function goNextWeek() {
    if (!canGoNext) return
    const next = shiftISODateLocal(viewingWeekStart, 7)
    setViewWeekAnchor(next > today ? today : next)
  }

  function goToday() {
    setViewWeekAnchor(today)
    onSelectDate?.(today)
  }

  return (
    <aside className="progress-panel panel week-panel-hero" aria-label={weekCopy.title}>
      <div className="progress-panel-header">
        <div className="week-panel-title-block">
          <h3>{isCurrentWeek ? weekCopy.title : weekCopy.titlePast}</h3>
          {week && (
            <p className="week-panel-range" aria-live="polite">
              {weekRangeLabel(week.weekStart, week.weekEnd)}
            </p>
          )}
        </div>
        <div className="week-panel-header-actions">
          <div className="week-nav" role="group" aria-label={weekCopy.rangeAria}>
            <ActionIcon
              variant="default"
              size="sm"
              aria-label={weekCopy.prevWeek}
              onClick={goPrevWeek}
            >
              <IconChevronLeft size={14} stroke={1.75} />
            </ActionIcon>
            {showJumpToday && (
              <ActionIcon
                className="week-jump-today"
                variant="light"
                color="teal"
                size="sm"
                aria-label={weekCopy.jumpTodayAria}
                title={weekCopy.jumpToday}
                onClick={goToday}
              >
                <IconCalendarEvent size={14} stroke={1.75} />
              </ActionIcon>
            )}
            <ActionIcon
              variant="default"
              size="sm"
              aria-label={weekCopy.nextWeek}
              onClick={goNextWeek}
              disabled={!canGoNext}
            >
              <IconChevronRight size={14} stroke={1.75} />
            </ActionIcon>
          </div>
          {onOpenAnalytics && (
            <Button variant="subtle" size="compact-xs" onClick={onOpenAnalytics}>
              {weekCopy.linkAnalytics}
            </Button>
          )}
        </div>
      </div>

      {loading && !week && <p className="panel-empty">{weekCopy.loading}</p>}

      {!loading && error && !week && (
        <div className="empty">
          <p>{error}</p>
          <Button variant="default" size="xs" onClick={() => void retry()}>
            {weekCopy.retry}
          </Button>
        </div>
      )}

      {week && (
        <>
          {error && (
            <p className="week-panel-soft-error" role="status">
              {error}{' '}
              <button type="button" className="week-panel-retry-inline" onClick={() => void retry()}>
                {weekCopy.retry}
              </button>
            </p>
          )}
          <div className={`week-hero${loading ? ' is-refreshing' : ''}`}>
            <CompletionRing percent={week.summary.percent} />
            <div className="week-hero-meta">
              <Text fw={650} size="sm">
                {weekCopy.doneOf(week.summary.completed, week.summary.total)}
              </Text>
              <div className="week-chips">
                <span
                  className={`week-chip ${
                    week.summary.percent > week.previous.percent
                      ? 'up'
                      : week.summary.percent < week.previous.percent
                        ? 'down'
                        : ''
                  }`}
                >
                  {deltaLabel(
                    week.summary.percent,
                    week.previous.percent,
                    week.previous.total,
                  )}
                </span>
                <span className="week-chip">
                  {weekCopy.streak(week.streak)}
                </span>
                <span className="week-chip">
                  {weekCopy.hours(formatHoursShort(week.summary.hours))}
                </span>
              </div>
            </div>
          </div>

          {week.summary.total === 0 ? (
            <p className="panel-empty">{weekCopy.empty}</p>
          ) : (
            <WeekBars
              days={week.days}
              selectedDate={date}
              onSelectDate={onSelectDate}
            />
          )}

          {selectedDay ? (
            <div className="week-day-goal">
              <div className="week-day-goal-header">
                <label htmlFor="week-day-goal-input">{weekCopy.dayGoalLabel}</label>
                <span className="week-day-goal-date">
                  {selectedDay.label} {selectedDay.dayOfMonth}
                  {selectedDay.isToday ? ' · Today' : ''}
                </span>
              </div>
              <TextInput
                id="week-day-goal-input"
                className="week-day-goal-input"
                size="xs"
                value={goalDraft}
                placeholder={weekCopy.dayGoalPlaceholder}
                aria-label={weekCopy.dayGoalAria}
                disabled={goalSaving}
                onChange={(e) => setGoalDraft(e.currentTarget.value)}
                onBlur={(e) => void saveGoal(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  }
                }}
              />
              {!goalDraft.trim() && (
                <p className="week-day-goal-hint">{weekCopy.dayGoalEmpty}</p>
              )}
            </div>
          ) : (
            <p className="week-day-goal-hint week-browse-hint">
              {weekCopy.browseHint}
            </p>
          )}
        </>
      )}
    </aside>
  )
}
