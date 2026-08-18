import { NumberInput } from '@mantine/core'
import { format, parseISO } from 'date-fns'
import { useEffect, useState } from 'react'
import type { TimeLog } from '../types'
import { historyCopy } from './history-copy'

type Props = {
  logs: TimeLog[]
  busy?: boolean
  loading?: boolean
  onHoursChange: (id: string, hours: number) => Promise<void>
}

export function HistoryPanel({ logs, busy, loading, onHoursChange }: Props) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{historyCopy.when}</th>
            <th>{historyCopy.task}</th>
            <th>{historyCopy.checklist}</th>
            <th>{historyCopy.category}</th>
            <th>{historyCopy.hours}</th>
            <th>{historyCopy.note}</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{format(parseISO(log.createdAt), 'MMM d, HH:mm')}</td>
              <td>{log.title}</td>
              <td>{log.subtaskTitle || '—'}</td>
              <td>{log.category}</td>
              <td>
                <HistoryHoursCell
                  log={log}
                  busy={busy}
                  onSave={(hours) => onHoursChange(log.id, hours)}
                />
              </td>
              <td>{log.note}</td>
            </tr>
          ))}
          {loading && logs.length === 0 && (
            <tr>
              <td colSpan={6}>
                <div className="skeleton" style={{ margin: 0 }} />
              </td>
            </tr>
          )}
          {!loading && logs.length === 0 && (
            <tr>
              <td colSpan={6}>{historyCopy.empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function HistoryHoursCell({
  log,
  busy,
  onSave,
}: {
  log: TimeLog
  busy?: boolean
  onSave: (hours: number) => Promise<void>
}) {
  const [draft, setDraft] = useState(Number(log.hours.toFixed(2)))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(Number(log.hours.toFixed(2)))
  }, [log.id, log.hours])

  async function commit() {
    const next = Math.max(0, Math.round(draft * 100) / 100)
    if (next === Number(log.hours.toFixed(2))) {
      setDraft(next)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
    } catch {
      setDraft(Number(log.hours.toFixed(2)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="history-hours-cell">
      <NumberInput
        min={0}
        step={0.05}
        decimalScale={2}
        value={draft}
        disabled={busy || saving}
        hideControls
        size="xs"
        variant="unstyled"
        aria-label={historyCopy.hoursAria(log.title)}
        classNames={{ input: 'history-hours-input' }}
        onChange={(value) => {
          const next = typeof value === 'number' ? value : Number(value)
          setDraft(Number.isFinite(next) ? next : 0)
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.currentTarget as HTMLInputElement).blur()
          }
        }}
      />
      <span className="history-hours-unit" aria-hidden>
        h
      </span>
    </div>
  )
}
