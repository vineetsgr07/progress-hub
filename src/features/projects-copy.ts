export const projectsCopy = {
  boardTitle: 'Projects',
  addProject: '+ Project',
  addProjectPlaceholder: 'New project name…',
  addProjectAria: 'Add a project',
  addProjectConfirm: 'Add',
  addProjectCancel: 'Cancel',
  sectionEmpty: 'No tasks yet',
  sectionAddPlaceholder: '+ Add task…',
  bandAddPlaceholder: '+ Add…',
  bandAddAria: (project: string, status: string) =>
    `Add task to ${project}, ${status}`,
  sectionCount: (n: number) => String(n),
  sectionCountAria: (n: number) => (n === 1 ? '1 task' : `${n} tasks`),
  expandSection: 'Show project tasks',
  collapseSection: 'Hide project tasks',
  sectionsAria: 'Projects',
  boardAria: 'Project board',
  boardEmpty: 'No projects yet',
  boardEmptyHint: 'Add a project to start a column, then drop tasks into To do.',
  columnAddAria: (project: string) => `Add task to ${project}`,
  openNotes: 'Notes',
  closeNotes: 'Hide notes',
  notesToggleAria: (open: boolean, count: number) =>
    open
      ? `Hide notes panel`
      : count > 0
        ? `Show notes panel, ${count} notes`
        : 'Show notes panel',
  dragCardAria: (title: string) => `Drag ${title}`,
  emptyBoardCta: 'Add your first project',
} as const
