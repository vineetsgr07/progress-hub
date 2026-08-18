function decodeHtmlEntities(text: string): string {
  let prev = ''
  let out = text
  // Repeat so historical double-escapes (&amp;amp;) fully unwind.
  while (out !== prev) {
    prev = out
    out = out
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#0*39;/g, "'")
      .replace(/&#x0*27;/gi, "'")
      .replace(/&#(\d+);/g, (match, n) => {
        const code = Number(n)
        if (!Number.isFinite(code)) return match
        try {
          return String.fromCodePoint(code)
        } catch {
          return match
        }
      })
      .replace(/&#x([0-9a-f]+);/gi, (match, h) => {
        const code = parseInt(h, 16)
        if (!Number.isFinite(code)) return match
        try {
          return String.fromCodePoint(code)
        } catch {
          return match
        }
      })
      // Must run last so &amp; in other entities is preserved until decoded.
      .replace(/&amp;/gi, '&')
  }
  return out
}

function escapeHtml(text: string): string {
  // Decode first so contentEditable / already-escaped input is not double-escaped.
  return decodeHtmlEntities(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value)
}

/** Plain text for aria-labels and drag handles. */
export function subtaskPlainText(raw: string): string {
  return decodeHtmlEntities(
    (raw ?? '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain text for multiline editors — keeps line breaks from `<br>` / block tags. */
export function subtaskEditableText(raw: string): string {
  return decodeHtmlEntities(
    (raw ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type StackTag = 'strong' | 'em' | 'u' | 'size'

/**
 * Allow only bold, italic, underline, larger-size spans, and line breaks.
 * Plain text is escaped and newlines become <br>.
 * Works in browser and Node (no DOM dependency).
 */
export function sanitizeSubtaskHtml(raw: string): string {
  const value = (raw ?? '').trim()
  if (!value) return ''
  if (!looksLikeHtml(value)) return escapeHtml(value).replace(/\n/g, '<br>')

  let out = ''
  const stack: StackTag[] = []
  // Match any tag or a run of text
  const tokenRe = /<\/?[a-z][a-z0-9]*\b[^>]*>|[^<]+/gi
  const tokens = value.match(tokenRe) || [value]

  for (const token of tokens) {
    if (!token.startsWith('<')) {
      out += escapeHtml(token)
      continue
    }

    if (/^<br\s*\/?>$/i.test(token)) {
      out += '<br>'
      continue
    }

    const open = token.match(/^<(strong|b|em|i|u|span|div|p)\b([^>]*)>/i)
    if (open) {
      const tag = open[1].toLowerCase()
      const attrs = open[2] || ''
      if (tag === 'b' || tag === 'strong') {
        stack.push('strong')
        out += '<strong>'
      } else if (tag === 'i' || tag === 'em') {
        stack.push('em')
        out += '<em>'
      } else if (tag === 'u') {
        stack.push('u')
        out += '<u>'
      } else if (tag === 'span' && /subtask-size-lg/.test(attrs)) {
        stack.push('size')
        out += '<span class="subtask-size-lg">'
      }
      // div/p/other allowed openers unwrap — content only
      continue
    }

    const close = token.match(/^<\/(strong|b|em|i|u|span|div|p)>/i)
    if (close) {
      const tag = close[1].toLowerCase()
      const want: StackTag | null =
        tag === 'b' || tag === 'strong'
          ? 'strong'
          : tag === 'i' || tag === 'em'
            ? 'em'
            : tag === 'u'
              ? 'u'
              : tag === 'span'
                ? 'size'
                : null
      if (want) {
        const idx = stack.lastIndexOf(want)
        if (idx >= 0) {
          for (let i = stack.length - 1; i >= idx; i--) {
            const t = stack.pop()!
            out +=
              t === 'strong'
                ? '</strong>'
                : t === 'em'
                  ? '</em>'
                  : t === 'u'
                    ? '</u>'
                    : '</span>'
          }
        }
      } else if (tag === 'div' || tag === 'p') {
        out += '<br>'
      }
      continue
    }

    // Unknown tag (script, img, …) — drop the tag, keep nothing from attributes
  }

  while (stack.length) {
    const t = stack.pop()!
    out +=
      t === 'strong'
        ? '</strong>'
        : t === 'em'
          ? '</em>'
          : t === 'u'
            ? '</u>'
            : '</span>'
  }

  return out.replace(/(?:<br>)+$/g, '').trim()
}

/** HTML safe for rendering in the list (plain text → escaped + br). */
export function subtaskDisplayHtml(raw: string): string {
  const value = raw ?? ''
  if (!value.trim()) return ''
  if (!looksLikeHtml(value)) return escapeHtml(value).replace(/\n/g, '<br>')
  return sanitizeSubtaskHtml(value)
}
