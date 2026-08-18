export type StandaloneProbe = {
  navigator: { standalone?: boolean }
  matchMedia?: (query: string) => { matches: boolean }
}

export function isStandalonePwa(
  win: StandaloneProbe = globalThis as StandaloneProbe,
): boolean {
  if (win.navigator?.standalone === true) return true
  try {
    return win.matchMedia?.('(display-mode: standalone)')?.matches === true
  } catch {
    return false
  }
}
