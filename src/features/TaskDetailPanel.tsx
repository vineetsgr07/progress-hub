import {
  ActionIcon,
  Button,
  Select,
  TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconGripHorizontal,
  IconGripVertical,
  IconSwitchHorizontal,
  IconSwitchVertical,
  IconX,
} from '@tabler/icons-react'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Priority, Subtask } from '../types'
import { formatDuration } from '../utils/date'
import { FocusChecklist } from './FocusChecklist'
import { FocusNotes } from './FocusNotes'
import { FocusPomodoro } from './FocusPomodoro'
import { FocusSmile } from './FocusSmile'
import {
  endAtFromNow,
  extendEndAt,
  isCountdownDone,
  remainingMs,
} from './focus-countdown'
import { focusCopy } from './focus-copy'
import {
  FOCUS_DURATION_PRESETS,
  FOCUS_END_SOUNDS,
  FOCUS_END_SOUND_DURATION_PRESETS_SEC,
  FOCUS_EXTEND_MIN,
  type FocusEndSound,
  type FocusEndSoundDurationSec,
  readFocusCountdownSession,
  readFocusDurationMin,
  readFocusEndSound,
  readFocusEndSoundDurationSec,
  readFocusNotesLeft,
  readFocusOnStart,
  writeFocusCountdownSession,
  writeFocusDurationMin,
  writeFocusEndSound,
  writeFocusEndSoundDurationSec,
  writeFocusNotesLeft,
  writeFocusOnStart,
} from './focus-prefs'
import {
  playFocusEndSound,
  signalFocusEnded,
  unlockFocusAudio,
} from './focus-signal'
import { MOTION_BASE_MS, prefersReducedMotion } from './motion'
import { NARROW_MAX_WIDTH } from './notes-copy'
import type { DetailMetaPatch } from './NotesDrawer'
import { RowMeta } from './RowMeta'
import { PRIORITY_TAGS } from './tags'
import { useTagColors } from './TagColorsContext'
import { STATUS_OPTIONS, isTaskStatus, statusSwatch } from './status-ui'
import { taskCopy } from './task-copy'
import type { TaskDetailSize } from './task-detail-prefs'
import {
  TASK_DETAIL_CHECKLIST_SHARE_DEFAULT,
  TASK_DETAIL_CHECKLIST_SHARE_NUDGE,
  clampTaskDetailChecklistShare,
  readTaskDetailChecklistShare,
  readTaskDetailNotesOnTop,
  readTaskDetailSize,
  writeTaskDetailChecklistShare,
  writeTaskDetailNotesOnTop,
  writeTaskDetailSize,
} from './task-detail-prefs'

const WEEKDAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => {
  const d = i + 1
  return { value: String(d), label: String(d) }
})

type Props = {
  taskId: string
  title: string
  notesHtml: string
  subtasks: Subtask[]
  projectTag?: string
  priority?: Priority
  category?: string
  cadenceWeekday?: number | null
  cadenceMonthDay?: number | null
  status?: 'todo' | 'doing' | 'done'
  timerSubtaskId?: string | null
  timerStartedAt?: string | null
  tick?: number
  busy?: boolean
  focusTitle?: boolean
  /** Play / Focus entry forces full size; Pomodoro + smile always show. */
  sessionActive?: boolean
  workedHours?: number
  onClose: () => void
  onSaveNotes: (taskId: string, html: string) => Promise<void> | void
  onMetaChange?: (meta: DetailMetaPatch) => Promise<void>
  onDelete?: () => void
  onToggleSubtask: (subtaskId: string, done: boolean) => void
  onRenameSubtask: (subtaskId: string, title: string) => void
  onAddSubtask: (
    title: string,
    opts?: { afterId?: string },
  ) => Promise<string | void>
  onDeleteSubtask: (subtaskId: string) => void
  onStartSubtaskTimer: (subtaskId: string) => void
  onStopSubtaskTimer: () => void
  onReorderSubtasks: (orderedIds: string[]) => Promise<void>
}

function initEndAt(taskId: string, durationMin: number): number {
  const existing = readFocusCountdownSession()
  if (existing && existing.taskId === taskId && existing.endAt > Date.now()) {
    return existing.endAt
  }
  const next = endAtFromNow(durationMin)
  writeFocusCountdownSession({ taskId, endAt: next })
  return next
}

export function TaskDetailPanel({
  taskId,
  title: titleProp,
  notesHtml,
  subtasks,
  projectTag: projectTagProp,
  priority: priorityProp,
  category: categoryProp,
  cadenceWeekday,
  cadenceMonthDay,
  status: statusProp,
  timerSubtaskId,
  timerStartedAt,
  tick = 0,
  busy,
  focusTitle,
  sessionActive = false,
  workedHours = 0,
  onClose,
  onSaveNotes,
  onMetaChange,
  onDelete,
  onToggleSubtask,
  onRenameSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onStartSubtaskTimer,
  onStopSubtaskTimer,
  onReorderSubtasks,
}: Props) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<HTMLButtonElement>(null)
  const isNarrow = useMediaQuery(`(max-width: ${NARROW_MAX_WIDTH}px)`)
  const [size, setSize] = useState<TaskDetailSize>(() =>
    sessionActive ? 'full' : readTaskDetailSize(),
  )
  const [notesOnTop, setNotesOnTop] = useState(readTaskDetailNotesOnTop)
  const [notesLeft, setNotesLeft] = useState(readFocusNotesLeft)
  const [checklistShare, setChecklistShare] = useState(readTaskDetailChecklistShare)
  const [resizing, setResizing] = useState(false)
  const [title, setTitle] = useState(titleProp)
  const [open, setOpen] = useState(() => prefersReducedMotion())
  const pomoWrapRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)
  const closedRef = useRef(false)
  const exitTimer = useRef<number | null>(null)
  const latestShare = useRef(checklistShare)
  const notesLeftRef = useRef(notesLeft)
  const notesOnTopRef = useRef(notesOnTop)

  const signaledRef = useRef(false)
  const [durationMin, setDurationMin] = useState(readFocusDurationMin)
  const [endAt, setEndAt] = useState(() =>
    initEndAt(taskId, readFocusDurationMin()),
  )
  const [sessionTick, setSessionTick] = useState(0)
  const [flash, setFlash] = useState(false)
  const [customMin, setCustomMin] = useState('')
  const [durationOpen, setDurationOpen] = useState(false)
  const [openOnStart, setOpenOnStart] = useState(readFocusOnStart)
  const [endSound, setEndSound] = useState(readFocusEndSound)
  const [endSoundDurationSec, setEndSoundDurationSec] = useState(
    readFocusEndSoundDurationSec,
  )

  const { frequencies, projects, swatchFor } = useTagColors()
  const category = categoryProp || 'Daily'
  const projectTag = projectTagProp || 'Marketing'
  const priority = priorityProp || 'Medium'
  const taskStatus = statusProp || 'todo'

  const frequencyOptions = frequencies.includes(category)
    ? frequencies
    : [...frequencies, category]
  const projectOptions = projects.includes(projectTag)
    ? projects
    : [...projects, projectTag]

  const effectiveFull = size === 'full' || Boolean(isNarrow)
  /** Desktop: horizontal resize in full, vertical resize in half. */
  const canResizeSplit = !isNarrow
  const verticalSplit = canResizeSplit && !effectiveFull
  const left = remainingMs(endAt)
  void sessionTick
  const sessionDone = isCountdownDone(endAt)

  useEffect(() => {
    latestShare.current = checklistShare
  }, [checklistShare])

  useEffect(() => {
    notesLeftRef.current = notesLeft
  }, [notesLeft])

  useEffect(() => {
    notesOnTopRef.current = notesOnTop
  }, [notesOnTop])

  useEffect(() => {
    setTitle(titleProp)
  }, [taskId, titleProp])

  useEffect(() => {
    signaledRef.current = false
    setFlash(false)
    setEndAt(initEndAt(taskId, readFocusDurationMin()))
    setDurationMin(readFocusDurationMin())
  }, [taskId])

  useEffect(() => {
    if (!sessionActive) return
    setSize('full')
    writeTaskDetailSize('full')
  }, [sessionActive, taskId])

  useEffect(() => {
    const id = window.setInterval(() => setSessionTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    void sessionTick
    writeFocusCountdownSession({ taskId, endAt })
  }, [taskId, endAt, sessionTick])

  useEffect(() => {
    if (!sessionDone || signaledRef.current) return
    signaledRef.current = true
    setFlash(true)
    void signalFocusEnded()
    const clearMs = prefersReducedMotion() ? 1200 : 2400
    const id = window.setTimeout(() => setFlash(false), clearMs)
    return () => window.clearTimeout(id)
  }, [sessionDone, sessionTick])

  useEffect(() => {
    if (prefersReducedMotion()) {
      setOpen(true)
      return
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setOpen(true))
    })
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    return () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current)
    }
  }, [])

  const finishClose = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    if (exitTimer.current) {
      window.clearTimeout(exitTimer.current)
      exitTimer.current = null
    }
    onClose()
  }, [onClose])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    if (durationOpen) {
      setDurationOpen(false)
      return
    }
    if (prefersReducedMotion()) {
      finishClose()
      return
    }
    closingRef.current = true
    setOpen(false)
    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null
      finishClose()
    }, MOTION_BASE_MS)
  }, [finishClose, durationOpen])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        requestClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
        ),
      ]
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestClose])

  async function commitTitle() {
    if (!onMetaChange) return
    const next = title.trim()
    if (!next || next === titleProp.trim()) {
      if (!next) setTitle(titleProp)
      return
    }
    try {
      await onMetaChange({ title: next })
    } catch {
      /* parent surfaces error */
    }
  }

  function onToggleSize() {
    const next: TaskDetailSize = size === 'half' ? 'full' : 'half'
    setSize(next)
    writeTaskDetailSize(next)
  }

  function onSwapPanes() {
    if (effectiveFull) {
      setNotesLeft((prev) => {
        const next = !prev
        writeFocusNotesLeft(next)
        return next
      })
      return
    }
    setNotesOnTop((prev) => {
      const next = !prev
      writeTaskDetailNotesOnTop(next)
      return next
    })
  }

  const applyChecklistShare = useCallback((next: number) => {
    const clamped = clampTaskDetailChecklistShare(next)
    latestShare.current = clamped
    setChecklistShare(clamped)
    return clamped
  }, [])

  const commitChecklistShare = useCallback(
    (next: number) => {
      writeTaskDetailChecklistShare(applyChecklistShare(next))
    },
    [applyChecklistShare],
  )

  const shareFromClientX = useCallback((clientX: number) => {
    const el = stackRef.current
    if (!el) return latestShare.current
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return latestShare.current
    const leftPct = ((clientX - rect.left) / rect.width) * 100
    return notesLeftRef.current ? 100 - leftPct : leftPct
  }, [])

  const shareFromClientY = useCallback((clientY: number) => {
    const el = stackRef.current
    if (!el) return latestShare.current
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) return latestShare.current
    const topPct = ((clientY - rect.top) / rect.height) * 100
    // Top pane share → checklistShare (notes-on-top: top is notes).
    return notesOnTopRef.current ? 100 - topPct : topPct
  }, [])

  useEffect(() => {
    if (!resizing) return

    function onMove(e: PointerEvent) {
      const next = verticalSplit
        ? shareFromClientY(e.clientY)
        : shareFromClientX(e.clientX)
      applyChecklistShare(next)
    }

    function onUp() {
      setResizing(false)
      writeTaskDetailChecklistShare(latestShare.current)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [
    resizing,
    verticalSplit,
    applyChecklistShare,
    shareFromClientX,
    shareFromClientY,
  ])

  useEffect(() => {
    const el = resizeRef.current
    if (!el || !canResizeSplit) return

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const raw = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (raw === 0) return
      const axisDelta =
        raw > 0
          ? TASK_DETAIL_CHECKLIST_SHARE_NUDGE
          : -TASK_DETAIL_CHECKLIST_SHARE_NUDGE
      // Wheel down / right grows the top or left pane edge toward bottom/right.
      const shareDelta = verticalSplit
        ? notesOnTopRef.current
          ? -axisDelta
          : axisDelta
        : notesLeftRef.current
          ? -axisDelta
          : axisDelta
      const next = clampTaskDetailChecklistShare(
        latestShare.current + shareDelta,
      )
      latestShare.current = next
      setChecklistShare(next)
      writeTaskDetailChecklistShare(next)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canResizeSplit, verticalSplit])

  function startResize(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    setResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    const next = verticalSplit
      ? shareFromClientY(e.clientY)
      : shareFromClientX(e.clientX)
    applyChecklistShare(next)
  }

  function nudgeShare(delta: number) {
    commitChecklistShare(latestShare.current + delta)
  }

  function resetShare() {
    commitChecklistShare(TASK_DETAIL_CHECKLIST_SHARE_DEFAULT)
  }

  function applyDuration(minutes: number, opts?: { persist?: boolean }) {
    const persist = opts?.persist !== false
    if (persist) writeFocusDurationMin(minutes)
    setDurationMin(minutes)
    signaledRef.current = false
    setFlash(false)
    const next = endAtFromNow(minutes)
    setEndAt(next)
    writeFocusCountdownSession({ taskId, endAt: next })
    setDurationOpen(false)
    setCustomMin('')
  }

  function restartBlock() {
    applyDuration(durationMin, { persist: false })
  }

  function extendByFive() {
    signaledRef.current = false
    setFlash(false)
    const next = extendEndAt(endAt, FOCUS_EXTEND_MIN)
    setEndAt(next)
    setDurationMin((prev) => prev + FOCUS_EXTEND_MIN)
    writeFocusCountdownSession({ taskId, endAt: next })
    setDurationOpen(false)
  }

  function applyEndSound(kind: FocusEndSound) {
    writeFocusEndSound(kind)
    setEndSound(kind)
    void unlockFocusAudio().then(() => {
      // Short sample so browsing sounds stays comfortable at any ring length.
      playFocusEndSound(kind, { preview: true })
    })
  }

  function applyEndSoundDuration(sec: FocusEndSoundDurationSec) {
    writeFocusEndSoundDurationSec(sec)
    setEndSoundDurationSec(sec)
  }

  function soundDurationLabel(sec: number): string {
    return sec < 60
      ? focusCopy.soundDurationSec(sec)
      : focusCopy.soundDurationMin(Math.round(sec / 60))
  }

  const openClass = open ? ' is-open' : ''
  const sizeClass = effectiveFull ? ' is-full' : ' is-half'
  const flashClass = flash ? ' is-flash' : ''
  const liveClass = sessionDone ? ' is-ended' : ' is-live'
  const resizingClass = resizing ? ' is-resizing' : ''
  const stackClass = effectiveFull
    ? notesLeft
      ? ' is-notes-left'
      : ''
    : notesOnTop
      ? ' is-notes-on-top'
      : ' is-checklist-on-top'

  const leftCol = notesLeft ? 100 - checklistShare : checklistShare
  const topRow = notesOnTop ? 100 - checklistShare : checklistShare
  const stackStyle = canResizeSplit
    ? verticalSplit
      ? {
          gridTemplateRows: `minmax(0, ${topRow}fr) minmax(0, ${100 - topRow}fr)`,
        }
      : {
          gridTemplateColumns: `${leftCol}% ${100 - leftCol}%`,
        }
    : undefined

  const swapAria = effectiveFull
    ? notesLeft
      ? taskCopy.detailSwapChecklistLeft
      : taskCopy.detailSwapNotesLeft
    : notesOnTop
      ? taskCopy.detailSwapChecklistTop
      : taskCopy.detailSwapNotesTop

  const resizeStyle = verticalSplit
    ? { top: `${topRow}%` }
    : { left: `${leftCol}%` }
  const swapStyle = canResizeSplit ? resizeStyle : undefined

  return (
    <>
      <button
        type="button"
        className={`task-detail-backdrop${openClass}${sizeClass}`}
        aria-label={taskCopy.closeBackdrop}
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        className={`task-detail-panel${openClass}${sizeClass} is-session${liveClass}${flashClass}${resizingClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onTransitionEnd={(e) => {
          if (
            e.target !== e.currentTarget ||
            e.propertyName !== 'transform' ||
            open ||
            !closingRef.current
          ) {
            return
          }
          if (exitTimer.current) {
            window.clearTimeout(exitTimer.current)
            exitTimer.current = null
          }
          finishClose()
        }}
      >
        {durationOpen ? (
          <button
            type="button"
            className="task-detail-duration-dismiss"
            aria-label={focusCopy.durationDismiss}
            onClick={() => setDurationOpen(false)}
          />
        ) : null}
        <header className="task-detail-header">
          <div className="task-detail-header-top">
            <div className="task-detail-header-main">
              <TextInput
                id={titleId}
                variant="unstyled"
                className="task-detail-title-input"
                value={title}
                placeholder={taskCopy.titlePlaceholder}
                onChange={(e) => setTitle(e.currentTarget.value)}
                onBlur={() => void commitTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.currentTarget as HTMLInputElement).blur()
                  }
                }}
                autoFocus={focusTitle}
                disabled={busy || !onMetaChange}
              />
            </div>
            {onMetaChange ? (
              <div className="task-detail-meta" role="group" aria-label={taskCopy.detailMetaLabel}>
                <RowMeta
                  value={category}
                  options={frequencyOptions.map((value) => ({
                    value,
                    label: value,
                    swatch: swatchFor('category', value),
                  }))}
                  swatch={swatchFor('category', category)}
                  onSelect={(value) => {
                    const patch: DetailMetaPatch = { category: value }
                    if (value === 'Weekly') {
                      patch.cadenceWeekday = cadenceWeekday ?? 5
                      patch.cadenceMonthDay = null
                    } else if (value === 'Monthly') {
                      patch.cadenceMonthDay = cadenceMonthDay ?? 1
                      patch.cadenceWeekday = null
                    } else {
                      patch.cadenceWeekday = null
                      patch.cadenceMonthDay = null
                    }
                    void onMetaChange(patch)
                  }}
                  ariaLabel={taskCopy.frequency}
                  disabled={busy}
                />
                <RowMeta
                  value={projectTag}
                  options={projectOptions.map((value) => ({
                    value,
                    label: value,
                    swatch: swatchFor('project', value),
                  }))}
                  swatch={swatchFor('project', projectTag)}
                  onSelect={(value) => void onMetaChange({ projectTag: value })}
                  ariaLabel={taskCopy.project}
                  disabled={busy}
                />
                <RowMeta
                  value={priority}
                  options={PRIORITY_TAGS.map((value) => ({
                    value,
                    label: value,
                    swatch: swatchFor('priority', value),
                  }))}
                  swatch={swatchFor('priority', priority)}
                  onSelect={(value) =>
                    void onMetaChange({ priority: value as Priority })
                  }
                  ariaLabel={taskCopy.priority}
                  disabled={busy}
                />
                <RowMeta
                  value={taskStatus}
                  options={STATUS_OPTIONS}
                  swatch={statusSwatch(taskStatus)}
                  onSelect={(value) => {
                    if (!isTaskStatus(value)) return
                    void onMetaChange({ status: value })
                  }}
                  ariaLabel={taskCopy.status}
                  disabled={busy}
                />
              </div>
            ) : null}
            <div className="task-detail-header-actions">
              <span
                className="task-detail-worked"
                title={focusCopy.timeWorked}
                aria-label={`${focusCopy.timeWorked}: ${formatDuration(workedHours)}`}
              >
                <span className="task-detail-worked-value">
                  {formatDuration(workedHours)}
                </span>
              </span>
              <div className="task-detail-pomo-wrap" ref={pomoWrapRef}>
                <FocusPomodoro
                  variant="compact"
                  remainingMs={left}
                  durationMin={durationMin}
                  ended={sessionDone}
                  expanded={durationOpen}
                  onClick={() => setDurationOpen((v) => !v)}
                />
                {durationOpen ? (
                  <div
                    id="focus-duration-panel"
                    className="task-detail-duration-panel"
                    role="dialog"
                    aria-label={focusCopy.durationLabel}
                  >
                    <section className="task-detail-duration-section">
                      <p className="task-detail-duration-heading">
                        {focusCopy.durationPresetsLabel}
                      </p>
                      <div
                        className="task-detail-duration-presets"
                        role="group"
                        aria-label={focusCopy.durationPresetsLabel}
                      >
                        {FOCUS_DURATION_PRESETS.map((m) => {
                          const isActive = durationMin === m
                          return (
                            <button
                              key={m}
                              type="button"
                              className={`focus-mode-chip${isActive ? ' is-active' : ''}`}
                              disabled={busy}
                              aria-pressed={isActive}
                              onClick={() => applyDuration(m)}
                            >
                              {focusCopy.minutes(m)}
                            </button>
                          )
                        })}
                      </div>
                      <div className="task-detail-duration-custom">
                        <TextInput
                          size="xs"
                          type="number"
                          min={1}
                          max={180}
                          className="task-detail-duration-custom-input"
                          placeholder={focusCopy.customPlaceholder}
                          aria-label={focusCopy.customMinutes}
                          value={customMin}
                          disabled={busy}
                          onChange={(e) => setCustomMin(e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            const n = Number(customMin)
                            if (Number.isFinite(n) && n >= 1 && n <= 180) {
                              applyDuration(n)
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="focus-mode-chip is-action"
                          disabled={busy || !customMin.trim()}
                          onClick={() => {
                            const n = Number(customMin)
                            if (Number.isFinite(n) && n >= 1 && n <= 180) {
                              applyDuration(n)
                            }
                          }}
                        >
                          {focusCopy.applyCustom}
                        </button>
                      </div>
                    </section>

                    <section
                      className="task-detail-duration-section is-quiet"
                      aria-label={focusCopy.durationActionsLabel}
                    >
                      <div
                        className="task-detail-duration-actions"
                        role="group"
                        aria-label={focusCopy.durationActionsLabel}
                      >
                        <button
                          type="button"
                          className="focus-mode-chip is-quiet"
                          disabled={busy}
                          aria-label={focusCopy.restartBlockAria}
                          onClick={restartBlock}
                        >
                          {focusCopy.restartBlock}
                        </button>
                        <button
                          type="button"
                          className="focus-mode-chip is-quiet"
                          disabled={busy}
                          aria-label={focusCopy.addFiveAria}
                          onClick={extendByFive}
                        >
                          {focusCopy.addFive}
                        </button>
                      </div>
                    </section>

                    <section className="task-detail-duration-section is-sound">
                      <p className="task-detail-duration-heading">
                        {focusCopy.soundLabel}
                      </p>
                      <div
                        className="task-detail-duration-presets is-sound"
                        role="group"
                        aria-label={focusCopy.soundPickAria}
                      >
                        {FOCUS_END_SOUNDS.map((kind) => {
                          const label =
                            kind === 'off'
                              ? focusCopy.soundOff
                              : kind === 'soft'
                                ? focusCopy.soundSoft
                                : kind === 'chime'
                                  ? focusCopy.soundChime
                                  : focusCopy.soundAlarm
                          const isActive = endSound === kind
                          return (
                            <button
                              key={kind}
                              type="button"
                              className={`focus-mode-chip${isActive ? ' is-active' : ''}`}
                              disabled={busy}
                              aria-pressed={isActive}
                              onClick={() => applyEndSound(kind)}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      {endSound !== 'off' ? (
                        <div className="task-detail-sound-duration">
                          <span
                            className="task-detail-sound-duration-label"
                            id="focus-sound-duration-label"
                          >
                            {focusCopy.soundDurationLabel}
                          </span>
                          <Select
                            size="xs"
                            className="task-detail-sound-duration-select"
                            aria-labelledby="focus-sound-duration-label"
                            aria-label={focusCopy.soundDurationAria}
                            data={FOCUS_END_SOUND_DURATION_PRESETS_SEC.map(
                              (sec) => ({
                                value: String(sec),
                                label: soundDurationLabel(sec),
                              }),
                            )}
                            value={String(endSoundDurationSec)}
                            disabled={busy}
                            allowDeselect={false}
                            checkIconPosition="right"
                            comboboxProps={{
                              withinPortal: false,
                              offset: 6,
                              position: 'bottom-end',
                              middlewares: { flip: false, shift: false },
                            }}
                            onChange={(value) => {
                              const n = Number(value)
                              if (
                                !Number.isFinite(n) ||
                                !(
                                  FOCUS_END_SOUND_DURATION_PRESETS_SEC as readonly number[]
                                ).includes(n)
                              ) {
                                return
                              }
                              applyEndSoundDuration(
                                n as FocusEndSoundDurationSec,
                              )
                            }}
                          />
                        </div>
                      ) : null}
                    </section>
                  </div>
                ) : null}
              </div>
              {!isNarrow && (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label={
                    size === 'half'
                      ? taskCopy.detailExpand
                      : taskCopy.detailShrink
                  }
                  title={
                    size === 'half'
                      ? taskCopy.detailExpand
                      : taskCopy.detailShrink
                  }
                  onClick={onToggleSize}
                >
                  {size === 'half' ? (
                    <IconArrowsMaximize size={16} stroke={1.75} aria-hidden />
                  ) : (
                    <IconArrowsMinimize size={16} stroke={1.75} aria-hidden />
                  )}
                </ActionIcon>
              )}
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={taskCopy.detailClose}
                title={taskCopy.detailClose}
                onClick={requestClose}
              >
                <IconX size={16} stroke={2} aria-hidden />
              </ActionIcon>
            </div>
          </div>

          {sessionDone ? (
            <p className="task-detail-ended-note" role="status">
              {focusCopy.sessionEndedBody}
            </p>
          ) : null}

          {onMetaChange && category === 'Weekly' ? (
            <Select
              className="task-detail-cadence"
              label={taskCopy.cadenceWeekday}
              data={WEEKDAYS}
              value={String(cadenceWeekday ?? 5)}
              onChange={(v) =>
                v && void onMetaChange({ cadenceWeekday: Number(v) })
              }
              size="xs"
              w={160}
              disabled={busy}
            />
          ) : null}
          {onMetaChange && category === 'Monthly' ? (
            <Select
              className="task-detail-cadence"
              label={taskCopy.cadenceMonthDay}
              data={MONTH_DAYS}
              value={String(cadenceMonthDay ?? 1)}
              onChange={(v) =>
                v && void onMetaChange({ cadenceMonthDay: Number(v) })
              }
              size="xs"
              w={140}
              disabled={busy}
            />
          ) : null}
        </header>

        <div
          ref={stackRef}
          className={`task-detail-stack${stackClass}`}
          style={stackStyle}
        >
          <button
            type="button"
            className="task-detail-swap"
            aria-label={swapAria}
            title={taskCopy.detailSwap}
            onClick={onSwapPanes}
            style={swapStyle}
          >
            {effectiveFull ? (
              <IconSwitchHorizontal size={18} stroke={1.75} aria-hidden />
            ) : (
              <IconSwitchVertical size={18} stroke={1.75} aria-hidden />
            )}
          </button>

          {canResizeSplit ? (
            <button
              type="button"
              ref={resizeRef}
              className={`task-detail-resize${verticalSplit ? ' is-vertical' : ''}`}
              aria-label={taskCopy.detailResize}
              title={taskCopy.detailResizeReset}
              style={resizeStyle}
              onPointerDown={startResize}
              onDoubleClick={(e) => {
                e.preventDefault()
                resetShare()
              }}
              onKeyDown={(e) => {
                if (verticalSplit) {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    const topDelta = -TASK_DETAIL_CHECKLIST_SHARE_NUDGE
                    const shareDelta = notesOnTop ? -topDelta : topDelta
                    nudgeShare(shareDelta)
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    const topDelta = TASK_DETAIL_CHECKLIST_SHARE_NUDGE
                    const shareDelta = notesOnTop ? -topDelta : topDelta
                    nudgeShare(shareDelta)
                  } else if (e.key === 'Home') {
                    e.preventDefault()
                    resetShare()
                  }
                  return
                }
                if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  const leftDelta = -TASK_DETAIL_CHECKLIST_SHARE_NUDGE
                  const shareDelta = notesLeft ? -leftDelta : leftDelta
                  nudgeShare(shareDelta)
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  const leftDelta = TASK_DETAIL_CHECKLIST_SHARE_NUDGE
                  const shareDelta = notesLeft ? -leftDelta : leftDelta
                  nudgeShare(shareDelta)
                } else if (e.key === 'Home') {
                  e.preventDefault()
                  resetShare()
                }
              }}
            >
              <span className="task-detail-resize-grip" aria-hidden>
                {verticalSplit ? (
                  <IconGripHorizontal size={16} stroke={1.75} />
                ) : (
                  <IconGripVertical size={16} stroke={1.75} />
                )}
              </span>
            </button>
          ) : null}

          <section
            className="task-detail-pane task-detail-checklist"
            aria-label={taskCopy.detailChecklistLabel}
          >
            <FocusChecklist
              items={subtasks}
              activeTimerSubtaskId={timerSubtaskId}
              timerStartedAt={timerStartedAt}
              tick={tick}
              busy={busy}
              onToggle={onToggleSubtask}
              onRename={onRenameSubtask}
              onAdd={onAddSubtask}
              onDelete={onDeleteSubtask}
              onStartTimer={onStartSubtaskTimer}
              onStopTimer={onStopSubtaskTimer}
              onReorder={onReorderSubtasks}
            />
          </section>

          <section
            className="task-detail-pane task-detail-notes"
            aria-label={taskCopy.detailNotesLabel}
          >
            <FocusNotes
              key={taskId}
              taskId={taskId}
              notesHtml={notesHtml}
              busy={busy}
              onSave={onSaveNotes}
            />
          </section>
        </div>

        <footer className="task-detail-footer">
          {onDelete && (
            <Button
              variant="subtle"
              color="red"
              disabled={busy}
              onClick={onDelete}
            >
              {taskCopy.deleteTask}
            </Button>
          )}
          {sessionActive ? (
            <button
              type="button"
              className="task-detail-session-link"
              onClick={() => {
                const next = !openOnStart
                writeFocusOnStart(next)
                setOpenOnStart(next)
              }}
            >
              {openOnStart ? focusCopy.stayOnList : focusCopy.openOnStart}
            </button>
          ) : null}
          <div className="task-detail-footer-end">
            <Button variant="default" onClick={requestClose}>
              {taskCopy.detailClose}
            </Button>
          </div>
        </footer>

        <FocusSmile taskId={taskId} />
      </div>
    </>
  )
}
