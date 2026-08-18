import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, Button, HoverCard, SegmentedControl, Select, Text, TextInput } from '@mantine/core'
import {
  IconChevronDown,
  IconChevronRight,
  IconGripVertical,
  IconLayoutGrid,
  IconList,
  IconPlus,
  IconPin,
  IconPinnedOff,
  IconTrash,
} from '@tabler/icons-react'
import { api } from '../api'
import {
  TASK_DRAG_DISTANCE,
  TaskPointerSensor,
} from './drag-sensors'
import {
  buildNoteSections,
  noteItemKey,
  NOTES_PROJECT_ALL,
  notesListCopy,
  parseNoteGroupBy,
  parseNoteLayout,
  readNotesFilters,
  readNotesGroupCollapsed,
  readNotesLayout,
  relativeUpdatedAt,
  sectionItemCount,
  subjectFromDetail,
  writeNotesFilters,
  writeNotesGroupCollapsed,
  writeNotesLayout,
  type NoteGroupBy,
  type NoteLayout,
  type NoteListItem,
  type NoteSort,
  type NotesSubject,
} from './notes-list'
import { ProjectFilterChips } from './ProjectFilterChips'
import { RowMeta } from './RowMeta'
import { PRIORITY_TAGS, resolveTagSwatch, type TagColorMap } from './tags'
import { useTagColors } from './TagColorsContext'

type Props = {
  version: number
  busy?: boolean
  onOpen: (subject: NotesSubject, opts?: { focusTitle?: boolean }) => void
  onChanged: () => void
  onError?: (message: string) => void
  onToast?: (message: string) => void
}

export function NotesView({
  version,
  busy,
  onOpen,
  onChanged,
  onError,
  onToast,
}: Props) {
  const { colors, projects } = useTagColors()
  const [notes, setNotes] = useState<NoteListItem[] | null>(null)
  const [olderNotes, setOlderNotes] = useState<NoteListItem[] | null>(null)
  const [olderCount, setOlderCount] = useState(0)
  const [showOlder, setShowOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [project, setProject] = useState(() => readNotesFilters().project)
  const [priority, setPriority] = useState(() => readNotesFilters().priority)
  const [source, setSource] = useState(() => readNotesFilters().source)
  const [sort, setSort] = useState<NoteSort>(() => readNotesFilters().sort)
  const [groupBy, setGroupBy] = useState<NoteGroupBy>(() => readNotesFilters().groupBy)
  const [pinnedOnly, setPinnedOnly] = useState(() => readNotesFilters().pinnedOnly)
  const [layout, setLayout] = useState<NoteLayout>(() => readNotesLayout())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    readNotesGroupCollapsed(),
  )
  const [arrangeOpen, setArrangeOpen] = useState(false)
  const sensors = useSensors(
    useSensor(TaskPointerSensor, {
      activationConstraint: { distance: TASK_DRAG_DISTANCE },
    }),
  )

  function changeLayout(next: NoteLayout) {
    setLayout(next)
    writeNotesLayout(next)
  }

  useEffect(() => {
    if (groupBy === 'project' && sort === 'project') setSort('updated')
    if (groupBy === 'priority' && sort === 'priority') setSort('updated')
  }, [groupBy, sort])

  useEffect(() => {
    writeNotesFilters({
      project,
      priority,
      source,
      sort,
      groupBy,
      pinnedOnly,
    })
  }, [project, priority, source, sort, groupBy, pinnedOnly])
  const requestId = useRef(0)
  const olderRequestId = useRef(0)
  const notesRef = useRef<NoteListItem[] | null>(null)
  const searchTimer = useRef<number | null>(null)
  const [debouncedQ, setDebouncedQ] = useState('')
  const searching = debouncedQ.length > 0

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => setDebouncedQ(q.trim()), 200)
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current)
    }
  }, [q])

  // Reset lazy older list when filters/search change.
  useEffect(() => {
    setShowOlder(false)
    setOlderNotes(null)
  }, [debouncedQ, project, priority, source, pinnedOnly])

  useEffect(() => {
    const id = ++requestId.current
    const soft = notesRef.current != null
    if (!soft) {
      setLoading(true)
    }
    setError(null)
    void api
      .getNotes({
        q: debouncedQ || undefined,
        project: project === NOTES_PROJECT_ALL ? undefined : project,
        priority: priority === 'All' ? undefined : priority,
        source,
        sort,
        scope: pinnedOnly ? 'all' : 'recent',
        pinned: pinnedOnly || undefined,
      })
      .then((res) => {
        if (requestId.current !== id) return
        setNotes(res.notes)
        if (!searching && !pinnedOnly) setOlderCount(res.olderCount ?? 0)
        else setOlderCount(0)
      })
      .catch(() => {
        if (requestId.current !== id) return
        if (!notesRef.current) setNotes(null)
        setError(notesListCopy.error)
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false)
      })
  }, [version, debouncedQ, project, priority, source, sort, searching, pinnedOnly])

  async function loadOlderNotes() {
    const id = ++olderRequestId.current
    setLoadingOlder(true)
    try {
      const res = await api.getNotes({
        project: project === NOTES_PROJECT_ALL ? undefined : project,
        priority: priority === 'All' ? undefined : priority,
        source,
        sort,
        scope: 'older',
        pinned: pinnedOnly || undefined,
      })
      if (olderRequestId.current !== id) return
      setOlderNotes(res.notes)
      setOlderCount(res.notes.length)
    } catch {
      if (olderRequestId.current !== id) return
      onError?.(notesListCopy.error)
      setShowOlder(false)
    } finally {
      if (olderRequestId.current === id) setLoadingOlder(false)
    }
  }

  // Fetch older notes only while "Show all" is open.
  useEffect(() => {
    if (!showOlder || searching) return
    void loadOlderNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOlder, version, sort, searching])

  function toggleShowOlder() {
    if (showOlder) {
      setShowOlder(false)
      setOlderNotes(null)
      return
    }
    setShowOlder(true)
  }

  const sections = useMemo(
    () => (notes ? buildNoteSections(notes, groupBy, sort) : []),
    [notes, groupBy, sort],
  )
  const olderSections = useMemo(
    () =>
      olderNotes && showOlder
        ? buildNoteSections(olderNotes, groupBy, sort)
        : [],
    [olderNotes, showOlder, groupBy, sort],
  )

  const canDrag = groupBy === 'none'
  const showOlderToggle = !searching && !pinnedOnly && olderCount > 0
  const hasRecent = (notes?.length ?? 0) > 0
  const otherFiltersActive =
    Boolean(debouncedQ) ||
    project !== NOTES_PROJECT_ALL ||
    priority !== 'All' ||
    source !== 'all'
  const filteredEmpty = otherFiltersActive || pinnedOnly
  const showSourceBadge =
    source === 'all' &&
    (searching ||
      project !== NOTES_PROJECT_ALL ||
      priority !== 'All')

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      writeNotesGroupCollapsed(next)
      return next
    })
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
        pinned: pinnedOnly,
      })
      onChanged()
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

  async function togglePin(item: NoteListItem) {
    if (item.source !== 'note') return
    try {
      await api.updateNote(item.id, { pinned: !item.pinned })
      onChanged()
      onToast?.(item.pinned ? notesListCopy.unpinnedToast : notesListCopy.pinnedToast)
    } catch {
      onError?.('Couldn’t update pin. Try again.')
    }
  }

  async function deleteItem(item: NoteListItem) {
    const confirmMsg =
      item.source === 'note'
        ? notesListCopy.deleteConfirm
        : notesListCopy.clearTaskConfirm
    if (!window.confirm(confirmMsg)) return
    try {
      if (item.source === 'note') {
        await api.deleteNote(item.id)
      } else {
        await api.clearTaskNotes(item.id)
      }
      onChanged()
      onToast?.(item.source === 'note' ? 'Note deleted' : 'Task notes cleared')
    } catch {
      onError?.('Couldn’t delete. Try again.')
    }
  }

  async function onDragEnd(event: DragEndEvent, list: NoteListItem[]) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = list.findIndex((n) => noteItemKey(n) === String(active.id))
    const newIndex = list.findIndex((n) => noteItemKey(n) === String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    const previous = list
    const next = arrayMove(list, oldIndex, newIndex)
    setNotes(next)

    try {
      await api.reorderNotes(next.map(noteItemKey))
      if (sort !== 'manual') setSort('manual')
      onToast?.(notesListCopy.reorderSaved)
    } catch {
      setNotes(previous)
      onError?.(notesListCopy.reorderFailed)
      onChanged()
    }
  }

  function renderNotes(list: NoteListItem[], sortable: boolean) {
    const body = (
      <div
        className={layout === 'list' ? 'notes-view-list' : 'notes-view-grid'}
      >
        {sortable ? (
          <SortableContext
            items={list.map(noteItemKey)}
            strategy={
              layout === 'list'
                ? verticalListSortingStrategy
                : rectSortingStrategy
            }
          >
            {list.map((item) => (
              <SortableNoteCard
                key={noteItemKey(item)}
                item={item}
                layout={layout}
                colors={colors}
                showSourceBadge={showSourceBadge}
                busy={busy}
                onOpen={() => void openItem(item)}
                onTogglePin={() => void togglePin(item)}
                onDelete={() => void deleteItem(item)}
              />
            ))}
          </SortableContext>
        ) : (
          list.map((item) => (
            <NoteCard
              key={noteItemKey(item)}
              item={item}
              layout={layout}
              colors={colors}
              showSourceBadge={showSourceBadge}
              draggable={false}
              onOpen={() => void openItem(item)}
              onTogglePin={() => void togglePin(item)}
              onDelete={() => void deleteItem(item)}
            />
          ))
        )}
      </div>
    )

    if (!sortable) return body

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => void onDragEnd(e, list)}
      >
        {body}
      </DndContext>
    )
  }

  return (
    <div className="notes-view">
      <div className="notes-view-toolbar">
        <div>
          <h2 className="notes-view-title">{notesListCopy.viewTitle}</h2>
          {notes && (
            <p className="notes-view-count">
              {notesListCopy.count(notes.length)}
              {!searching && !pinnedOnly && (
                <span className="notes-view-count-hint">
                  {' '}
                  · {notesListCopy.recentHint}
                </span>
              )}
            </p>
          )}
        </div>
        <TextInput
          className="notes-view-search"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          placeholder={notesListCopy.searchPlaceholder}
          aria-label={notesListCopy.searchPlaceholder}
        />
        <Button
          color="dark"
          leftSection={<IconPlus size={16} stroke={1.75} />}
          disabled={busy}
          onClick={() => void createNote()}
        >
          {notesListCopy.newNote}
        </Button>
      </div>

      <ProjectFilterChips
        projects={projects}
        value={project}
        onChange={setProject}
      />

      <button
        type="button"
        className="notes-view-arrange-toggle"
        aria-expanded={arrangeOpen}
        aria-controls="notes-arrange-panel"
        onClick={() => setArrangeOpen((open) => !open)}
      >
        <span className="notes-view-section-chevron" aria-hidden>
          {arrangeOpen ? (
            <IconChevronDown size={16} stroke={1.75} />
          ) : (
            <IconChevronRight size={16} stroke={1.75} />
          )}
        </span>
        {notesListCopy.arrange}
      </button>

      {arrangeOpen && (
      <div className="notes-view-filters" id="notes-arrange-panel">
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
        <Select
          w={140}
          size="xs"
          value={pinnedOnly ? 'pinned' : 'all'}
          onChange={(v) => setPinnedOnly(v === 'pinned')}
          data={[
            { value: 'all', label: notesListCopy.filterPinnedAll },
            { value: 'pinned', label: notesListCopy.filterPinnedOnly },
          ]}
          aria-label={notesListCopy.filterPinned}
          allowDeselect={false}
        />
        <Select
          w={150}
          size="xs"
          value={source}
          onChange={(v) => setSource((v as 'all' | 'task' | 'note') || 'all')}
          data={[
            { value: 'all', label: notesListCopy.sourceAll },
            { value: 'task', label: notesListCopy.sourceTask },
            { value: 'note', label: notesListCopy.sourceNote },
          ]}
          aria-label={notesListCopy.filterSource}
          allowDeselect={false}
        />
        <div className="notes-view-levels" role="group" aria-label={notesListCopy.arrange}>
          <Select
            w={140}
            size="xs"
            label={notesListCopy.groupByLabel}
            value={groupBy}
            onChange={(v) => setGroupBy(parseNoteGroupBy(v))}
            data={[
              { value: 'none', label: notesListCopy.groupByNone },
              { value: 'project', label: notesListCopy.groupByProject },
              { value: 'priority', label: notesListCopy.groupByPriority },
            ]}
            aria-label={notesListCopy.groupByLabel}
            allowDeselect={false}
          />
          <Select
            w={160}
            size="xs"
            label={
              groupBy === 'none'
                ? notesListCopy.sortLabel
                : notesListCopy.sortWithinLabel
            }
            value={sort}
            onChange={(v) => setSort((v as NoteSort) || 'updated')}
            data={[
              { value: 'updated', label: notesListCopy.sortUpdated },
              { value: 'manual', label: notesListCopy.sortManual },
              ...(groupBy !== 'priority'
                ? [{ value: 'priority', label: notesListCopy.sortPriority }]
                : []),
              ...(groupBy !== 'project'
                ? [{ value: 'project', label: notesListCopy.sortProject }]
                : []),
            ]}
            aria-label={
              groupBy === 'none'
                ? notesListCopy.sortLabel
                : notesListCopy.sortWithinLabel
            }
            allowDeselect={false}
          />
          <div className="notes-view-layout">
            <span className="notes-view-layout-label">{notesListCopy.layoutLabel}</span>
            <SegmentedControl
              size="xs"
              value={layout}
              onChange={(v) => changeLayout(parseNoteLayout(v))}
              data={[
                {
                  value: 'list',
                  label: (
                    <span className="notes-view-layout-option">
                      <IconList size={14} stroke={1.75} aria-hidden />
                      {notesListCopy.layoutList}
                    </span>
                  ),
                },
                {
                  value: 'grid',
                  label: (
                    <span className="notes-view-layout-option">
                      <IconLayoutGrid size={14} stroke={1.75} aria-hidden />
                      {notesListCopy.layoutGrid}
                    </span>
                  ),
                },
              ]}
              aria-label={notesListCopy.layoutLabel}
            />
          </div>
        </div>
      </div>
      )}

      <div className="notes-view-body">
        {loading && <div className="empty">{notesListCopy.loading}</div>}

        {!loading && error && (
          <div className="empty">
            <p>{error}</p>
            <Button variant="default" size="xs" onClick={() => onChanged()}>
              {notesListCopy.retry}
            </Button>
          </div>
        )}

        {!loading && !error && notes && !hasRecent && !showOlderToggle && (
          <div className="empty">
            <strong>
              {pinnedOnly && !otherFiltersActive
                ? notesListCopy.emptyPinned
                : filteredEmpty
                  ? notesListCopy.emptyFiltered
                  : notesListCopy.empty}
            </strong>
          </div>
        )}

        {!loading && !error && notes && !hasRecent && showOlderToggle && (
          <div className="empty">
            <strong>{notesListCopy.noRecent}</strong>
          </div>
        )}

        {!loading && !error && notes && hasRecent && groupBy === 'none' && (
          renderNotes(sections[0]?.items ?? notes, canDrag)
        )}

        {!loading && !error && notes && hasRecent && groupBy !== 'none' && (
          <div className="notes-view-sections">
            {sections.map((section) => {
              const count = sectionItemCount(section)
              const isCollapsed = Boolean(collapsed[section.key])
              const bodyId = `notes-section-${section.key}`
              const headerSwatch =
                groupBy === 'project'
                  ? resolveTagSwatch('project', section.label, colors)
                  : resolveTagSwatch('priority', section.label, colors)
              return (
                <section key={section.key} className="notes-view-section">
                  <button
                    type="button"
                    className="notes-view-section-header"
                    aria-expanded={!isCollapsed}
                    aria-controls={bodyId}
                    onClick={() => toggleCollapsed(section.key)}
                  >
                    <span className="notes-view-section-chevron" aria-hidden>
                      {isCollapsed ? (
                        <IconChevronRight size={16} stroke={1.75} />
                      ) : (
                        <IconChevronDown size={16} stroke={1.75} />
                      )}
                    </span>
                    <span
                      className="notes-view-section-swatch"
                      style={{
                        background: headerSwatch.bg,
                        borderColor: headerSwatch.border,
                      }}
                      aria-hidden
                    />
                    <span className="notes-view-section-label">
                      {section.label}
                    </span>
                    <span className="notes-view-section-count">
                      {notesListCopy.sectionCount(count)}
                    </span>
                    <span className="sr-only">
                      {isCollapsed
                        ? notesListCopy.expandSection
                        : notesListCopy.collapseSection}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div id={bodyId} className="notes-view-section-body">
                      {renderNotes(section.items, false)}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}

        {!loading && !error && showOlderToggle && (
          <section className="notes-view-older">
            <button
              type="button"
              className="notes-view-older-toggle"
              aria-expanded={showOlder}
              aria-controls="notes-older-body"
              onClick={toggleShowOlder}
              disabled={loadingOlder}
            >
              <span className="notes-view-section-chevron" aria-hidden>
                {showOlder ? (
                  <IconChevronDown size={16} stroke={1.75} />
                ) : (
                  <IconChevronRight size={16} stroke={1.75} />
                )}
              </span>
              <span className="notes-view-older-label">
                {showOlder ? notesListCopy.hideOlder : notesListCopy.showAll}
              </span>
              <span className="notes-view-section-count">
                {notesListCopy.olderCount(olderCount)}
              </span>
            </button>

            {showOlder && (
              <div id="notes-older-body" className="notes-view-older-body">
                {loadingOlder && (
                  <p className="panel-empty">{notesListCopy.olderLoading}</p>
                )}
                {!loadingOlder && olderNotes && olderNotes.length === 0 && (
                  <p className="panel-empty">{notesListCopy.olderEmpty}</p>
                )}
                {!loadingOlder &&
                  olderNotes &&
                  olderNotes.length > 0 &&
                  groupBy === 'none' &&
                  renderNotes(olderSections[0]?.items ?? olderNotes, false)}
                {!loadingOlder &&
                  olderNotes &&
                  olderNotes.length > 0 &&
                  groupBy !== 'none' && (
                    <div className="notes-view-sections">
                      {olderSections.map((section) => (
                        <section
                          key={`older-${section.key}`}
                          className="notes-view-section"
                        >
                          <div className="notes-view-section-header is-static">
                            <span className="notes-view-section-label">
                              {section.label}
                            </span>
                            <span className="notes-view-section-count">
                              {notesListCopy.sectionCount(
                                sectionItemCount(section),
                              )}
                            </span>
                          </div>
                          <div className="notes-view-section-body">
                            {renderNotes(section.items, false)}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function SortableNoteCard({
  item,
  layout,
  colors,
  showSourceBadge,
  busy,
  onOpen,
  onTogglePin,
  onDelete,
}: {
  item: NoteListItem
  layout: NoteLayout
  colors: TagColorMap
  showSourceBadge: boolean
  busy?: boolean
  onOpen: () => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: noteItemKey(item),
    disabled: Boolean(busy),
  })

  return (
    <NoteCard
      item={item}
      layout={layout}
      colors={colors}
      showSourceBadge={showSourceBadge}
      draggable
      dragRef={setNodeRef}
      dragStyle={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
      }}
      isDragging={isDragging}
      dragProps={{ ...attributes, ...listeners }}
      onOpen={onOpen}
      onTogglePin={onTogglePin}
      onDelete={onDelete}
    />
  )
}

function NoteCard({
  item,
  layout,
  colors,
  showSourceBadge,
  draggable,
  dragRef,
  dragStyle,
  isDragging,
  dragProps,
  onOpen,
  onTogglePin,
  onDelete,
}: {
  item: NoteListItem
  layout: NoteLayout
  colors: TagColorMap
  showSourceBadge: boolean
  draggable: boolean
  dragRef?: (node: HTMLElement | null) => void
  dragStyle?: CSSProperties
  isDragging?: boolean
  dragProps?: Record<string, unknown>
  onOpen: () => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  const projectSwatch = resolveTagSwatch('project', item.projectTag, colors)
  const prioritySwatch = resolveTagSwatch(
    'priority',
    String(item.priority),
    colors,
  )
  const isList = layout === 'list'
  const title = item.title || notesListCopy.untitled
  const previewBody = item.excerpt?.trim() || ''

  const cardButton = (
    <button
      type="button"
      className={`notes-card${isList ? ' notes-card-row' : ' notes-card-wide'}`}
      onClick={onOpen}
    >
      <div className="notes-card-top">
        <strong className="notes-card-title">{title}</strong>
        {showSourceBadge &&
          (item.source === 'task' ? (
            <span className="notes-card-badge">{notesListCopy.fromTask}</span>
          ) : (
            <span className="notes-card-badge notes-card-badge-standalone">
              {notesListCopy.sourceNote}
            </span>
          ))}
        {item.pinned && (
          <span className="notes-card-badge">{notesListCopy.pinnedBadge}</span>
        )}
      </div>
      <p className="notes-card-excerpt">
        {previewBody || notesListCopy.cardPreviewEmpty}
      </p>
      <div className="notes-card-meta">
        <span
          className="notes-card-chip"
          style={{
            background: projectSwatch.bg,
            color: projectSwatch.fg,
            borderColor: projectSwatch.border,
          }}
        >
          {item.projectTag}
        </span>
        <span
          className="notes-card-chip"
          style={{
            background: prioritySwatch.bg,
            color: prioritySwatch.fg,
            borderColor: prioritySwatch.border,
          }}
        >
          {item.priority}
        </span>
        <span className="notes-card-time">
          {relativeUpdatedAt(item.updatedAt)}
        </span>
      </div>
    </button>
  )

  return (
    <div
      ref={dragRef}
      style={dragStyle}
      className={`notes-view-card${isList ? ' is-row' : ''}${isDragging ? ' is-dragging' : ''}${draggable ? ' is-sortable' : ''}`}
      {...(draggable ? dragProps : {})}
      role={draggable ? 'group' : undefined}
      aria-roledescription={draggable ? 'sortable' : undefined}
      aria-label={draggable ? notesListCopy.dragHandle(title) : undefined}
    >
      {draggable && (
        <span className="notes-drag-handle" aria-hidden>
          <IconGripVertical size={14} stroke={2} />
        </span>
      )}
      {isList || isDragging ? (
        cardButton
      ) : (
        <HoverCard
          width={340}
          shadow="md"
          openDelay={220}
          closeDelay={60}
          position="bottom"
          withinPortal
          classNames={{ dropdown: 'notes-card-hover-dropdown' }}
        >
          <HoverCard.Target>{cardButton}</HoverCard.Target>
          <HoverCard.Dropdown>
            <div className="notes-card-hover-preview" data-no-dnd>
              <Text className="notes-card-hover-title" fw={650} size="sm">
                {title}
              </Text>
              <Text
                className="notes-card-hover-body"
                size="sm"
                c="dimmed"
                mt={8}
              >
                {previewBody || notesListCopy.cardPreviewEmpty}
              </Text>
              <div className="notes-card-hover-meta">
                <span
                  className="notes-card-chip"
                  style={{
                    background: projectSwatch.bg,
                    color: projectSwatch.fg,
                    borderColor: projectSwatch.border,
                  }}
                >
                  {item.projectTag}
                </span>
                <span
                  className="notes-card-chip"
                  style={{
                    background: prioritySwatch.bg,
                    color: prioritySwatch.fg,
                    borderColor: prioritySwatch.border,
                  }}
                >
                  {item.priority}
                </span>
                <span className="notes-card-time">
                  {relativeUpdatedAt(item.updatedAt)}
                </span>
              </div>
            </div>
          </HoverCard.Dropdown>
        </HoverCard>
      )}
      <div className="notes-view-card-actions" data-no-dnd>
        {item.source === 'note' && (
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={item.pinned ? notesListCopy.unpin : notesListCopy.pin}
            data-no-dnd
            onClick={onTogglePin}
          >
            {item.pinned ? (
              <IconPinnedOff size={16} stroke={1.5} />
            ) : (
              <IconPin size={16} stroke={1.5} />
            )}
          </ActionIcon>
        )}
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label={notesListCopy.delete}
          data-no-dnd
          onClick={onDelete}
        >
          <IconTrash size={16} stroke={1.5} />
        </ActionIcon>
      </div>
    </div>
  )
}
