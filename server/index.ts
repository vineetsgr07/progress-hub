import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)

const PORT = Number(process.env.PORT || 8787)
const app = await createApp()

app.listen(PORT, () => {
  console.log(`Todo API listening on http://localhost:${PORT}`)
})
