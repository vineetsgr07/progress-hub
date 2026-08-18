import { createApp } from '../server/app.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

let appPromise: ReturnType<typeof createApp> | null = null

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const forwarded = req.headers['x-forwarded-uri']
  if (typeof forwarded === 'string' && forwarded.startsWith('/api')) {
    req.url = forwarded
  }
  if (!appPromise) appPromise = createApp()
  const app = await appPromise
  app(req, res)
}
