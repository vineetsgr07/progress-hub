export const historyCopy = {
  when: 'When',
  task: 'Task',
  checklist: 'Checklist',
  category: 'Category',
  hours: 'Hours',
  note: 'Note',
  empty: 'No timer sessions yet. Start a timer on Today.',
  hoursAria: (title: string) => `Hours for ${title}`,
  saveFailed: 'Couldn’t update hours. Try again.',
  saved: 'Hours updated',
} as const
