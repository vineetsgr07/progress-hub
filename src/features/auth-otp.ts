export type EmailOtpVerify =
  | { kind: 'token'; token: string }
  | { kind: 'hash'; tokenHash: string; type: EmailOtpType }

export type EmailOtpType =
  | 'email'
  | 'magiclink'
  | 'signup'
  | 'invite'
  | 'recovery'
  | 'email_change'

const OTP_TYPES = new Set<EmailOtpType>([
  'email',
  'magiclink',
  'signup',
  'invite',
  'recovery',
  'email_change',
])

function asOtpType(value: string | null): EmailOtpType {
  if (value && OTP_TYPES.has(value as EmailOtpType)) return value as EmailOtpType
  return 'email'
}

export function parseEmailOtpInput(raw: string): EmailOtpVerify | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const digits = trimmed.replace(/\s/g, '')
  if (/^\d{6}$/.test(digits)) return { kind: 'token', token: digits }

  try {
    const url = new URL(trimmed)
    const token = url.searchParams.get('token') || url.searchParams.get('token_hash')
    if (token && token.length >= 6) {
      return {
        kind: 'hash',
        tokenHash: token,
        type: asOtpType(url.searchParams.get('type')),
      }
    }
  } catch {
    // not a URL
  }

  if (/^[A-Za-z0-9._~-]{20,}$/.test(trimmed)) {
    return { kind: 'hash', tokenHash: trimmed, type: 'email' }
  }

  return null
}

export function isOtpRateLimited(error: {
  message?: string
  code?: string
  status?: number
} | null) {
  const message = (error?.message || '').toLowerCase()
  const code = (error?.code || '').toLowerCase()
  return (
    error?.status === 429 ||
    code.includes('over_email_send_rate_limit') ||
    message.includes('rate limit')
  )
}

export function otpSendErrorMessage(
  error: { message?: string; code?: string; status?: number } | null,
  copy: { otpError: string; otpRateLimit: string; otpWait: string },
): string {
  const message = (error?.message || '').toLowerCase()
  if (isOtpRateLimited(error)) return copy.otpRateLimit
  if (message.includes('after 60 seconds') || message.includes('security purposes')) {
    return copy.otpWait
  }
  return copy.otpError
}

export const OTP_COOLDOWN_MS = 60_000
export const OTP_RATE_LOCK_MS = 60 * 60 * 1000
export const OTP_SENT_AT_KEY = 'ph.otp.sentAt'
export const OTP_LOCK_UNTIL_KEY = 'ph.otp.lockUntil'
export const OTP_EMAIL_KEY = 'ph.otp.email'

export type OtpMemory = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type OtpSendGate = {
  canSend: boolean
  waitMs: number
  locked: boolean
  email: string
}

function readNumber(memory: OtpMemory | undefined, key: string): number {
  if (!memory) return 0
  const raw = Number(memory.getItem(key) || 0)
  return Number.isFinite(raw) ? raw : 0
}

export function readOtpSendGate(
  now = Date.now(),
  memory?: OtpMemory | null,
): OtpSendGate {
  const store = memory ?? undefined
  const lockUntil = readNumber(store, OTP_LOCK_UNTIL_KEY)
  const sentAt = readNumber(store, OTP_SENT_AT_KEY)
  const email = store?.getItem(OTP_EMAIL_KEY) || ''
  if (lockUntil > now) {
    return { canSend: false, waitMs: lockUntil - now, locked: true, email }
  }
  const waitMs = Math.max(0, sentAt + OTP_COOLDOWN_MS - now)
  return { canSend: waitMs === 0, waitMs, locked: false, email }
}

export function markOtpSent(
  email: string,
  now = Date.now(),
  memory?: OtpMemory | null,
) {
  if (!memory) return
  memory.setItem(OTP_SENT_AT_KEY, String(now))
  memory.setItem(OTP_EMAIL_KEY, email)
}

export function markOtpRateLimited(now = Date.now(), memory?: OtpMemory | null) {
  if (!memory) return
  memory.setItem(OTP_LOCK_UNTIL_KEY, String(now + OTP_RATE_LOCK_MS))
}

export function browserOtpMemory(): OtpMemory | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}
