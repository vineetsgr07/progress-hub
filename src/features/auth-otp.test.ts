import assert from 'node:assert/strict'
import { parseEmailOtpInput } from './auth-otp.ts'

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

console.log('auth-otp tests passed')
