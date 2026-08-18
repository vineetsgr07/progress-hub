import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const css = readFileSync(path.join(here, '../index.css'), 'utf8')
const html = readFileSync(path.join(here, '../../index.html'), 'utf8')

function mediaBlocks(maxWidth: number): string[] {
  const needle = `@media (max-width: ${maxWidth}px)`
  const blocks: string[] = []
  let from = 0
  while (from < css.length) {
    const start = css.indexOf(needle, from)
    if (start < 0) break
    const open = css.indexOf('{', start)
    let depth = 0
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1
      else if (css[i] === '}') {
        depth -= 1
        if (depth === 0) {
          blocks.push(css.slice(start, i + 1))
          from = i + 1
          break
        }
      }
    }
  }
  assert.ok(blocks.length > 0, `missing @media (max-width: ${maxWidth}px)`)
  return blocks
}

const phone = mediaBlocks(900).find((block) =>
  block.includes('grid-template-areas'),
)
const tablet = mediaBlocks(1100)[0]
assert.ok(phone, 'missing phone task-list media query')

assert.doesNotMatch(
  css,
  /margin-left:\s*52px/,
  'phone task status must not keep the 52px table indent',
)
assert.doesNotMatch(
  phone,
  /\.task-row\s*>\s*\.task-controls\s*\{[^}]*padding-left:\s*36px/,
  'phone task controls must not keep the 36px left pad',
)
assert.match(
  css,
  /\.task-row-draggable\s*\{[^}]*touch-action:\s*pan-y/,
  'task rows must allow vertical scroll before a touch drag',
)
assert.match(
  tablet,
  /\.task-row\s*>\s*\.list-drag-handle\s*\{[^}]*display:\s*none/,
  'tablet task rows hide the drag-handle column',
)
assert.match(
  css,
  /\.now-item\.is-sortable\s*\{[^}]*grid-template-columns:\s*18px 18px minmax/,
  'desktop Now tasks keep a grip column',
)
assert.match(
  tablet,
  /\.now-item\.is-sortable\s*\{[^}]*grid-template-columns:\s*18px minmax/,
  'tablet Now tasks drop the grip column',
)
assert.match(
  tablet,
  /\.now-item \.list-drag-handle,\s*\n\s*\.now-item \.subtask-drag-handle\s*\{[^}]*display:\s*none/,
  'tablet Now hides the grip so the grid cannot grow an extra column',
)
assert.match(
  css,
  /\.now-view\s*\{[^}]*overflow-x:\s*clip/,
  'Now column clips horizontal overflow',
)
assert.match(
  css,
  /\.hub-body:has\(\.now-view\)\s*\{[^}]*overflow-x:\s*hidden/,
  'Now hub body does not pan sideways',
)
assert.match(
  css,
  /\.now-view\s*\{[^}]*margin-inline:\s*auto/,
  'Now column is centered in the hub track',
)
assert.match(
  css,
  /\.now-item\.is-sortable\s*\{[^}]*touch-action:\s*pan-y/,
  'Now task rows allow vertical scroll before a touch drag',
)
assert.match(
  phone,
  /\.task-row\s*>\s*\.list-drag-handle\s*\{[^}]*display:\s*none/,
  'phone task rows hide the drag-handle column',
)
assert.match(
  tablet,
  /\.subtask-panel\s*\{[^}]*padding:\s*4px 12px 10px 28px/,
  'tablet subtasks nest under the title, not the 48px desktop gutter',
)
assert.doesNotMatch(
  tablet,
  /padding-left:\s*48px/,
  'tablet media query must not leave the 48px desktop subtask indent',
)
assert.match(
  phone,
  /\.subtask-panel\s*\{[^}]*padding:\s*2px 8px 6px 28px/,
  'phone subtasks nest under the title, not 12px or 48px',
)
assert.match(
  phone,
  /\.subtask-drag-handle\s*\{[^}]*display:\s*none/,
  'phone subtask grip is hidden',
)
assert.match(
  phone,
  /\.subtask-list li\s*\{[^}]*grid-template-columns:\s*18px minmax\(0,\s*1fr\) auto/,
  'phone checklist is check | title | actions',
)
assert.match(
  css,
  /\.time-control\.is-idle-icon\s*\{[^}]*height:\s*24px/,
  'idle checklist timer is icon-sized',
)
assert.match(
  css,
  /\.subtask-actions/,
  'pin sits in the checklist actions next to the timer',
)
assert.match(
  phone,
  /grid-template-areas:\s*"check main controls"/,
  'phone task row is checkbox | title | controls',
)
assert.doesNotMatch(
  phone,
  /"\.\s+status\s+status"/,
  'phone task row must not keep a second status row',
)
assert.match(
  phone,
  /\.task-meta-status\s*\{[^}]*display:\s*none/,
  'phone list hides status — it lives in the task sheet',
)
assert.doesNotMatch(
  phone,
  /\.time-control\s*\{[^}]*height:\s*36px/,
  'phone timer must stay 28px, not inflate to 36px',
)
assert.doesNotMatch(
  phone,
  /\.icon-btn[^{]*\{[^}]*min-height:\s*36px/,
  'phone row icons must stay 28px, not inflate to 36px',
)
assert.match(
  phone,
  /\.focus-reentry\s*\{[^}]*display:\s*none/,
  'phone hides the Open focus chip so the row stays one line',
)
assert.match(
  phone,
  /\.filters\s*\{[^}]*flex-wrap:\s*nowrap/,
  'phone category chips stay on one line',
)
assert.match(
  phone,
  /\.filter-chip\s*\{[^}]*flex:\s*1 1 0/,
  'phone category chips share the row equally',
)
assert.doesNotMatch(
  phone,
  /\.filter-chip\s*\{[^}]*flex-shrink:\s*0/,
  'phone category chips must not refuse to shrink',
)

const detail = mediaBlocks(900).find((block) =>
  block.includes('.task-detail-panel.is-full .task-detail-stack'),
)
assert.ok(detail, 'missing phone task-detail media query')
assert.match(
  detail,
  /\.task-detail-panel\.is-full \.task-detail-stack\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  'phone task sheet stacks checklist and notes in one column',
)
assert.doesNotMatch(
  detail,
  /\.task-detail-panel\.is-full \.task-detail-stack\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/,
  'phone task sheet must not keep the desktop two-column split',
)
assert.match(
  detail,
  /\.focus-checklist-row\s*\{[^}]*grid-template-columns:\s*20px minmax\(0,\s*1fr\) auto/,
  'phone focus checklist is check | title | actions',
)
assert.doesNotMatch(
  detail,
  /\.focus-checklist-row\s*\{[^}]*22px 20px minmax/,
  'phone focus checklist must not keep the desktop 4-column template',
)
assert.match(
  detail,
  /\.focus-checklist-drag\s*\{[^}]*display:\s*none/,
  'phone focus checklist hides the grip',
)
assert.match(
  detail,
  /\.focus-checklist-title-wrap\s*\{[^}]*overflow:\s*visible/,
  'phone checklist title is not clipped',
)
assert.match(
  css,
  /\.focus-checklist-title\s*\{[^}]*overflow-wrap:\s*anywhere/,
  'checklist titles wrap instead of ellipsizing to a few characters',
)
assert.doesNotMatch(
  detail,
  /\.focus-checklist-title[^{]*\{[^}]*white-space:\s*nowrap/,
  'phone checklist title must not force a single clipped line',
)

const compactChecklist = mediaBlocks(520).find((block) =>
  block.includes('.focus-checklist-row'),
)
assert.ok(compactChecklist, 'missing 520px focus-checklist media query')
assert.match(
  compactChecklist,
  /grid-template-areas:\s*"check title"\s*"\. actions"/,
  'narrowest checklist puts timer/delete under the title',
)
assert.match(
  compactChecklist,
  /\.subtask-list li/,
  'narrowest Today checklist wraps pin+timer+delete under the title',
)

const coarse = (() => {
  const start = css.indexOf('@media (pointer: coarse)')
  assert.ok(start >= 0, 'missing @media (pointer: coarse)')
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  assert.fail('unclosed @media (pointer: coarse)')
})()

assert.match(
  coarse,
  /html\s*\{[^}]*touch-action:\s*manipulation/,
  'touch devices disable double-tap zoom without locking pinch',
)
assert.match(
  coarse,
  /\[contenteditable='true'\]\s*\{[^}]*font-size:\s*max\(16px,\s*1em\)/,
  'touch text fields floor at 16px so iOS does not zoom on focus',
)
assert.match(
  coarse,
  /\.subtask-editor,\s*\n\s*\.habits-add-input\s*\{[^}]*font-size:\s*max\(16px,\s*1em\)\s*!important/,
  'compact checklist and habit inputs beat 12px !important on touch',
)

const phoneNow = mediaBlocks(520)[0]
assert.ok(phoneNow, 'missing 520px Now / checklist wrap query')
assert.match(
  phoneNow,
  /\.now-item:has\(\.now-item-actions\),\s*\n\s*\.now-item\.is-sortable\s*\{[^}]*grid-template-columns:\s*18px minmax\(0,\s*1fr\) auto/,
  'phone Now rows keep check | title | actions on one line',
)
assert.doesNotMatch(
  phoneNow,
  /\.now-item:has\(\.now-item-actions\)[^{]*\{[^}]*grid-template-areas:/,
  'phone Now rows must not wrap pin and timer under the title',
)
assert.match(
  phoneNow,
  /\.now-reminder-add\s*\{[^}]*flex-direction:\s*row/,
  'phone reminder composer stays on one line',
)
assert.match(
  phoneNow,
  /\.now-reminder-add\s*\{[^}]*flex-wrap:\s*nowrap/,
  'phone reminder composer does not wrap onto a second line',
)

const viewport = html.match(/<meta name="viewport"[^>]*>/)?.[0] ?? ''
assert.match(viewport, /width=device-width/, 'viewport is device-width')
assert.doesNotMatch(
  viewport,
  /maximum-scale|user-scalable\s*=\s*no/,
  'viewport must not lock pinch-zoom',
)

console.log('mobile-task-list.test.ts: ok')
