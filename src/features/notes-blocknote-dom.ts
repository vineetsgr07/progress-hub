import { JSDOM } from 'jsdom'

/** Install minimal DOM globals so BlockNote HTML parsers work under `tsx`. */
export function installNotesTestDom() {
  const g = globalThis as typeof globalThis & {
    __notesTestDom?: boolean
  }
  if (g.__notesTestDom) return
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
  const w = dom.window
  Object.defineProperty(globalThis, 'document', { value: w.document, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: w, configurable: true })
  Object.defineProperty(globalThis, 'DOMParser', { value: w.DOMParser, configurable: true })
  Object.defineProperty(globalThis, 'Node', { value: w.Node, configurable: true })
  Object.defineProperty(globalThis, 'HTMLElement', {
    value: w.HTMLElement,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'Element', { value: w.Element, configurable: true })
  Object.defineProperty(globalThis, 'DocumentFragment', {
    value: w.DocumentFragment,
    configurable: true,
  })
  g.__notesTestDom = true
}
