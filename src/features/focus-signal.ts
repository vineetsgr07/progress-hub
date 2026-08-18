import {
  DEFAULT_FOCUS_END_SOUND,
  type FocusEndSound,
  readFocusEndSound,
  readFocusEndSoundDurationSec,
} from './focus-prefs'
import { focusCopy } from './focus-copy'

/** Short sample when picking a sound — not the full ring length. */
export const FOCUS_END_SOUND_PREVIEW_SEC = 4

let audioCtx: AudioContext | null = null
let activeNodes: Array<AudioNode | OscillatorNode> = []
let stopTimer: number | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  return audioCtx
}

/** Call from the Play click so browsers allow a later beep. */
export async function unlockFocusAudio(): Promise<void> {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      /* ignore */
    }
  }
}

/** Stop any in-progress end sound / preview. */
export function stopFocusEndSound(): void {
  if (stopTimer != null) {
    window.clearTimeout(stopTimer)
    stopTimer = null
  }
  for (const node of activeNodes) {
    try {
      if ('stop' in node && typeof node.stop === 'function') {
        node.stop()
      }
      node.disconnect()
    } catch {
      /* already stopped */
    }
  }
  activeNodes = []
}

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  peak = 0.12,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  gain.gain.value = 0.0001
  osc.connect(gain)
  gain.connect(ctx.destination)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.start(start)
  osc.stop(start + duration + 0.02)
  activeNodes.push(osc, gain)
}

function scheduleSoft(ctx: AudioContext, now: number, until: number) {
  // Soft beep every ~1.0s
  for (let t = now; t < until; t += 1.0) {
    tone(ctx, 880, t, 0.35, 0.12)
  }
}

function scheduleChime(ctx: AudioContext, now: number, until: number) {
  // Two-note chime every ~1.4s
  for (let t = now; t < until; t += 1.4) {
    tone(ctx, 988, t, 0.22, 0.1)
    tone(ctx, 1319, t + 0.18, 0.35, 0.1)
  }
}

function scheduleAlarm(ctx: AudioContext, now: number, until: number) {
  // Triple pulse every ~1.1s
  for (let t = now; t < until; t += 1.1) {
    tone(ctx, 740, t, 0.18, 0.18, 'square')
    tone(ctx, 740, t + 0.28, 0.18, 0.18, 'square')
    tone(ctx, 740, t + 0.56, 0.28, 0.2, 'square')
  }
}

/** Soft single beep (legacy default) — now the repeating soft pattern. */
export function playFocusBeep(): void {
  playFocusEndSound('soft')
}

export type PlayFocusEndSoundOptions = {
  /** Override ring length in seconds. Defaults to the saved preference. */
  durationSec?: number
  /** Use a short sample instead of the full ring length. */
  preview?: boolean
}

export function playFocusEndSound(
  kind: FocusEndSound = readFocusEndSound(),
  options: PlayFocusEndSoundOptions = {},
): void {
  stopFocusEndSound()
  if (kind === 'off') return
  const ctx = getAudioContext()
  if (!ctx) return
  const durationSec = options.preview
    ? FOCUS_END_SOUND_PREVIEW_SEC
    : Math.max(
        1,
        Math.floor(
          options.durationSec ?? readFocusEndSoundDurationSec(),
        ),
      )
  try {
    const now = ctx.currentTime
    const until = now + durationSec
    if (kind === 'soft') scheduleSoft(ctx, now, until)
    else if (kind === 'chime') scheduleChime(ctx, now, until)
    else scheduleAlarm(ctx, now, until)

    // Clear node bookkeeping after the pattern finishes.
    stopTimer = window.setTimeout(() => {
      activeNodes = []
      stopTimer = null
    }, durationSec * 1000 + 200)
  } catch {
    /* ignore */
  }
}

export async function notifyFocusEnded(): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  try {
    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }
    if (permission !== 'granted') return
    new Notification(focusCopy.sessionEndedTitle, {
      body: focusCopy.sessionEndedBody,
      silent: true,
    })
  } catch {
    /* ignore */
  }
}

/** Beep + optional notification. Safe to call once per countdown end. */
export async function signalFocusEnded(): Promise<void> {
  playFocusEndSound(readFocusEndSound() || DEFAULT_FOCUS_END_SOUND)
  await notifyFocusEnded()
}
