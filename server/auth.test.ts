import './test-env.js'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const dir = mkdtempSync(path.join(tmpdir(), 'tracker-auth-'))
process.env.TRACKER_DB_PATH = path.join(dir, 'pg')
process.env.TRACKER_SKIP_SEED = '1'
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.AUTH_ALLOWED_EMAILS = 'owner@gmail.com'

const { createApp } = await import('./app.js')
const app = await createApp()
const server: Server = createServer(app)
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address() as AddressInfo
const base = `http://127.0.0.1:${port}`

const health = await fetch(`${base}/api/health`)
assert.equal(health.status, 200)

const tasks = await fetch(`${base}/api/tasks?date=2026-08-06`)
assert.equal(tasks.status, 401)

await new Promise<void>((resolve, reject) =>
  server.close((err) => (err ? reject(err) : resolve())),
)
rmSync(dir, { recursive: true, force: true })
console.log('auth tests passed')
