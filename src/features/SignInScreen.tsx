import { useState } from 'react'
import { Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { authCopy } from './auth-copy'
import { isStandalonePwa } from './pwa-display'
import { getSupabase } from '../supabase'

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function SignInScreen({
  forbidden,
  standalone = isStandalonePwa(),
}: {
  forbidden?: boolean
  standalone?: boolean
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInGoogle() {
    const supabase = getSupabase()
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  async function sendCode() {
    const supabase = getSupabase()
    const trimmed = email.trim().toLowerCase()
    if (!supabase || !validEmail(trimmed)) return
    setBusy(true)
    setError(null)
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (sendError) {
      setError(authCopy.otpError)
      return
    }
    setEmail(trimmed)
    setSent(true)
  }

  async function verifyCode() {
    const supabase = getSupabase()
    const token = code.replace(/\s/g, '')
    if (!supabase || token.length < 6) return
    setBusy(true)
    setError(null)
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
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
          {standalone ? (
            sent ? (
              <>
                <TextInput
                  label={authCopy.codeLabel}
                  placeholder={authCopy.codePlaceholder}
                  value={code}
                  onChange={(event) => setCode(event.currentTarget.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={busy}
                />
                <Button
                  color="dark"
                  loading={busy}
                  disabled={code.replace(/\s/g, '').length < 6}
                  onClick={() => void verifyCode()}
                >
                  {authCopy.verify}
                </Button>
                <Button
                  variant="subtle"
                  color="gray"
                  disabled={busy}
                  onClick={() => void sendCode()}
                >
                  {authCopy.resend}
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
                  loading={busy}
                  disabled={!validEmail(email.trim())}
                  onClick={() => void sendCode()}
                >
                  {authCopy.sendCode}
                </Button>
              </>
            )
          ) : (
            <Button color="dark" onClick={() => void signInGoogle()}>
              {authCopy.google}
            </Button>
          )}
        </Stack>
      </Paper>
    </div>
  )
}
