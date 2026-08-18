import { format } from 'date-fns'
import { nowCopy } from './now-copy'

export function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function reminderWhenChip(
  dueDate: string,
  dueTime: string | null,
): string {
  const date = parseIsoDate(dueDate)
  if (!date) return nowCopy.whenEmpty
  const day = format(date, 'EEE d')
  return dueTime ? `${day} · ${dueTime}` : day
}

export function reminderWhenSavedLabel(dueDate: string): string {
  const date = parseIsoDate(dueDate)
  if (!date) return dueDate
  return format(date, 'd MMM')
}

export function reminderWhenAria(
  dueDate: string,
  dueTime: string | null,
): string {
  const date = parseIsoDate(dueDate)
  if (!date) return nowCopy.whenAria
  return nowCopy.whenDueAria(reminderWhenChip(dueDate, dueTime))
}
