import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { api, type ListSort } from '../api'
import {
  DEFAULT_TAG_COLORS,
  DEFAULT_TAG_LISTS,
  addToTagLists,
  clearLocalTagColors,
  hasLocalTagColors,
  isBuiltinFrequency,
  loadTagColors,
  normalizeTagColors,
  normalizeTagLists,
  removeFromTagLists,
  renameInTagLists,
  renameTagColorKey,
  resolveTagSwatch,
  setTagColor,
  type TagColorMap,
  type TagKind,
  type TagLists,
  type TagSwatch,
} from './tags'

type TagColorsApi = {
  colors: TagColorMap
  lists: TagLists
  listSort: ListSort
  setListSort: Dispatch<SetStateAction<ListSort>>
  frequencies: string[]
  projects: string[]
  priorities: string[]
  setColor: (kind: TagKind, value: string, swatchKey: string) => void
  addTag: (kind: 'category' | 'project', value: string) => void
  renameTag: (kind: 'category' | 'project', from: string, to: string) => Promise<void>
  removeTag: (kind: 'category' | 'project', value: string) => void
  resetDefaults: () => void
  swatchFor: (kind: TagKind, value: string) => TagSwatch
  isLockedFrequency: (value: string) => boolean
}

const TagColorsContext = createContext<TagColorsApi | null>(null)

function persistColors(next: TagColorMap) {
  void api.patchSettings({ tagColors: next }).catch(() => undefined)
}

function persistLists(next: TagLists) {
  void api.patchSettings({ tagLists: next }).catch(() => undefined)
}

export function TagColorsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<TagColorMap>(() => loadTagColors())
  const [lists, setLists] = useState<TagLists>(() =>
    structuredClone(DEFAULT_TAG_LISTS),
  )
  const [listSort, setListSort] = useState<ListSort>({
    field: 'manual',
    dir: 'asc',
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const settings = await api.getSettings()
        if (cancelled) return
        if (settings.listSort) setListSort(settings.listSort)
        if (settings.tagColors) {
          setColors(normalizeTagColors(settings.tagColors))
          clearLocalTagColors()
        } else if (hasLocalTagColors()) {
          const local = loadTagColors()
          setColors(local)
          await api.patchSettings({ tagColors: local })
          if (!cancelled) clearLocalTagColors()
        }
        if (settings.tagLists) {
          setLists(normalizeTagLists(settings.tagLists))
        }
      } catch {
        /* keep defaults / local fallback */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const apiValue = useMemo<TagColorsApi>(
    () => ({
      colors,
      lists,
      listSort,
      setListSort,
      frequencies: lists.category,
      projects: lists.project,
      priorities: ['High', 'Medium', 'Low'],
      isLockedFrequency: isBuiltinFrequency,
      setColor(kind, value, swatchKey) {
        setColors((prev) => {
          const next = setTagColor(prev, kind, value, swatchKey)
          persistColors(next)
          return next
        })
      },
      addTag(kind, value) {
        setLists((prev) => {
          const next = addToTagLists(prev, kind, value)
          if (next === prev) return prev
          persistLists(next)
          return next
        })
        setColors((prev) => {
          const trimmed = value.trim()
          if (!trimmed || prev[kind]?.[trimmed]) return prev
          const next = setTagColor(prev, kind, trimmed, 'slate')
          persistColors(next)
          return next
        })
      },
      async renameTag(kind, from, to) {
        const trimmed = to.trim()
        if (!trimmed || trimmed === from) return
        if (kind === 'category' && isBuiltinFrequency(from)) return

        const res = await api.renameTag({ kind, from, to: trimmed })
        if (res.tagLists) setLists(normalizeTagLists(res.tagLists))
        else {
          setLists((prev) => {
            const next = renameInTagLists(prev, kind, from, trimmed)
            persistLists(next)
            return next
          })
        }
        if (res.tagColors) setColors(normalizeTagColors(res.tagColors))
        else {
          setColors((prev) => {
            const next = renameTagColorKey(prev, kind, from, trimmed)
            persistColors(next)
            return next
          })
        }
      },
      removeTag(kind, value) {
        if (kind === 'category' && isBuiltinFrequency(value)) return
        setLists((prev) => {
          const next = removeFromTagLists(prev, kind, value)
          persistLists(next)
          return next
        })
      },
      resetDefaults() {
        const freshColors: TagColorMap = {
          category: { ...DEFAULT_TAG_COLORS.category },
          project: { ...DEFAULT_TAG_COLORS.project },
          priority: { ...DEFAULT_TAG_COLORS.priority },
        }
        const freshLists = structuredClone(DEFAULT_TAG_LISTS)
        persistColors(freshColors)
        persistLists(freshLists)
        setColors(freshColors)
        setLists(freshLists)
      },
      swatchFor(kind, value) {
        return resolveTagSwatch(kind, value, colors)
      },
    }),
    [colors, lists, listSort],
  )

  return (
    <TagColorsContext.Provider value={apiValue}>{children}</TagColorsContext.Provider>
  )
}

export function useTagColors(): TagColorsApi {
  const ctx = useContext(TagColorsContext)
  if (!ctx) {
    throw new Error('useTagColors must be used within TagColorsProvider')
  }
  return ctx
}
