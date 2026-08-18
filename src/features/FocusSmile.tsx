import { useMemo, useRef, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { focusCopy } from './focus-copy'
import { pickFocusQuote, pickFocusSmileKicker } from './focus-quotes'

type Props = {
  taskId: string
}

type Pos = { x: number; y: number }

/**
 * Floating lift over Focus Mode. Draggable + dismissible for this session only;
 * remounts (and reappears) on the next Focus entry.
 */
export function FocusSmile({ taskId }: Props) {
  const quote = useMemo(() => pickFocusQuote(taskId), [taskId])
  const kicker = useMemo(() => pickFocusSmileKicker(taskId), [taskId])
  const cardRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef<Pos | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const [dragging, setDragging] = useState(false)

  if (dismissed) return null

  function clampPos(x: number, y: number, width: number, height: number): Pos {
    const pad = 8
    const maxX = Math.max(pad, window.innerWidth - width - pad)
    const maxY = Math.max(pad, window.innerHeight - height - pad)
    return {
      x: Math.min(maxX, Math.max(pad, x)),
      y: Math.min(maxY, Math.max(pad, y)),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement | null)?.closest('[data-smile-close]')) return
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
    setPos(clampPos(rect.left, rect.top, rect.width, rect.height))
    setDragging(true)
    el.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !dragOffset.current || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setPos(
      clampPos(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
        rect.width,
        rect.height,
      ),
    )
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    dragOffset.current = null
    setDragging(false)
    if (cardRef.current?.hasPointerCapture(e.pointerId)) {
      cardRef.current.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div
      ref={cardRef}
      className={`focus-mode-smile${dragging ? ' is-dragging' : ''}${pos ? ' is-placed' : ''}`}
      style={
        pos
          ? {
              left: pos.x,
              top: pos.y,
            }
          : undefined
      }
      aria-label={focusCopy.smileLabel}
      title={focusCopy.smileDrag}
      role="complementary"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <button
        type="button"
        className="focus-mode-smile-close"
        data-smile-close=""
        aria-label={focusCopy.smileClose}
        title={focusCopy.smileClose}
        onClick={() => setDismissed(true)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <IconX size={14} stroke={2} aria-hidden />
      </button>

      <div className="focus-mode-smile-stage" aria-hidden="true">
        <span className="focus-mode-smile-glow" />
        <span className="focus-mode-smile-face">
          <svg
            viewBox="0 0 80 80"
            width="52"
            height="52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="focus-mode-smile-ring"
              cx="40"
              cy="40"
              r="36"
              stroke="currentColor"
              strokeWidth="2.25"
            />
            <circle
              className="focus-mode-smile-eye focus-mode-smile-eye-left"
              cx="28"
              cy="33"
              r="3.6"
              fill="currentColor"
            />
            <circle
              className="focus-mode-smile-eye focus-mode-smile-eye-right"
              cx="52"
              cy="33"
              r="3.6"
              fill="currentColor"
            />
            <path
              className="focus-mode-smile-mouth"
              d="M25 46c4.2 7.5 10.2 11.5 15 11.5S50.8 53.5 55 46"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>

      <div className="focus-mode-smile-copy">
        <p className="focus-mode-smile-kicker">{kicker}</p>
        <blockquote className="focus-mode-quote">
          <p>{quote}</p>
        </blockquote>
        <p className="focus-mode-smile-hint">{focusCopy.smileHint}</p>
      </div>
    </div>
  )
}
