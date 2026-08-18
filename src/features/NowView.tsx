import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Button, Checkbox, TextInput } from '@mantine/core'
import { IconPin, IconX } from '@tabler/icons-react'
import { api } from '../api'
import type { NowPage, PinnedChecklistItem, Reminder, Task } from '../types'
import { nowCopy } from './now-copy'
import { TimeControl } from './TimeControl'
import { subtaskDisplayHtml, subtaskPlainText } from './subtask-html'

const ICON = { size: 14, stroke: 1.5 } as const

type Props = {
  date: string
  tick: number
  busy?: boolean
  onOpenTask: (task: Task) => void
  onEnsureTask: (task: Task) => void
  onToggleItem: (taskId: string, id: string, done: boolean) => void
  onTogglePin: (taskId: string, id: string, pinned: boolean) => void
  onToggleTimer: (
    taskId: string,
    subtaskId: string,
    action: 'start' | 'stop',
  ) => void | Promise<void>
  onError?: (message: string) => void
  onToast?: (message: string) => void
}

export function NowView({
  date,
  tick,
  busy,
  onOpenTask,
  onEnsureTask,
  onToggleItem,
  onTogglePin,
  onToggleTimer,
  onError,
  onToast,
}: Props) {
  const [page, setPage] = useState<NowPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftTime, setDraftTime] = useState('')
  const requestId = useRef(0)

  async function load() {
    const id = ++requestId.current
    setError(null)
    setLoading(true)
    try {
      const next = await api.getNow(date)
      if (id !== requestId.current) return
      setPage(next)
    } catch {
      if (id !== requestId.current) return
      const message =
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? nowCopy.loadError
          : nowCopy.loadError
      setError(message)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [date])

  async function addReminder() {
    const title = draft.trim()
    if (!title || busy) return
    try {
      const created = await api.createReminder({
        title,
        dueDate: date,
        dueTime: draftTime || null,
      })
      setDraft('')
      setDraftTime('')
      setPage((prev) =>
        prev
          ? { ...prev, reminders: [...prev.reminders, created] }
          : { date, items: [], reminders: [created] },
      )
    } catch {
      onError?.(nowCopy.reminderFailed)
    }
  }

  const items = page?.items ?? []
  const reminders = page?.reminders ?? []

  function liveHours(item: PinnedChecklistItem) {
    const base = item.hours ?? 0
    if (!item.timerStartedAt || item.timerSubtaskId !== item.id) return base
    const started = new Date(item.timerStartedAt).getTime()
    if (!Number.isFinite(started)) return base
    void tick
    return base + (Date.now() - started) / 3_600_000
  }

  return (
    <div className="now-view">
      {loading && !page ? (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      ) : null}

      {error ? (
        <div className="now-error">
          <p>{error}</p>
          <Button variant="default" size="xs" onClick={() => void load()}>
            {nowCopy.retry}
          </Button>
        </div>
      ) : null}

      <section className="now-section" aria-labelledby="now-tasks-title">
        <h2 id="now-tasks-title" className="now-section-title">
          {nowCopy.tasks}
        </h2>
        {!loading && items.length === 0 ? (
          <p className="now-empty">{nowCopy.emptyTasks}</p>
        ) : null}
        {items.length > 0 ? (
          <ul className="now-list">
            {items.map((item) => {
              const plain = subtaskPlainText(item.title)
              const running =
                Boolean(item.timerStartedAt) && item.timerSubtaskId === item.id
              return (
                <li
                  key={item.id}
                  className={`now-item${item.done ? ' is-done' : ''}`}
                >
                  <Checkbox
                    size="xs"
                    checked={item.done}
                    disabled={busy}
                    aria-label={
                      item.done
                        ? `${nowCopy.markNotDone}: ${plain}`
                        : `${nowCopy.markDone}: ${plain}`
                    }
                    onChange={() => {
                      onToggleItem(item.taskId, item.id, !item.done)
                      setPage((prev) =>
                        prev
                          ? {
                              ...prev,
                              items: prev.items.filter((row) => row.id !== item.id),
                            }
                          : prev,
                      )
                    }}
                  />
                  <div className="now-item-body">
                    <button
                      type="button"
                      className="now-item-title"
                      aria-label={nowCopy.openTask(item.taskTitle)}
                      onClick={() => {
                        onEnsureTask(item.task)
                        onOpenTask(item.task)
                      }}
                    >
                      <span
                        className="now-item-title-html"
                        dangerouslySetInnerHTML={{
                          __html: subtaskDisplayHtml(item.title),
                        }}
                      />
                    </button>
                    <span className="now-item-parent">{item.taskTitle}</span>
                  </div>
                  <div className="now-item-actions">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      className="subtask-pin is-pinned"
                      aria-label={nowCopy.unpin}
                      title={nowCopy.unpin}
                      disabled={busy}
                      onClick={() => {
                        onTogglePin(item.taskId, item.id, false)
                        setPage((prev) =>
                          prev
                            ? {
                                ...prev,
                                items: prev.items.filter((row) => row.id !== item.id),
                              }
                            : prev,
                        )
                        onToast?.(nowCopy.unpinnedToast)
                      }}
                    >
                      <IconPin {...ICON} />
                    </ActionIcon>
                    <TimeControl
                      compact
                      idleIconOnly
                      running={running}
                      hours={liveHours(item)}
                      busy={busy}
                      onToggleTimer={() => {
                        void (async () => {
                          onEnsureTask(item.task)
                          await onToggleTimer(
                            item.taskId,
                            item.id,
                            running ? 'stop' : 'start',
                          )
                          await load()
                        })()
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>

      <section className="now-section" aria-labelledby="now-reminders-title">
        <h2 id="now-reminders-title" className="now-section-title">
          {nowCopy.reminders}
        </h2>
        {!loading && reminders.length === 0 ? (
          <p className="now-empty">{nowCopy.emptyReminders}</p>
        ) : null}
        {reminders.length > 0 ? (
          <ul className="now-list">
            {reminders.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                busy={busy}
                onToggle={async (done) => {
                  try {
                    const updated = await api.updateReminder(reminder.id, { done })
                    setPage((prev) =>
                      prev
                        ? {
                            ...prev,
                            reminders: done
                              ? prev.reminders.filter((r) => r.id !== reminder.id)
                              : prev.reminders.map((r) =>
                                  r.id === reminder.id ? updated : r,
                                ),
                          }
                        : prev,
                    )
                  } catch {
                    onError?.(nowCopy.reminderFailed)
                  }
                }}
                onDelete={async () => {
                  try {
                    await api.deleteReminder(reminder.id)
                    setPage((prev) =>
                      prev
                        ? {
                            ...prev,
                            reminders: prev.reminders.filter(
                              (r) => r.id !== reminder.id,
                            ),
                          }
                        : prev,
                    )
                    onToast?.(nowCopy.reminderDeleted)
                  } catch {
                    onError?.(nowCopy.reminderFailed)
                  }
                }}
              />
            ))}
          </ul>
        ) : null}
        <div className="now-reminder-add">
          <TextInput
            placeholder={nowCopy.addPlaceholder}
            size="xs"
            value={draft}
            disabled={busy}
            aria-label={nowCopy.addReminder}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addReminder()
              }
            }}
          />
          <input
            type="time"
            className="now-reminder-time"
            value={draftTime}
            aria-label={nowCopy.timeAria}
            disabled={busy}
            onChange={(e) => setDraftTime(e.currentTarget.value)}
          />
          <Button
            variant="default"
            size="xs"
            disabled={busy || !draft.trim()}
            onClick={() => void addReminder()}
          >
            {nowCopy.addReminder}
          </Button>
        </div>
      </section>
    </div>
  )
}

function ReminderRow({
  reminder,
  busy,
  onToggle,
  onDelete,
}: {
  reminder: Reminder
  busy?: boolean
  onToggle: (done: boolean) => void
  onDelete: () => void
}) {
  return (
    <li className={`now-item now-reminder${reminder.done ? ' is-done' : ''}`}>
      <Checkbox
        size="xs"
        checked={reminder.done}
        disabled={busy}
        aria-label={
          reminder.done
            ? `${nowCopy.markNotDone}: ${reminder.title}`
            : `${nowCopy.markDone}: ${reminder.title}`
        }
        onChange={() => onToggle(!reminder.done)}
      />
      <div className="now-item-body">
        <span className="now-item-title">{reminder.title}</span>
        {reminder.dueTime ? (
          <span className="now-item-parent">{reminder.dueTime}</span>
        ) : null}
      </div>
      <div className="now-item-actions">
        <ActionIcon
          color="red"
          variant="subtle"
          size="sm"
          aria-label={`${nowCopy.deleteReminder}: ${reminder.title}`}
          disabled={busy}
          onClick={onDelete}
        >
          <IconX {...ICON} />
        </ActionIcon>
      </div>
    </li>
  )
}
