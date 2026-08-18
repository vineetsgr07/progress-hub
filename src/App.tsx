import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Menu,
  Modal,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconDotsVertical, IconMoon, IconSun } from '@tabler/icons-react'
import { api } from './api'
import { SortableTaskList } from './features/SortableTaskList'
import { ProgressPanel } from './features/ProgressPanel'
import { HistoryPanel } from './features/HistoryPanel'
import { TaskModal, type TaskDraft } from './features/TaskModal'
import type { DetailMetaPatch } from './features/NotesDrawer'
import { NotesPanel } from './features/NotesPanel'
import { TagsPanel } from './features/TagsPanel'
import { DaySnapshot } from './features/DaySnapshot'
import { HabitsPanel } from './features/HabitsPanel'

const KanbanBoard = lazy(() =>
  import('./features/KanbanBoard').then((m) => ({ default: m.KanbanBoard })),
)
const AnalyticsView = lazy(() =>
  import('./features/AnalyticsView').then((m) => ({ default: m.AnalyticsView })),
)
const NotesDrawer = lazy(() =>
  import('./features/NotesDrawer').then((m) => ({ default: m.NotesDrawer })),
)
const NotesView = lazy(() =>
  import('./features/NotesView').then((m) => ({ default: m.NotesView })),
)
const MapsView = lazy(() =>
  import('./features/MapsView').then((m) => ({ default: m.MapsView })),
)
const TaskDetailPanel = lazy(() =>
  import('./features/TaskDetailPanel').then((m) => ({ default: m.TaskDetailPanel })),
)
import { ProjectsBoard } from './features/ProjectsBoard'
import {
  readProjectsNotesOpen,
  writeProjectsNotesOpen,
} from './features/projects-board'
import { projectsCopy } from './features/projects-copy'
import {
  clearFocusCountdownSession,
  readFocusOnStart,
} from './features/focus-prefs'
import { MOTION_BASE_MS } from './features/motion'
import {
  NARROW_MAX_WIDTH,
  readNotesDrawerWidth,
} from './features/notes-copy'
import { notesListCopy, type NotesSubject } from './features/notes-list'
import { NowView } from './features/NowView'
import { nowCopy } from './features/now-copy'
import { frequencyFilterLabel, taskCopy } from './features/task-copy'
import { historyCopy } from './features/history-copy'
import { themeCopy } from './features/theme-copy'
import { useTagColors } from './features/TagColorsContext'
import { useDelayedFlag } from './features/use-delayed-flag'
import { ViewStage } from './features/ViewStage'
import { SignInScreen } from './features/SignInScreen'
import { authCopy } from './features/auth-copy'
import { getSupabase, supabaseAuthEnabled } from './supabase'
import { mergeTask, mergeSubtask, appendSubtask, insertSubtaskAfter, removeSubtask, patchSubtaskLocal, settleRunningSubtaskTimer, ensureTaskPresent } from './features/task-merge'
import { unlockFocusAudio } from './features/focus-signal'
import type {
  Category,
  DateSummary,
  Habit,
  HabitsProgress,
  Stats,
  Task,
  TimeLog,
  ViewTab,
  WeekProgress,
} from './types'
import {
  localISODate,
  shiftISODate,
} from './utils/date'

function LazyFallback() {
  return (
    <>
      <div className="skeleton" />
      <div className="skeleton" />
    </>
  )
}

const CATEGORIES_FALLBACK: Category[] = [
  'All',
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Goal',
  'Projects',
]

const EMPTY_DRAFT: TaskDraft = {
  title: '',
  notes: '',
  category: 'Daily',
  projectTag: 'Marketing',
  priority: 'Medium',
  subtasks: [''],
  cadenceWeekday: 5,
  cadenceMonthDay: 1,
}

const NAV_ITEMS: Array<{ value: ViewTab; label: string; primary?: boolean }> = [
  { value: 'now', label: nowCopy.nav, primary: true },
  { value: 'today', label: taskCopy.navToday, primary: true },
  { value: 'notes', label: taskCopy.navNotes, primary: true },
  { value: 'master', label: taskCopy.navMaster, primary: true },
  { value: 'maps', label: taskCopy.navMaps },
  { value: 'analytics', label: taskCopy.navAnalytics },
  { value: 'dates', label: taskCopy.navDates },
  { value: 'history', label: taskCopy.navHistory },
  { value: 'board', label: taskCopy.navBoard },
]

function liveHours(task: Task, tick: number) {
  const base = task.entry?.hours ?? 0
  if (!task.entry?.timerStartedAt) return base
  void tick
  return base + (Date.now() - new Date(task.entry.timerStartedAt).getTime()) / 3_600_000
}

export default function App() {
  const { frequencies, listSort, setListSort } = useTagColors()
  const isNarrow = useMediaQuery(`(max-width: ${NARROW_MAX_WIDTH}px)`)
  const { toggleColorScheme } = useMantineColorScheme()
  const computedScheme = useComputedColorScheme('light')
  const categoryFilters: Category[] =
    frequencies.length > 0
      ? (['All', ...frequencies] as Category[])
      : CATEGORIES_FALLBACK
  const [tab, setTab] = useState<ViewTab>('now')
  const [analyticsHabitDetail, setAnalyticsHabitDetail] = useState(false)
  const [date, setDate] = useState(localISODate())
  const [category, setCategory] = useState<Category>('All')
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [habits, setHabits] = useState<Habit[] | null>(null)
  const [week, setWeek] = useState<WeekProgress | null>(null)
  const [habitsProgress, setHabitsProgress] = useState<HabitsProgress | null>(
    null,
  )
  const [history, setHistory] = useState<TimeLog[]>([])
  const [dates, setDates] = useState<DateSummary[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [modal, setModal] = useState<'add' | 'delete' | null>(null)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskDraft>(EMPTY_DRAFT)
  const [notesFocus, setNotesFocus] = useState<NotesSubject | null>(null)
  const [notesDrawerWidth, setNotesDrawerWidth] = useState(readNotesDrawerWidth)
  const [notesFocusTitle, setNotesFocusTitle] = useState(false)
  const [notesVersion, setNotesVersion] = useState(0)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null)
  const [focusSession, setFocusSession] = useState(false)
  const [focusRestored, setFocusRestored] = useState(false)
  const [pendingOpenTaskId, setPendingOpenTaskId] = useState<string | null>(null)
  const [mapsEditing, setMapsEditing] = useState(false)
  const [projectsNotesOpen, setProjectsNotesOpen] = useState(() =>
    readProjectsNotesOpen(),
  )
  const [sessionReady, setSessionReady] = useState(!supabaseAuthEnabled)
  const [signedIn, setSignedIn] = useState(!supabaseAuthEnabled)
  const [authForbidden, setAuthForbidden] = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session))
      setSessionReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session))
      setAuthForbidden(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (tab !== 'maps') setMapsEditing(false)
  }, [tab])

  // Legacy Habits tab → Analytics (habit detail open).
  useEffect(() => {
    if (tab !== 'habits') return
    setAnalyticsHabitDetail(true)
    setTab('analytics')
  }, [tab])

  function toggleProjectsNotes() {
    setProjectsNotesOpen((prev) => {
      const next = !prev
      writeProjectsNotesOpen(next)
      return next
    })
  }

  const notesSubject = useMemo(() => {
    if (!notesFocus) return null
    if (notesFocus.source === 'task') {
      const task = tasks.find((t) => t.id === notesFocus.id)
      if (!task) return notesFocus
      return {
        ...notesFocus,
        title: task.title,
        body: task.notes,
        projectTag: task.projectTag,
        priority: task.priority,
        category: task.category,
        cadenceWeekday: task.cadenceWeekday,
        cadenceMonthDay: task.cadenceMonthDay,
        status: task.status,
      }
    }
    return notesFocus
  }, [notesFocus, tasks])

  function openTask(task: Task) {
    openTaskSubject(task, { session: false })
  }

  function openTaskSubject(task: Task, opts?: { session?: boolean }) {
    setNotesFocusTitle(false)
    setNotesFocus({
      id: task.id,
      source: 'task',
      title: task.title,
      body: task.notes,
      projectTag: task.projectTag,
      priority: task.priority,
      category: task.category,
      cadenceWeekday: task.cadenceWeekday,
      cadenceMonthDay: task.cadenceMonthDay,
      status: task.status,
    })
    if (opts?.session) {
      setFocusTaskId(task.id)
      setFocusSession(true)
    } else {
      setFocusTaskId(null)
      setFocusSession(false)
    }
  }

  function openNoteSubject(subject: NotesSubject, opts?: { focusTitle?: boolean }) {
    setFocusTaskId(null)
    setFocusSession(false)
    setNotesFocusTitle(Boolean(opts?.focusTitle))
    setNotesFocus(subject)
  }

  function bumpNotesVersion() {
    setNotesVersion((v) => v + 1)
  }

  const isToday = date === localISODate()
  const masterCount = useMemo(
    () => stats?.byCategory.reduce((s, c) => s + c.count, 0) ?? tasks.length,
    [stats, tasks.length],
  )

  function flash(message: string) {
    setToast(message)
    setToastVisible(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setToastVisible(true))
    })
    window.setTimeout(() => setToastVisible(false), 2200)
  }

  async function refresh() {
    setError(null)
    try {
      if (tab === 'today' || tab === 'master') {
        const page = await api.getToday(date, {
          category,
          master: tab === 'master',
        })
        setTasks(page.tasks)
        setStats(page.stats)
        if (page.habits) setHabits(page.habits.habits)
        if (page.week) setWeek(page.week)
      } else if (tab === 'analytics') {
        const page = await api.getAnalytics(date)
        setStats(page.stats)
        setHabitsProgress(page.habitsProgress)
      } else if (tab === 'history') {
        const hist = await api.getHistory()
        setHistory(hist.logs)
      } else if (tab === 'dates') {
        const d = await api.getDates()
        setDates(d.dates)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'AUTH_FORBIDDEN') {
        setAuthForbidden(true)
        setSignedIn(false)
        return
      }
      if (msg === 'AUTH_REQUIRED') {
        setSignedIn(false)
        return
      }
      setError(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? taskCopy.offlineError
          : taskCopy.loadError,
      )
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (!sessionReady || !signedIn) return
    setFetching(true)
    void refresh()
  }, [tab, date, category, sessionReady, signedIn])

  const showPending = useDelayedFlag(fetching)
  const showTaskSkeletons = showPending && tasks.length === 0
  const softRefreshing = fetching && (tasks.length > 0 || stats != null)
  const analyticsLoading = fetching && !stats

  useEffect(() => {
    if (toastVisible || !toast) return
    const id = window.setTimeout(() => setToast(null), MOTION_BASE_MS)
    return () => window.clearTimeout(id)
  }, [toastVisible, toast])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (fetching || focusRestored || tab !== 'today') return
    setFocusRestored(true)
    // Preference only gates restore-on-load — not an explicit Play click.
    if (!readFocusOnStart()) return
    const running = tasks.find((t) => t.entry?.timerStartedAt)
    if (running) openTaskSubject(running, { session: true })
  }, [fetching, tasks, tab, focusRestored])

  useEffect(() => {
    if (!focusTaskId) return
    const task = tasks.find((t) => t.id === focusTaskId)
    if (!task) {
      setFocusTaskId(null)
      setFocusSession(false)
    }
  }, [focusTaskId, tasks])

  // Analytics carryover / insight CTA → Today + open notes once tasks load.
  useEffect(() => {
    if (!pendingOpenTaskId || tab !== 'today') return
    const task = tasks.find((t) => t.id === pendingOpenTaskId)
    if (task) {
      openTask(task)
      setPendingOpenTaskId(null)
      return
    }
    if (fetching) return
    setPendingOpenTaskId(null)
  }, [pendingOpenTaskId, tab, tasks, fetching])

  function openAnalyticsTask(taskId: string) {
    setPendingOpenTaskId(taskId)
    setFetching(true)
    setTab('today')
  }

  /** Open Focus after an explicit Play click. Always — preference is restore-only. */
  function enterFocus(taskId: string, _force = false) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) {
      setFocusTaskId(taskId)
      setFocusSession(true)
      return
    }
    openTaskSubject(task, { session: true })
  }

  const detailTaskLive =
    notesFocus?.source === 'task'
      ? tasks.find((t) => t.id === notesFocus.id) ?? null
      : null
  async function stopTaskTimer(taskId: string) {
    await run(
      async () => {
        const updated = await api.patchDayEntry(taskId, {
          date,
          timerAction: 'stop',
        })
        setTasks((prev) => mergeTask(prev, updated))
        clearFocusCountdownSession()
      },
      {
        success: 'Timer stopped',
        refresh: false,
        busy: false,
        refreshStats: true,
      },
    )
  }

  function toggleSubtaskFor(taskId: string, sid: string, doneVal: boolean) {
    const task = tasks.find((t) => t.id === taskId)
    const shouldStop =
      doneVal &&
      Boolean(task?.entry?.timerStartedAt) &&
      task?.entry?.timerSubtaskId === sid

    setTasks((prev) => {
      let next = patchSubtaskLocal(prev, taskId, sid, { done: doneVal })
      if (shouldStop) next = settleRunningSubtaskTimer(next, taskId, sid)
      return next
    })
    void run(
      async () => {
        if (shouldStop) {
          const stopped = await api.patchDayEntry(taskId, {
            date,
            timerAction: 'stop',
          })
          setTasks((prev) => mergeTask(prev, stopped))
          clearFocusCountdownSession()
        }
        const updated = await api.updateSubtask(sid, {
          done: doneVal,
          date,
        })
        setTasks((prev) => mergeSubtask(prev, taskId, updated))
      },
      { refresh: false, busy: false, refreshStats: true },
    )
  }

  function togglePinFor(taskId: string, sid: string, pinned: boolean) {
    setTasks((prev) => patchSubtaskLocal(prev, taskId, sid, { pinned }))
    void run(
      async () => {
        const updated = await api.updateSubtask(sid, { pinned })
        setTasks((prev) => mergeSubtask(prev, taskId, updated))
      },
      {
        success: pinned ? nowCopy.pinnedToast : nowCopy.unpinnedToast,
        refresh: false,
        busy: false,
      },
    )
  }

  function renameSubtaskFor(taskId: string, sid: string, title: string) {
    setTasks((prev) => patchSubtaskLocal(prev, taskId, sid, { title }))
    void run(
      async () => {
        const updated = await api.updateSubtask(sid, { title })
        setTasks((prev) => mergeSubtask(prev, taskId, updated))
      },
      { refresh: false, busy: false, refreshStats: true },
    )
  }

  async function addSubtaskFor(
    taskId: string,
    title: string,
    opts?: { afterId?: string },
  ): Promise<string | void> {
    try {
      const created = await api.addSubtask(taskId, title)
      if (opts?.afterId) {
        let orderedIds: string[] = []
        setTasks((prev) => {
          const next = insertSubtaskAfter(prev, taskId, created, opts.afterId!)
          const task = next.find((t) => t.id === taskId)
          orderedIds = (task?.subtasks || []).map((s) => s.id)
          return next
        })
        if (orderedIds.length > 0) {
          await api.reorderSubtasks(taskId, orderedIds)
        }
      } else {
        setTasks((prev) => appendSubtask(prev, taskId, created))
      }
      if (tab === 'today' || tab === 'master') await refreshStatsQuiet()
      return created.id
    } catch {
      setError('That action didn’t save. Try again.')
      if (tab !== 'board') await refresh()
    }
  }

  function deleteSubtaskFor(taskId: string, sid: string) {
    setTasks((prev) => removeSubtask(prev, taskId, sid))
    void run(
      async () => {
        await api.deleteSubtask(sid)
      },
      { refresh: false, busy: false, refreshStats: true },
    )
  }

  function startSubtaskTimerFor(taskId: string, sid: string) {
    void unlockFocusAudio()
    return run(
      async () => {
        const updated = await api.patchDayEntry(taskId, {
          date,
          timerAction: 'start',
          subtaskId: sid,
        })
        setTasks((prev) =>
          mergeTask(prev, updated, { clearOtherTimers: true }),
        )
      },
      {
        success: 'Timer started',
        refresh: false,
        busy: false,
        refreshStats: true,
      },
    )
  }

  async function reorderSubtasksFor(taskId: string, orderedIds: string[]) {
    const task = tasks.find((t) => t.id === taskId)
    const byId = new Map((task?.subtasks || []).map((s) => [s.id, s]))
    const nextSubs = orderedIds
      .map((id, i) => {
        const s = byId.get(id)
        return s ? { ...s, position: i } : null
      })
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, subtasks: nextSubs } : t)),
    )
    try {
      await api.reorderSubtasks(taskId, orderedIds)
    } catch {
      setError('Couldn’t save checklist order. Reloading…')
      await refresh()
      throw new Error('reorder failed')
    }
  }

  async function saveTaskNotes(taskId: string, notesHtml: string) {
    await api.updateTask(taskId, { notes: notesHtml })
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, notes: notesHtml } : t)),
    )
    setNotesFocus((t) =>
      t && t.id === taskId && t.source === 'task'
        ? { ...t, body: notesHtml }
        : t,
    )
    bumpNotesVersion()
  }

  async function refreshStatsQuiet() {
    try {
      const pulse = await api.getTodayPulse(date)
      setStats(pulse.stats)
      setWeek(pulse.week)
    } catch {
      /* keep existing stats */
    }
  }

  async function run(
    action: () => Promise<void>,
    successOrOpts?:
      | string
      | {
          success?: string
          /** Full list reload. Default true. */
          refresh?: boolean
          /** Show global busy/disabled. Default true. */
          busy?: boolean
          /** Soft-update stats without list reload. */
          refreshStats?: boolean
        },
  ) {
    const opts =
      typeof successOrOpts === 'string'
        ? { success: successOrOpts }
        : successOrOpts || {}
    const useBusy = opts.busy !== false
    const doRefresh = opts.refresh !== false
    const doStats = Boolean(opts.refreshStats)

    if (useBusy) setBusy(true)
    setError(null)
    try {
      await action()
      if (doRefresh && tab !== 'board') await refresh()
      else if (doStats && (tab === 'today' || tab === 'master')) await refreshStatsQuiet()
      if (opts.success) flash(opts.success)
    } catch {
      setError('That action didn’t save. Try again.')
      if (tab !== 'board') await refresh()
    } finally {
      if (useBusy) setBusy(false)
    }
  }

  async function addQuickTask() {
    const title = draft.trim()
    if (!title) return
    await run(async () => {
      await api.createTask({
        title,
        category: category === 'All' ? 'Daily' : category,
        addToToday: true,
        date,
      })
      setDraft('')
    }, 'Task added')
  }

  async function saveModal() {
    if (!form.title.trim()) return
    const checklist = form.subtasks.map((s) => s.trim()).filter(Boolean)
    await run(async () => {
      await api.createTask({
        title: form.title.trim(),
        notes: form.notes,
        category: form.category,
        projectTag: form.projectTag,
        priority: form.priority,
        cadenceWeekday: form.category === 'Weekly' ? form.cadenceWeekday : null,
        cadenceMonthDay: form.category === 'Monthly' ? form.cadenceMonthDay : null,
        subtasks: checklist,
        addToToday: tab !== 'master',
        date,
      })
      setModal(null)
      setEditing(null)
      setForm(EMPTY_DRAFT)
    }, 'Task added')
  }

  async function confirmDelete() {
    if (!editing) return
    const deletedId = editing.id
    await run(async () => {
      await api.deleteTask(deletedId)
      setModal(null)
      setEditing(null)
      setNotesFocus((focus) =>
        focus?.source === 'task' && focus.id === deletedId ? null : focus,
      )
      setFocusTaskId((id) => (id === deletedId ? null : id))
      setFocusSession((on) => (focusTaskId === deletedId ? false : on))
    }, 'Task deleted')
  }

  async function exportBackup() {
    await run(async () => {
      const data = await api.exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `progress-hub-${localISODate()}.json`
      a.click()
      URL.revokeObjectURL(url)
    }, 'Backup downloaded')
  }

  async function importBackup(file: File) {
    await run(async () => {
      const text = await file.text()
      const payload = JSON.parse(text) as Record<string, unknown>
      const result = await api.importAll(payload)
      flash(
        `Restored ${result.counts.tasks} tasks · ${result.counts.dayEntries} day entries`,
      )
    })
  }

  function onImportClick() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const ok = window.confirm(
        'Replace all local data with this backup? This cannot be undone.',
      )
      if (!ok) return
      void importBackup(file)
    }
    input.click()
  }

  const listCompleted = tasks.filter((t) =>
    tab === 'master' ? t.status === 'done' : Boolean(t.entry?.completed),
  ).length
  const completed = stats?.today.completed ?? listCompleted
  const total = stats?.today.total ?? tasks.length
  const checklistDone =
    stats?.today.checklistDone ??
    tasks.reduce((sum, t) => sum + (t.subtaskProgress?.done ?? 0), 0)
  const checklistTotal =
    stats?.today.checklistTotal ??
    tasks.reduce((sum, t) => sum + (t.subtaskProgress?.total ?? 0), 0)
  const unitsDone = completed + checklistDone
  const unitsTotal = total + checklistTotal
  const completedPercent = unitsTotal
    ? Math.round((unitsDone / unitsTotal) * 100)
    : 0
  const hours = useMemo(() => {
    if (tab !== 'today') return stats?.today.hours ?? 0
    return tasks.reduce((sum, t) => sum + liveHours(t, tick), 0)
  }, [tasks, tick, tab, stats])

  if (supabaseAuthEnabled && (!sessionReady || !signedIn)) {
    return <SignInScreen forbidden={authForbidden} />
  }

  return (
    <div
      className={`app-shell${notesFocus ? ' with-drawer' : ''}`}
      style={{ ['--notes-drawer-width' as string]: `${notesDrawerWidth}px` }}
    >
      <div className="hub">
        <header className="hub-header">
          <div className="hub-track hub-header-inner">
            <div className="hub-brand">
              <div className="brand-icon" aria-hidden>
                ⚡
              </div>
              <h1>{taskCopy.brandTitleShort}</h1>
            </div>

            <nav className="nav-tabs" aria-label={taskCopy.navPrimaryAria}>
              {NAV_ITEMS.map((item, index) => {
                const prev = NAV_ITEMS[index - 1]
                const showSep = Boolean(prev?.primary && !item.primary)
                const label =
                  item.value === 'today' && !isToday
                    ? format(parseISO(date), 'MMM d')
                    : item.label
                return (
                  <span key={item.value} className="nav-tab-wrap">
                    {showSep ? <span className="nav-sep" aria-hidden /> : null}
                    <button
                      type="button"
                      className={`nav-tab${tab === item.value ? ' active' : ''}${item.primary ? '' : ' nav-tab-secondary'}`}
                      onClick={() => {
                        if (item.value === 'analytics') {
                          setAnalyticsHabitDetail(false)
                        }
                        setTab(item.value)
                      }}
                      aria-current={tab === item.value ? 'page' : undefined}
                    >
                      {label}
                      {item.value === 'master' && masterCount > 0 ? (
                        <span className="nav-tab-count">{masterCount}</span>
                      ) : null}
                    </button>
                  </span>
                )
              })}
            </nav>

            <div className="header-actions">
              <Menu shadow="md" width={200} position="bottom-end">
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="lg"
                    aria-label={taskCopy.moreMenu}
                    title={taskCopy.moreMenu}
                  >
                    <IconDotsVertical size={18} stroke={1.5} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    onClick={() => toggleColorScheme()}
                    leftSection={
                      computedScheme === 'dark' ? (
                        <IconSun size={16} stroke={1.5} />
                      ) : (
                        <IconMoon size={16} stroke={1.5} />
                      )
                    }
                  >
                    {computedScheme === 'dark'
                      ? themeCopy.useLight
                      : themeCopy.useDark}
                  </Menu.Item>
                  <Menu.Item onClick={() => setTagsOpen(true)}>
                    {taskCopy.tagsNav}
                  </Menu.Item>
                  <Menu.Item onClick={() => void exportBackup()}>
                    {taskCopy.exportBackup}
                  </Menu.Item>
                  <Menu.Item onClick={onImportClick}>
                    {taskCopy.importBackup}
                  </Menu.Item>
                  {supabaseAuthEnabled ? (
                    <Menu.Item
                      onClick={() => {
                        void getSupabase()?.auth.signOut()
                      }}
                    >
                      {authCopy.signOut}
                    </Menu.Item>
                  ) : null}
                </Menu.Dropdown>
              </Menu>
              <Button
                color="dark"
                size={isNarrow ? 'xs' : 'sm'}
                onClick={() => {
                  setForm(EMPTY_DRAFT)
                  setEditing(null)
                  setModal('add')
                }}
              >
                {isNarrow ? taskCopy.addTaskShort : taskCopy.addTask}
              </Button>
            </div>
          </div>
        </header>

        {error && (
          <Alert
            className="hub-track"
            color="red"
            variant="light"
            role="alert"
            withCloseButton={false}
            mt="sm"
            mb="sm"
          >
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm">{error}</Text>
              <Button variant="default" size="xs" onClick={() => void refresh()}>
                Retry
              </Button>
            </Group>
          </Alert>
        )}

        <div
          className={`hub-body${tab === 'maps' && mapsEditing ? ' is-maps-editor' : ''}`}
        >
          <div className="hub-track hub-body-inner">
          <ViewStage stageKey={tab}>
          {tab === 'now' && (
            <NowView
              date={date}
              tick={tick}
              busy={busy}
              tasks={tasks}
              onOpenTask={openTask}
              onEnsureTask={(task) => {
                setTasks((prev) => ensureTaskPresent(prev, task))
              }}
              onToggleItem={(taskId, sid, doneVal) =>
                toggleSubtaskFor(taskId, sid, doneVal)
              }
              onTogglePin={(taskId, sid, pinned) =>
                togglePinFor(taskId, sid, pinned)
              }
              onToggleTimer={async (taskId, sid, action) => {
                if (action === 'start') await startSubtaskTimerFor(taskId, sid)
                else await stopTaskTimer(taskId)
              }}
              onError={setError}
              onToast={flash}
            />
          )}
          {(tab === 'today' || tab === 'master') && (
            <div
              className={
                tab === 'today'
                  ? `today-layout${
                      category === 'Projects'
                        ? ` is-projects${projectsNotesOpen ? ' is-notes-open' : ''}`
                        : ''
                    }`
                  : undefined
              }
            >
              <div className={tab === 'today' ? 'today-main' : undefined}>
              <div className="toolbar">
                <div className="toolbar-left">
                  <Title order={2} size="h3">
                    {category === 'Projects'
                      ? projectsCopy.boardTitle
                      : tab === 'today'
                        ? `${isToday ? "Today's" : ''} Focus Tasks`.trim()
                        : 'Master Tasks'}
                  </Title>
                  {tab === 'today' && (
                    <div className="date-nav" aria-label="Choose date">
                      <ActionIcon
                        variant="default"
                        aria-label="Previous day"
                        onClick={() => setDate(shiftISODate(date, -1))}
                      >
                        ‹
                      </ActionIcon>
                      <TextInput
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.currentTarget.value)}
                        aria-label="Date"
                        className="date-nav-input"
                        size="xs"
                      />
                      <ActionIcon
                        variant="default"
                        aria-label="Next day"
                        onClick={() => setDate(shiftISODate(date, 1))}
                      >
                        ›
                      </ActionIcon>
                      {!isToday && (
                        <Button
                          variant="default"
                          size="xs"
                          onClick={() => setDate(localISODate())}
                        >
                          Jump to today
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="filters" role="tablist" aria-label="Category">
                  {categoryFilters.map((c) => {
                    const label = frequencyFilterLabel(c, Boolean(isNarrow))
                    return (
                      <button
                        key={c}
                        type="button"
                        role="tab"
                        aria-selected={category === c}
                        aria-label={label !== c ? c : undefined}
                        className={`filter-chip${category === c ? ' active' : ''}`}
                        onClick={() => setCategory(c)}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {tab === 'today' && category !== 'Projects' && (
                <div className="today-overview">
                  <HabitsPanel
                    date={date}
                    habits={habits}
                    onHabitsChange={setHabits}
                    busy={busy}
                    onError={setError}
                    onOpenHistory={() => {
                      setAnalyticsHabitDetail(true)
                      setTab('analytics')
                    }}
                  />
                </div>
              )}

              <div
                className={`task-list${category === 'Projects' ? ' is-projects-board' : ''}${softRefreshing ? ' is-refreshing' : ''}`}
                aria-busy={softRefreshing || undefined}
              >
                {showTaskSkeletons && (
                  <>
                    <div className="skeleton" />
                    <div className="skeleton" />
                    <div className="skeleton" />
                  </>
                )}
                {!fetching && tasks.length === 0 && category !== 'Projects' && (
                  <div className="empty">
                    <strong>{taskCopy.emptyTodayTitle}</strong>
                    {taskCopy.emptyTodayBody}
                  </div>
                )}
                {category === 'Projects' ? (
                  <ProjectsBoard
                    tab={tab}
                    date={date}
                    tasks={tasks}
                    setTasks={setTasks}
                    busy={busy}
                    onRun={run}
                    onOpenTask={openTask}
                    onFocusEnter={(taskId, force) => enterFocus(taskId, force)}
                    selectedTaskId={
                      notesFocus?.source === 'task' ? notesFocus.id : null
                    }
                    onError={setError}
                    onToast={flash}
                    onRefresh={refresh}
                    addToToday={tab !== 'master'}
                    notesOpen={projectsNotesOpen}
                    onToggleNotes={toggleProjectsNotes}
                    showNotesToggle={tab === 'today'}
                  />
                ) : (
                  tasks.length > 0 && (
                    <SortableTaskList
                      tab={tab}
                      date={date}
                      tasks={tasks}
                      setTasks={setTasks}
                      listSort={listSort}
                      setListSort={setListSort}
                      busy={busy}
                      tick={tick}
                      expanded={expanded}
                      setExpanded={setExpanded}
                      liveHours={liveHours}
                      onRun={run}
                      onDelete={(task) => {
                        setEditing(task)
                        setModal('delete')
                      }}
                      onOpenTask={openTask}
                      onFocusEnter={(taskId, force) => enterFocus(taskId, force)}
                      selectedTaskId={
                        notesFocus?.source === 'task' ? notesFocus.id : null
                      }
                      onError={setError}
                      onToast={flash}
                      onRefresh={refresh}
                    />
                  )
                )}

                {tab === 'today' && category !== 'Projects' && (
                  <div className="add-row">
                    <TextInput
                      style={{ flex: 1 }}
                      value={draft}
                      placeholder="+ Add a task for this day…"
                      onChange={(e) => setDraft(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addQuickTask()
                      }}
                      disabled={busy}
                    />
                    <Button
                      variant="default"
                      disabled={busy || !draft.trim()}
                      onClick={() => void addQuickTask()}
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>
              </div>
              {tab === 'today' && category !== 'Projects' && (
                <div className="today-side">
                  <DaySnapshot
                    completed={completed}
                    total={total}
                    checklistDone={checklistDone}
                    checklistTotal={checklistTotal}
                    completedPercent={completedPercent}
                    hours={hours}
                    timerRunning={tasks.some((t) => t.entry?.timerStartedAt)}
                    sessions={stats?.sessions ?? []}
                    tick={tick}
                  />
                  <ProgressPanel
                    date={date}
                    week={week}
                    onWeekChange={setWeek}
                    onOpenAnalytics={() => {
                      setAnalyticsHabitDetail(false)
                      setTab('analytics')
                    }}
                    onSelectDate={setDate}
                    onError={setError}
                  />
                </div>
              )}
              {tab === 'today' &&
                category === 'Projects' &&
                projectsNotesOpen && (
                  <aside
                    className="today-side projects-notes-dock"
                    aria-label="Notes"
                  >
                    <div className="projects-notes-dock-head">
                      <button
                        type="button"
                        className="projects-notes-dock-collapse"
                        onClick={toggleProjectsNotes}
                      >
                        Hide notes
                      </button>
                    </div>
                    <NotesPanel
                      version={notesVersion}
                      busy={busy}
                      onOpen={openNoteSubject}
                      onChanged={bumpNotesVersion}
                      onError={setError}
                    />
                  </aside>
                )}
            </div>
          )}

          {tab === 'board' && (
            <Suspense fallback={<LazyFallback />}>
              <KanbanBoard
                date={date}
                busy={busy}
                onToast={flash}
                onError={setError}
                onOpenNotes={openTask}
              />
            </Suspense>
          )}

          {tab === 'maps' && (
            <Suspense fallback={<LazyFallback />}>
              <MapsView
                onError={setError}
                onToast={flash}
                onEditingChange={setMapsEditing}
              />
            </Suspense>
          )}

          {tab === 'analytics' && (
            <Suspense fallback={<LazyFallback />}>
              <AnalyticsView
                stats={stats}
                habitsProgress={habitsProgress}
                loading={analyticsLoading}
                date={date}
                preferHabitDetail={analyticsHabitDetail}
                onSelectDate={(d) => {
                  setDate(d)
                  setTab('today')
                }}
                onGoToday={() => setTab('today')}
                onOpenTaskId={openAnalyticsTask}
              />
            </Suspense>
          )}

          {tab === 'notes' && (
            <Suspense fallback={<LazyFallback />}>
              <NotesView
                version={notesVersion}
                busy={busy}
                onOpen={openNoteSubject}
                onChanged={bumpNotesVersion}
                onError={setError}
                onToast={flash}
              />
            </Suspense>
          )}

          {tab === 'history' && (
            <HistoryPanel
              logs={history}
              busy={busy}
              loading={showPending}
              onHoursChange={async (id, hours) => {
                try {
                  const updated = await api.patchHistoryLog(id, { hours })
                  setHistory((prev) =>
                    prev.map((row) => (row.id === id ? updated : row)),
                  )
                  flash(historyCopy.saved)
                  void refreshStatsQuiet()
                } catch {
                  setError(historyCopy.saveFailed)
                  throw new Error('history-hours-failed')
                }
              }}
            />
          )}

          {tab === 'dates' && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Completed</th>
                    <th>Total</th>
                    <th>Hours</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dates.map((row) => (
                    <tr key={row.date}>
                      <td>{format(parseISO(row.date), 'EEE, MMM d yyyy')}</td>
                      <td>{row.completed}</td>
                      <td>{row.total}</td>
                      <td>{row.hours}</td>
                      <td>
                        <Button
                          variant="default"
                          size="xs"
                          onClick={() => {
                            setDate(row.date)
                            setTab('today')
                          }}
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {showPending && dates.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <div className="skeleton" style={{ margin: 0 }} />
                      </td>
                    </tr>
                  )}
                  {!fetching && dates.length === 0 && (
                    <tr>
                      <td colSpan={5}>No past days yet. Complete or time a task today.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          </ViewStage>
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={`banner toast${toastVisible ? ' is-visible' : ''}`}
          role="status"
        >
          {toast}
        </div>
      )}

      {modal === 'add' && (
        <TaskModal
          value={form}
          onChange={setForm}
          onClose={() => {
            setModal(null)
            setEditing(null)
          }}
          onSave={() => void saveModal()}
          busy={busy}
        />
      )}

      {modal === 'delete' && editing && (
        <Modal
          opened
          onClose={() => setModal(null)}
          title="Delete this task?"
          size="sm"
          fullScreen={Boolean(isNarrow)}
        >
          <Text size="sm" c="dimmed" mb="lg">
            “{editing.title}” will be removed permanently, including checklist items and time
            logs.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={busy}
              loading={busy}
              onClick={() => void confirmDelete()}
            >
              Delete task
            </Button>
          </Group>
        </Modal>
      )}

      {notesSubject?.source === 'task' && (
        <Suspense fallback={<LazyFallback />}>
        <TaskDetailPanel
          taskId={notesSubject.id}
          title={notesSubject.title}
          notesHtml={
            detailTaskLive?.notes ?? notesSubject.body ?? ''
          }
          subtasks={detailTaskLive?.subtasks ?? []}
          projectTag={notesSubject.projectTag}
          priority={notesSubject.priority}
          category={notesSubject.category}
          cadenceWeekday={notesSubject.cadenceWeekday}
          cadenceMonthDay={notesSubject.cadenceMonthDay}
          status={notesSubject.status}
          timerSubtaskId={detailTaskLive?.entry?.timerSubtaskId ?? null}
          timerStartedAt={detailTaskLive?.entry?.timerStartedAt ?? null}
          tick={tick}
          busy={busy}
          focusTitle={notesFocusTitle}
          sessionActive={focusSession && notesSubject.id === focusTaskId}
          workedHours={
            detailTaskLive ? liveHours(detailTaskLive, tick) : 0
          }
          onClose={() => {
            setNotesFocus(null)
            setNotesFocusTitle(false)
            setFocusSession(false)
            setFocusTaskId(null)
          }}
          onSaveNotes={(id, notesHtml) => saveTaskNotes(id, notesHtml)}
          onMetaChange={async (meta: DetailMetaPatch) => {
            const id = notesSubject.id
            const updated = await api.updateTask(id, {
              ...meta,
              category: meta.category as Task['category'] | undefined,
              date,
            })
            setTasks((prev) => mergeTask(prev, updated))
            setNotesFocus((t) =>
              t && t.id === id && t.source === 'task'
                ? {
                    ...t,
                    title: updated.title,
                    projectTag: updated.projectTag,
                    priority: updated.priority,
                    category: updated.category,
                    cadenceWeekday: updated.cadenceWeekday,
                    cadenceMonthDay: updated.cadenceMonthDay,
                    status: updated.status,
                  }
                : t,
            )
            bumpNotesVersion()
          }}
          onDelete={() => {
            const task =
              detailTaskLive ??
              ({
                id: notesSubject.id,
                title: notesSubject.title,
              } as Task)
            setEditing(task)
            setModal('delete')
          }}
          onToggleSubtask={(sid, doneVal) =>
            toggleSubtaskFor(notesSubject.id, sid, doneVal)
          }
          onRenameSubtask={(sid, title) =>
            renameSubtaskFor(notesSubject.id, sid, title)
          }
          onAddSubtask={async (title, opts) =>
            addSubtaskFor(notesSubject.id, title, opts)
          }
          onDeleteSubtask={(sid) => deleteSubtaskFor(notesSubject.id, sid)}
          onStartSubtaskTimer={(sid) =>
            startSubtaskTimerFor(notesSubject.id, sid)
          }
          onStopSubtaskTimer={() => void stopTaskTimer(notesSubject.id)}
          onReorderSubtasks={(orderedIds) =>
            reorderSubtasksFor(notesSubject.id, orderedIds)
          }
          onTogglePin={(sid, pinned) =>
            togglePinFor(notesSubject.id, sid, pinned)
          }
        />
        </Suspense>
      )}

      {notesSubject && notesSubject.source === 'note' && (
        <Suspense fallback={<LazyFallback />}>
        <NotesDrawer
          subject={notesSubject}
          width={notesDrawerWidth}
          onWidthChange={setNotesDrawerWidth}
          busy={busy}
          focusTitle={notesFocusTitle}
          side="right"
          onClose={() => {
            setNotesFocus(null)
            setNotesFocusTitle(false)
          }}
          onSave={async (notesHtml) => {
            const { id, source } = notesSubject
            try {
              await api.updateNote(id, { body: notesHtml })
              setNotesFocus((t) =>
                t && t.id === id && t.source === source
                  ? { ...t, body: notesHtml }
                  : t,
              )
              bumpNotesVersion()
            } catch {
              setError('Notes didn’t save. Use Retry in the notes panel.')
              throw new Error('notes-save-failed')
            }
          }}
          onMetaChange={async (meta: DetailMetaPatch) => {
            const { id } = notesSubject
            try {
              const updated = await api.updateNote(id, {
                title: meta.title,
                projectTag: meta.projectTag,
                priority: meta.priority,
                pinned: meta.pinned,
              })
              setNotesFocus({
                id: updated.id,
                source: 'note',
                title: updated.title,
                body: updated.body,
                projectTag: updated.projectTag,
                priority: updated.priority as Task['priority'],
                pinned: updated.pinned,
              })
              bumpNotesVersion()
              if (meta.pinned !== undefined) {
                flash(
                  meta.pinned
                    ? notesListCopy.pinnedToast
                    : notesListCopy.unpinnedToast,
                )
              }
            } catch {
              setError('Notes didn’t save. Use Retry in the notes panel.')
              throw new Error('notes-meta-failed')
            }
          }}
        />
        </Suspense>
      )}

      <TagsPanel
        opened={tagsOpen}
        onClose={() => {
          setTagsOpen(false)
          void refresh()
        }}
      />
    </div>
  )
}
