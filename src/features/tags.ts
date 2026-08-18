import type { Category, Priority } from '../types'

export type TagKind = 'category' | 'project' | 'priority'

export type TagSwatch = {
  key: string
  label: string
  bg: string
  fg: string
  border: string
}

/** Curated swatches — CSS vars switch light/dark with color scheme. */
export const TAG_SWATCHES: TagSwatch[] = [
  {
    key: 'slate',
    label: 'Slate',
    bg: 'var(--tag-slate-bg)',
    fg: 'var(--tag-slate-ink)',
    border: 'var(--tag-slate-line)',
  },
  {
    key: 'blue',
    label: 'Blue',
    bg: 'var(--tag-blue-bg)',
    fg: 'var(--tag-blue-ink)',
    border: 'var(--tag-blue-line)',
  },
  {
    key: 'green',
    label: 'Green',
    bg: 'var(--tag-green-bg)',
    fg: 'var(--tag-green-ink)',
    border: 'var(--tag-green-line)',
  },
  {
    key: 'teal',
    label: 'Teal',
    bg: 'var(--tag-teal-bg)',
    fg: 'var(--tag-teal-ink)',
    border: 'var(--tag-teal-line)',
  },
  {
    key: 'purple',
    label: 'Purple',
    bg: 'var(--tag-purple-bg)',
    fg: 'var(--tag-purple-ink)',
    border: 'var(--tag-purple-line)',
  },
  {
    key: 'amber',
    label: 'Amber',
    bg: 'var(--tag-amber-bg)',
    fg: 'var(--tag-amber-ink)',
    border: 'var(--tag-amber-line)',
  },
  {
    key: 'orange',
    label: 'Orange',
    bg: 'var(--tag-orange-bg)',
    fg: 'var(--tag-orange-ink)',
    border: 'var(--tag-orange-line)',
  },
  {
    key: 'red',
    label: 'Red',
    bg: 'var(--tag-red-bg)',
    fg: 'var(--tag-red-ink)',
    border: 'var(--tag-red-line)',
  },
  {
    key: 'pink',
    label: 'Pink',
    bg: 'var(--tag-pink-bg)',
    fg: 'var(--tag-pink-ink)',
    border: 'var(--tag-pink-line)',
  },
]

export const FREQUENCY_TAGS: Exclude<Category, 'All'>[] = [
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Goal',
  'Projects',
]

/** Cadence-aware frequencies — colourable, but not renamed or deleted. */
export const BUILTIN_FREQUENCY_TAGS: readonly string[] = [...FREQUENCY_TAGS]

export const PROJECT_TAGS = [
  'Marketing',
  'Development',
  'Work/Client',
  'Management',
  'Personal',
  'Admin/Legal',
] as const

export const PRIORITY_TAGS: Priority[] = ['High', 'Medium', 'Low']

export type TagLists = {
  category: string[]
  project: string[]
}

export const DEFAULT_TAG_LISTS: TagLists = {
  category: [...FREQUENCY_TAGS],
  project: [...PROJECT_TAGS],
}

export function normalizeTagLists(raw: unknown): TagLists {
  const parsed = (raw && typeof raw === 'object' ? raw : {}) as Partial<TagLists>
  const category = Array.isArray(parsed.category)
    ? parsed.category
        .map((v) => String(v).trim())
        .filter(Boolean)
        // Legacy rename: Transactional → Projects
        .map((v) => (v === 'Transactional' ? 'Projects' : v))
    : [...DEFAULT_TAG_LISTS.category]
  const project = Array.isArray(parsed.project)
    ? parsed.project.map((v) => String(v).trim()).filter(Boolean)
    : [...DEFAULT_TAG_LISTS.project]

  // Always keep built-in frequencies present (order: builtins first, then customs).
  const customCats = category.filter((c) => !BUILTIN_FREQUENCY_TAGS.includes(c))
  return {
    category: [...BUILTIN_FREQUENCY_TAGS, ...customCats],
    project: project.length > 0 ? uniquePreserve(project) : [...DEFAULT_TAG_LISTS.project],
  }
}

function uniquePreserve(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

export function isBuiltinFrequency(value: string): boolean {
  return BUILTIN_FREQUENCY_TAGS.includes(value)
}

export function renameInTagLists(
  lists: TagLists,
  kind: 'category' | 'project',
  from: string,
  to: string,
): TagLists {
  const next = to.trim()
  if (!next || from === next) return lists
  if (kind === 'category' && isBuiltinFrequency(from)) return lists
  return {
    ...lists,
    [kind]: uniquePreserve(lists[kind].map((v) => (v === from ? next : v))),
  }
}

export function addToTagLists(
  lists: TagLists,
  kind: 'category' | 'project',
  value: string,
): TagLists {
  const next = value.trim()
  if (!next) return lists
  if (lists[kind].some((v) => v.toLowerCase() === next.toLowerCase())) return lists
  if (kind === 'category' && isBuiltinFrequency(next)) return lists
  return {
    ...lists,
    [kind]: [...lists[kind], next],
  }
}

export function removeFromTagLists(
  lists: TagLists,
  kind: 'category' | 'project',
  value: string,
): TagLists {
  if (kind === 'category' && isBuiltinFrequency(value)) return lists
  return {
    ...lists,
    [kind]: lists[kind].filter((v) => v !== value),
  }
}

export function renameTagColorKey(
  map: TagColorMap,
  kind: TagKind,
  from: string,
  to: string,
): TagColorMap {
  const bucket = { ...map[kind] }
  if (from in bucket) {
    bucket[to] = bucket[from]
    delete bucket[from]
  }
  return { ...map, [kind]: bucket }
}

export type TagColorMap = Record<TagKind, Record<string, string>>

const STORAGE_KEY = 'todo-app.tagColors'

export const DEFAULT_TAG_COLORS: TagColorMap = {
  category: {
    Daily: 'slate',
    Weekly: 'purple',
    Monthly: 'teal',
    Quarterly: 'teal',
    Goal: 'teal',
    Projects: 'orange',
  },
  project: {
    Marketing: 'pink',
    Development: 'blue',
    'Work/Client': 'amber',
    Management: 'purple',
    Personal: 'green',
    'Admin/Legal': 'slate',
  },
  priority: {
    High: 'red',
    Medium: 'amber',
    Low: 'slate',
  },
}

function swatchByKey(key: string | undefined): TagSwatch {
  return TAG_SWATCHES.find((s) => s.key === key) ?? TAG_SWATCHES[0]
}

export function resolveTagSwatch(kind: TagKind, value: string, map: TagColorMap): TagSwatch {
  return swatchByKey(map[kind]?.[value] ?? DEFAULT_TAG_COLORS[kind]?.[value])
}

export function normalizeTagColors(raw: unknown): TagColorMap {
  const parsed = (raw && typeof raw === 'object' ? raw : {}) as Partial<TagColorMap>
  const category = { ...(parsed.category || {}) }
  // Legacy rename: Yearly → Goal (preserve custom color if set).
  if (category.Yearly != null && category.Goal == null) {
    category.Goal = category.Yearly
  }
  delete category.Yearly
  // Legacy rename: Transactional → Projects.
  if (category.Transactional != null && category.Projects == null) {
    category.Projects = category.Transactional
  }
  delete category.Transactional
  return {
    category: { ...DEFAULT_TAG_COLORS.category, ...category },
    project: { ...DEFAULT_TAG_COLORS.project, ...(parsed.project || {}) },
    priority: { ...DEFAULT_TAG_COLORS.priority, ...(parsed.priority || {}) },
  }
}

export function loadTagColors(): TagColorMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_TAG_COLORS)
    return normalizeTagColors(JSON.parse(raw))
  } catch {
    return structuredClone(DEFAULT_TAG_COLORS)
  }
}

export function hasLocalTagColors(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY))
  } catch {
    return false
  }
}

export function saveTagColors(map: TagColorMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearLocalTagColors() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function setTagColor(
  map: TagColorMap,
  kind: TagKind,
  value: string,
  swatchKey: string,
): TagColorMap {
  return {
    ...map,
    [kind]: {
      ...map[kind],
      [value]: swatchKey,
    },
  }
}
