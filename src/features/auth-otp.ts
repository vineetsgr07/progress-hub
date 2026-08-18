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

export function otpSendErrorMessage(
  error: { message?: string; code?: string; status?: number } | null,
  copy: { otpError: string; otpRateLimit: string; otpWait: string },
): string {
  const message = (error?.message || '').toLowerCase()
  const code = (error?.code || '').toLowerCase()
  if (
    error?.status === 429 ||
    code.includes('over_email_send_rate_limit') ||
    message.includes('rate limit')
  ) {
    return copy.otpRateLimit
  }
  if (message.includes('after 60 seconds') || message.includes('security purposes')) {
    return copy.otpWait
  }
  return copy.otpError
}
