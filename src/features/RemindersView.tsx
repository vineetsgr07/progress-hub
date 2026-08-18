import { useEffect, useRef, useState } from 'react'
import { Button, TextInput } from '@mantine/core'
import { api } from '../api'
import type { Reminder } from '../types'
import { nowCopy } from './now-copy'
import { ReminderList } from './ReminderList'
import { ReminderWhen } from './ReminderWhen'
import { reminderWhenSavedLabel } from './reminder-when'
import { remindersCopy } from './reminders-copy'
import { groupReminderInbox } from './reminders-inbox'

type Props = {
  date: string
  busy?: boolean
  onError?: (message: string) => void
  onToast?: (message: string) => void
}

let remindersCache: Reminder[] | null = null

export function RemindersView({ date, busy, onError, onToast }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>(
    () => remindersCache ?? [],
  )
  const [loading, setLoading] = useState(remindersCache == null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftDate, setDraftDate] = useState(date)
  const [draftTime, setDraftTime] = useState<string | null>(null)
  const requestId = useRef(0)

  async function load() {
    const id = ++requestId.current
    setError(null)
    if (remindersCache == null) setLoading(true)
    try {
      const next = await api.getReminders()
      if (id !== requestId.current) return
      remindersCache = next.reminders
      setReminders(next.reminders)
    } catch {
      if (id !== requestId.current) return
      setError(remindersCopy.loadError)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    setDraftDate(date)
  }, [date])

  async function addReminder() {
    const title = draft.trim()
    if (!title || busy) return
    try {
      const created = await api.createReminder({
        title,
        dueDate: draftDate,
        dueTime: draftTime,
      })
      setDraft('')
      setDraftTime(null)
      setReminders((prev) => {
        const next = [...prev, created]
        remindersCache = next
        return next
      })
      if (created.dueDate !== date) {
        onToast?.(nowCopy.savedFor(reminderWhenSavedLabel(created.dueDate)))
      }
    } catch {
      onError?.(nowCopy.reminderFailed)
    }
  }

  function applyReminders(next: Reminder[]) {
    remindersCache = next
    setReminders(next)
  }

  const grouped = groupReminderInbox(reminders, date)
  const sections: Array<{
    id: string
    title: string
    items: Reminder[]
  }> = [
    { id: 'overdue', title: remindersCopy.overdue, items: grouped.overdue },
    { id: 'today', title: remindersCopy.today, items: grouped.today },
    { id: 'later', title: remindersCopy.later, items: grouped.later },
    { id: 'done', title: remindersCopy.done, items: grouped.done },
  ]

  return (
    <div className="reminders-view">
      <h2 className="reminders-view-title">{remindersCopy.pageTitle}</h2>

      {loading && reminders.length === 0 ? (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      ) : null}

      {error ? (
        <div className="now-error">
          <p>{error}</p>
          <Button variant="default" size="xs" onClick={() => void load()}>
            {remindersCopy.retry}
          </Button>
        </div>
      ) : null}

      {!loading && reminders.length === 0 && !error ? (
        <p className="now-empty">{remindersCopy.empty}</p>
      ) : null}

      {sections.map((section) =>
        section.items.length > 0 ? (
          <section
            key={section.id}
            className="now-section"
            aria-labelledby={`reminders-${section.id}-title`}
          >
            <h3
              id={`reminders-${section.id}-title`}
              className="now-section-title"
            >
              {section.title}
            </h3>
            <ReminderList
              reminders={section.items}
              viewDate={date}
              busy={busy}
              onError={onError}
              onToast={onToast}
              persistIds={(visible) => {
                const ids = new Set(visible.map((r) => r.id))
                const queue = [...visible]
                return reminders.map((r) =>
                  ids.has(r.id) ? queue.shift() ?? r : r,
                ).map((r) => r.id)
              }}
              onRemindersChange={(nextSection) => {
                const changedIds = new Set(nextSection.map((r) => r.id))
                const sectionIds = new Set(section.items.map((r) => r.id))
                applyReminders(
                  reminders
                    .filter(
                      (r) => !sectionIds.has(r.id) || changedIds.has(r.id),
                    )
                    .map(
                      (r) =>
                        nextSection.find((row) => row.id === r.id) ?? r,
                    ),
                )
              }}
            />
          </section>
        ) : null,
      )}

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
        <ReminderWhen
          dueDate={draftDate}
          dueTime={draftTime}
          disabled={busy}
          onChange={(next) => {
            setDraftDate(next.dueDate)
            setDraftTime(next.dueTime)
          }}
        />
        <Button
          variant="default"
          size="xs"
          disabled={busy || !draft.trim()}
          aria-label={nowCopy.addReminder}
          onClick={() => void addReminder()}
        >
          {nowCopy.addReminderShort}
        </Button>
      </div>
    </div>
  )
}
