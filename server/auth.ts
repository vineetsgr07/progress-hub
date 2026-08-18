import type { NextFunction, Request, Response } from 'express'
import { createClient, type User } from '@supabase/supabase-js'

export type AuthedRequest = Request & { authUser?: User }

export function authEnabled() {
  return Boolean(supabaseUrl() && supabaseAnonKey())
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
}

function supabaseAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  )
}

function allowedEmails() {
  return (process.env.AUTH_ALLOWED_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1] ?? null
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!authEnabled()) {
    next()
    return
  }
  const token = bearerToken(req)
  if (!token) {
    res.status(401).json({ error: 'Sign in required' })
    return
  }
  const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.email) {
    res.status(401).json({ error: 'Sign in required' })
    return
  }
  const allow = allowedEmails()
  if (allow.length > 0 && !allow.includes(data.user.email.toLowerCase())) {
    res.status(403).json({ error: 'This account is not allowed' })
    return
  }
  req.authUser = data.user
  next()
}
