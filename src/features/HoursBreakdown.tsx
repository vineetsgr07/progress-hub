import { useId, useMemo, useState } from 'react'
import type { TimeSession } from '../types'
import { formatDuration } from '../utils/date'
import {
  aggregateSessionBlocks,
  blockHue,
  formatStartedClock,
  sessionSharePercent,
  type SessionBlock,
} from './hours-share'
import { timerCopy } from './timer-copy'

const MAX_VISIBLE = 8
const OVERFLOW_LIST = 5
const OVERFLOW_ID = '__overflow__'

type Props = {
  sessions: TimeSession[]
  /** Live tick so running segment widths update. */
  tick?: number
}

function blockSubtitle(block: SessionBlock): string | null {
  const sub = block.subtaskTitle?.trim()
  if (sub) return sub
  const project = block.projectTag?.trim()
  if (project) return project
  return null
}

function blockMeta(block: SessionBlock): string | null {
  const parts: string[] = []
  const priority = block.priority?.trim()
  if (priority) parts.push(priority)
  if (block.sessionCount > 1) {
    parts.push(timerCopy.sessionCount(block.sessionCount))
  }
  const clock = formatStartedClock(block.createdAt)
  if (clock && !block.running) parts.push(timerCopy.startedAt(clock))
  return parts.length > 0 ? parts.join(' · ') : null
}

function BlockDetail({
  block,
  totalHours,
}: {
  block: SessionBlock
  totalHours: number
}) {
  const share = sessionSharePercent(block.displayHours, totalHours)
  const subtitle = blockSubtitle(block)
  const meta = blockMeta(block)
  return (
    <>
      <strong className="hours-breakdown-pop-title">{block.title}</strong>
      {subtitle ? (
        <span className="hours-breakdown-pop-sub">{subtitle}</span>
      ) : null}
      <span className="hours-breakdown-pop-hours">
        {timerCopy.durationAndShare(formatDuration(block.displayHours), share)}
        {block.running ? timerCopy.liveSuffix : ''}
      </span>
      {meta ? <span className="hours-breakdown-pop-meta">{meta}</span> : null}
    </>
  )
}

export function HoursBreakdown({ sessions, tick = 0 }: Props) {
  const labelId = useId()
  const [activeId, setActiveId] = useState<string | null>(null)

  const blocks = useMemo(
    () => aggregateSessionBlocks(sessions, tick),
    [sessions, tick],
  )

  const total = blocks.reduce((sum, b) => sum + b.displayHours, 0)
  const visible = blocks.slice(0, MAX_VISIBLE)
  const overflowBlocks = blocks.slice(MAX_VISIBLE)
  const overflowCount = overflowBlocks.length
  const overflowHours = overflowBlocks.reduce((sum, b) => sum + b.displayHours, 0)
  const overflowListed = overflowBlocks.slice(0, OVERFLOW_LIST)
  const overflowHidden = overflowBlocks.slice(OVERFLOW_LIST)
  const overflowHiddenHours = overflowHidden.reduce(
    (sum, b) => sum + b.displayHours,
    0,
  )

  const activeBlock =
    activeId && activeId !== OVERFLOW_ID
      ? (blocks.find((b) => b.id === activeId) ?? null)
      : null
  const overflowOpen = activeId === OVERFLOW_ID

  if (blocks.length === 0 || total <= 0) return null

  return (
    <div className="hours-breakdown">
      <div
        className="hours-breakdown-strip"
        role="list"
        aria-labelledby={labelId}
        aria-label={timerCopy.sessionStripAria}
      >
        <span id={labelId} className="sr-only">
          {timerCopy.sessionStripAria}
        </span>
        {visible.map((b) => {
          const pct = Math.max(2, (b.displayHours / total) * 100)
          const isActive = activeId === b.id
          const subtitle = blockSubtitle(b)
          return (
            <button
              key={b.id}
              type="button"
              role="listitem"
              className={`hours-breakdown-seg${b.running ? ' is-running' : ''}${isActive ? ' is-active' : ''}`}
              style={{
                flexGrow: pct,
                flexBasis: 0,
                background: blockHue(b),
              }}
              aria-label={`${b.title}${subtitle ? ` — ${subtitle}` : ''}: ${formatDuration(b.displayHours)}`}
              aria-expanded={isActive}
              onMouseEnter={() => setActiveId(b.id)}
              onMouseLeave={() => setActiveId((id) => (id === b.id ? null : id))}
              onFocus={() => setActiveId(b.id)}
              onBlur={() => setActiveId((id) => (id === b.id ? null : id))}
            />
          )
        })}
        {overflowCount > 0 ? (
          <button
            type="button"
            className={`hours-breakdown-more${overflowOpen ? ' is-active' : ''}`}
            aria-label={timerCopy.overflowAria(overflowCount)}
            aria-expanded={overflowOpen}
            onMouseEnter={() => setActiveId(OVERFLOW_ID)}
            onMouseLeave={() =>
              setActiveId((id) => (id === OVERFLOW_ID ? null : id))
            }
            onFocus={() => setActiveId(OVERFLOW_ID)}
            onBlur={() =>
              setActiveId((id) => (id === OVERFLOW_ID ? null : id))
            }
          >
            {timerCopy.moreSessions(overflowCount)}
          </button>
        ) : null}
      </div>

      {activeBlock ? (
        <div className="hours-breakdown-pop" role="tooltip">
          <BlockDetail block={activeBlock} totalHours={total} />
        </div>
      ) : null}

      {overflowOpen ? (
        <div className="hours-breakdown-pop hours-breakdown-pop-overflow" role="tooltip">
          <strong className="hours-breakdown-pop-title">
            {timerCopy.overflowHeading}
          </strong>
          <span className="hours-breakdown-pop-hours">
            {timerCopy.durationAndShare(
              formatDuration(overflowHours),
              sessionSharePercent(overflowHours, total),
            )}
          </span>
          <ul className="hours-breakdown-pop-list">
            {overflowListed.map((b) => (
              <li key={b.id} className="hours-breakdown-pop-list-item">
                <span className="hours-breakdown-pop-list-title">{b.title}</span>
                <span className="hours-breakdown-pop-list-hours">
                  {formatDuration(b.displayHours)}
                </span>
              </li>
            ))}
          </ul>
          {overflowHidden.length > 0 ? (
            <span className="hours-breakdown-pop-meta">
              {timerCopy.overflowRemainder(
                overflowHidden.length,
                formatDuration(overflowHiddenHours),
              )}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
