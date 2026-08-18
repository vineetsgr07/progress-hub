import { useEffect, useState } from 'react'
import { Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { authCopy } from './auth-copy'
import {
  browserOtpMemory,
  isOtpRateLimited,
  markOtpRateLimited,
  markOtpSent,
  otpSendErrorMessage,
  parseEmailOtpInput,
  readOtpSendGate,
} from './auth-otp'
import { isStandalonePwa } from './pwa-display'
import { getSupabase } from '../supabase'

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function waitLabel(waitMs: number, locked: boolean) {
  if (locked) return authCopy.otpRateLimit
  const seconds = Math.max(1, Math.ceil(waitMs / 1000))
  return `${authCopy.otpWait} (${seconds}s)`
}

export function SignInScreen({
  forbidden,
  standalone = isStandalonePwa(),
}: {
  forbidden?: boolean
  standalone?: boolean
}) {
  const memory = browserOtpMemory()
  const initialGate = readOtpSendGate(Date.now(), memory)
  const [email, setEmail] = useState(initialGate.email)
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(Boolean(initialGate.email) && !initialGate.canSend)
  const [emailOpen, setEmailOpen] = useState(sent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(
    initialGate.locked ? authCopy.otpRateLimit : null,
  )
  const [now, setNow] = useState(() => Date.now())

  const gate = readOtpSendGate(now, memory)

  useEffect(() => {
    if (gate.canSend) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [gate.canSend])

  async function signInGoogle() {
    const supabase = getSupabase()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
      },
    })
    if (oauthError || !data.url) {
      setBusy(false)
      setError(authCopy.googleError)
      return
    }
    window.location.assign(data.url)
  }

  async function sendCode() {
    const supabase = getSupabase()
    const trimmed = email.trim().toLowerCase()
    const current = readOtpSendGate(Date.now(), memory)
    if (!supabase || !validEmail(trimmed) || !current.canSend) return
    setBusy(true)
    setError(null)
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    setNow(Date.now())
    if (sendError) {
      if (isOtpRateLimited(sendError)) {
        markOtpRateLimited(Date.now(), memory)
        setNow(Date.now())
      }
      setError(otpSendErrorMessage(sendError, authCopy))
      return
    }
    markOtpSent(trimmed, Date.now(), memory)
    setNow(Date.now())
    setEmail(trimmed)
    setSent(true)
  }

  async function verifyCode() {
    const supabase = getSupabase()
    const parsed = parseEmailOtpInput(code)
    if (!supabase || !parsed) return
    setBusy(true)
    setError(null)
    const { error: verifyErr } =
      parsed.kind === 'token'
        ? await supabase.auth.verifyOtp({
            email: email.trim().toLowerCase(),
            token: parsed.token,
            type: 'email',
          })
        : await supabase.auth.verifyOtp({
            token_hash: parsed.tokenHash,
            type: parsed.type,
          })
    setBusy(false)
    if (verifyErr) setError(authCopy.verifyError)
  }

  const body = forbidden
    ? authCopy.forbidden
    : standalone
      ? sent
        ? authCopy.otpSent
        : authCopy.bodyStandalone
      : authCopy.body

  const sendDisabled =
    busy || !validEmail(email.trim()) || !gate.canSend

  return (
    <div className="hub-signin">
      <Paper p="xl" radius="md" withBorder shadow="sm" maw={420} mx="auto">
        <Stack gap="md">
          <Title order={2}>{authCopy.title}</Title>
          <Text size="sm" c="dimmed">
            {body}
          </Text>
          {error ? (
            <Text size="sm" c="red">
              {error}
            </Text>
          ) : null}
          <Button color="dark" loading={busy} onClick={() => void signInGoogle()}>
            {authCopy.google}
          </Button>
          {standalone ? (
            emailOpen ? (
              sent ? (
                <>
                  <TextInput
                    label={authCopy.codeLabel}
                    placeholder={authCopy.codePlaceholder}
                    value={code}
                    onChange={(event) => setCode(event.currentTarget.value)}
                    autoComplete="one-time-code"
                    disabled={busy}
                  />
                  <Button
                    color="dark"
                    variant="light"
                    loading={busy}
                    disabled={!parseEmailOtpInput(code)}
                    onClick={() => void verifyCode()}
                  >
                    {authCopy.verify}
                  </Button>
                  <Button
                    variant="subtle"
                    color="gray"
                    disabled={busy || !gate.canSend}
                    onClick={() => void sendCode()}
                  >
                    {gate.canSend ? authCopy.resend : waitLabel(gate.waitMs, gate.locked)}
                  </Button>
                  <Button
                    variant="subtle"
                    color="gray"
                    disabled={busy}
                    onClick={() => {
                      setSent(false)
                      setCode('')
                      setError(null)
                    }}
                  >
                    {authCopy.changeEmail}
                  </Button>
                </>
              ) : (
                <>
                  <TextInput
                    label={authCopy.emailLabel}
                    placeholder={authCopy.emailPlaceholder}
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    type="email"
                    autoComplete="email"
                    disabled={busy}
                  />
                  <Button
                    color="dark"
                    variant="light"
                    loading={busy}
                    disabled={sendDisabled}
                    onClick={() => void sendCode()}
                  >
                    {gate.canSend
                      ? authCopy.sendCode
                      : waitLabel(gate.waitMs, gate.locked)}
                  </Button>
                  <Button
                    variant="subtle"
                    color="gray"
                    disabled={busy}
                    onClick={() => setEmailOpen(false)}
                  >
                    {authCopy.hideEmail}
                  </Button>
                </>
              )
            ) : (
              <Button
                variant="subtle"
                color="gray"
                disabled={busy}
                onClick={() => setEmailOpen(true)}
              >
                {authCopy.emailInstead}
              </Button>
            )
          ) : null}
        </Stack>
      </Paper>
    </div>
  )
}
