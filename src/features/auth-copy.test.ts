import assert from 'node:assert/strict'
import { authCopy } from './auth-copy.ts'

assert.equal(authCopy.forbidden.includes('Google'), false, 'forbidden is provider-neutral')
assert.ok(authCopy.bodyStandalone.includes('paste'), 'standalone tells you to paste a link')
assert.ok(authCopy.body.includes('Google'), 'safari body mentions Google')
assert.ok(authCopy.otpSent.includes('email'), 'otp sent mentions email')
assert.ok(authCopy.otpSent.includes('Do not tap'), 'otp sent warns against opening the link')
assert.equal(authCopy.sendCode, 'Send code')
assert.equal(authCopy.verify, 'Verify')
assert.ok(authCopy.otpRateLimit.includes('hour'), 'rate limit tells you to wait')

console.log('auth-copy tests passed')
