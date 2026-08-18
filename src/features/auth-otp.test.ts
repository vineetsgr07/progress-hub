import assert from 'node:assert/strict'
import {
  OTP_COOLDOWN_MS,
  OTP_RATE_LOCK_MS,
  markOtpRateLimited,
  markOtpSent,
  otpSendErrorMessage,
  parseEmailOtpInput,
  readOtpSendGate,
} from './auth-otp.ts'
import { authCopy } from './auth-copy.ts'

assert.deepEqual(parseEmailOtpInput('123456'), { kind: 'token', token: '123456' })
assert.deepEqual(parseEmailOtpInput(' 12 34 56 '), { kind: 'token', token: '123456' })
assert.equal(parseEmailOtpInput('12345'), null)
assert.equal(parseEmailOtpInput(''), null)

const fromLink = parseEmailOtpInput(
  'https://your-project-ref.supabase.co/auth/v1/verify?token=abcTOKENHASH123&type=magiclink&redirect_to=https://progressive-hub.vercel.app/',
)
assert.deepEqual(fromLink, {
  kind: 'hash',
  tokenHash: 'abcTOKENHASH123',
  type: 'magiclink',
})

const hashed = parseEmailOtpInput(
  'https://example.com/auth/confirm?token_hash=hash_value_here_long&type=email',
)
assert.deepEqual(hashed, {
  kind: 'hash',
  tokenHash: 'hash_value_here_long',
  type: 'email',
})

assert.deepEqual(parseEmailOtpInput('pkce_hashed_token_value_here'), {
  kind: 'hash',
  tokenHash: 'pkce_hashed_token_value_here',
  type: 'email',
})

assert.equal(
  otpSendErrorMessage(
    { status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
    authCopy,
  ),
  authCopy.otpRateLimit,
)
assert.equal(
  otpSendErrorMessage(
    { message: 'For security purposes, you can only request this after 60 seconds.' },
    authCopy,
  ),
  authCopy.otpWait,
)
assert.equal(otpSendErrorMessage({ message: 'nope' }, authCopy), authCopy.otpError)

class Memory {
  store = new Map<string, string>()
  getItem(key: string) {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
}

const mem = new Memory()
const t0 = 1_000_000
assert.equal(readOtpSendGate(t0, mem).canSend, true)
markOtpSent('owner@example.com', t0, mem)
assert.equal(readOtpSendGate(t0 + 1, mem).canSend, false)
assert.equal(readOtpSendGate(t0 + OTP_COOLDOWN_MS, mem).canSend, true)
assert.equal(readOtpSendGate(t0 + 1, mem).email, 'owner@example.com')
markOtpRateLimited(t0, mem)
const locked = readOtpSendGate(t0 + OTP_COOLDOWN_MS + 1, mem)
assert.equal(locked.canSend, false)
assert.equal(locked.locked, true)
assert.equal(readOtpSendGate(t0 + OTP_RATE_LOCK_MS, mem).canSend, true)

console.log('auth-otp tests passed')
