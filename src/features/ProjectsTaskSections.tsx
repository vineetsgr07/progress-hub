import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Button, TextInput } from '@mantine/core'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { api, type ListSort } from '../api'
import type { Task, ViewTab } from '../types'
import { useTagColors } from './TagColorsContext'
import { SortableTaskList } from './SortableTaskList'
import { projectsCopy } from './projects-copy'
import {
  buildProjectSections,
  readProjectsGroupCollapsed,
  rebuildOrderedIds,
  sectionTaskCount,
  writeProjectsGroupCollapsed,
} from './projects-sections'

type RunOptions = {
  success?: string
  refresh?: boolean
  busy?: boolean
  refreshStats?: boolean
}

type RunFn = (
  action: () => Promise<void>,
  successOrOpts?: string | RunOptions,
) => Promise<void>

type Props = {
  tab: ViewTab
  date: string
  tasks: Task[]
  setTasks: Dispatch<SetStateAction<Task[]>>
  listSort: ListSort
  setListSort: Dispatch<SetStateAction<ListSort>>
  busy: boolean
  tick: number
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  liveHours: (task: Task, tick: number) => number
  onRun: RunFn
  onDelete: (task: Task) => void
  onError: (msg: string) => void
  onToast: (msg: string) => void
  onRefresh: () => Promise<void>
  onOpenTask: (task: Task) => void
  onFocusEnter?: (taskId: string, force?: boolean) => void
  selectedTaskId?: string | null
  addToToday: boolean
}

function tagKey(task: Task): string {
  return (task.projectTag || '').trim() || 'Personal'
}

export function ProjectsTaskSections({
  tab,
  date,
  tasks,
  setTasks,
  listSort,
  setListSort,
  busy,
  tick,
  expanded,
  setExpanded,
  liveHours,
  onRun,
  onDelete,
  onError,
  onToast,
  onRefresh,
  onOpenTask,
  onFocusEnter,
  selectedTaskId,
  addToToday,
}: Props) {
  const { projects, addTag, swatchFor } = useTagColors()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    readProjectsGroupCollapsed(),
  )
  const [addingProject, setAddingProject] = useState(false)
  const [newProject, setNewProject] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const sections = useMemo(
    () => buildProjectSections(tasks, projects),
    [tasks, projects],
  )

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      writeProjectsGroupCollapsed(next)
      return next
    })
  }

  function makeSectionSetTasks(
    sectionKey: string,
  ): Dispatch<SetStateAction<Task[]>> {
    return (updater) => {
      setTasks((prev) => {
        const sectionTasks = prev.filter((t) => tagKey(t) === sectionKey)
        const sectionIds = new Set(sectionTasks.map((t) => t.id))
        const nextSection =
          typeof updater === 'function' ? updater(sectionTasks) : updater
        const result: Task[] = []
        let inserted = false
        for (const t of prev) {
          if (sectionIds.has(t.id)) {
            if (!inserted) {
              result.push(...nextSection)
              inserted = true
            }
          } else {
            result.push(t)
          }
        }
        if (!inserted) result.push(...nextSection)
        return result.map((t, i) => ({ ...t, sortOrder: i }))
      })
    }
  }

  function confirmAddProject() {
    const name = newProject.trim()
    if (!name) return
    addTag('project', name)
    setNewProject('')
    setAddingProject(false)
    setCollapsed((prev) => {
      const next = { ...prev, [name]: false }
      writeProjectsGroupCollapsed(next)
      return next
    })
  }

  async function addTaskToProject(projectTag: string) {
    const title = (drafts[projectTag] || '').trim()
    if (!title) return
    await onRun(async () => {
      await api.createTask({
        title,
        category: 'Projects',
        projectTag,
        addToToday,
        date,
      })
      setDrafts((prev) => ({ ...prev, [projectTag]: '' }))
    }, 'Task added')
  }

  return (
    <div className="projects-sections" aria-label={projectsCopy.sectionsAria}>
      <div className="projects-toolbar">
        {addingProject ? (
          <div className="projects-add-row">
            <TextInput
              style={{ flex: 1 }}
              value={newProject}
              placeholder={projectsCopy.addProjectPlaceholder}
              aria-label={projectsCopy.addProjectAria}
              autoFocus
              onChange={(e) => setNewProject(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAddProject()
                if (e.key === 'Escape') {
                  setAddingProject(false)
                  setNewProject('')
                }
              }}
              disabled={busy}
            />
            <Button
              variant="filled"
              color="dark"
              disabled={busy || !newProject.trim()}
              onClick={confirmAddProject}
            >
              {projectsCopy.addProjectConfirm}
            </Button>
            <Button
              variant="default"
              disabled={busy}
              onClick={() => {
                setAddingProject(false)
                setNewProject('')
              }}
            >
              {projectsCopy.addProjectCancel}
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            size="compact-sm"
            onClick={() => setAddingProject(true)}
          >
            {projectsCopy.addProject}
          </Button>
        )}
      </div>

      {sections.map((section) => {
        const count = sectionTaskCount(section)
        const isCollapsed = Boolean(collapsed[section.key])
        const bodyId = `projects-section-${section.key}`
        const headerSwatch = swatchFor('project', section.label)
        return (
          <section key={section.key} className="projects-section">
            <button
              type="button"
              className="projects-section-header"
              aria-expanded={!isCollapsed}
              aria-controls={bodyId}
              onClick={() => toggleCollapsed(section.key)}
            >
              <span className="projects-section-chevron" aria-hidden>
                {isCollapsed ? (
                  <IconChevronRight size={16} stroke={1.75} />
                ) : (
                  <IconChevronDown size={16} stroke={1.75} />
                )}
              </span>
              <span
                className="projects-section-swatch"
                style={{
                  background: headerSwatch.bg,
                  borderColor: headerSwatch.border,
                }}
                aria-hidden
              />
              <span className="projects-section-label">{section.label}</span>
              <span className="projects-section-count">
                {projectsCopy.sectionCount(count)}
              </span>
              <span className="sr-only">
                {isCollapsed
                  ? projectsCopy.expandSection
                  : projectsCopy.collapseSection}
              </span>
            </button>
            {!isCollapsed && (
              <div id={bodyId} className="projects-section-body">
                {section.items.length > 0 ? (
                  <SortableTaskList
                    tab={tab}
                    date={date}
                    tasks={section.items}
                    setTasks={makeSectionSetTasks(section.key)}
                    listSort={listSort}
                    setListSort={setListSort}
                    busy={busy}
                    tick={tick}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    liveHours={liveHours}
                    onRun={onRun}
                    onDelete={onDelete}
                    onOpenTask={onOpenTask}
                    onFocusEnter={onFocusEnter}
                    selectedTaskId={selectedTaskId}
                    onError={onError}
                    onToast={onToast}
                    onRefresh={onRefresh}
                    compactHeader
                    rebuildOrderedIds={(sectionOrderedIds) =>
                      rebuildOrderedIds(tasks, sectionOrderedIds)
                    }
                  />
                ) : (
                  <p className="projects-section-empty">{projectsCopy.sectionEmpty}</p>
                )}
                <div className="add-row projects-section-add">
                  <TextInput
                    style={{ flex: 1 }}
                    value={drafts[section.key] ?? ''}
                    placeholder={projectsCopy.sectionAddPlaceholder}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [section.key]: e.currentTarget.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void addTaskToProject(section.key)
                    }}
                    disabled={busy}
                  />
                  <Button
                    variant="default"
                    disabled={busy || !(drafts[section.key] || '').trim()}
                    onClick={() => void addTaskToProject(section.key)}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
