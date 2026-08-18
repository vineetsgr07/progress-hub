import { Position } from '@xyflow/react'
import { mapsCopy } from './maps-copy'

/** Lucid-style node shapes (ideas). Stickies/frames ignore most shapes. */
export const MINDMAP_SHAPES = [
  'rounded',
  'rect',
  'ellipse',
  'diamond',
  'parallelogram',
] as const

export type MindmapShape = (typeof MINDMAP_SHAPES)[number]

export const MINDMAP_KINDS = ['idea', 'sticky', 'frame'] as const
export type MindmapKind = (typeof MINDMAP_KINDS)[number]

/** Accent fills — mapped to CSS classes `maps-node-color-*`. */
export const MINDMAP_COLORS = [
  'default',
  'slate',
  'blue',
  'teal',
  'green',
  'amber',
  'rose',
  'violet',
] as const

export type MindmapColor = (typeof MINDMAP_COLORS)[number]

export const EDGE_MARKERS = ['none', 'arrow'] as const
export type EdgeMarker = (typeof EDGE_MARKERS)[number]

export type MindmapSide = 'left' | 'right' | 'top' | 'bottom'

export type MindmapNodeData = {
  label: string
  shape: MindmapShape
  /** Rich HTML body (TipTap), same model as task notes. */
  body: string
  kind: MindmapKind
  color: MindmapColor
}

export type MindmapEdgeData = {
  marker: EdgeMarker
  dashed: boolean
}

export type NodeSize = { width: number; height: number }

export const NODE_SIZE: NodeSize = { width: 200, height: 64 }
export const STICKY_SIZE: NodeSize = { width: 168, height: 168 }
export const FRAME_SIZE: NodeSize = { width: 420, height: 280 }
export const NODE_MIN_SIZE: NodeSize = { width: 140, height: 48 }
export const STICKY_MIN_SIZE: NodeSize = { width: 120, height: 120 }
export const FRAME_MIN_SIZE: NodeSize = { width: 240, height: 160 }
export const NODE_MAX_SIZE: NodeSize = { width: 560, height: 420 }
export const FRAME_MAX_SIZE: NodeSize = { width: 1200, height: 900 }
export const SPROUT_GAP = 88

export function parseMindmapShape(value: unknown): MindmapShape {
  if (
    typeof value === 'string' &&
    (MINDMAP_SHAPES as readonly string[]).includes(value)
  ) {
    return value as MindmapShape
  }
  return 'rounded'
}

export function parseMindmapKind(value: unknown): MindmapKind {
  if (
    typeof value === 'string' &&
    (MINDMAP_KINDS as readonly string[]).includes(value)
  ) {
    return value as MindmapKind
  }
  return 'idea'
}

export function parseMindmapColor(value: unknown): MindmapColor {
  if (
    typeof value === 'string' &&
    (MINDMAP_COLORS as readonly string[]).includes(value)
  ) {
    return value as MindmapColor
  }
  return 'default'
}

export function parseEdgeMarker(value: unknown): EdgeMarker {
  if (
    typeof value === 'string' &&
    (EDGE_MARKERS as readonly string[]).includes(value)
  ) {
    return value as EdgeMarker
  }
  return 'arrow'
}

export function parseMindmapEdgeData(raw: unknown): MindmapEdgeData {
  const data = (raw ?? {}) as Partial<MindmapEdgeData> & {
    style?: unknown
  }
  return {
    marker: parseEdgeMarker(data.marker),
    dashed: Boolean(data.dashed),
  }
}

export function parseMindmapNodeData(raw: unknown): MindmapNodeData {
  const data = (raw ?? {}) as Partial<MindmapNodeData>
  const kind = parseMindmapKind(data.kind)
  return {
    label: String(data.label ?? defaultLabelForKind(kind)),
    shape: kind === 'idea' ? parseMindmapShape(data.shape) : 'rounded',
    body: typeof data.body === 'string' ? data.body : '',
    kind,
    color: parseMindmapColor(data.color),
  }
}

export function defaultLabelForKind(kind: MindmapKind): string {
  switch (kind) {
    case 'sticky':
      return mapsCopy.defaultStickyLabel
    case 'frame':
      return mapsCopy.defaultFrameLabel
    default:
      return mapsCopy.defaultNodeLabel
  }
}

export function defaultSizeForKind(kind: MindmapKind): NodeSize {
  switch (kind) {
    case 'sticky':
      return { ...STICKY_SIZE }
    case 'frame':
      return { ...FRAME_SIZE }
    default:
      return { ...NODE_SIZE }
  }
}

export function minSizeForKind(kind: MindmapKind): NodeSize {
  switch (kind) {
    case 'sticky':
      return { ...STICKY_MIN_SIZE }
    case 'frame':
      return { ...FRAME_MIN_SIZE }
    default:
      return { ...NODE_MIN_SIZE }
  }
}

export function maxSizeForKind(kind: MindmapKind): NodeSize {
  switch (kind) {
    case 'frame':
      return { ...FRAME_MAX_SIZE }
    default:
      return { ...NODE_MAX_SIZE }
  }
}

export function parseNodeSize(
  style: unknown,
  measured?: { width?: number | null; height?: number | null },
): NodeSize {
  const s = (style ?? {}) as { width?: unknown; height?: unknown }
  const width =
    typeof s.width === 'number'
      ? s.width
      : typeof s.width === 'string'
        ? Number.parseFloat(s.width)
        : typeof measured?.width === 'number'
          ? measured.width
          : NODE_SIZE.width
  const height =
    typeof s.height === 'number'
      ? s.height
      : typeof s.height === 'string'
        ? Number.parseFloat(s.height)
        : typeof measured?.height === 'number'
          ? measured.height
          : NODE_SIZE.height
  return {
    width: Number.isFinite(width) ? Math.round(width) : NODE_SIZE.width,
    height: Number.isFinite(height) ? Math.round(height) : NODE_SIZE.height,
  }
}

export function oppositeSide(side: MindmapSide): MindmapSide {
  switch (side) {
    case 'left':
      return 'right'
    case 'right':
      return 'left'
    case 'top':
      return 'bottom'
    case 'bottom':
      return 'top'
  }
}

export function sideToPosition(side: MindmapSide): Position {
  switch (side) {
    case 'left':
      return Position.Left
    case 'right':
      return Position.Right
    case 'top':
      return Position.Top
    case 'bottom':
      return Position.Bottom
  }
}

/** Source / target handle ids per side (both exist on every node). */
export function sourceHandleId(side: MindmapSide): string {
  return `s-${side}`
}

export function targetHandleId(side: MindmapSide): string {
  return `t-${side}`
}

export function childOffsetForSide(
  side: MindmapSide,
  size: NodeSize = NODE_SIZE,
): { x: number; y: number } {
  const { width: w, height: h } = size
  const g = SPROUT_GAP
  switch (side) {
    case 'right':
      return { x: w + g, y: 0 }
    case 'left':
      return { x: -(w + g), y: 0 }
    case 'bottom':
      return { x: 0, y: h + g }
    case 'top':
      return { x: 0, y: -(h + g) }
  }
}

export const SHAPE_OPTIONS: Array<{
  value: MindmapShape
  label: string
}> = [
  { value: 'rounded', label: mapsCopy.shapeRounded },
  { value: 'rect', label: mapsCopy.shapeRect },
  { value: 'ellipse', label: mapsCopy.shapeEllipse },
  { value: 'diamond', label: mapsCopy.shapeDiamond },
  { value: 'parallelogram', label: mapsCopy.shapeParallelogram },
]

export const COLOR_OPTIONS: Array<{
  value: MindmapColor
  label: string
}> = [
  { value: 'default', label: mapsCopy.colorDefault },
  { value: 'slate', label: mapsCopy.colorSlate },
  { value: 'blue', label: mapsCopy.colorBlue },
  { value: 'teal', label: mapsCopy.colorTeal },
  { value: 'green', label: mapsCopy.colorGreen },
  { value: 'amber', label: mapsCopy.colorAmber },
  { value: 'rose', label: mapsCopy.colorRose },
  { value: 'violet', label: mapsCopy.colorViolet },
]
