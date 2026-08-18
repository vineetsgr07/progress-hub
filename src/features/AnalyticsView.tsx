import { useEffect, useMemo, useState } from 'react'
import { Button } from '@mantine/core'
import type { HabitsProgress, Stats } from '../types'
import { formatHoursShort } from '../utils/date'
import {
  analyticsCopy,
  analyticsNudge,
  budgetWeekPulse,
  streakLabel,
} from './analytics-copy'
import { BudgetChart } from './BudgetChart'
import { AttentionList, HabitsView } from './HabitsView'
import { habitsNeedingAttention } from './habits-overview'

type Props = {
  stats: Stats | null
  habitsProgress: HabitsProgress | null
  loading: boolean
  date: string
  onSelectDate?: (date: string) => void
  onGoToday?: () => void
  onOpenTaskId?: (taskId: string) => void
  preferHabitDetail?: boolean
}

export function AnalyticsView({
  stats,
  habitsProgress,
  loading,
  date,
  onSelectDate,
  onGoToday,
  onOpenTaskId,
  preferHabitDetail = false,
}: Props) {
  const [habitDetailOpen, setHabitDetailOpen] = useState(preferHabitDetail)
  const [recentDaysOpen, setRecentDaysOpen] = useState(false)

  useEffect(() => {
    if (preferHabitDetail) setHabitDetailOpen(true)
  }, [preferHabitDetail])

  const habitAttention = useMemo(
    () =>
      habitsProgress ? habitsNeedingAttention(habitsProgress, date) : [],
    [habitsProgress, date],
  )

  if (loading) {
    return <div className="empty">Loading analytics…</div>
  }

  if (!stats) {
    return (
      <div className="empty">
        Couldn’t load analytics. Check that the app server is running, then try
        again.
      </div>
    )
  }

  const insight = stats.insight
  const budget = insight?.todayBudget
  const goals = insight?.goals
  const series = insight?.budgetSeries ?? []
  const unfinished = insight?.unfinishedDaily ?? []
  const nudge = analyticsNudge(stats)
  const pulse = budgetWeekPulse(series)
  const hasActionQueue = unfinished.length > 0 || habitAttention.length > 0
  const rangeHint =
    insight?.rangeStart && insight?.rangeEnd
      ? analyticsCopy.hoursRangeHint(insight.rangeStart, insight.rangeEnd)
      : null
  const maxCategoryHours = Math.max(
    ...stats.byCategory.map((r) => Number(r.hours) || 0),
    0,
  )
  const maxProjectHours = Math.max(
    ...stats.byProject.map((r) => Number(r.hours) || 0),
    0,
  )
  const categoryHoursEmpty = stats.byCategory.every(
    (r) => (Number(r.hours) || 0) <= 0,
  )
  const projectHoursEmpty = stats.byProject.every(
    (r) => (Number(r.hours) || 0) <= 0,
  )

  function runInsightAction() {
    if (nudge.action === 'open_task' && nudge.taskId) {
      onOpenTaskId?.(nudge.taskId)
      return
    }
    if (nudge.action === 'habits') {
      onGoToday?.()
      return
    }
    onGoToday?.()
  }

  const insightTone =
    budget && budget.totalPercent >= 100
      ? 'success'
      : budget && budget.totalHours === 0 && unfinished.length === 0
        ? 'start'
        : ''

  return (
    <div className="analytics-view analytics-dashboard">
      <header className="analytics-page-head">
        <div>
          <h2>{analyticsCopy.pageTitle}</h2>
          <p>{analyticsCopy.pageSubtitle}</p>
        </div>
      </header>

      <section
        className="analytics-action-zone"
        aria-label={analyticsCopy.actionQueueTitle}
      >
        <div
          className={`analytics-nudge analytics-insight ${insightTone}`}
          role="status"
        >
          <div className="analytics-insight-body">
            <strong>{nudge.title}</strong>
            <p>{nudge.detail}</p>
          </div>
          <Button size="sm" onClick={runInsightAction}>
            {nudge.ctaLabel}
          </Button>
        </div>

        {hasActionQueue && (
          <div className="analytics-action-queue">
            <div className="analytics-action-queue-head">
              <h3>{analyticsCopy.actionQueueTitle}</h3>
              <p>{analyticsCopy.actionQueueHint}</p>
            </div>
            <div
              className={`analytics-action-queue-grid${
                unfinished.length > 0 && habitAttention.length > 0
                  ? ' has-two'
                  : ''
              }`}
            >
              {unfinished.length > 0 && (
                <div
                  className="panel analytics-carryover analytics-action-card"
                  aria-label={analyticsCopy.carryoverTitle}
                >
                  <div className="analytics-carryover-header">
                    <h3>{analyticsCopy.carryoverTitle}</h3>
                    <p className="panel-hint">
                      {analyticsCopy.carryoverSummary(
                        unfinished.length,
                        insight?.unfinishedDailyTotalHours ?? 0,
                      )}
                    </p>
                  </div>
                  <ul className="analytics-carryover-list">
                    {unfinished.map((row) => (
                      <li key={row.taskId}>
                        <button
                          type="button"
                          className="analytics-carryover-row"
                          onClick={() => onOpenTaskId?.(row.taskId)}
                        >
                          <div className="analytics-carryover-main">
                            <strong>{row.title}</strong>
                            <span>
                              {analyticsCopy.carryoverRow(
                                row.todayHours,
                                row.totalHours,
                              )}
                            </span>
                          </div>
                          <span className="analytics-carryover-meta">
                            {analyticsCopy.carryoverPriorDays(
                              row.priorIncompleteDays,
                            )}
                            <span className="analytics-carryover-open">
                              {analyticsCopy.carryoverOpen}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {habitAttention.length > 0 && (
                <div className="panel analytics-action-card analytics-habit-actions">
                  <AttentionList
                    items={habitAttention}
                    onCheckIn={onGoToday}
                    compact
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {!budget || !goals ? (
        <div className="analytics-nudge start" role="status">
          <strong>Budget unavailable</strong>
          <p>{analyticsCopy.insightMissing}</p>
        </div>
      ) : (
        <div className="analytics-scorecards">
          <div
            className="analytics-kpi-grid analytics-kpi-grid-primary"
            aria-label={analyticsCopy.budgetTitle}
          >
            <article className="analytics-kpi is-work">
              <label>{analyticsCopy.workLabel}</label>
              <strong>{formatHoursShort(budget.workHours)}h</strong>
              <span>{analyticsCopy.kpiWorkSub(budget.workTarget)}</span>
              <div className="analytics-kpi-track" aria-hidden>
                <div
                  className="analytics-kpi-fill"
                  style={{ width: `${budget.workPercent}%` }}
                />
              </div>
              <em>{budget.workPercent}%</em>
            </article>
            <article className="analytics-kpi is-habit">
              <label>{analyticsCopy.habitsLabel}</label>
              <strong>{formatHoursShort(budget.habitBudgetHours)}h</strong>
              <span>
                {analyticsCopy.kpiHabitSub(
                  budget.habitCompleted,
                  budget.habitTotal,
                  budget.habitTarget,
                )}
              </span>
              <div className="analytics-kpi-track" aria-hidden>
                <div
                  className="analytics-kpi-fill"
                  style={{ width: `${budget.habitPercent}%` }}
                />
              </div>
              <em>{budget.habitPercent}%</em>
            </article>
            <article className="analytics-kpi is-streak">
              <label>{analyticsCopy.streakLabel}</label>
              <strong>{stats.streak > 0 ? stats.streak : '—'}</strong>
              <span>{streakLabel(stats.streak)}</span>
              <div className="analytics-kpi-meta">
                Tasks today {stats.today.completed}/{stats.today.total}
              </div>
            </article>
          </div>
          <p className="analytics-total-caption">
            {analyticsCopy.totalCaption(budget.totalHours, budget.totalTarget)}
          </p>
          <p className="analytics-budget-caption">{analyticsCopy.budgetHint}</p>
        </div>
      )}

      <div className="panel-grid analytics-breakdown-grid">
        <div className="panel">
          <h3>{analyticsCopy.hoursByCategoryTitle}</h3>
          {rangeHint && <p className="panel-hint">{rangeHint}</p>}
          {categoryHoursEmpty && (
            <p className="panel-empty">{analyticsCopy.hoursEmptyCategory}</p>
          )}
          {!categoryHoursEmpty &&
            stats.byCategory.map((row) => {
              const hours = Number(row.hours) || 0
              if (hours <= 0) return null
              const width =
                maxCategoryHours > 0
                  ? Math.max(6, (hours / maxCategoryHours) * 100)
                  : 6
              const share = row.sharePercent ?? 0
              const prior = row.priorHours ?? 0
              return (
                <div className="bar-row" key={row.category}>
                  <span>{row.category}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${width}%` }} />
                  </div>
                  <span className="bar-meta">
                    <strong>{analyticsCopy.hoursBarValue(hours)}</strong>
                    {share > 0 && (
                      <small>{analyticsCopy.hoursShare(share)}</small>
                    )}
                    <small>
                      {analyticsCopy.hoursPriorDelta(
                        Math.round((hours - prior) * 100) / 100,
                      )}
                    </small>
                    {row.count > 0 && (
                      <small>
                        {analyticsCopy.masterDoneSub(row.done, row.count)}
                      </small>
                    )}
                  </span>
                </div>
              )
            })}
        </div>
        <div className="panel">
          <h3>{analyticsCopy.hoursByProjectTitle}</h3>
          {rangeHint && <p className="panel-hint">{rangeHint}</p>}
          {projectHoursEmpty && (
            <p className="panel-empty">{analyticsCopy.hoursEmptyProject}</p>
          )}
          {!projectHoursEmpty &&
            stats.byProject.map((row) => {
              const hours = Number(row.hours) || 0
              if (hours <= 0) return null
              const width =
                maxProjectHours > 0
                  ? Math.max(6, (hours / maxProjectHours) * 100)
                  : 6
              const share = row.sharePercent ?? 0
              const prior = row.priorHours ?? 0
              return (
                <div className="bar-row" key={row.projectTag}>
                  <span>{row.projectTag || '—'}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${width}%` }} />
                  </div>
                  <span className="bar-meta">
                    <strong>{analyticsCopy.hoursBarValue(hours)}</strong>
                    {share > 0 && (
                      <small>{analyticsCopy.hoursShare(share)}</small>
                    )}
                    <small>
                      {analyticsCopy.hoursPriorDelta(
                        Math.round((hours - prior) * 100) / 100,
                      )}
                    </small>
                    {row.count > 0 && (
                      <small>
                        {analyticsCopy.masterDoneSub(row.done, row.count)}
                      </small>
                    )}
                  </span>
                </div>
              )
            })}
        </div>
      </div>

      <div className="panel week-panel analytics-chart-panel">
        <div className="analytics-panel-head">
          <div>
            <h3>{analyticsCopy.chartTitle}</h3>
            <p className="panel-hint">{analyticsCopy.chartSubtitle}</p>
          </div>
        </div>
        <BudgetChart
          series={series}
          selectedDate={date}
          onSelectDate={onSelectDate}
        />
        {pulse.days > 0 && (
          <div
            className="analytics-pulse-row"
            aria-label={analyticsCopy.weekPulseTitle}
          >
            <div className="analytics-pulse-chip">
              {analyticsCopy.weekAvgWork(pulse.avgWork)}
            </div>
            <div className="analytics-pulse-chip">
              {analyticsCopy.weekAvgHabit(pulse.avgHabit)}
            </div>
            <div className="analytics-pulse-chip">
              {analyticsCopy.weekWorkHits(pulse.workHits, pulse.days)}
            </div>
            <div className="analytics-pulse-chip">
              {analyticsCopy.weekHabitHits(pulse.habitHits, pulse.days)}
            </div>
          </div>
        )}
      </div>

      <div className="panel analytics-habit-detail">
        <div className="analytics-habit-detail-head">
          <div>
            <h3>{analyticsCopy.habitDetailTitle}</h3>
            <p className="panel-hint">{analyticsCopy.habitDetailHint}</p>
          </div>
          <Button
            variant="default"
            size="xs"
            onClick={() => setHabitDetailOpen((v) => !v)}
            aria-expanded={habitDetailOpen}
          >
            {habitDetailOpen
              ? analyticsCopy.habitDetailClose
              : analyticsCopy.habitDetailOpen}
          </Button>
        </div>
        {habitDetailOpen && (
          <HabitsView
            embedded
            hideActionQueue
            initialData={habitsProgress}
            focusDate={date}
            onCheckInToday={onGoToday}
            onSelectDate={(d) => {
              onSelectDate?.(d)
            }}
          />
        )}
      </div>

      <div className="panel analytics-recent-days">
        <div className="analytics-habit-detail-head">
          <div>
            <h3>{analyticsCopy.recentDaysTitle}</h3>
          </div>
          <Button
            variant="default"
            size="xs"
            onClick={() => setRecentDaysOpen((v) => !v)}
            aria-expanded={recentDaysOpen}
          >
            {recentDaysOpen
              ? analyticsCopy.recentDaysClose
              : analyticsCopy.recentDaysOpen}
          </Button>
        </div>
        {recentDaysOpen && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Completed</th>
                  <th>Total</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {stats.history.map((row) => (
                  <tr
                    key={row.date}
                    className={row.date === date ? 'selected-row' : ''}
                  >
                    <td>{row.date}</td>
                    <td>{row.completed}</td>
                    <td>{row.total}</td>
                    <td>{row.hours}</td>
                  </tr>
                ))}
                {stats.history.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      No logged days yet — start a timer or mark a task done.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
