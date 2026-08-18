import { useEffect, useRef, useState } from 'react'
import { Button, Select, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { api } from '../api'
import {
  NOTES_PROJECT_ALL,
  notesListCopy,
  relativeUpdatedAt,
  subjectFromDetail,
  type NoteListItem,
  type NotesSubject,
} from './notes-list'
import { ProjectFilterChips } from './ProjectFilterChips'
import { RowMeta } from './RowMeta'
import { PRIORITY_TAGS, resolveTagSwatch } from './tags'
import { useTagColors } from './TagColorsContext'

type NotesSourceFilter = 'all' | 'task' | 'note'

type Props = {
  version: number
  notes?: NoteListItem[] | null
  busy?: boolean
  onOpen: (subject: NotesSubject, opts?: { focusTitle?: boolean }) => void
  onChanged?: () => void
  onError?: (message: string) => void
}

export function NotesPanel({
  version,
  notes: bootstrapNotes,
  busy,
  onOpen,
  onChanged,
  onError,
}: Props) {
  const { colors, projects } = useTagColors()
  const [notes, setNotes] = useState<NoteListItem[] | null>(bootstrapNotes ?? null)
  const [loading, setLoading] = useState(bootstrapNotes == null)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<string>(NOTES_PROJECT_ALL)
  const [priority, setPriority] = useState<string>('All')
  const [source, setSource] = useState<NotesSourceFilter>('all')
  const requestId = useRef(0)
  const filtersActive =
    project !== NOTES_PROJECT_ALL || priority !== 'All' || source !== 'all'

  useEffect(() => {
    if (!filtersActive) {
      setNotes(bootstrapNotes ?? null)
      setLoading(bootstrapNotes == null)
      setError(null)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    void api
      .getNotes({
        project: project === NOTES_PROJECT_ALL ? undefined : project,
        priority: priority === 'All' ? undefined : priority,
        source,
        sort: 'updated',
        scope: 'recent',
      })
      .then((res) => {
        if (requestId.current !== id) return
        setNotes(res.notes)
      })
      .catch(() => {
        if (requestId.current !== id) return
        setNotes(null)
        setError(notesListCopy.error)
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false)
      })
  }, [version, project, priority, source, bootstrapNotes, filtersActive])

  async function retry() {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const res = await api.getNotes({
        project: project === NOTES_PROJECT_ALL ? undefined : project,
        priority: priority === 'All' ? undefined : priority,
        source,
        sort: 'updated',
        scope: 'recent',
      })
      if (requestId.current !== id) return
      setNotes(res.notes)
    } catch {
      if (requestId.current !== id) return
      setNotes(null)
      setError(notesListCopy.error)
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }

  async function createNote() {
    try {
      const created = await api.createNote({
        title: '',
        body: '',
        projectTag: project === NOTES_PROJECT_ALL ? 'Personal' : project,
        priority: (priority === 'All' ? 'Medium' : priority) as
          | 'High'
          | 'Medium'
          | 'Low',
      })
      onChanged?.()
      onOpen(subjectFromDetail(created), { focusTitle: true })
    } catch {
      onError?.('Couldn’t create a note. Try again.')
    }
  }

  async function openItem(item: NoteListItem) {
    try {
      const detail = await api.getNote(item.source, item.id)
      onOpen(subjectFromDetail(detail))
    } catch {
      onError?.('Couldn’t open that note. Try again.')
    }
  }

  const filtered =
    project !== NOTES_PROJECT_ALL || priority !== 'All' || source !== 'all'

  return (
    <aside className="notes-panel panel" aria-label={notesListCopy.panelTitle}>
      <div className="notes-panel-header">
        <div>
          <h3>{notesListCopy.panelTitle}</h3>
          {notes && (
            <Text size="xs" c="dimmed">
              {notesListCopy.count(notes.length)}
            </Text>
          )}
        </div>
        <Button
          size="compact-xs"
          variant="light"
          color="gray"
          leftSection={<IconPlus size={12} stroke={2} />}
          disabled={busy}
          onClick={() => void createNote()}
        >
          {notesListCopy.newNote}
        </Button>
      </div>

      <ProjectFilterChips
        compact
        projects={projects}
        value={project}
        onChange={setProject}
      />

      <div className="notes-panel-filters">
        <Select
          w={118}
          size="xs"
          value={source}
          onChange={(v) => setSource((v as NotesSourceFilter) || 'all')}
          data={[
            { value: 'all', label: notesListCopy.sourceAll },
            { value: 'note', label: notesListCopy.sourceNote },
            { value: 'task', label: notesListCopy.sourceTask },
          ]}
          aria-label={notesListCopy.filterSource}
          allowDeselect={false}
        />
        <RowMeta
          value={priority}
          options={['All', ...PRIORITY_TAGS]}
          onSelect={setPriority}
          ariaLabel={notesListCopy.filterPriority}
          swatch={
            priority !== 'All'
              ? resolveTagSwatch('priority', priority, colors)
              : undefined
          }
        />
      </div>

      {loading && <p className="panel-empty">{notesListCopy.loading}</p>}

      {!loading && error && (
        <div className="empty">
          <p>{error}</p>
          <Button variant="default" size="xs" onClick={() => void retry()}>
            {notesListCopy.retry}
          </Button>
        </div>
      )}

      {!loading && !error && notes && notes.length === 0 && (
        <p className="panel-empty">
          {filtered ? notesListCopy.emptyFiltered : notesListCopy.empty}
        </p>
      )}

      {!loading && !error && notes && notes.length > 0 && (
        <ul className="notes-panel-list">
          {notes.map((item) => (
            <li key={`${item.source}:${item.id}`}>
              <button
                type="button"
                className="notes-card"
                onClick={() => void openItem(item)}
              >
                <div className="notes-card-top">
                  <strong className="notes-card-title">
                    {item.title || notesListCopy.untitled}
                  </strong>
                  {item.source === 'task' ? (
                    <span className="notes-card-badge">{notesListCopy.fromTask}</span>
                  ) : (
                    <span className="notes-card-badge notes-card-badge-standalone">
                      {notesListCopy.sourceNote}
                    </span>
                  )}
                  {item.pinned && <span className="notes-card-badge">Pinned</span>}
                </div>
                {item.excerpt && (
                  <p className="notes-card-excerpt">{item.excerpt}</p>
                )}
                <div className="notes-card-meta">
                  <span
                    className="notes-card-chip"
                    style={{
                      background: resolveTagSwatch('project', item.projectTag, colors)
                        .bg,
                      color: resolveTagSwatch('project', item.projectTag, colors).fg,
                      borderColor: resolveTagSwatch(
                        'project',
                        item.projectTag,
                        colors,
                      ).border,
                    }}
                  >
                    {item.projectTag}
                  </span>
                  <span
                    className="notes-card-chip"
                    style={{
                      background: resolveTagSwatch(
                        'priority',
                        String(item.priority),
                        colors,
                      ).bg,
                      color: resolveTagSwatch(
                        'priority',
                        String(item.priority),
                        colors,
                      ).fg,
                      borderColor: resolveTagSwatch(
                        'priority',
                        String(item.priority),
                        colors,
                      ).border,
                    }}
                  >
                    {item.priority}
                  </span>
                  <span className="notes-card-time">
                    {relativeUpdatedAt(item.updatedAt)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
