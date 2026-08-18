import {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
  createContext,
  useContext,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  NodeResizer,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  ConnectionMode,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnMoveEnd,
  type Viewport,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ActionIcon, Button, TextInput, Tooltip } from '@mantine/core'
import {
  IconArrowLeft,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCopy,
  IconPlus,
  IconNote,
  IconBoxMargin,
  IconX,
  IconRefresh,
} from '@tabler/icons-react'
import { api } from '../api'
import type { MindmapDocument } from '../types'
import { mapsCopy } from './maps-copy'
import { NotesEditor } from './NotesEditor'
import { notesPreviewText } from './notes-html'
import {
  canRedo,
  canUndo,
  EMPTY_HISTORY,
  pushHistory,
  redoHistory,
  undoHistory,
  type MindmapHistory,
  type MindmapSnapshot,
} from './mindmap-history'
import {
  COLOR_OPTIONS,
  NODE_SIZE,
  SHAPE_OPTIONS,
  childOffsetForSide,
  defaultLabelForKind,
  defaultSizeForKind,
  maxSizeForKind,
  minSizeForKind,
  oppositeSide,
  parseMindmapColor,
  parseMindmapEdgeData,
  parseMindmapKind,
  parseMindmapNodeData,
  parseMindmapShape,
  parseNodeSize,
  sideToPosition,
  sourceHandleId,
  targetHandleId,
  type MindmapColor,
  type MindmapEdgeData,
  type MindmapKind,
  type MindmapNodeData,
  type MindmapShape,
  type MindmapSide,
  type NodeSize,
} from './mindmap-model'

type MindmapFlowNode = Node<MindmapNodeData, 'mindmap'>
type MindmapFlowEdge = Edge<MindmapEdgeData>

function edgeVisual(data: MindmapEdgeData) {
  return {
    type: 'smoothstep' as const,
    style: {
      strokeWidth: 1.75,
      ...(data.dashed ? { strokeDasharray: '6 4' } : {}),
    },
    markerEnd:
      data.marker === 'arrow'
        ? { type: MarkerType.ArrowClosed, width: 16, height: 16 }
        : undefined,
    data,
  }
}

const DEFAULT_EDGE_DATA: MindmapEdgeData = { marker: 'arrow', dashed: false }
const DEFAULT_EDGE_OPTIONS = edgeVisual(DEFAULT_EDGE_DATA)

const SIDES: MindmapSide[] = ['left', 'right', 'top', 'bottom']

type MindmapActions = {
  sproutFrom: (nodeId: string, side: MindmapSide) => void
  setTextFocus: (focused: boolean) => void
}

const MindmapActionsContext = createContext<MindmapActions | null>(null)

function useMindmapActions() {
  const ctx = useContext(MindmapActionsContext)
  if (!ctx) throw new Error('MindmapActionsContext missing')
  return ctx
}

function stripUi(nodes: MindmapFlowNode[], edges: MindmapFlowEdge[]): MindmapSnapshot<MindmapFlowNode, MindmapFlowEdge> {
  return {
    nodes: nodes.map((n) => ({
      ...n,
      selected: false,
      className: undefined,
      dragging: false,
    })),
    edges: edges.map((e) => ({
      ...e,
      selected: false,
      className: undefined,
    })),
  }
}

const MindmapNodeView = memo(function MindmapNodeView({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<MindmapFlowNode>) {
  const { updateNodeData } = useReactFlow()
  const { sproutFrom, setTextFocus } = useMindmapActions()
  const titleRef = useRef<HTMLDivElement>(null)
  const kind = parseMindmapKind(data.kind)
  const shape = kind === 'idea' ? parseMindmapShape(data.shape) : 'rounded'
  const color = parseMindmapColor(data.color)
  const preview = kind !== 'frame' ? notesPreviewText(data.body ?? '', 72) : ''
  const showSprouts = kind === 'idea'
  const showHandles = kind !== 'frame'

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    if (el.textContent !== data.label) {
      el.textContent = data.label
    }
  }, [data.label])

  useEffect(() => {
    if (!selected || kind === 'frame') return
    const el = titleRef.current
    if (!el) return
    if (document.activeElement === el) return
    if (data.label === defaultLabelForKind(kind)) {
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [selected, data.label, kind])

  const commitLabel = () => {
    const next = (titleRef.current?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const label = next || defaultLabelForKind(kind)
    if (label !== data.label) {
      updateNodeData(id, { label })
    }
    if (titleRef.current && titleRef.current.textContent !== label) {
      titleRef.current.textContent = label
    }
  }

  const min = minSizeForKind(kind)
  const max = maxSizeForKind(kind)
  const size = defaultSizeForKind(kind)

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={min.width}
        minHeight={min.height}
        maxWidth={max.width}
        maxHeight={max.height}
        keepAspectRatio={shape === 'diamond' || kind === 'sticky'}
        lineClassName="maps-resizer-line"
        handleClassName="maps-resizer-handle"
      />
      <div
        className={`maps-node maps-node-kind-${kind} maps-node-shape-${shape} maps-node-color-${color}${selected ? ' is-selected' : ''}${preview ? ' has-preview' : ''}`}
        style={{
          width: width ?? size.width,
          height: height ?? size.height,
        }}
      >
        {showHandles &&
          SIDES.map((side) => (
            <Handle
              key={`t-${side}`}
              type="target"
              id={targetHandleId(side)}
              position={sideToPosition(side)}
              className={`maps-node-handle maps-node-handle-${side}`}
              aria-label={`Connect on ${side}`}
            />
          ))}
        {showHandles &&
          SIDES.map((side) => (
            <Handle
              key={`s-${side}`}
              type="source"
              id={sourceHandleId(side)}
              position={sideToPosition(side)}
              className={`maps-node-handle maps-node-handle-${side}`}
              aria-label={`Connect from ${side}`}
            />
          ))}

        {showSprouts &&
          SIDES.map((side) => (
            <button
              key={`sprout-${side}`}
              type="button"
              className={`maps-node-sprout maps-node-sprout-${side}`}
              aria-label={mapsCopy.sproutAria(side)}
              tabIndex={selected ? 0 : -1}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                sproutFrom(id, side)
              }}
            >
              <IconPlus size={12} stroke={2.5} />
            </button>
          ))}

        <div className="maps-node-body">
          <div
            ref={titleRef}
            className="maps-node-title nodrag nopan"
            role="textbox"
            aria-label={mapsCopy.nodeLabelAria}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            data-placeholder={defaultLabelForKind(kind)}
            onMouseDown={(e) => e.stopPropagation()}
            onFocus={() => setTextFocus(true)}
            onBlur={() => {
              setTextFocus(false)
              commitLabel()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.blur()
              }
              e.stopPropagation()
            }}
          />
          {preview ? (
            <p className="maps-node-preview">{preview}</p>
          ) : null}
        </div>
      </div>
    </>
  )
})

const nodeTypes = { mindmap: MindmapNodeView }

function readStoredSize(raw: Partial<MindmapFlowNode>, kind: MindmapKind): NodeSize {
  const fallback = defaultSizeForKind(kind)
  const parsed = parseNodeSize(raw.style, {
    width: typeof raw.width === 'number' ? raw.width : null,
    height: typeof raw.height === 'number' ? raw.height : null,
  })
  if (
    parsed.width === NODE_SIZE.width &&
    parsed.height === NODE_SIZE.height &&
    kind !== 'idea' &&
    raw.width == null &&
    raw.height == null &&
    !(raw.style as { width?: unknown } | undefined)?.width
  ) {
    return fallback
  }
  return parsed
}

function toFlowState(doc: MindmapDocument): {
  nodes: MindmapFlowNode[]
  edges: MindmapFlowEdge[]
  viewport: Viewport
} {
  const nodes = (Array.isArray(doc.nodes) ? doc.nodes : []).map((raw, i) => {
    const n = raw as Partial<MindmapFlowNode> & {
      id?: string
      parentId?: string
      extent?: 'parent' | undefined
    }
    const data = parseMindmapNodeData(n.data)
    const size = readStoredSize(n, data.kind)
    const isFrame = data.kind === 'frame'
    return {
      id: String(n.id ?? `n-${i}`),
      type: 'mindmap' as const,
      position: n.position ?? { x: 80 + i * 40, y: 80 + i * 24 },
      data,
      width: size.width,
      height: size.height,
      style: { width: size.width, height: size.height },
      zIndex: isFrame ? -1 : undefined,
      ...(n.parentId ? { parentId: String(n.parentId) } : {}),
      ...(n.parentId ? { extent: 'parent' as const } : {}),
    } satisfies MindmapFlowNode
  })
  const edges = (Array.isArray(doc.edges) ? doc.edges : []).map((raw, i) => {
    const e = raw as Partial<MindmapFlowEdge> & {
      id?: string
      source?: string
      target?: string
    }
    const data = parseMindmapEdgeData(e.data)
    return {
      id: String(e.id ?? `e-${i}`),
      source: String(e.source ?? ''),
      target: String(e.target ?? ''),
      ...edgeVisual(data),
      ...(e.sourceHandle != null ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.targetHandle != null ? { targetHandle: e.targetHandle } : {}),
    } satisfies MindmapFlowEdge
  })
  const vp = doc.viewport as Viewport | undefined
  const viewport: Viewport =
    vp &&
    typeof vp.x === 'number' &&
    typeof vp.y === 'number' &&
    typeof vp.zoom === 'number'
      ? { x: vp.x, y: vp.y, zoom: vp.zoom }
      : { x: 0, y: 0, zoom: 1 }
  return { nodes, edges, viewport }
}

function serializeDocument(
  nodes: MindmapFlowNode[],
  edges: MindmapFlowEdge[],
  viewport: Viewport,
): MindmapDocument {
  return {
    nodes: nodes.map((n) => {
      const kind = parseMindmapKind(n.data?.kind)
      const size = parseNodeSize(n.style, {
        width: n.width,
        height: n.height,
      })
      return {
        id: n.id,
        type: 'mindmap',
        position: n.position,
        width: size.width,
        height: size.height,
        style: { width: size.width, height: size.height },
        ...(n.parentId ? { parentId: n.parentId } : {}),
        data: {
          label: String(n.data?.label ?? ''),
          shape: parseMindmapShape(n.data?.shape),
          body: String(n.data?.body ?? ''),
          kind,
          color: parseMindmapColor(n.data?.color),
        },
      }
    }),
    edges: edges.map((e) => {
      const data = parseMindmapEdgeData(e.data)
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type ?? 'smoothstep',
        data,
        ...(e.sourceHandle != null ? { sourceHandle: e.sourceHandle } : {}),
        ...(e.targetHandle != null ? { targetHandle: e.targetHandle } : {}),
      }
    }),
    viewport,
  }
}

function ShapeGlyph({ shape }: { shape: MindmapShape }) {
  return <span className={`maps-shape-glyph maps-shape-glyph-${shape}`} aria-hidden />
}

type InnerProps = {
  id: string
  initialTitle: string
  onBack: () => void
  onTitleChange?: (title: string) => void
  onError?: (message: string) => void
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type LoadState = 'loading' | 'ready' | 'error'

function MindmapEditorInner({
  id,
  initialTitle,
  onBack,
  onTitleChange,
  onError,
}: InnerProps) {
  const { screenToFlowPosition } = useReactFlow()
  const [title, setTitle] = useState(initialTitle)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadNonce, setLoadNonce] = useState(0)
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<MindmapFlowNode>([])
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<MindmapFlowEdge>([])
  const [defaultViewport, setDefaultViewport] = useState<Viewport>({
    x: 0,
    y: 0,
    zoom: 1,
  })
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [textFocus, setTextFocus] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const historyRef = useRef<MindmapHistory<MindmapFlowNode, MindmapFlowEdge>>(
    EMPTY_HISTORY(),
  )
  const [historyTick, setHistoryTick] = useState(0)
  const saveTimer = useRef<number | null>(null)
  const titleTimer = useRef<number | null>(null)
  const ready = useRef(false)
  const applyingHistory = useRef(false)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  const selectedNodes = nodes.filter((n) => n.selected)
  const selectedEdges = edges.filter((e) => e.selected)
  const activeNode =
    selectedNodes.length === 1 && parseMindmapKind(selectedNodes[0].data.kind) !== 'frame'
      ? selectedNodes[0]
      : null
  const ideaSelection = selectedNodes.filter(
    (n) => parseMindmapKind(n.data.kind) === 'idea',
  )
  const activeShape: MindmapShape | null =
    ideaSelection.length === 0
      ? null
      : ideaSelection.every(
            (n) =>
              parseMindmapShape(n.data.shape) ===
              parseMindmapShape(ideaSelection[0].data.shape),
          )
        ? parseMindmapShape(ideaSelection[0].data.shape)
        : null
  const activeColor: MindmapColor | null =
    selectedNodes.length === 0
      ? null
      : selectedNodes.every(
            (n) =>
              parseMindmapColor(n.data.color) ===
              parseMindmapColor(selectedNodes[0].data.color),
          )
        ? parseMindmapColor(selectedNodes[0].data.color)
        : null

  const bumpHistoryUi = () => setHistoryTick((t) => t + 1)

  const recordHistory = useCallback(() => {
    if (!ready.current || applyingHistory.current) return
    historyRef.current = pushHistory(
      historyRef.current,
      stripUi(nodesRef.current, edgesRef.current),
    )
    bumpHistoryUi()
  }, [])

  const loadMap = useCallback(() => {
    let cancelled = false
    setLoadState('loading')
    ready.current = false
    historyRef.current = EMPTY_HISTORY()
    bumpHistoryUi()
    api
      .getMindmap(id)
      .then((map) => {
        if (cancelled) return
        const { nodes: n, edges: e, viewport } = toFlowState(map.document)
        setNodes(n)
        setEdges(e)
        viewportRef.current = viewport
        setDefaultViewport(viewport)
        setTitle(map.title)
        setLoadState('ready')
        window.setTimeout(() => {
          ready.current = true
        }, 80)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadState('error')
        onError?.(err instanceof Error ? err.message : mapsCopy.loadMapError)
      })
    return () => {
      cancelled = true
    }
  }, [id, onError, setEdges, setNodes])

  useEffect(() => {
    const cancel = loadMap()
    return cancel
  }, [loadMap, loadNonce])

  const persistDocument = useCallback(async () => {
    if (!ready.current) return
    setSaveStatus('saving')
    try {
      await api.updateMindmap(id, {
        document: serializeDocument(
          nodesRef.current,
          edgesRef.current,
          viewportRef.current,
        ),
      })
      setSaveStatus('saved')
    } catch (err) {
      setSaveStatus('error')
      onError?.(err instanceof Error ? err.message : mapsCopy.saveFailed)
    }
  }, [id, onError])

  const scheduleSave = useCallback(() => {
    if (!ready.current) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void persistDocument()
    }, 500)
  }, [persistDocument])

  useEffect(() => {
    if (!ready.current || applyingHistory.current) return
    scheduleSave()
  }, [nodes, edges, scheduleSave])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      if (titleTimer.current) window.clearTimeout(titleTimer.current)
    }
  }, [])

  useEffect(() => {
    if (activeNode) setDetailsOpen(true)
  }, [activeNode])

  const onNodesChange = useCallback(
    (changes: NodeChange<MindmapFlowNode>[]) => {
      const structural = changes.some(
        (c) =>
          c.type === 'remove' ||
          c.type === 'add' ||
          c.type === 'replace' ||
          (c.type === 'position' && c.dragging === false),
      )
      if (structural) recordHistory()
      onNodesChangeBase(changes)
    },
    [onNodesChangeBase, recordHistory],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<MindmapFlowEdge>[]) => {
      const structural = changes.some(
        (c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace',
      )
      if (structural) recordHistory()
      onEdgesChangeBase(changes)
    },
    [onEdgesChangeBase, recordHistory],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      recordHistory()
      setEdges((eds) =>
        addEdge({ ...connection, ...DEFAULT_EDGE_OPTIONS }, eds),
      )
    },
    [recordHistory, setEdges],
  )

  const onMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => {
      viewportRef.current = viewport
      scheduleSave()
    },
    [scheduleSave],
  )

  const applySnapshot = useCallback(
    (snapshot: MindmapSnapshot<MindmapFlowNode, MindmapFlowEdge>) => {
      applyingHistory.current = true
      setNodes(snapshot.nodes.map((n) => ({ ...n })))
      setEdges(snapshot.edges.map((e) => ({ ...e })))
      window.setTimeout(() => {
        applyingHistory.current = false
        scheduleSave()
      }, 0)
    },
    [scheduleSave, setEdges, setNodes],
  )

  const undo = useCallback(() => {
    if (textFocus) return
    const current = stripUi(nodesRef.current, edgesRef.current)
    const step = undoHistory(historyRef.current, current)
    if (!step.snapshot) return
    historyRef.current = step.history
    bumpHistoryUi()
    applySnapshot(step.snapshot)
  }, [applySnapshot, textFocus])

  const redo = useCallback(() => {
    if (textFocus) return
    const current = stripUi(nodesRef.current, edgesRef.current)
    const step = redoHistory(historyRef.current, current)
    if (!step.snapshot) return
    historyRef.current = step.history
    bumpHistoryUi()
    applySnapshot(step.snapshot)
  }, [applySnapshot, textFocus])

  const createNode = useCallback(
    (
      position: { x: number; y: number },
      opts?: {
        shape?: MindmapShape
        color?: MindmapColor
        kind?: MindmapKind
        /** Frame to nest under (xyflow parentId). */
        frameId?: string
        /** Idea to connect from with an edge. */
        connectFrom?: { id: string; side: MindmapSide }
        size?: NodeSize
      },
    ) => {
      recordHistory()
      const kind = opts?.kind ?? 'idea'
      const newId = crypto.randomUUID()
      const shape = opts?.shape ?? 'rounded'
      const color =
        opts?.color ??
        (kind === 'sticky' ? 'amber' : kind === 'frame' ? 'slate' : 'default')
      const size = opts?.size ?? defaultSizeForKind(kind)
      const selectedFrame = nodesRef.current.find(
        (n) => n.selected && parseMindmapKind(n.data.kind) === 'frame',
      )?.id
      const frameId =
        kind !== 'frame'
          ? (opts?.frameId ?? (!opts?.connectFrom ? selectedFrame : undefined))
          : undefined
      const pos =
        frameId && !opts?.connectFrom
          ? {
              x: 32,
              y:
                48 +
                nodesRef.current.filter((n) => n.parentId === frameId).length *
                  24,
            }
          : position

      const newNode: MindmapFlowNode = {
        id: newId,
        type: 'mindmap',
        position: pos,
        data: {
          label: defaultLabelForKind(kind),
          shape,
          body: '',
          kind,
          color,
        },
        selected: true,
        width: size.width,
        height: size.height,
        style: { width: size.width, height: size.height },
        className: 'maps-node-enter',
        zIndex: kind === 'frame' ? -1 : undefined,
        ...(frameId ? { parentId: frameId, extent: 'parent' as const } : {}),
      }
      setNodes((prev) => [
        ...prev.map((n) => ({ ...n, selected: false })),
        newNode,
      ] as MindmapFlowNode[])

      if (opts?.connectFrom && kind === 'idea') {
        const edge: MindmapFlowEdge = {
          id: crypto.randomUUID(),
          source: opts.connectFrom.id,
          target: newId,
          sourceHandle: sourceHandleId(opts.connectFrom.side),
          targetHandle: targetHandleId(oppositeSide(opts.connectFrom.side)),
          ...DEFAULT_EDGE_OPTIONS,
          className: 'maps-edge-enter',
        }
        setEdges((eds) => eds.concat(edge))
      }

      window.setTimeout(() => {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === newId ? { ...n, className: undefined } : n,
          ),
        )
      }, 320)
    },
    [recordHistory, setEdges, setNodes],
  )

  const addNodeAt = useCallback(
    (position: { x: number; y: number }, kind: MindmapKind = 'idea') => {
      createNode(position, { kind })
    },
    [createNode],
  )

  const sproutFrom = useCallback(
    (nodeId: string, side: MindmapSide) => {
      const parent = nodesRef.current.find((n) => n.id === nodeId)
      if (!parent) return
      const size = parseNodeSize(parent.style, {
        width: parent.width,
        height: parent.height,
      })
      const offset = childOffsetForSide(side, size)
      createNode(
        {
          x: parent.position.x + offset.x,
          y: parent.position.y + offset.y,
        },
        {
          connectFrom: { id: nodeId, side },
          shape: parseMindmapShape(parent.data.shape),
          color: parseMindmapColor(parent.data.color),
          kind: 'idea',
          ...(parent.parentId ? { frameId: parent.parentId } : {}),
        },
      )
    },
    [createNode],
  )

  const setSelectedShape = useCallback(
    (shape: MindmapShape) => {
      recordHistory()
      setNodes((prev) =>
        prev.map((n) =>
          n.selected && parseMindmapKind(n.data.kind) === 'idea'
            ? { ...n, data: { ...n.data, shape } }
            : n,
        ),
      )
    },
    [recordHistory, setNodes],
  )

  const setSelectedColor = useCallback(
    (color: MindmapColor) => {
      recordHistory()
      setNodes((prev) =>
        prev.map((n) =>
          n.selected ? { ...n, data: { ...n.data, color } } : n,
        ),
      )
    },
    [recordHistory, setNodes],
  )

  const setSelectedEdgeStyle = useCallback(
    (patch: Partial<MindmapEdgeData>) => {
      if (selectedEdges.length === 0) return
      recordHistory()
      setEdges((prev) =>
        prev.map((e) => {
          if (!e.selected) return e
          const data = { ...parseMindmapEdgeData(e.data), ...patch }
          return { ...e, ...edgeVisual(data) }
        }),
      )
    },
    [recordHistory, selectedEdges.length, setEdges],
  )

  const updateActiveBody = useCallback(
    (body: string) => {
      if (!activeNode) return
      setNodes((prev) =>
        prev.map((n) =>
          n.id === activeNode.id ? { ...n, data: { ...n.data, body } } : n,
        ),
      )
    },
    [activeNode, setNodes],
  )

  const addNode = useCallback(
    (kind: MindmapKind = 'idea') => {
      const selected = nodesRef.current.find(
        (n) => n.selected && parseMindmapKind(n.data.kind) === 'idea',
      )
      if (selected && kind === 'idea') {
        sproutFrom(selected.id, 'right')
        return
      }
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      const size = defaultSizeForKind(kind)
      const jitter = nodesRef.current.length * 12
      addNodeAt(
        {
          x: center.x - size.width / 2 + jitter,
          y: center.y - size.height / 2 + jitter,
        },
        kind,
      )
    },
    [addNodeAt, screenToFlowPosition, sproutFrom],
  )

  const duplicateSelected = useCallback(() => {
    if (textFocus) return
    const selected = nodesRef.current.filter((n) => n.selected)
    if (selected.length === 0) return
    recordHistory()
    const idMap = new Map<string, string>()
    for (const n of selected) idMap.set(n.id, crypto.randomUUID())
    const clones: MindmapFlowNode[] = selected.map((n) => {
      const newId = idMap.get(n.id)!
      const parentId =
        n.parentId && idMap.has(n.parentId)
          ? idMap.get(n.parentId)
          : n.parentId
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + 24, y: n.position.y + 24 },
        selected: true,
        parentId,
        className: 'maps-node-enter',
      }
    })
    const selectedIds = new Set(selected.map((n) => n.id))
    const edgeClones = edgesRef.current
      .filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target))
      .map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        selected: false,
      }))
    setNodes((prev) =>
      [
        ...prev.map((n) => ({ ...n, selected: false })),
        ...clones,
      ] as MindmapFlowNode[],
    )
    if (edgeClones.length) {
      setEdges((eds) => eds.concat(edgeClones as MindmapFlowEdge[]))
    }
  }, [recordHistory, setEdges, setNodes, textFocus])

  const onPaneDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.react-flow__node')) return
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      addNodeAt({
        x: position.x - NODE_SIZE.width / 2,
        y: position.y - NODE_SIZE.height / 2,
      })
    },
    [addNodeAt, screenToFlowPosition],
  )

  const onTitleInput = (value: string) => {
    setTitle(value)
    if (titleTimer.current) window.clearTimeout(titleTimer.current)
    titleTimer.current = window.setTimeout(() => {
      const next = value.trim() || mapsCopy.untitled
      void api
        .updateMindmap(id, { title: next })
        .then(() => onTitleChange?.(next))
        .catch((err) =>
          onError?.(err instanceof Error ? err.message : mapsCopy.saveFailed),
        )
    }, 400)
  }

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (textFocus) return
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
        return
      }
      if (
        meta &&
        (event.key.toLowerCase() === 'y' ||
          (event.key.toLowerCase() === 'z' && event.shiftKey))
      ) {
        event.preventDefault()
        redo()
        return
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
        return
      }
      if (event.key === 'Tab' && !meta) {
        const selected = nodesRef.current.find(
          (n) => n.selected && parseMindmapKind(n.data.kind) === 'idea',
        )
        if (selected) {
          event.preventDefault()
          sproutFrom(selected.id, 'right')
        }
      }
    },
    [duplicateSelected, redo, sproutFrom, textFocus, undo],
  )

  const actions: MindmapActions = { sproutFrom, setTextFocus }
  void historyTick
  const undoEnabled = canUndo(historyRef.current)
  const redoEnabled = canRedo(historyRef.current)

  if (loadState === 'loading') {
    return (
      <div className="maps-editor maps-editor-loading" role="status">
        <p className="maps-muted">{mapsCopy.loadingMap}</p>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="maps-editor maps-editor-loading" role="alert">
        <p className="maps-error">{mapsCopy.loadMapError}</p>
        <div className="maps-editor-error-actions">
          <Button variant="default" onClick={onBack}>
            {mapsCopy.back}
          </Button>
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={() => setLoadNonce((n) => n + 1)}
          >
            {mapsCopy.retry}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <MindmapActionsContext.Provider value={actions}>
      <div
        className={`maps-editor${activeNode && detailsOpen ? ' has-details' : ''}`}
        onKeyDown={onKeyDown}
        tabIndex={-1}
      >
        <div className="maps-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onMoveEnd={onMoveEnd}
            onDoubleClick={onPaneDoubleClick}
            nodeTypes={nodeTypes}
            defaultViewport={defaultViewport}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={textFocus ? null : ['Backspace', 'Delete']}
            multiSelectionKeyCode="Shift"
            selectionOnDrag={false}
            minZoom={0.25}
            maxZoom={2.5}
            snapToGrid
            snapGrid={[16, 16]}
            proOptions={{ hideAttribution: true }}
            className="maps-flow"
            aria-label={mapsCopy.canvasAria}
          >
            <Background
              id="maps-dots"
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.25}
              className="maps-flow-bg"
            />
            <Controls
              showInteractive={false}
              position="bottom-left"
              className="maps-flow-controls"
            />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              className="maps-flow-minimap"
              maskColor="color-mix(in srgb, var(--bg) 55%, transparent)"
            />
            <Panel position="top-center" className="maps-editor-chrome">
              <div className="maps-editor-toolbar" title={mapsCopy.editorHint}>
                <Tooltip label={mapsCopy.back}>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    radius="md"
                    aria-label={mapsCopy.back}
                    onClick={onBack}
                  >
                    <IconArrowLeft size={18} />
                  </ActionIcon>
                </Tooltip>
                <TextInput
                  className="maps-editor-title"
                  value={title}
                  onChange={(e) => onTitleInput(e.currentTarget.value)}
                  aria-label={mapsCopy.titleAria}
                  size="sm"
                  variant="unstyled"
                />
                <div className="maps-toolbar-divider" aria-hidden />
                <Tooltip label={mapsCopy.undo}>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    radius="md"
                    aria-label={mapsCopy.undo}
                    disabled={!undoEnabled}
                    onClick={undo}
                  >
                    <IconArrowBackUp size={18} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={mapsCopy.redo}>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    radius="md"
                    aria-label={mapsCopy.redo}
                    disabled={!redoEnabled}
                    onClick={redo}
                  >
                    <IconArrowForwardUp size={18} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={mapsCopy.duplicate}>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    radius="md"
                    aria-label={mapsCopy.duplicate}
                    disabled={selectedNodes.length === 0}
                    onClick={duplicateSelected}
                  >
                    <IconCopy size={17} />
                  </ActionIcon>
                </Tooltip>
                {selectedNodes.length > 0 && (
                  <div
                    className="maps-color-picker"
                    role="group"
                    aria-label={mapsCopy.colorGroupAria}
                  >
                    {COLOR_OPTIONS.map((opt) => (
                      <Tooltip key={opt.value} label={opt.label}>
                        <button
                          type="button"
                          className={`maps-color-btn maps-color-btn-${opt.value}${activeColor === opt.value ? ' is-active' : ''}`}
                          aria-label={opt.label}
                          aria-pressed={activeColor === opt.value}
                          onClick={() => setSelectedColor(opt.value)}
                        />
                      </Tooltip>
                    ))}
                  </div>
                )}
                {ideaSelection.length > 0 && (
                  <div
                    className="maps-shape-picker"
                    role="group"
                    aria-label={mapsCopy.shapeGroupAria}
                  >
                    {SHAPE_OPTIONS.map((opt) => (
                      <Tooltip key={opt.value} label={opt.label}>
                        <button
                          type="button"
                          className={`maps-shape-btn${activeShape === opt.value ? ' is-active' : ''}`}
                          aria-label={opt.label}
                          aria-pressed={activeShape === opt.value}
                          onClick={() => setSelectedShape(opt.value)}
                        >
                          <ShapeGlyph shape={opt.value} />
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                )}
                {selectedEdges.length > 0 && (
                  <div
                    className="maps-edge-picker"
                    role="group"
                    aria-label={mapsCopy.edgeGroupAria}
                  >
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => setSelectedEdgeStyle({ marker: 'arrow' })}
                    >
                      {mapsCopy.edgeArrow}
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => setSelectedEdgeStyle({ marker: 'none' })}
                    >
                      {mapsCopy.edgePlain}
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => setSelectedEdgeStyle({ dashed: true })}
                    >
                      {mapsCopy.edgeDashed}
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => setSelectedEdgeStyle({ dashed: false })}
                    >
                      {mapsCopy.edgeSolid}
                    </Button>
                  </div>
                )}
                <Button
                  size="compact-sm"
                  radius="md"
                  leftSection={<IconPlus size={15} />}
                  onClick={() => addNode('idea')}
                >
                  {mapsCopy.addNode}
                </Button>
                <Tooltip label={mapsCopy.addSticky}>
                  <ActionIcon
                    variant="light"
                    size="lg"
                    radius="md"
                    aria-label={mapsCopy.addSticky}
                    onClick={() => addNode('sticky')}
                  >
                    <IconNote size={17} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={mapsCopy.addFrame}>
                  <ActionIcon
                    variant="light"
                    size="lg"
                    radius="md"
                    aria-label={mapsCopy.addFrame}
                    onClick={() => addNode('frame')}
                  >
                    <IconBoxMargin size={17} />
                  </ActionIcon>
                </Tooltip>
                <span
                  className={`maps-save-status maps-save-status-${saveStatus}`}
                  aria-live="polite"
                >
                  {saveStatus === 'saving' && mapsCopy.saving}
                  {saveStatus === 'saved' && mapsCopy.saved}
                  {saveStatus === 'error' && mapsCopy.saveFailed}
                  {saveStatus === 'idle' && '\u00a0'}
                </span>
                {saveStatus === 'error' && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="red"
                    onClick={() => void persistDocument()}
                  >
                    {mapsCopy.saveRetry}
                  </Button>
                )}
              </div>
            </Panel>
            {nodes.length === 0 && (
              <Panel position="top-center" className="maps-canvas-empty">
                <p>{mapsCopy.emptyCanvas}</p>
                <p className="maps-canvas-empty-hint">{mapsCopy.emptyHint}</p>
                <Button
                  size="sm"
                  radius="md"
                  leftSection={<IconPlus size={16} />}
                  onClick={() => addNode('idea')}
                >
                  {mapsCopy.addNode}
                </Button>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {activeNode && detailsOpen && (
          <aside className="maps-details" aria-label={mapsCopy.detailsTitle}>
            <header className="maps-details-header">
              <div className="maps-details-heading">
                <p className="maps-details-kicker">{mapsCopy.detailsTitle}</p>
                <h3 className="maps-details-title">
                  {activeNode.data.label.trim() ||
                    defaultLabelForKind(parseMindmapKind(activeNode.data.kind))}
                </h3>
                <p className="maps-details-hint">{mapsCopy.detailsHint}</p>
              </div>
              <Tooltip label={mapsCopy.closeDetails}>
                <ActionIcon
                  variant="subtle"
                  radius="md"
                  aria-label={mapsCopy.closeDetails}
                  onClick={() => setDetailsOpen(false)}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Tooltip>
            </header>
            <div
              className="maps-details-editor"
              onFocusCapture={() => setTextFocus(true)}
              onBlurCapture={(e) => {
                const next = e.relatedTarget as HTMLElement | null
                if (!next || !e.currentTarget.contains(next)) {
                  setTextFocus(false)
                }
              }}
            >
              <NotesEditor
                focusKey={activeNode.id}
                content={activeNode.data.body ?? ''}
                onChange={updateActiveBody}
                autoFocus={false}
                placeholder={mapsCopy.nodeBodyPlaceholder}
                ariaLabel={mapsCopy.nodeBodyAria}
                className="maps-notes-editor"
              />
            </div>
          </aside>
        )}

        {activeNode && !detailsOpen && (
          <button
            type="button"
            className="maps-details-reopen"
            onClick={() => setDetailsOpen(true)}
          >
            {mapsCopy.detailsTitle}
          </button>
        )}
      </div>
    </MindmapActionsContext.Provider>
  )
}

type Props = InnerProps

export function MindmapEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <MindmapEditorInner key={props.id} {...props} />
    </ReactFlowProvider>
  )
}
