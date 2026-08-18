import assert from 'node:assert/strict'
import { authCopy } from './auth-copy.ts'

assert.equal(authCopy.forbidden.includes('Google'), false, 'forbidden is provider-neutral')
assert.ok(authCopy.bodyStandalone.includes('code'), 'standalone mentions code')
assert.ok(authCopy.body.includes('Google'), 'safari body mentions Google')
assert.ok(authCopy.otpSent.includes('email'), 'otp sent mentions email')
assert.equal(authCopy.sendCode, 'Send code')
assert.equal(authCopy.verify, 'Verify code')
assert.equal(authCopy.codePlaceholder, '6-digit code')

console.log('auth-copy tests passed')
