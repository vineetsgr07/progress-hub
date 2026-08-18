import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionIcon, Button, TextInput } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { api } from '../api'
import type { MindmapListItem } from '../types'
import { mapsCopy } from './maps-copy'
import { MindmapEditor } from './MindmapEditor'

type Props = {
  onError?: (message: string) => void
  onToast?: (message: string) => void
  /** True while a map editor fills the hub body (full-bleed layout). */
  onEditingChange?: (editing: boolean) => void
}

export function MapsView({ onError, onToast, onEditingChange }: Props) {
  const [maps, setMaps] = useState<MindmapListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const res = await api.getMindmaps()
      if (id !== requestId.current) return
      setMaps(res.mindmaps)
    } catch (err) {
      if (id !== requestId.current) return
      const msg = err instanceof Error ? err.message : mapsCopy.loadError
      setError(msg)
      onError?.(msg)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  const createMap = async () => {
    setBusy(true)
    try {
      const map = await api.createMindmap({ title: mapsCopy.untitled })
      setMaps((prev) => [...(prev ?? []), map])
      setOpenId(map.id)
      onToast?.(mapsCopy.newMap)
    } catch (err) {
      onError?.(err instanceof Error ? err.message : mapsCopy.loadError)
    } finally {
      setBusy(false)
    }
  }

  const deleteMap = async (item: MindmapListItem) => {
    if (!window.confirm(mapsCopy.deleteConfirm(item.title))) return
    setBusy(true)
    try {
      await api.deleteMindmap(item.id)
      setMaps((prev) => (prev ?? []).filter((m) => m.id !== item.id))
      if (openId === item.id) setOpenId(null)
    } catch (err) {
      onError?.(err instanceof Error ? err.message : mapsCopy.loadError)
    } finally {
      setBusy(false)
    }
  }

  const commitRename = async (item: MindmapListItem) => {
    const next = renameValue.trim() || mapsCopy.untitled
    setRenamingId(null)
    if (next === item.title) return
    setBusy(true)
    try {
      const updated = await api.updateMindmap(item.id, { title: next })
      setMaps((prev) =>
        (prev ?? []).map((m) =>
          m.id === item.id
            ? { ...m, title: updated.title, updatedAt: updated.updatedAt }
            : m,
        ),
      )
    } catch (err) {
      onError?.(err instanceof Error ? err.message : mapsCopy.saveFailed)
    } finally {
      setBusy(false)
    }
  }

  const openItem = maps?.find((m) => m.id === openId) ?? null
  const editing = Boolean(openId && openItem)

  useEffect(() => {
    onEditingChange?.(editing)
    return () => onEditingChange?.(false)
  }, [editing, onEditingChange])

  if (openId && openItem) {
    return (
      <MindmapEditor
        id={openId}
        initialTitle={openItem.title}
        onBack={() => {
          setOpenId(null)
          void load()
        }}
        onTitleChange={(title) => {
          setMaps((prev) =>
            (prev ?? []).map((m) =>
              m.id === openId ? { ...m, title } : m,
            ),
          )
        }}
        onError={onError}
      />
    )
  }

  if (openId && !openItem && !loading) {
    return (
      <div className="maps-view">
        <p className="maps-error">{mapsCopy.loadError}</p>
        <div className="maps-editor-error-actions">
          <Button variant="subtle" onClick={() => setOpenId(null)}>
            {mapsCopy.back}
          </Button>
          <Button variant="light" onClick={() => void load()}>
            {mapsCopy.retry}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="maps-view">
      <div className="maps-view-header">
        <div>
          <h2>{mapsCopy.title}</h2>
          <p className="maps-view-subtitle">{mapsCopy.subtitle}</p>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => void createMap()}
          disabled={busy}
        >
          {mapsCopy.newMap}
        </Button>
      </div>

      {loading && <p className="maps-muted">{mapsCopy.loading}</p>}
      {error && !loading && (
        <div className="maps-error-block">
          <p className="maps-error">{error}</p>
          <Button variant="light" size="compact-sm" onClick={() => void load()}>
            {mapsCopy.retry}
          </Button>
        </div>
      )}

      {!loading && !error && maps && maps.length === 0 && (
        <div className="maps-empty">
          <p>{mapsCopy.empty}</p>
          <p className="maps-empty-hint">{mapsCopy.emptyHint}</p>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => void createMap()}
            disabled={busy}
          >
            {mapsCopy.newMap}
          </Button>
        </div>
      )}

      {!loading && maps && maps.length > 0 && (
        <ul className="maps-list">
          {maps.map((item) => (
            <li key={item.id} className="maps-list-item">
              <div className="maps-list-thumb" aria-hidden>
                <span className="maps-list-thumb-node" />
                <span className="maps-list-thumb-node is-small" />
                <span className="maps-list-thumb-line" />
              </div>
              {renamingId === item.id ? (
                <TextInput
                  autoFocus
                  size="sm"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.currentTarget.value)}
                  onBlur={() => void commitRename(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void commitRename(item)
                    }
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  aria-label={mapsCopy.rename}
                />
              ) : (
                <button
                  type="button"
                  className="maps-list-open"
                  onClick={() => setOpenId(item.id)}
                  onDoubleClick={() => {
                    setRenamingId(item.id)
                    setRenameValue(item.title)
                  }}
                >
                  <span className="maps-list-title">{item.title}</span>
                  <span className="maps-list-meta">
                    {mapsCopy.updated(item.updatedAt)}
                  </span>
                </button>
              )}
              <div className="maps-list-actions">
                <Button
                  variant="subtle"
                  size="compact-xs"
                  disabled={busy}
                  onClick={() => {
                    setRenamingId(item.id)
                    setRenameValue(item.title)
                  }}
                >
                  {mapsCopy.rename}
                </Button>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={mapsCopy.delete}
                  disabled={busy}
                  onClick={() => void deleteMap(item)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
