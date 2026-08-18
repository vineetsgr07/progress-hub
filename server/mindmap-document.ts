/** Max serialized mindmap document size (2 MiB). */
export const MINDMAP_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024

export type MindmapDocument = {
  nodes: unknown[]
  edges: unknown[]
  viewport?: unknown
}

export const EMPTY_MINDMAP_DOCUMENT: MindmapDocument = {
  nodes: [],
  edges: [],
}

export type ParseMindmapDocumentResult =
  | { ok: true; document: MindmapDocument; raw: string }
  | { ok: false; error: string }

/**
 * Validate and normalize a mindmap document for persistence.
 * Accepts object or JSON string; requires nodes/edges arrays.
 */
export function parseMindmapDocument(
  input: unknown,
  opts?: { maxBytes?: number },
): ParseMindmapDocumentResult {
  const maxBytes = opts?.maxBytes ?? MINDMAP_DOCUMENT_MAX_BYTES

  let value: unknown = input
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > maxBytes) {
      return { ok: false, error: 'document exceeds size limit' }
    }
    try {
      value = JSON.parse(input)
    } catch {
      return { ok: false, error: 'document must be valid JSON' }
    }
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'document must be an object' }
  }

  const obj = value as Record<string, unknown>
  if (!Array.isArray(obj.nodes)) {
    return { ok: false, error: 'document.nodes must be an array' }
  }
  if (!Array.isArray(obj.edges)) {
    return { ok: false, error: 'document.edges must be an array' }
  }

  const document: MindmapDocument = {
    nodes: obj.nodes,
    edges: obj.edges,
  }
  if ('viewport' in obj) {
    document.viewport = obj.viewport
  }

  const raw = JSON.stringify(document)
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    return { ok: false, error: 'document exceeds size limit' }
  }

  return { ok: true, document, raw }
}

export function stringifyMindmapDocument(doc: MindmapDocument): string {
  return JSON.stringify(doc)
}
